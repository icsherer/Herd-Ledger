import { useState } from "react";
import { DEFAULT_TAB_VISIBILITY, TAB_OPTIONS, SPECIES, VACCINE_ROUTES } from "../lib/constants.js";
import { Card, Input, Select, Btn } from "./ui.jsx";
import { supabase } from "../supabase";

const emptyVaccine = () => ({ vaccineName: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "", trackBooster: false });
const emptyProtocol = () => ({ id: "", name: "", vaccines: [emptyVaccine()] });

const emptyContact = () => ({ id: "", name: "", ranchCompany: "", phone: "", email: "", notes: "" });

export default function Settings({ settings, setSettings, contacts = [], setContacts, onLogout, setTab }) {
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const protocols = settings?.vaccinationProtocols ?? [];
  const [protocolForm, setProtocolForm] = useState(null); // null | { id, name, vaccines } for add/edit
  const [contactForm, setContactForm] = useState(null); // null | contact for add/edit
  const [expandedContactId, setExpandedContactId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const setProtocols = (next) => setSettings(prev => ({ ...prev, vaccinationProtocols: next }));
  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error("Could not identify user.");
      const tables = ["animals", "gestations", "tasks", "contacts", "expenses", "feeder_programs", "load_sales", "notes", "pastures", "pasture_feed_logs", "user_settings", "user_data"];
      for (const table of tables) {
        const { error } = await supabase.from(table).delete().eq("user_id", userId);
        if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const res = await fetch("https://ugjtrdnqrlanrenhsddf.supabase.co/functions/v1/delete-account", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnanRyZG5xcmxhbnJlbmhzZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA0MzMwNzMsImV4cCI6MjA1NjAwOTA3M30.p7DFBtkQ9M3ShLOHQGAY0-8YqfJLj_4pQR0Q5NQBT6c",
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

  const setVisibility = (id, value) => {
    setSettings(prev => ({
      ...prev,
      tabVisibility: { ...(prev?.tabVisibility ?? DEFAULT_TAB_VISIBILITY), [id]: value },
    }));
  };
  return (
    <div className="hl-page hl-fade-in">
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)", marginBottom: "24px" }}>Settings</div>

        {setTab && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setTab("help")}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("help"); } }}
            style={{ padding: "16px 20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderLeft: "4px solid var(--brass)" }}
          >
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>Help & Guide</span>
            <span style={{ color: "var(--brass2)", fontSize: "18px" }}>→</span>
          </Card>
        )}

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Farm Profile</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Input
              label="Farm name"
              value={settings?.farmName ?? ""}
              onChange={e => setSettings(prev => ({ ...prev, farmName: e.target.value }))}
              placeholder="e.g. Green Valley Ranch"
            />
            <Input
              label="Owner name"
              value={settings?.ownerName ?? ""}
              onChange={e => setSettings(prev => ({ ...prev, ownerName: e.target.value }))}
              placeholder="e.g. Jane Smith"
            />
          </div>
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Default Species</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>Pre-select this species when adding a new animal.</p>
          <Select
            value={settings?.defaultSpecies ?? "Cattle"}
            onChange={e => setSettings(prev => ({ ...prev, defaultSpecies: e.target.value }))}
          >
            {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
          </Select>
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Vaccination Protocols</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Create named templates (e.g. Spring Working) with vaccine name, dosage, route, and booster interval. Use them when logging vaccinations on animal profiles or in bulk.</p>
          {protocols.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {protocols.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>{p.name || "Unnamed"}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>{p.vaccines?.length ?? 0} vaccine{(p.vaccines?.length ?? 0) !== 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Btn size="sm" variant="ghost" onClick={() => setProtocolForm({ id: p.id, name: p.name || "", vaccines: (p.vaccines || []).length ? p.vaccines.map(v => ({ vaccineName: v.vaccineName || "", dosage: v.dosage || "", route: v.route || "IM (Intramuscular)", boosterIntervalDays: v.boosterIntervalDays != null ? String(v.boosterIntervalDays) : "", trackBooster: !!v.trackBooster })) : [emptyVaccine()] })}>Edit</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { if (confirm("Delete this protocol? This cannot be undone.")) setProtocols(protocols.filter(x => x.id !== p.id)); }}>Delete</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!protocolForm ? (
            <Btn variant="secondary" onClick={() => setProtocolForm(emptyProtocol())}>Add Protocol</Btn>
          ) : (
            <div style={{ padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Protocol name</label>
                <Input value={protocolForm.name} onChange={e => setProtocolForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Spring Working" />
              </div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px" }}>Treatments</div>
              {(protocolForm.vaccines || []).map((v, i) => (
                <div key={i} style={{ position: "relative", padding: "14px", background: "#fff", borderRadius: "var(--radius)", border: "1px solid var(--cream3)", marginBottom: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button type="button" onClick={() => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.filter((_, j) => j !== i) }))} style={{ position: "absolute", top: "8px", right: "8px", padding: "2px 8px", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }} title="Remove vaccine">×</button>
                  <Input label="Product name" placeholder="e.g. Ivomec, Cylence, Vision 7, Bovi-Shield" value={v.vaccineName} onChange={e => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.map((x, j) => j === i ? { ...x, vaccineName: e.target.value } : x) }))} />
                  <Input label="Dosage" placeholder="e.g. 2 mL" value={v.dosage} onChange={e => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x) }))} />
                  <Select label="Route" value={v.route} onChange={e => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.map((x, j) => j === i ? { ...x, route: e.target.value } : x) }))}>
                    {VACCINE_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!v.trackBooster} onChange={e => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.map((x, j) => j === i ? { ...x, trackBooster: e.target.checked } : x) }))} style={{ width: "16px", height: "16px", accentColor: "var(--green)" }} />
                    Track booster
                  </label>
                  {v.trackBooster && (
                    <Input label="Booster interval (days)" type="number" min={0} placeholder="e.g. 365" value={v.boosterIntervalDays} onChange={e => setProtocolForm(p => ({ ...p, vaccines: p.vaccines.map((x, j) => j === i ? { ...x, boosterIntervalDays: e.target.value } : x) }))} />
                  )}
                </div>
              ))}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                <Btn size="sm" variant="ghost" onClick={() => setProtocolForm(p => ({ ...p, vaccines: [...(p.vaccines || []), emptyVaccine()] }))}>+ Add treatment</Btn>
                <Btn size="sm" onClick={() => {
                  const name = (protocolForm.name || "").trim();
                  if (!name) return;
                  const vaccines = (protocolForm.vaccines || []).map(v => ({
                    vaccineName: (v.vaccineName || "").trim(),
                    dosage: (v.dosage || "").trim(),
                    route: v.route || "IM (Intramuscular)",
                    boosterIntervalDays: v.boosterIntervalDays !== "" && v.boosterIntervalDays != null ? parseInt(String(v.boosterIntervalDays), 10) : undefined,
                    trackBooster: !!v.trackBooster,
                  })).filter(v => v.vaccineName);
                  if (vaccines.length === 0) return;
                  const id = protocolForm.id || Date.now().toString();
                  const newProtocol = { id, name, vaccines };
                  const next = protocolForm.id ? protocols.map(p => p.id === id ? newProtocol : p) : [...protocols, newProtocol];
                  setProtocols(next);
                  setProtocolForm(null);
                }}>Save Protocol</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setProtocolForm(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Contacts</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Save seller and buyer contacts (name, ranch/company, phone, email). Use them when entering &quot;Purchased from&quot; or recording a sale.</p>
          {(contacts || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              {(contacts || []).map(c => {
                const isExpanded = expandedContactId === c.id;
                return (
                  <div key={c.id} style={{ borderRadius: "var(--radius)", border: "1px solid var(--cream2)", overflow: "hidden", background: isExpanded ? "rgba(201,149,42,0.05)" : "var(--cream)", borderLeft: isExpanded ? "3px solid var(--brass)" : "1px solid var(--cream2)" }}>
                    <button
                      onClick={() => setExpandedContactId(isExpanded ? null : c.id)}
                      style={{ display: "flex", alignItems: "center", width: "100%", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", gap: "10px", WebkitTapHighlightColor: "transparent" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name || "Unnamed"}</div>
                        {c.ranchCompany && <div style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.ranchCompany}</div>}
                      </div>
                      <span style={{ fontSize: "16px", color: "var(--muted)", flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s ease", display: "inline-block" }}>›</span>
                    </button>
                    {isExpanded && (
                      <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--cream2)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "var(--ink2)", paddingTop: "10px", marginBottom: "12px" }}>
                          {c.phone && <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Phone: </span>{c.phone}</div>}
                          {c.email && <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Email: </span>{c.email}</div>}
                          {c.notes && <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Notes: </span>{c.notes}</div>}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <Btn size="sm" variant="ghost" onClick={() => { setContactForm({ id: c.id, name: c.name || "", ranchCompany: c.ranchCompany || "", phone: c.phone || "", email: c.email || "", notes: c.notes || "" }); setExpandedContactId(null); }}>Edit</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => { if (confirm("Delete this contact?")) { setContacts((contacts || []).filter(x => x.id !== c.id)); setExpandedContactId(null); } }}>Delete</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!contactForm ? (
            <Btn variant="secondary" onClick={() => setContactForm(emptyContact())}>Add Contact</Btn>
          ) : (
            <div style={{ padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "12px" }}>
                <Input label="Name" value={contactForm.name} onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Smith" />
                <Input label="Ranch / Company" value={contactForm.ranchCompany} onChange={e => setContactForm(p => ({ ...p, ranchCompany: e.target.value }))} placeholder="e.g. Smith Livestock" />
                <Input label="Phone" value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 555-123-4567" />
                <Input label="Email" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} placeholder="e.g. john@example.com" type="email" />
                <Input label="Notes" value={contactForm.notes} onChange={e => setContactForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <Btn size="sm" onClick={() => {
                  const name = (contactForm.name || "").trim();
                  if (!name) return;
                  const id = contactForm.id || Date.now().toString();
                  const newContact = { id, name, ranchCompany: (contactForm.ranchCompany || "").trim(), phone: (contactForm.phone || "").trim(), email: (contactForm.email || "").trim(), notes: (contactForm.notes || "").trim() };
                  const list = contacts || [];
                  const next = contactForm.id ? list.map(x => x.id === id ? newContact : x) : [...list, newContact];
                  setContacts(next);
                  setContactForm(null);
                }}>Save Contact</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setContactForm(null)}>Cancel</Btn>
              </div>
            </div>
          )}
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Tab Visibility</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Show or hide tabs in the navigation. Dashboard and Animals are always visible. Settings is always visible.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {TAB_OPTIONS.filter(t => t.id !== "dashboard" && t.id !== "animals").map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}><span>{t.icon}</span> {t.label}</span>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={visibility[t.id] !== false}
                    onChange={e => setVisibility(t.id, e.target.checked)}
                    style={{ width: "18px", height: "18px", accentColor: "var(--green)" }}
                  />
                </label>
              </div>
            ))}
          </div>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={onLogout}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLogout(); } }}
          style={{
            padding: "16px 20px",
            textAlign: "center",
            background: "#f8f0f0",
            border: "1px solid #e8d8d8",
            color: "#8b6b6b",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Log Out
        </Card>

        <div style={{ marginTop: "40px", paddingTop: "32px", borderTop: "2px solid #e8d8d8" }}>
          <button
            type="button"
            onClick={() => { setDeleteConfirmText(""); setDeleteError(null); setShowDeleteModal(true); }}
            style={{ background: "none", border: "1.5px solid #C0392B", color: "#C0392B", borderRadius: "var(--radius)", padding: "10px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer", width: "100%" }}
          >
            Delete Account
          </button>
        </div>
      </div>

      {showDeleteModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}
          onClick={() => { if (!deleting) { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(null); } }}
        >
          <Card style={{ padding: "28px", maxWidth: "420px", width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 700, color: "#C0392B", marginBottom: "14px" }}>Delete Account</div>
            <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.6, marginBottom: "20px" }}>
              This will permanently delete all your animals, records, photos, and account data. <strong>This cannot be undone.</strong>
            </p>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>Type <strong>DELETE</strong> to confirm</label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={deleting}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", fontSize: "14px", boxSizing: "border-box", fontFamily: "inherit" }}
              />
            </div>
            {deleteError && (
              <div style={{ marginBottom: "14px", padding: "10px 12px", background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: "var(--radius)", fontSize: "13px", color: "#C0392B" }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                style={{ flex: 1, background: deleteConfirmText === "DELETE" && !deleting ? "#C0392B" : "#e0c0bc", border: "none", color: "#fff", borderRadius: "var(--radius)", padding: "10px 16px", fontSize: "14px", fontWeight: 600, cursor: deleteConfirmText === "DELETE" && !deleting ? "pointer" : "not-allowed" }}
              >
                {deleting ? "Deleting…" : "Permanently Delete Account"}
              </button>
              <Btn variant="secondary" onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(""); setDeleteError(null); }} disabled={deleting}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
