import { useState, useRef, useEffect } from "react";
import { Input, Btn } from "./ui.jsx";

/** Dropdown of contacts with type-to-search + optional "Add New Contact" inline. value/onChange for single field; onSelectContact(contact) for buyer (sets name + contact). */
export default function ContactPicker({ label, value, onChange, contacts = [], setContacts, placeholder = "Search or type name", onSelectContact }) {
  const [open, setOpen] = useState(false);
  const [addNew, setAddNew] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", ranchCompany: "", phone: "", email: "", notes: "" });
  const wrapperRef = useRef(null);

  const q = (value || "").trim().toLowerCase();
  const filtered = (contacts || []).filter(c => {
    if (!q) return true;
    return [c.name, c.ranchCompany, c.phone, c.email].some(f => (f || "").toLowerCase().includes(q));
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (c) => {
    if (onSelectContact) {
      onSelectContact(c);
    } else {
      onChange(c.name || "");
    }
    setOpen(false);
  };

  const saveNewContact = () => {
    const name = (newContact.name || "").trim();
    if (!name) return;
    const id = Date.now().toString();
    const c = { id, name, ranchCompany: (newContact.ranchCompany || "").trim(), phone: (newContact.phone || "").trim(), email: (newContact.email || "").trim(), notes: (newContact.notes || "").trim() };
    setContacts([...(contacts || []), c]);
    if (onSelectContact) onSelectContact(c); else onChange(name);
    setNewContact({ name: "", ranchCompany: "", phone: "", email: "", notes: "" });
    setAddNew(false);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="hl-input"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          minHeight: "44px",
        }}
      />
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", background: "#fff", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 1000, maxHeight: "280px", overflowY: "auto" }}>
          {!addNew ? (
            <>
              {filtered.slice(0, 20).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  style={{ display: "block", width: "100%", padding: "10px 14px", textAlign: "left", background: "none", border: "none", fontSize: "14px", color: "var(--ink)", cursor: "pointer" }}
                >
                  <div style={{ fontWeight: 600 }}>{c.name || "Unnamed"}</div>
                  {(c.ranchCompany || c.phone || c.email) && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{[c.ranchCompany, c.phone, c.email].filter(Boolean).join(" · ")}</div>}
                </button>
              ))}
              {filtered.length === 0 && (contacts || []).length > 0 && <div style={{ padding: "12px 14px", fontSize: "13px", color: "var(--muted)" }}>No matches</div>}
              <div style={{ borderTop: "1px solid var(--cream2)", padding: "8px" }}>
                <Btn size="sm" variant="ghost" onClick={() => setAddNew(true)} style={{ width: "100%" }}>+ Add New Contact</Btn>
              </div>
            </>
          ) : (
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                <Input label="Name *" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="e.g. John Smith" />
                <Input label="Ranch / Company" value={newContact.ranchCompany} onChange={e => setNewContact(p => ({ ...p, ranchCompany: e.target.value }))} placeholder="e.g. Smith Livestock" />
                <Input label="Phone" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="555-123-4567" />
                <Input label="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn size="sm" onClick={saveNewContact} disabled={!(newContact.name || "").trim()}>Save & Use</Btn>
                <Btn size="sm" variant="ghost" onClick={() => { setAddNew(false); setNewContact({ name: "", ranchCompany: "", phone: "", email: "", notes: "" }); }}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
