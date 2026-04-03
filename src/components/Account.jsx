import { useState, useEffect } from "react";
import { supabase } from "../supabase";

const SUPABASE_FUNCTIONS_URL = "https://ugjtrdnqrlanrenhsddf.supabase.co/functions/v1";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnanRyZG5xcmxhbnJlbmhzZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MzMwNzMsImV4cCI6MjA1NjAwOTA3M30.p7DFBtkQ9M3ShLOHQGAY0-8YqfJLj_4pQR0Q5NQBT6c";

export default function Account({ user, subscription }) {
  const [periodEnd, setPeriodEnd] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(null);
  const [upgradeError, setUpgradeError] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase
      .from("subscriptions")
      .select("current_period_end")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.current_period_end) setPeriodEnd(data.current_period_end);
      });
  }, [user.id]);

  const sub = subscription ?? { status: "free", grandfathered: false, plan: null };
  const isPro = sub.status === "active" || sub.status === "trialing" || sub.grandfathered;

  const planName = sub.grandfathered
    ? "Pro (Grandfathered)"
    : sub.plan === "annual"
    ? "Pro Annual"
    : sub.plan === "monthly"
    ? "Pro Monthly"
    : "Free";

  let statusLabel;
  let statusColor;
  if (sub.grandfathered) {
    statusLabel = "Active";
    statusColor = "var(--green)";
  } else if (sub.status === "active") {
    statusLabel = "Active";
    statusColor = "var(--green)";
  } else if (sub.status === "trialing") {
    const msLeft = periodEnd ? new Date(periodEnd) - Date.now() : null;
    const daysLeft = msLeft !== null ? Math.max(0, Math.ceil(msLeft / 86400000)) : null;
    statusLabel = daysLeft !== null
      ? `Trial — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`
      : "Trial Active";
    statusColor = "var(--brass)";
  } else {
    statusLabel = "Free Plan";
    statusColor = "var(--muted)";
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-portal-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Failed to open billing portal");
      window.location.href = json.url;
    } catch (err) {
      setPortalError(err.message);
      setPortalLoading(false);
    }
  }

  async function handleUpgrade(plan) {
    setUpgradeLoading(plan);
    setUpgradeError(null);
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
      setUpgradeError(err.message);
      setUpgradeLoading(null);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const userId = user.id;
      const tables = ["animals", "gestations", "tasks", "contacts", "expenses", "feeder_programs", "load_sales", "notes", "pastures", "pasture_feed_logs", "user_settings", "user_data"];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", userId);
        if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-account`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to delete account. Please contact support.");
        }
      }
      await supabase.auth.signOut();
    } catch (err) {
      setDeleteError(err.message || "An error occurred. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "32px", fontWeight: 700, color: "#1B3A2B", marginBottom: "8px" }}>
            My Account
          </div>
          <div style={{ fontSize: "14px", color: "var(--muted)" }}>
            Herd Ledger · {user.email}
          </div>
        </div>

        {/* Current Plan */}
        <Section title="Current Plan">
          <div style={{
            background: "#fff",
            borderRadius: "12px",
            padding: "20px 24px",
            border: "1px solid var(--cream3)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "#1B3A2B", marginBottom: "6px" }}>
                  {planName}
                </div>
                <div style={{ fontSize: "14px", color: statusColor, fontWeight: 600, marginBottom: "4px" }}>
                  {statusLabel}
                </div>
                {periodEnd && sub.status === "active" && (
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                    Next billing date:{" "}
                    {new Date(periodEnd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </div>
                )}
              </div>
              {isPro && !sub.grandfathered && (
                <button
                  type="button"
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                  style={{
                    padding: "10px 18px",
                    background: "var(--green)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: portalLoading ? "not-allowed" : "pointer",
                    opacity: portalLoading ? 0.7 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {portalLoading ? "Opening…" : "Manage Subscription"}
                </button>
              )}
            </div>
            {portalError && (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "8px", fontSize: "13px", color: "#c0392b" }}>
                {portalError}
              </div>
            )}
          </div>
        </Section>

        {/* Upgrade card — hidden if already pro */}
        {!isPro && (
          <Section title="Upgrade to Pro">
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
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "var(--brass)" }}>
                  Save 33%
                </div>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "32px", fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>
                  $79.99
                </div>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>per year</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", fontSize: "12px", color: "var(--ink2)", lineHeight: 1.9, alignSelf: "stretch" }}>
                  {PLAN_FEATURES.map(f => (
                    <li key={f} style={{ display: "flex", gap: "6px" }}>
                      <span style={{ color: "var(--brass)", fontWeight: 700 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleUpgrade("annual")}
                  disabled={upgradeLoading !== null}
                  style={{
                    width: "100%",
                    padding: "11px",
                    background: upgradeLoading === "annual" ? "var(--brass2)" : "var(--brass)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: upgradeLoading !== null ? "not-allowed" : "pointer",
                    marginTop: "4px",
                  }}
                >
                  {upgradeLoading === "annual" ? "Redirecting…" : "Start Free Trial"}
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
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "var(--muted)" }}>
                  Month to Month
                </div>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "32px", fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>
                  $9.99
                </div>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>per month</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0", fontSize: "12px", color: "var(--ink2)", lineHeight: 1.9, alignSelf: "stretch" }}>
                  {PLAN_FEATURES.map(f => (
                    <li key={f} style={{ display: "flex", gap: "6px" }}>
                      <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => handleUpgrade("monthly")}
                  disabled={upgradeLoading !== null}
                  style={{
                    width: "100%",
                    padding: "11px",
                    background: upgradeLoading === "monthly" ? "var(--green2)" : "var(--green)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: upgradeLoading !== null ? "not-allowed" : "pointer",
                    marginTop: "4px",
                  }}
                >
                  {upgradeLoading === "monthly" ? "Redirecting…" : "Start Free Trial"}
                </button>
              </div>
            </div>

            {upgradeError && (
              <div style={{ marginTop: "14px", padding: "10px 14px", background: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "8px", fontSize: "13px", color: "#c0392b" }}>
                {upgradeError}
              </div>
            )}
          </Section>
        )}

        {/* Danger Zone */}
        <Section title="Danger Zone">
          <p style={{ fontSize: "15px", color: "var(--ink2)", lineHeight: 1.7, margin: "0 0 16px" }}>
            Permanently delete your account and all associated data — animals, records, photos, and documents.
            This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => { setDeleteConfirmText(""); setDeleteError(null); setShowDeleteModal(true); }}
            style={{
              padding: "10px 20px",
              background: "#C0392B",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete Account
          </button>
        </Section>

        {/* Back link */}
        <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--cream2)" }}>
          <a
            href="https://app.herdledger.app"
            style={{ fontSize: "14px", color: "var(--muted)", textDecoration: "none", fontWeight: 500 }}
          >
            ← Back to Herd Ledger
          </a>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          onClick={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(null); } }}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "var(--cream)", borderRadius: "14px", padding: "28px 24px", maxWidth: "420px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
          >
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 700, color: "#C0392B", marginBottom: "14px" }}>
              Delete Account
            </div>
            <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.6, marginBottom: "20px" }}>
              This will permanently delete all your animals, records, photos, and account data.{" "}
              <strong>This cannot be undone.</strong>
            </p>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--cream3)", borderRadius: "8px", fontSize: "14px", boxSizing: "border-box" }}
              />
            </div>
            {deleteError && (
              <div style={{ marginBottom: "14px", padding: "10px 14px", background: "#fff0f0", border: "1px solid #f5c6c6", borderRadius: "8px", fontSize: "13px", color: "#c0392b" }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  background: deleteConfirmText === "DELETE" && !deleting ? "#C0392B" : "#e0c0bc",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: deleteConfirmText === "DELETE" && !deleting ? "pointer" : "not-allowed",
                }}
              >
                {deleting ? "Deleting…" : "Permanently Delete Account"}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(null); }}
                disabled={deleting}
                style={{ padding: "10px 16px", background: "var(--cream2)", color: "var(--ink)", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "36px" }}>
      <div style={{
        fontFamily: "'Playfair Display'",
        fontSize: "18px",
        fontWeight: 600,
        color: "#1B3A2B",
        marginBottom: "12px",
        paddingBottom: "6px",
        borderBottom: "2px solid var(--cream2)",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

const PLAN_FEATURES = [
  "Unlimited animals",
  "Health records & vaccinations",
  "Bill of Sale PDF generator",
  "Hay & forage inventory",
  "Pasture management",
  "P&L reports & Schedule F export",
  "Breeding & gestation tracking",
  "Priority support",
];
