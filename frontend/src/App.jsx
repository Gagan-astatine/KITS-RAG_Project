import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Sidebar from "./components/Sidebar.jsx";
import GhostFibers from "./components/GhostFibers.jsx";
import Shuffle from "./components/Shuffle.jsx";
import VoiceMic from "./components/VoiceMic.jsx";
import InteractiveChart from "./components/InteractiveChart.jsx";
import PdfModalViewer from "./components/PdfModalViewer.jsx";
import HeroSection from "./components/HeroSection.jsx";
import AuthModal from "./components/AuthModal.jsx";
import { supabase } from "./supabaseClient.js";
import useChats from "./hooks/useChats.js";
import { getLang, retranslate, setLanguage } from "./utils/translate.js";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const INGEST_URL =
  import.meta.env.VITE_N8N_URL || "http://localhost:5678/webhook/ingest";

const EXAMPLE_QUESTIONS = [
  "What are the key policies in these documents?",
  "Summarize the main deadlines and requirements.",
  "Who should I contact for approval?",
];

function errorMessage(error) {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function timestampLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [viewMode, setViewMode] = useState("hero"); // 'hero' | 'chat'
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState(null);
  const [input, setInput] = useState("");
  const [chartsOn, setChartsOn] = useState(false);
  const [pendingChatId, setPendingChatId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copyFailedId, setCopyFailedId] = useState(null);
  const [translationWarning, setTranslationWarning] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState(getLang);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [activePdf, setActivePdf] = useState(null); // { fileName, page, url }

  // Subscribe to Supabase Auth state changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (!nextUser) {
        setViewMode("hero");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function handleOpenAuth(mode = "signin") {
    setAuthMode(mode);
    setAuthModalOpen(true);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setViewMode("hero");
  }

  function handleLaunchChat() {
    if (!user) {
      handleOpenAuth("signin");
      return;
    }
    setViewMode("chat");
  }

  function openPdfReference(fileName, page) {
    if (!fileName) return;
    const cleanFileName = fileName.trim();
    const pdfUrl = `${API_URL}/pdf/${encodeURIComponent(cleanFileName)}`;
    setActivePdf({
      fileName: cleanFileName,
      page: page || 1,
      url: pdfUrl,
    });
  }
  const bottomRef = useRef(null);
  const messageElements = useRef(new Map());
  const pendingTranslationIds = useRef(new Set());
  const uploadInputRef = useRef(null);
  const askingRef = useRef(false);
  const copyTimer = useRef(null);
  const {
    activeChat,
    activeChatId,
    chats,
    clearAllChats,
    deleteChat,
    selectChat,
    startNewChat,
    updateMessages,
  } = useChats(user?.id);
  const messages = useMemo(() => activeChat?.messages || [], [activeChat]);
  const isChatEmpty = messages.length === 0;
  const asking = pendingChatId === activeChatId && pendingChatId !== null;
  const requestPending = pendingChatId !== null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChatId, messages, asking]);

  useEffect(() => {
    let attempts = 0;
    const widgetCheck = window.setInterval(() => {
      attempts += 1;
      if (document.querySelector(".goog-te-combo")) {
        window.clearInterval(widgetCheck);
        setTranslationWarning("");
      } else if (attempts >= 25) {
        window.clearInterval(widgetCheck);
        setTranslationWarning(
          "Translation is unavailable. Check your internet connection or ad blocker.",
        );
      }
    }, 200);
    return () => window.clearInterval(widgetCheck);
  }, []);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (
      latestMessage?.role !== "assistant" ||
      latestMessage.error ||
      !pendingTranslationIds.current.has(latestMessage.id)
    ) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      pendingTranslationIds.current.delete(latestMessage.id);
      const element = messageElements.current.get(latestMessage.id);
      if (!element || element.querySelector("font")) return;

      try {
        const result = await retranslate();
        if (!result.available) setTranslationWarning(result.message);
      } catch (error) {
        setTranslationWarning(
          `The new answer could not be translated. ${errorMessage(error)}`,
        );
      }
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [activeChatId, messages]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  async function handleUpload() {
    if (!files.length) return;

    const selectedFiles = [...files];
    const results = [];
    setStatus({
      type: "loading",
      text: `Uploading 0 of ${selectedFiles.length} PDFs…`,
    });

    for (const [index, file] of selectedFiles.entries()) {
      setStatus({
        type: "loading",
        text: `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`,
      });
      try {
        const form = new FormData();
        form.append("file", file);

        // Also store PDF in backend storage for instant viewer & page lookup
        fetch(`${API_URL}/store_pdf`, { method: "POST", body: form }).catch((err) =>
          console.warn("Backend PDF backup storage failed:", err)
        );

        const response = await fetch(INGEST_URL, { method: "POST", body: form });
        if (!response.ok) {
          throw new Error(`Upload failed (HTTP ${response.status}).`);
        }

        const payload = await response.json().catch(() => null);
        const result = Array.isArray(payload) ? payload[0] : payload;
        const hasChunkCount =
          result &&
          typeof result === "object" &&
          result.chunks !== undefined &&
          result.chunks !== null;
        const resultFile =
          result && typeof result.file === "string" ? result.file.trim() : "";

        results.push({
          fileName: hasChunkCount && resultFile ? resultFile : file.name,
          chunks: hasChunkCount && resultFile ? result.chunks : null,
          error: null,
        });
      } catch (error) {
        results.push({
          fileName: file.name,
          chunks: null,
          error: errorMessage(error),
        });
      }
    }

    setStatus({
      type: results.some((result) => result.error) ? "error" : "ok",
      results,
    });
    setFiles([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  }

  async function sendQuestion(
    rawQuestion,
    { chatId = activeChatId, addUserMessage = true } = {},
  ) {
    const question = rawQuestion.trim();
    if (!question || !chatId || askingRef.current) return;

    setTranslationWarning("");
    askingRef.current = true;
    setPendingChatId(chatId);
    if (addUserMessage) {
      updateMessages(chatId, (current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: question,
          timestamp: Date.now(),
        },
      ]);
    }

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, charts: chartsOn }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 1200)}`);
      }

      const data = await response.json();
      if (typeof data.answer !== "string") {
        throw new Error("The server returned an invalid answer.");
      }

      const answerMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.answer,
        sources: Array.isArray(data.sources) ? data.sources : [],
        references: Array.isArray(data.references) ? data.references : [],
        chart_image: data.chart_image,
        chart_data: data.chart_data,
        plotly_data: data.plotly_data,
        timestamp: Date.now(),
      };
      if (getLang() !== "en") {
        pendingTranslationIds.current.add(answerMessage.id);
      }
      updateMessages(chatId, (current) => [
        ...current,
        answerMessage,
      ]);
    } catch (error) {
      updateMessages(chatId, (current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: errorMessage(error),
          error: true,
          retryQuestion: question,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      askingRef.current = false;
      setPendingChatId(null);
    }
  }

  async function handleAsk(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || askingRef.current) return;
    setInput("");
    await sendQuestion(question, { chatId: activeChatId });
  }

  async function handleRetry(message) {
    if (askingRef.current) return;
    const chatId = activeChatId;
    updateMessages(chatId, (current) =>
      current.filter((item) => item.id !== message.id),
    );
    await sendQuestion(message.retryQuestion, {
      chatId,
      addUserMessage: false,
    });
  }

  function handleNewChat() {
    if (!user) {
      handleOpenAuth("signin");
      return;
    }
    startNewChat();
    setInput("");
    setSidebarOpen(false);
    setViewMode("chat");
  }

  function handleSelectChat(chatId) {
    if (!user) {
      handleOpenAuth("signin");
      return;
    }
    selectChat(chatId);
    setInput("");
    setViewMode("chat");
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 899px)").matches) {
      setSidebarOpen(true);
      return;
    }
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  async function handleCopy(message) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      setCopyFailedId(null);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopyFailedId(message.id);
    }
  }

  async function handleLanguageChange(event) {
    const code = event.currentTarget.value;
    setSelectedLanguage(code);
    setTranslationWarning("");
    try {
      const result = await setLanguage(code);
      if (!result.available) setTranslationWarning(result.message);
    } catch (error) {
      setTranslationWarning(
        `The language could not be changed. ${errorMessage(error)}`,
      );
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", minHeight: "100vh" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 0,
          backgroundColor: "#0a0a0a" // Ensure a dark background behind the fibers
        }}
      >
        <GhostFibers
          glowColor="#A855F7"
          speed={0.2}
          scale={2}
          rotationSpeed={0.25}
          layers={4}
          twist={0.1}
          threads={1}
          glow={2}
          brightness={1.4}
          vignette={0.8}
          rotation={0}
          waves={0.015}
          spread={1}
          thickness={1}
          grain={0.03}
          mouseInteraction
          lightMode={false}
        />
      </div>
      <div className="app-shell" style={{ position: "relative", zIndex: 1, background: "transparent" }}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={(chatId) => deleteChat(chatId)}
          onClearAll={clearAllChats}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          user={user}
        />
        {viewMode === "hero" ? (
          <div style={{ flex: 1, width: "100%", overflowY: "auto", height: "100vh" }}>
            <HeroSection
              user={user}
              onOpenAuth={handleOpenAuth}
              onSignOut={handleSignOut}
              onOpenChat={handleLaunchChat}
              onUploadClick={() => {
                if (!user) {
                  handleOpenAuth("signin");
                  return;
                }
                setUploadModalOpen(true);
              }}
            />
          </div>
        ) : (
          <main className="app">
            <header className="app-header">
              <div className="header-copy">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <h1 className="nova-bot-title" style={{ color: "#fff", margin: 0, display: "flex", alignItems: "center" }}>
                    <Shuffle
                      text="Nova Bot"
                      tag="span"
                      duration={0.4}
                      shuffleTimes={2}
                      scrambleCharset="!@#$%&*+?"
                      colorFrom="#c084fc"
                      colorTo="#ffffff"
                      triggerOnHover={true}
                      style={{
                        fontSize: "inherit",
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                        fontFamily: "inherit",
                        lineHeight: 1.1
                      }}
                    />
                  </h1>
                </div>
                <p className="header-description" style={{ color: "#e5e7eb" }}>
                  Ask questions and get answers grounded in your company documents.
                </p>
              </div>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {user ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "#c084fc",
                        background: "rgba(168, 85, 247, 0.15)",
                        padding: "5px 10px",
                        borderRadius: "10px",
                        border: "1px solid rgba(192, 132, 252, 0.3)",
                        maxWidth: "140px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                      title={user.email}
                    >
                      {user.user_metadata?.full_name || user.email?.split("@")[0]}
                    </span>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="hero-btn-ghost"
                      style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                      title="Sign out of Supabase"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpenAuth("signin")}
                    className="hero-btn-ghost"
                    style={{ padding: "8px 14px", borderRadius: "10px", fontSize: "0.82rem" }}
                  >
                    Sign in
                  </button>
                )}
                <button
                  type="button"
                  className="upload-button"
                  onClick={() => setUploadModalOpen(true)}
                  style={{ padding: "8px 16px", borderRadius: "12px" }}
                >
                  Upload PDFs
                </button>
                <label className="language-control notranslate" translate="no">
                  <span>Language</span>
                  <select
                    aria-label="Choose display language"
                    value={selectedLanguage}
                    onChange={(event) => void handleLanguageChange(event)}
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="te">Telugu</option>
                    <option value="ta">Tamil</option>
                    <option value="kn">Kannada</option>
                    <option value="ml">Malayalam</option>
                    <option value="bn">Bengali</option>
                    <option value="mr">Marathi</option>
                    <option value="gu">Gujarati</option>
                    <option value="ur">Urdu</option>
                  </select>
                </label>
              </div>
            </header>

          {uploadModalOpen && (
            <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={() => setUploadModalOpen(false)}>
              <div onClick={(e) => e.stopPropagation()}>
                <section className="card upload" aria-labelledby="upload-heading" style={{ margin: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="section-heading">
                      <span className="section-icon" aria-hidden="true">
                        ↑
                      </span>
                      <div>
                        <h2 id="upload-heading">Your documents</h2>
                        <p>Upload a PDF to add it to the knowledge base.</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => setUploadModalOpen(false)} style={{ background: "none", color: "#6b7280", border: "none", fontSize: "1.2rem", cursor: "pointer", padding: "0 8px" }}>✕</button>
                  </div>
                  <label className="upload-dropzone">
                    <span className="upload-dropzone-icon" aria-hidden="true">
                      ⇧
                    </span>
                    <span className="upload-dropzone-copy">
                      <span>Choose one or more PDF files</span>
                      <span>Each PDF will be added to your knowledge base.</span>
                    </span>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="application/pdf"
                      multiple
                      aria-label="Choose one or more PDFs to upload"
                      onChange={(event) => {
                        setFiles(Array.from(event.target.files || []));
                        setStatus(null);
                      }}
                    />
                  </label>
                  {files.length > 0 && (
                    <ul className="selected-files">
                      {files.map((file) => (
                        <li key={`${file.name}-${file.lastModified}-${file.size}`}>
                          <span className="file-type-icon" aria-hidden="true">
                            PDF
                          </span>
                          <span className="notranslate selected-file-name" translate="no">
                            {file.name}
                          </span>
                          <span className="selected-file-size">
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    className="upload-button"
                    type="button"
                    onClick={handleUpload}
                    disabled={!files.length || status?.type === "loading"}
                  >
                    <span>
                      {status?.type === "loading"
                        ? "Processing…"
                        : `Upload ${files.length || ""} PDF${files.length === 1 ? "" : "s"}`}
                    </span>
                  </button>
                  {status && (
                    <div className={`status ${status.type}`} role="status">
                      {status.results ? (
                        <ul className="upload-results">
                          {status.results.map((result, index) => (
                            <li
                              className={result.error ? "has-error" : ""}
                              key={`${result.fileName}-${index}`}
                            >
                              <span className="notranslate" translate="no">
                                {result.fileName}
                              </span>
                              {result.error ? (
                                <span>{result.error}</span>
                              ) : result.chunks !== null ? (
                                <span>Added · {result.chunks} chunks</span>
                              ) : (
                                <span>Uploaded</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span>{status.text}</span>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}

          <section
            className={`card chat ${isChatEmpty ? 'landing-mode' : ''}`}
            aria-label="Chat with your documents"
            style={isChatEmpty ? {
              background: "transparent",
              border: "none",
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              maxWidth: "800px",
              margin: "0 auto",
              height: "100%"
            } : {}}
          >
            {!isChatEmpty && (
              <div className="chat-heading">
                <div>
                  <h2>Ask your documents</h2>
                  <p>Answers are based on your uploaded files.</p>
                </div>
                <label className="chart-toggle">
                  <input
                    type="checkbox"
                    checked={chartsOn}
                    onChange={(event) => setChartsOn(event.target.checked)}
                    disabled={requestPending}
                  />
                  <span>Include charts</span>
                </label>
              </div>
            )}

            <div className="messages" aria-live="polite" style={isChatEmpty ? { display: "none" } : {}}>
              {isChatEmpty && (
                <div className="empty-state">
                  <div className="welcome-mark" aria-hidden="true">
                    ✦
                  </div>
                  <h3>How can I help you today?</h3>
                  <p>Ask a question about the information in your documents.</p>
                </div>
              )}

              {messages.map((message) => (
                <article
                  className={`message-row ${message.role}${message.error ? " has-error" : ""}`}
                  key={message.id}
                  ref={(element) => {
                    if (element) messageElements.current.set(message.id, element);
                    else messageElements.current.delete(message.id);
                  }}
                >
                  <div className={`avatar ${message.role}`} aria-hidden="true">
                    <span>{message.role === "user" ? "You" : "AI"}</span>
                  </div>
                  <div className="message-column">
                    <div className={`message-bubble ${message.role}${message.error ? " error" : ""}`}>
                      {message.role === "user" ? (
                        <p className="plain-message">
                          <span>{message.text}</span>
                        </p>
                      ) : (
                        <>
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.text}
                            </ReactMarkdown>
                          </div>

                          {message.error && (
                            <button
                              className="retry-button"
                              type="button"
                              disabled={requestPending}
                              onClick={() => void handleRetry(message)}
                            >
                              <span>Retry</span>
                            </button>
                          )}

                          {!message.error && (
                            <div className="answer-actions">
                              <button
                                className="copy-button"
                                type="button"
                                onClick={() => void handleCopy(message)}
                              >
                                <span>
                                  {copiedId === message.id
                                    ? "Copied"
                                    : copyFailedId === message.id
                                      ? "Copy failed"
                                      : "Copy"}
                                </span>
                              </button>
                            </div>
                          )}

                          {(message.chart_data || message.chart_image) && (
                            <InteractiveChart
                              chartData={message.chart_data}
                              plotlyData={message.plotly_data}
                              chartImage={message.chart_image}
                            />
                          )}

                          {((message.references && message.references.length > 0) || (message.sources && message.sources.length > 0)) && (
                            <div className="pdf-references-section" aria-label="PDF Document References">
                              <div className="references-header">
                                <span className="ref-header-icon" aria-hidden="true">📑</span>
                                <span className="ref-header-title">PDF Document References</span>
                                <span className="ref-count-badge">
                                  {(message.references?.length || message.sources?.length)} source{(message.references?.length || message.sources?.length) > 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="references-grid">
                                {message.references && message.references.length > 0 ? (
                                  message.references.map((ref, idx) => (
                                    <button
                                      type="button"
                                      className="pdf-ref-card interactive"
                                      key={`${message.id}-ref-${ref.file_name}-${ref.page || idx}`}
                                      onClick={() => openPdfReference(ref.file_name, ref.page)}
                                      title={`Click to open ${ref.file_name}${ref.page ? ` at Page ${ref.page}` : ""}`}
                                    >
                                      <div className="pdf-ref-card-top">
                                        <div className="pdf-icon-badge" aria-hidden="true">
                                          <span>PDF</span>
                                        </div>
                                        <div className="pdf-file-details">
                                          <span className="pdf-ref-filename notranslate" translate="no" title={ref.file_name}>
                                            {ref.file_name}
                                          </span>
                                          {ref.page && (
                                            <span className="pdf-page-pill">
                                              Page {ref.page}
                                            </span>
                                          )}
                                        </div>
                                        <span className="pdf-card-open-arrow" aria-hidden="true">↗</span>
                                      </div>
                                      {ref.snippet && (
                                        <p className="pdf-ref-snippet" title={ref.snippet}>
                                          “{ref.snippet}”
                                        </p>
                                      )}
                                      <div className="pdf-card-hint">
                                        <span>Click to view page {ref.page || 1}</span>
                                      </div>
                                    </button>
                                  ))
                                ) : (
                                  message.sources.map((source) => (
                                    <button
                                      type="button"
                                      className="pdf-ref-card interactive"
                                      key={`${message.id}-src-${source}`}
                                      onClick={() => openPdfReference(source, 1)}
                                      title={`Click to open ${source}`}
                                    >
                                      <div className="pdf-ref-card-top">
                                        <div className="pdf-icon-badge" aria-hidden="true">
                                          <span>PDF</span>
                                        </div>
                                        <div className="pdf-file-details">
                                          <span className="pdf-ref-filename notranslate" translate="no" title={source}>
                                            {source}
                                          </span>
                                        </div>
                                        <span className="pdf-card-open-arrow" aria-hidden="true">↗</span>
                                      </div>
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <p className="message-timestamp">
                      <time dateTime={new Date(message.timestamp).toISOString()}>
                        <span>{timestampLabel(message.timestamp)}</span>
                      </time>
                    </p>
                  </div>
                </article>
              ))}

              {asking && (
                <div
                  className="message-row assistant"
                  key={`typing-${activeChatId}-${pendingChatId}`}
                  role="status"
                  aria-label="Assistant is typing"
                >
                  <div className="avatar assistant" aria-hidden="true">
                    <span>AI</span>
                  </div>
                  <div className="message-column">
                    <div className="typing-indicator" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
              {translationWarning && (
                <p className="translation-warning" role="alert">
                  <span>{translationWarning}</span>
                </p>
              )}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={handleAsk} style={isChatEmpty ? { maxWidth: "800px", width: "100%", margin: "0 auto" } : {}}>
              <label className="sr-only" htmlFor="question-input">
                <span>Ask a question</span>
              </label>
              <div className="composer-input-group" style={{ display: "flex", flex: 1, alignItems: "center", position: "relative" }}>
                <input
                  id="question-input"
                  type="text"
                  placeholder="Message your knowledge base or click the mic…"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={requestPending}
                  style={isChatEmpty ? { borderRadius: "24px", padding: "16px 56px 16px 24px", fontSize: "1.1rem" } : { paddingRight: "48px" }}
                />
                <div style={{ position: "absolute", right: "10px", display: "flex", alignItems: "center", zIndex: 2 }}>
                  <VoiceMic
                    selectedLanguage={selectedLanguage}
                    disabled={requestPending}
                    onTranscript={(spokenText) => {
                      setInput((prev) => (prev ? `${prev.trim()} ${spokenText.trim()}` : spokenText.trim()));
                    }}
                  />
                </div>
              </div>
              <button type="submit" disabled={requestPending || !input.trim()} style={isChatEmpty ? { borderRadius: "24px", padding: "16px 24px" } : {}}>
                <span>{asking ? "Sending…" : "Send"}</span>
              </button>
            </form>
            {isChatEmpty && (
              <div className="example-questions" style={{ display: "flex", justifyContent: "center", gap: "10px", marginTop: "24px", flexWrap: "wrap" }}>
                {EXAMPLE_QUESTIONS.map((question) => (
                  <button
                    className="example-chip"
                    key={question}
                    type="button"
                    disabled={requestPending}
                    onClick={() =>
                      void sendQuestion(question, { chatId: activeChatId })
                    }
                  >
                    <span>{question}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="privacy-note" style={isChatEmpty ? { textAlign: "center", marginTop: "16px" } : {}}>
              <span>AI responses can make mistakes. Verify important details in the source documents.</span>
            </p>
          </section>
        </main>
        )}
      </div>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
      />

      {activePdf && (
        <PdfModalViewer
          pdfDoc={activePdf}
          onClose={() => setActivePdf(null)}
        />
      )}
    </div>
  );
}
