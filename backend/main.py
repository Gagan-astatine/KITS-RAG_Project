import base64
import io
import json
import os
import re
import time
from pathlib import Path

import requests
from deep_translator import GoogleTranslator
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from matplotlib.figure import Figure
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from pydantic import BaseModel, field_validator
from fastembed import TextEmbedding

# .env lives in the repo root, one level above backend/
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GROQ_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Loaded once at startup, not per request
model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")


class EmbedRequest(BaseModel):
    texts: list[str]


class AskRequest(BaseModel):
    question: str
    charts: bool = False

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Question must not be blank.")
        return value

STORAGE_DIR = Path(__file__).resolve().parent / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/store_pdf")
async def store_pdf(file: UploadFile = File(...)):
    """Save an uploaded PDF to backend storage so it can be previewed/opened."""
    safe_name = Path(file.filename).name
    dest = STORAGE_DIR / safe_name
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    return {"status": "ok", "file_name": safe_name}


@app.get("/pdf/{file_name}")
def get_pdf(file_name: str):
    """Serve a stored PDF for viewing, checking storage first and common folders as fallback."""
    safe_name = Path(file_name).name
    target = STORAGE_DIR / safe_name

    # Check direct storage
    if not target.is_file():
        # Fallback search paths in user profile (Downloads, Documents, Desktop)
        user_home = Path.home()
        fallback_dirs = [
            user_home / "Downloads",
            user_home / "OneDrive" / "Desktop",
            user_home / "Desktop",
            user_home / "Documents",
        ]
        found = None
        for fdir in fallback_dirs:
            candidate = fdir / safe_name
            if candidate.is_file():
                found = candidate
                break

        if found:
            # Copy to storage for instant future hits
            try:
                import shutil
                shutil.copy2(found, target)
                target = target
            except Exception:
                target = found
        else:
            raise HTTPException(404, f"PDF file '{safe_name}' not found. Please upload it via the Upload PDFs button.")

    return FileResponse(
        path=target,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = [v.tolist() for v in model.embed(req.texts)]
    return {"embeddings": vectors}


# ---------- Translation (typed question -> English) ----------
def to_english(text):
    try:
        return GoogleTranslator(source="auto", target="en").translate(text) or text
    except Exception:
        return text


# ---------- Retrieval ----------
def search_chunks(question_vector, k=5):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            503,
            "Configure SUPABASE_URL and SUPABASE_SERVICE_KEY in the project .env file.",
        )

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/match_documents",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json={"query_embedding": question_vector, "match_count": k},
        timeout=30,
    )
    if r.status_code != 200:
        raise HTTPException(502, f"Supabase error: {r.text}")
    return r.json()


# ---------- Prompts ----------
SYSTEM_PROMPT = """You are the company knowledge-base assistant for employees. Answer using ONLY the provided context from the company's documents. Never use outside knowledge and never guess.

How to write answers:
- Start with the direct answer in one or two sentences.
- Add supporting detail only if it helps. Use short paragraphs.
- Use a numbered list for steps or procedures, bullet points for lists of items, and a table only when comparing several items across attributes.
- Put key facts (deadlines, amounts, names, limits, approvers) in **bold**.
- Cite the source document where relevant (e.g. `[Document Name.pdf]`).
- Be concise. No filler, don't repeat the question, and never say "the context" or "the passage".
- Tone: professional, clear, friendly and neutral. Address the employee directly ("you").
- If the context answers only part of the question, answer that part and say plainly what is not covered.
- If the answer is not in the context, begin the reply with exactly: I couldn't find that in the uploaded documents. You may add one short sentence suggesting they rephrase or check with the relevant team.
- Always write in English."""

CHART_RULES = """
OUTPUT FORMAT (charts mode is ON):
Reply with ONE JSON object and nothing else: no markdown, no code fences, no text before or after.
Shape:
{
  "answer": "<your answer, grounded in the context>",
  "chart": null
}
or, when a chart is appropriate:
{
  "answer": "<your answer, grounded in the context>",
  "chart": {
    "type": "bar" | "line" | "pie",
    "title": "<short title>",
    "unit": "<unit such as %, ₹ crore, employees, or empty string>",
    "labels": ["<category or period>", ...],
    "values": [<number>, ...]
  }
}
Rules for the chart:
- Include a chart only if the context contains at least 2 numeric values that can be compared, ranked, or tracked over time. Otherwise set "chart" to null.
- Use ONLY numbers that appear in the context. Never estimate, calculate new figures, or invent data.
- "labels" and "values" must have the same length (2 to 12 items). Values are plain numbers, with no currency symbols, commas, or units.
- Use "bar" to compare categories, "line" for change over time, "pie" for parts of a whole.
- The "answer" must follow the same rules as always: only from the context. If the answer is not there, say so and set "chart" to null.
"""


# ---------- LLM (Gemini first, Groq as backup) ----------
def model_list(value):
    return [m.strip() for m in (value or "").split(",") if m.strip()]


def call_gemini(user_msg, model_name, system_prompt, api_key):
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        },
        timeout=25,
    )
    if r.status_code != 200:
        raise Exception(f"{r.status_code}: {r.text[:300]}")
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def call_groq(user_msg, model_name, system_prompt, api_key):
    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.2,
        },
        timeout=25,
    )
    if r.status_code != 200:
        raise Exception(f"{r.status_code}: {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def ask_llm(question, chunks, charts=False):
    context = "\n\n".join(
        f"[Reference: {c['file_name']}" + (f", Page {c.get('page')}" if c.get("page") else "") + f"]\n{c['content']}"
        for c in chunks
    )
    user_msg = f"Context:\n{context}\n\nQuestion: {question}"
    system_prompt = SYSTEM_PROMPT + ("\n" + CHART_RULES if charts else "")

    providers = [
        ("gemini", call_gemini, GEMINI_KEY, model_list(GEMINI_MODEL)),
        ("groq", call_groq, GROQ_KEY, model_list(GROQ_MODEL)),
    ]

    errors = []
    for name, fn, key, models in providers:
        if not key:
            continue
        for m in models:
            for attempt in range(2):
                try:
                    return fn(user_msg, m, system_prompt, key), f"{name}:{m}"
                except Exception as e:
                    err = str(e)
                    errors.append(f"{name}/{m}: {err[:150]}")
                    if attempt == 0 and ("503" in err or "429" in err or "timed out" in err.lower()):
                        time.sleep(1.5)
                        continue
                    break
    raise HTTPException(502, "All LLM providers failed. " + " | ".join(errors))


# ---------- Charts (the LLM gives numbers, Python draws) ----------
COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"]


def clean_spec(chart):
    """Validate the chart JSON from the LLM. Returns a safe spec, or None."""
    try:
        if not isinstance(chart, dict):
            return None
        labels, values = chart.get("labels"), chart.get("values")
        if not isinstance(labels, list) or not isinstance(values, list):
            return None
        n = min(len(labels), len(values), 12)
        if n < 2:
            return None
        vals = [float(v) for v in values[:n]]
        ctype = chart.get("type") if chart.get("type") in ("bar", "line", "pie") else "bar"
        if ctype == "pie" and (any(v < 0 for v in vals) or sum(vals) == 0):
            ctype = "bar"
        return {
            "type": ctype,
            "title": str(chart.get("title") or ""),
            "unit": str(chart.get("unit") or ""),
            "labels": [str(l) for l in labels[:n]],
            "values": vals,
        }
    except Exception:
        return None


def parse_chart_reply(raw):
    """Pull {answer, chart} out of the LLM reply. Any problem -> plain text, no chart."""
    try:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match is None:
            return raw, None
        data = json.loads(match.group(0))
        answer = str(data.get("answer") or "").strip() or raw
    except Exception:
        return raw, None
    return answer, clean_spec(data.get("chart"))


def render_seaborn_chart(spec):
    """Draw a styled chart with Seaborn & Matplotlib, returning a base64 PNG."""
    sns.set_theme(style="darkgrid", palette="mako")
    fig = plt.figure(figsize=(6.4, 3.8), dpi=120)
    ax = fig.add_subplot(111)

    # Dark modern styling matching Nova Bot palette
    fig.patch.set_facecolor("#12131f")
    ax.set_facecolor("#1a1b2e")

    labels = [l if len(l) <= 18 else l[:17] + "…" for l in spec["labels"]]
    values = spec["values"]
    palette = sns.color_palette("rocket", len(values)) if spec["type"] == "pie" else sns.color_palette("mako", len(values))

    if spec["type"] == "pie":
        wedges, texts, autotexts = ax.pie(
            values,
            labels=labels,
            autopct="%1.1f%%",
            startangle=140,
            colors=palette,
            textprops={"fontsize": 9, "color": "#e2e8f0"},
            wedgeprops={"edgecolor": "#12131f", "linewidth": 1.5}
        )
        for autotext in autotexts:
            autotext.set_color("#ffffff")
            autotext.set_fontweight("bold")
        ax.axis("equal")
    else:
        if spec["type"] == "line":
            ax.plot(labels, values, marker="o", markersize=7, color="#a855f7", linewidth=2.5, label=spec["unit"] or "Value")
            ax.fill_between(range(len(labels)), values, alpha=0.2, color="#a855f7")
            for x, y in zip(labels, values):
                ax.annotate(
                    f"{y:g}",
                    (x, y),
                    textcoords="offset points",
                    xytext=(0, 7),
                    ha="center",
                    fontsize=8.5,
                    color="#f8fafc",
                    fontweight="bold"
                )
        else:
            bars = ax.bar(labels, values, color=palette, edgecolor="#2e1065", linewidth=0.8, width=0.6)
            ax.bar_label(bars, fmt="%g", fontsize=8.5, color="#f8fafc", padding=3, fontweight="bold")

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color("#475569")
        ax.spines["bottom"].set_color("#475569")
        ax.tick_params(colors="#cbd5e1", labelsize=8.5)
        ax.yaxis.grid(True, linestyle="--", alpha=0.3, color="#64748b")
        ax.xaxis.grid(False)

        if spec["unit"]:
            ax.set_ylabel(spec["unit"], fontsize=9.5, color="#cbd5e1", labelpad=6)
        if len(labels) > 4 or any(len(l) > 8 for l in labels):
            ax.tick_params(axis="x", labelrotation=28, labelsize=8.5)
            for lbl in ax.get_xticklabels():
                lbl.set_horizontalalignment("right")

    if spec["title"]:
        ax.set_title(spec["title"], fontsize=11.5, fontweight="bold", color="#ffffff", pad=12)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def generate_plotly_figure(spec):
    """Build an interactive Plotly figure with hover effects and animations."""
    labels = spec["labels"]
    values = spec["values"]
    unit = spec.get("unit") or ""
    title = spec.get("title") or ""
    chart_type = spec.get("type", "bar")

    # Vibrant modern gradients
    colors = ["#a855f7", "#6366f1", "#38bdf8", "#ec4899", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6"]

    if chart_type == "pie":
        fig = go.Figure(
            data=[
                go.Pie(
                    labels=labels,
                    values=values,
                    hole=0.45,
                    marker=dict(colors=colors, line=dict(color="#0a0a0a", width=2)),
                    textinfo="label+percent",
                    hovertemplate="<b>%{label}</b><br>Value: %{value:,.2f}" + (f" {unit}" if unit else "") + "<br>Share: %{percent}<extra></extra>",
                    hoverlabel=dict(bgcolor="#18181b", font=dict(color="#f43f5e", size=13), bordercolor="#a855f7")
                )
            ]
        )
    elif chart_type == "line":
        fig = go.Figure(
            data=[
                go.Scatter(
                    x=labels,
                    y=values,
                    mode="lines+markers",
                    line=dict(color="#a855f7", width=3, shape="spline"),
                    marker=dict(size=9, color="#c084fc", line=dict(color="#ffffff", width=2)),
                    fill="tozeroy",
                    fillcolor="rgba(168, 85, 247, 0.15)",
                    hovertemplate="<b>%{x}</b><br>Value: <b>%{y:,.2f}</b>" + (f" {unit}" if unit else "") + "<extra></extra>",
                    hoverlabel=dict(bgcolor="#18181b", font=dict(color="#ffffff", size=13), bordercolor="#a855f7")
                )
            ]
        )
    else:  # bar
        fig = go.Figure(
            data=[
                go.Bar(
                    x=labels,
                    y=values,
                    marker=dict(
                        color=colors[:len(values)],
                        opacity=0.9,
                        line=dict(color="#ffffff", width=1.5)
                    ),
                    hovertemplate="<b>%{x}</b><br>Value: <b>%{y:,.2f}</b>" + (f" {unit}" if unit else "") + "<extra></extra>",
                    hoverlabel=dict(bgcolor="#18181b", font=dict(color="#ffffff", size=13), bordercolor="#a855f7")
                )
            ]
        )

    fig.update_layout(
        title=dict(text=title, font=dict(size=14, color="#ffffff", family="inherit")),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=40, r=30, t=50, b=50),
        font=dict(color="#e2e8f0", size=11),
        hovermode="closest",
        xaxis=dict(
            gridcolor="rgba(255, 255, 255, 0.08)",
            tickfont=dict(color="#94a3b8"),
            linecolor="rgba(255, 255, 255, 0.2)"
        ),
        yaxis=dict(
            gridcolor="rgba(255, 255, 255, 0.08)",
            tickfont=dict(color="#94a3b8"),
            linecolor="rgba(255, 255, 255, 0.2)",
            title=dict(text=unit, font=dict(color="#cbd5e1", size=11)) if unit else None
        )
    )

    return json.loads(fig.to_json())


# ---------- Main endpoint ----------
@app.post("/ask")
def ask(req: AskRequest):
    question_en = to_english(req.question)
    question_vector = list(model.embed([question_en]))[0].tolist()
    chunks = search_chunks(question_vector, k=8 if req.charts else 5)
    if not chunks:
        return {"answer": "No documents have been uploaded yet.", "sources": [],
                "chart_image": None, "chart_data": None}

    raw, provider = ask_llm(question_en, chunks, req.charts)

    answer, chart_image, chart_data, plotly_data = raw, None, None, None
    if req.charts:
        answer, spec = parse_chart_reply(raw)
        if spec:
            try:
                chart_image = render_seaborn_chart(spec)
                chart_data = spec
            except Exception:
                chart_image, chart_data = None, None  # drawing failed: just show the text

            try:
                plotly_data = generate_plotly_figure(spec)
            except Exception:
                plotly_data = None

    # Extract unique references with detected page numbers and snippets
    references = []
    seen_refs = set()
    for c in chunks:
        file_name = c.get("file_name", "Unknown document")
        content = c.get("content", "")
        # Look for page markers like "Page 1", "Page 2" in chunk text
        page_matches = re.findall(r"Page\s+(\d+)", content, re.IGNORECASE)
        page_num = int(page_matches[0]) if page_matches else None
        ref_key = (file_name, page_num)
        if ref_key not in seen_refs:
            seen_refs.add(ref_key)
            snippet = content[:140].strip() + ("…" if len(content) > 140 else "")
            references.append({
                "file_name": file_name,
                "page": page_num,
                "snippet": snippet,
            })

    sources = sorted({c["file_name"] for c in chunks})
    return {
        "answer": answer,
        "sources": sources,
        "references": references,
        "provider": provider,
        "chart_image": chart_image,
        "chart_data": chart_data,
        "plotly_data": plotly_data,
    }