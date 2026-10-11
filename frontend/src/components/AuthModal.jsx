import { useState } from "react";
import { supabase } from "../supabaseClient.js";
import "./AuthModal.css";

export default function AuthModal({ isOpen, onClose, initialMode = "signin" }) {
  const [mode, setMode] = useState(initialMode); // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text: '' }

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setMessage({ type: "success", text: "Signed in successfully!" });
        setTimeout(() => {
          onClose();
        }, 500);
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
            },
          },
        });
        if (error) throw error;
        if (data?.session) {
          setMessage({ type: "success", text: "Account created and logged in!" });
          setTimeout(() => onClose(), 600);
        } else {
          setMessage({
            type: "success",
            text: "Account registered! If confirmation is required, please check your email inbox.",
          });
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        setMessage({
          type: "success",
          text: "Password reset link sent to your email.",
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Authentication error." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="auth-modal-close"
          onClick={onClose}
          aria-label="Close authentication modal"
        >
          ✕
        </button>

        <div className="auth-modal-header">
          <div className="auth-modal-brand">
            <span className="auth-brand-badge">✦ Nova RAG</span>
          </div>
          <h2>
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
              ? "Create your account"
              : "Reset password"}
          </h2>
          <p>
            {mode === "signin"
              ? "Sign in with your Supabase credentials to access your document assistant."
              : mode === "signup"
              ? "Join your team knowledge hub with AI-grounded retrieval."
              : "Enter your registered email to receive a password recovery link."}
          </p>
        </div>

        {message && (
          <div className={`auth-alert ${message.type}`} role="alert">
            <span className="auth-alert-icon">
              {message.type === "error" ? "⚠️" : "✓"}
            </span>
            <span>{message.text}</span>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                type="text"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email Address</label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {mode !== "forgot" && (
            <div className="auth-field">
              <div className="auth-field-label-row">
                <label htmlFor="auth-password">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    className="auth-link-button inline-link"
                    onClick={() => {
                      setMessage(null);
                      setMode("forgot");
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="auth-spinner" aria-hidden="true" />
            ) : null}
            <span>
              {loading
                ? "Processing…"
                : mode === "signin"
                ? "Sign In"
                : mode === "signup"
                ? "Create Account"
                : "Send Reset Link"}
            </span>
          </button>
        </form>

        <div className="auth-modal-footer">
          {mode === "signin" ? (
            <p>
              Don't have an account?{" "}
              <button
                type="button"
                className="auth-link-button"
                onClick={() => {
                  setMessage(null);
                  setMode("signup");
                }}
              >
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="auth-link-button"
                onClick={() => {
                  setMessage(null);
                  setMode("signin");
                }}
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
