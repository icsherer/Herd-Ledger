import { useState } from "react";
import { supabase } from "./supabase";

export default function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");

  async function handle() {
    setLoading(true); setError(""); setMessage("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account, then log in.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1B3A2B", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "40px", width: "100%", maxWidth: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#1B3A2B" }}>Herd Ledger</div>
          <div style={{ fontSize: "13px", color: "#7A8C7A", marginTop: "4px", letterSpacing: "1px" }}>LIVESTOCK MANAGEMENT</div>
        </div>
        <div style={{ display: "flex", marginBottom: "24px", borderRadius: "6px", overflow: "hidden", border: "1.5px solid #E0D5C0" }}>
          {["login", "signup"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "10px", border: "none", background: mode === m ? "#1B3A2B" : "transparent", color: mode === m ? "#fff" : "#7A8C7A", fontWeight: 600, fontSize: "14px", cursor: "pointer", textTransform: "capitalize" }}>
              {m === "login" ? "Log In" : "Sign Up"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: "10px 14px", border: "1.5px solid #E0D5C0", borderRadius: "6px", fontSize: "15px", outline: "none" }} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} style={{ padding: "10px 14px", border: "1.5px solid #E0D5C0", borderRadius: "6px", fontSize: "15px", outline: "none" }} />
          {error && <div style={{ color: "#C0392B", fontSize: "13px" }}>{error}</div>}
          {message && <div style={{ color: "#2E6347", fontSize: "13px" }}>{message}</div>}
          <button onClick={handle} disabled={loading} style={{ padding: "12px", background: "#1B3A2B", color: "#fff", border: "none", borderRadius: "6px", fontSize: "15px", fontWeight: 600, cursor: "pointer", marginTop: "4px" }}>
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
