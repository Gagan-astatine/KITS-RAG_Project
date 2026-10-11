import { useState } from "react";
import Shuffle from "./Shuffle.jsx";
import "./HeroSection.css";

export default function HeroSection({
  user,
  onOpenAuth,
  onSignOut,
  onOpenChat,
  onUploadClick,
}) {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="hero-container">
      {/* Glow Orbs */}
      <div className="hero-glow hero-glow-1" aria-hidden="true" />
      <div className="hero-glow hero-glow-2" aria-hidden="true" />

      {/* Top Hero Navigation / Status */}
      <header className="hero-navbar">
        <div className="hero-nav-brand">
          <span className="hero-nav-title">KITS Nova RAG</span>
          <span className="hero-badge-v2">Enterprise AI 2.0</span>
        </div>

        <div className="hero-nav-actions">
          {user ? (
            <div className="hero-user-profile">
              <div className="hero-user-avatar">
                {(user.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="hero-user-meta">
                <span className="hero-user-email" title={user.email}>
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </span>
                <span className="hero-user-tag">Supabase Verified</span>
              </div>
              <button
                type="button"
                className="hero-btn-ghost"
                onClick={onSignOut}
                title="Sign out of Supabase"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="hero-auth-actions">
              <button
                type="button"
                className="hero-btn-ghost"
                onClick={() => onOpenAuth("signin")}
              >
                Sign in
              </button>
              <button
                type="button"
                className="hero-btn-primary"
                onClick={() => onOpenAuth("signup")}
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Hero Spotlight */}
      <section className="hero-spotlight">
        <div className="hero-pill-badge">
          <span>Next-Gen Enterprise Retrieval-Augmented Generation</span>
        </div>

        <h1 className="hero-headline">
          Grounded Intelligence with{" "}
          <span className="hero-gradient-text">
            <Shuffle
              text="Nova Knowledge RAG"
              tag="span"
              duration={0.4}
              shuffleTimes={2}
              scrambleCharset="!@#$%&*+?"
              colorFrom="#c084fc"
              colorTo="#60a5fa"
              triggerOnHover={true}
              style={{
                fontSize: "inherit",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                fontFamily: "inherit",
              }}
            />
          </span>
        </h1>

        <p className="hero-lead">
          Transform unstructured enterprise PDFs, handbooks, and policy manuals into an interactive, multilingual AI workspace. Instant semantic search with pgvector, automated n8n pipelines, and citation-backed confidence.
        </p>

        {/* CTA Button Group */}
        <div className="hero-cta-group">
          <button
            type="button"
            className="hero-cta-main"
            onClick={onOpenChat}
          >
            <span>Launch Nova Chat</span>
            <span className="hero-cta-arrow" aria-hidden="true">&rarr;</span>
          </button>

          <button
            type="button"
            className="hero-cta-secondary"
            onClick={onUploadClick}
          >
            <span>Upload Documents</span>
          </button>

          <a
            href="http://localhost:5678"
            target="_blank"
            rel="noreferrer"
            className="hero-cta-tertiary"
            title="Open n8n Visual Workflow Engine"
          >
            <span>n8n Pipeline Canvas</span>
            <span className="external-icon">&nearr;</span>
          </a>
        </div>

        {/* Live Metrics Row */}
        <div className="hero-metrics-strip">
          <div className="metric-cell">
            <span className="metric-val">384-dim</span>
            <span className="metric-lbl">FastEmbed Vector Space</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <span className="metric-val">10+</span>
            <span className="metric-lbl">Indian & Global Languages</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <span className="metric-val">n8n + Supabase</span>
            <span className="metric-lbl">Event-Driven Ingestion</span>
          </div>
          <div className="metric-divider" />
          <div className="metric-cell">
            <span className="metric-val">100% Citation</span>
            <span className="metric-lbl">Exact PDF Page Jump</span>
          </div>
        </div>
      </section>

      {/* Architecture & Feature Explorer */}
      <section className="hero-architecture-card">
        <div className="arch-header">
          <div>
            <h2 className="arch-title">Project Architecture & Engine Blueprint</h2>
            <p className="arch-sub">
              How Nova RAG orchestrates ingestion, embedding, retrieval, and contextual generation.
            </p>
          </div>
          <div className="arch-tabs">
            <button
              type="button"
              className={`arch-tab ${activeTab === "overview" ? "is-active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Overview
            </button>
            <button
              type="button"
              className={`arch-tab ${activeTab === "pipeline" ? "is-active" : ""}`}
              onClick={() => setActiveTab("pipeline")}
            >
              n8n Ingestion Flow
            </button>
            <button
              type="button"
              className={`arch-tab ${activeTab === "stack" ? "is-active" : ""}`}
              onClick={() => setActiveTab("stack")}
            >
              Tech Stack
            </button>
          </div>
        </div>

        {activeTab === "overview" && (
          <div className="arch-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper f-purple">
                <span className="feature-index">01</span>
              </div>
              <h3>FastEmbed & pgvector</h3>
              <p>
                Local <code>sentence-transformers/all-MiniLM-L6-v2</code> embeddings compute ultra-fast 384-dimensional query vectors matched against Supabase PostgreSQL via cosine distance.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper f-blue">
                <span className="feature-index">02</span>
              </div>
              <h3>Automated n8n Ingestion</h3>
              <p>
                Upload PDFs trigger an automated n8n webhook workflow that performs binary extraction, sliding chunk overlapping, vectorization, and Supabase upsert.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper f-emerald">
                <span className="feature-index">03</span>
              </div>
              <h3>Ground-Truth Citations</h3>
              <p>
                Every answer references verifiable source pages. Clicking any source badge opens the built-in PDF viewer directly to the cited page.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper f-amber">
                <span className="feature-index">04</span>
              </div>
              <h3>Voice & 10+ Languages</h3>
              <p>
                Ask questions verbally in Hindi, Telugu, Tamil, Kannada, Bengali, or Marathi with auto-translation and instant Plotly chart generation.
              </p>
            </div>
          </div>
        )}

        {activeTab === "pipeline" && (
          <div className="pipeline-flow">
            <div className="flow-step">
              <span className="flow-num">1</span>
              <h4>PDF Ingest</h4>
              <p>Webhook triggers on PDF upload from UI</p>
            </div>
            <div className="flow-arrow">&rarr;</div>
            <div className="flow-step">
              <span className="flow-num">2</span>
              <h4>Text Extraction</h4>
              <p>Extract text & chunk with sliding overlap</p>
            </div>
            <div className="flow-arrow">&rarr;</div>
            <div className="flow-step">
              <span className="flow-num">3</span>
              <h4>Embedding</h4>
              <p>Vector generation via FastAPI /embed</p>
            </div>
            <div className="flow-arrow">&rarr;</div>
            <div className="flow-step">
              <span className="flow-num">4</span>
              <h4>Supabase Store</h4>
              <p>Upsert into pgvector document store</p>
            </div>
            <div className="flow-arrow">&rarr;</div>
            <div className="flow-step">
              <span className="flow-num">5</span>
              <h4>RAG Query</h4>
              <p>Match chunks & synthesize answer with LLM</p>
            </div>
          </div>
        )}

        {activeTab === "stack" && (
          <div className="stack-badges-container">
            <div className="stack-group">
              <span className="stack-group-title">AI & Intelligence:</span>
              <div className="stack-pills">
                <span className="pill">Google Gemini</span>
                <span className="pill">Groq Llama 3.3 70B</span>
                <span className="pill">FastEmbed MiniLM</span>
                <span className="pill">Plotly Dynamic Viz</span>
              </div>
            </div>
            <div className="stack-group">
              <span className="stack-group-title">Backend & Storage:</span>
              <div className="stack-pills">
                <span className="pill">FastAPI Python</span>
                <span className="pill">Supabase PostgreSQL</span>
                <span className="pill">pgvector</span>
                <span className="pill">Supabase Auth</span>
              </div>
            </div>
            <div className="stack-group">
              <span className="stack-group-title">Workflow & Frontend:</span>
              <div className="stack-pills">
                <span className="pill">n8n Visual Automation</span>
                <span className="pill">React 19 + Vite</span>
                <span className="pill">GhostFibers & GSAP</span>
                <span className="pill">Web Speech API</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
