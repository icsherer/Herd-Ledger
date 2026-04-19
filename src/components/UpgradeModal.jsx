import { useState } from "react";
import { supabase } from "../supabase";

const SUPABASE_FUNCTIONS_URL = "https://ugjtrdnqrlanrenhsddf.supabase.co/functions/v1";

export default function UpgradeModal({ user, onClose }) {
  const [loading, setLoading] = useState(null); // 'monthly' | 'annual' | null
  const [error, setError] = useState(null);

  async function handleUpgrade(plan) {
    setLoading(plan);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout-session?plan=${plan}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Failed to create checkout session");
      window.location.href = json.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--cream)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header band */}
        <div style={{
          background: "var(--green)",
          padding: "28px 28px 24px",
          textAlign: "center",
          borderBottom: "3px solid var(--brass)",
        }}>
          <div style={{
            fontFamily: "'Playfair Display'",
            fontSize: "13px",
            letterSpacing: "3px",
            textTransform: "uppercase",
            color: "var(--brass3)",
            marginBottom: "8px",
          }}>
            Herd Ledger Pro
          </div>
          <div style={{
            fontFamily: "'Playfair Display'",
            fontSize: "28px",
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.2,
          }}>
            Upgrade to Pro
          </div>
          <div style={{
            fontSize: "15px",
            color: "rgba(255,255,255,0.75)",
            marginTop: "8px",
          }}>
            You've reached the 20 animal limit on the free plan
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "24px 28px 28px" }}>
          {/* Trial callout */}
          <div style={{
            background: "rgba(201,149,42,0.1)",
            border: "1px solid var(--brass2)",
            borderRadius: "10px",
            padding: "12px 16px",
            textAlign: "center",
            marginBottom: "20px",
            fontSize: "14px",
            color: "var(--ink)",
          }}>
            <strong style={{ color: "var(--brass)" }}>Try free for 14 days</strong>
            {" "}— then choose a plan below. Cancel anytime.
          </div>

          {/* Plan cards */}
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            {/* Annual — shown first */}
            <div style={{
              flex: "1 1 180px",
              border: "2px solid var(--brass)",
              borderRadius: "12px",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              background: "#fff",
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                top: "-12px",
                background: "var(--brass)",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "1px",
                textTransform: "uppercase",
                padding: "3px 12px",
                borderRadius: "20px",
              }}>
                Best Value
              </div>
              <div style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--brass)",
              }}>
                Save 33%
              </div>
              <div style={{
                fontFamily: "'Playfair Display'",
                fontSize: "32px",
                fontWeight: 700,
                color: "var(--ink)",
                lineHeight: 1,
              }}>
                $79.99
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)" }}>per year</div>
              <ul style={{
                listStyle: "none",
                padding: 0,
                margin: "4px 0 0",
                fontSize: "12px",
                color: "var(--ink2)",
                lineHeight: 1.9,
                alignSelf: "stretch",
              }}>
                {[
                  "Unlimited animals",
                  "Health records & vaccinations",
                  "Bill of Sale PDF generator",
                  "Hay & forage inventory",
                  "Pasture management",
                  "P&L reports & Schedule F export",
                  "Breeding & gestation tracking",
                  "Priority support",
                ].map(f => <li key={f} style={{ display: "flex", gap: "6px" }}><span style={{ color: "var(--brass)", fontWeight: 700 }}>✓</span>{f}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => handleUpgrade("annual")}
                disabled={loading !== null}
                style={{
                  width: "100%",
                  padding: "11px",
                  background: loading === "annual" ? "var(--brass2)" : "var(--brass)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: loading !== null ? "not-allowed" : "pointer",
                  marginTop: "4px",
                  transition: "background 0.15s",
                }}
              >
                {loading === "annual" ? "Redirecting…" : "Start Free Trial"}
              </button>
            </div>

            {/* Monthly */}
            <div style={{
              flex: "1 1 180px",
              border: "2px solid var(--cream3)",
              borderRadius: "12px",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              background: "#fff",
            }}>
              <div style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}>
                Month to Month
              </div>
              <div style={{
                fontFamily: "'Playfair Display'",
                fontSize: "32px",
                fontWeight: 700,
                color: "var(--ink)",
                lineHeight: 1,
              }}>
                $9.99
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)" }}>per month</div>
              <ul style={{
                listStyle: "none",
                padding: 0,
                margin: "4px 0 0",
                fontSize: "12px",
                color: "var(--ink2)",
                lineHeight: 1.9,
                alignSelf: "stretch",
              }}>
                {[
                  "Unlimited animals",
                  "Health records & vaccinations",
                  "Bill of Sale PDF generator",
                  "Hay & forage inventory",
                  "Pasture management",
                  "P&L reports & Schedule F export",
                  "Breeding & gestation tracking",
                  "Priority support",
                ].map(f => <li key={f} style={{ display: "flex", gap: "6px" }}><span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>{f}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => handleUpgrade("monthly")}
                disabled={loading !== null}
                style={{
                  width: "100%",
                  padding: "11px",
                  background: loading === "monthly" ? "var(--green2)" : "var(--green)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: loading !== null ? "not-allowed" : "pointer",
                  marginTop: "4px",
                  transition: "background 0.15s",
                }}
              >
                {loading === "monthly" ? "Redirecting…" : "Start Free Trial"}
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: "14px",
              padding: "10px 14px",
              background: "#fff0f0",
              border: "1px solid #f5c6c6",
              borderRadius: "8px",
              fontSize: "13px",
              color: "#c0392b",
            }}>
              {error}
            </div>
          )}

          <div style={{ textAlign: "center", marginTop: "18px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                fontSize: "13px",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Stay on free plan (20 animal limit)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
