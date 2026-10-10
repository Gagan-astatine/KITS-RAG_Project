import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastembed import TextEmbedding

# .env lives in the repo root, one level above backend/
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GROQ_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

app = FastAPI()

# The React app (Phase 5) runs on a different port, so the browser needs CORS
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest):
    vectors = [v.tolist() for v in model.embed(req.texts)]
    return {"embeddings": vectors}


# ---------- Retrieval ----------
def search_chunks(question_vector, k=5):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            500, "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY configuration."
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


# ---------- LLM (Gemini first, Groq as backup) ----------
SYSTEM_PROMPT = (
    "You are a company knowledge-base assistant. Answer ONLY using the context provided. "
    "If the answer is not in the context, say: \"I couldn't find that in the uploaded documents.\" "
    "Do not use outside knowledge."
)


def call_gemini(user_msg, api_key: str):
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
        json={
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
        },
        timeout=25,
    )
    r.raise_for_status()
    return r.json()["candidates"][0]["content"]["parts"][0]["text"]


def call_groq(user_msg, api_key: str):
    r = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.2,
        },
        timeout=25,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


def ask_llm(question, chunks):
    context = "\n\n".join(f"[Source: {c['file_name']}]\n{c['content']}" for c in chunks)
    user_msg = f"Context:\n{context}\n\nQuestion: {question}"

    errors = []
    for name, fn, key in [("gemini", call_gemini, GEMINI_KEY), ("groq", call_groq, GROQ_KEY)]:
        if not key:
            continue
        try:
            return fn(user_msg, key), name
        except Exception as e:
            errors.append(f"{name}: {e}")
    raise HTTPException(502, "All LLM providers failed. " + " | ".join(errors))


# ---------- Main endpoint ----------
@app.post("/ask")
def ask(req: AskRequest):
    question_vector = list(model.embed([req.question]))[0].tolist()
    chunks = search_chunks(question_vector)
    if not chunks:
        return {"answer": "No documents have been uploaded yet.", "sources": []}
    answer, provider = ask_llm(req.question, chunks)
    sources = sorted({c["file_name"] for c in chunks})
    return {"answer": answer, "sources": sources, "provider": provider}