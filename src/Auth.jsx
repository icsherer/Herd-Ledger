import { useState } from "react";
import { supabase } from "./supabase";

const AUTH_STYLES = {
  page: { minHeight: "100vh", background: "#1B3A2B", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" },
  card: { background: "#fff", borderRadius: "12px", padding: "40px", width: "100%", maxWidth: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" },
  input: { padding: "10px 14px", border: "1.5px solid #E0D5C0", borderRadius: "6px", fontSize: "15px", outline: "none" },
  btn: { padding: "12px", background: "#1B3A2B", color: "#fff", border: "none", borderRadius: "6px", fontSize: "15px", fontWeight: 600, cursor: "pointer", marginTop: "4px" },
};

export default function Auth({ onLogin, onContinueAsGuest }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handle() {
    setLoading(true); setError(""); setMessage("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account, then log in.");
    }
    setLoading(false);
  }

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setLoading(true); setError(""); setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: "https://herdledger.app/reset" });
    if (error) setError(error.message);
    else setMessage("Check your email for a reset link.");
    setLoading(false);
  }

  return (
    <div style={AUTH_STYLES.page}>
      <div style={AUTH_STYLES.card}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#1B3A2B" }}>Herd Ledger</div>
          <div style={{ fontSize: "13px", color: "#7A8C7A", marginTop: "4px", letterSpacing: "1px" }}>LIVESTOCK MANAGEMENT</div>
        </div>

        {mode === "forgot" ? (
          <>
            <div style={{ marginBottom: "24px" }}>
              <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#1B3A2B", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }}>
                ← Back to Log In
              </button>
            </div>
            <form onSubmit={handleForgotSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required style={{ ...AUTH_STYLES.input, width: "100%", boxSizing: "border-box" }} />
              {error && <div style={{ color: "#C0392B", fontSize: "13px" }}>{error}</div>}
              {message && <div style={{ color: "#2E6347", fontSize: "13px" }}>{message}</div>}
              <button type="submit" disabled={loading} style={AUTH_STYLES.btn}>
                {loading ? "Sending…" : "Send Reset Email"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div style={{ display: "flex", marginBottom: "24px", borderRadius: "6px", overflow: "hidden", border: "1.5px solid #E0D5C0" }}>
              {["login", "signup"].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "10px", border: "none", background: mode === m ? "#1B3A2B" : "transparent", color: mode === m ? "#fff" : "#7A8C7A", fontWeight: 600, fontSize: "14px", cursor: "pointer", textTransform: "capitalize" }}>
                  {m === "login" ? "Log In" : "Sign Up"}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={{ ...AUTH_STYLES.input, width: "100%", boxSizing: "border-box" }} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} style={{ ...AUTH_STYLES.input, width: "100%", boxSizing: "border-box" }} />
              {error && <div style={{ color: "#C0392B", fontSize: "13px" }}>{error}</div>}
              {message && <div style={{ color: "#2E6347", fontSize: "13px" }}>{message}</div>}
              <button type="button" onClick={handle} disabled={loading} style={AUTH_STYLES.btn}>
                {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
              </button>
              {mode === "login" && (
                <button type="button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }} style={{ background: "none", border: "none", color: "#7A8C7A", fontSize: "13px", cursor: "pointer", textDecoration: "underline", padding: "4px 0" }}>
                  Forgot your password?
                </button>
              )}
              {onContinueAsGuest && (
                <button type="button" onClick={onContinueAsGuest} style={{ marginTop: "16px", padding: "12px", background: "transparent", color: "#1B3A2B", border: "1.5px solid #1B3A2B", borderRadius: "6px", fontSize: "14px", fontWeight: 600, cursor: "pointer", width: "100%" }}>
                  Continue as Guest
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else {
      setSuccess(true);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      window.location.reload();
    }
  }

  return (
    <div style={AUTH_STYLES.page}>
      <div style={AUTH_STYLES.card}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#1B3A2B" }}>Herd Ledger</div>
          <div style={{ fontSize: "13px", color: "#7A8C7A", marginTop: "4px", letterSpacing: "1px" }}>SET NEW PASSWORD</div>
        </div>
        {success ? (
          <p style={{ color: "#2E6347", fontSize: "15px" }}>Password updated. Redirecting…</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input type="password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={{ ...AUTH_STYLES.input, width: "100%", boxSizing: "border-box" }} />
            <input type="password" placeholder="Confirm new password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} style={{ ...AUTH_STYLES.input, width: "100%", boxSizing: "border-box" }} />
            {error && <div style={{ color: "#C0392B", fontSize: "13px" }}>{error}</div>}
            <button type="submit" disabled={loading} style={AUTH_STYLES.btn}>
              {loading ? "Updating…" : "Set New Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
