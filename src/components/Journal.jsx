import { useState } from "react";
import { getAnimalName, fmt } from "../lib/helpers.js";
import { Card, Btn, Input, SectionTitle, Select, Textarea } from "./ui.jsx";

export default function Notes({ notes, setNotes, user, animals = [] }) {
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [journalSearch, setJournalSearch] = useState("");
  const [journalFilter, setJournalFilter] = useState("all"); // "all" | "manual" | "movement"

  function add() {
    if (!newBody.trim()) return;
    setNotes(p => [{ id: Date.now().toString(), title: newTitle || `Entry — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, body: newBody, date: new Date().toISOString() }, ...p]);
    setNewTitle(""); setNewBody(""); setShowAdd(false);
  }

  const filteredNotes = (() => {
    let list = notes;
    if (journalFilter === "manual") list = list.filter(n => !n.movementId);
    else if (journalFilter === "movement") list = list.filter(n => n.movementId);
    if (!journalSearch.trim()) return list;
    const q = journalSearch.trim().toLowerCase();
    return list.filter(n => {
      if ((n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)) return true;
      if (n.animalId && animals.length) {
        const animal = animals.find(a => a.id === n.animalId);
        if (animal && (getAnimalName(animal).toLowerCase().includes(q) || (animal.tag && String(animal.tag).toLowerCase().includes(q)))) return true;
      }
      return false;
    });
  })();

  return (
    <div className="hl-page hl-page-narrow hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ New Entry</Btn>}>
        Farm Journal
      </SectionTitle>

      {(notes.length > 0 || showAdd) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Input placeholder="Search by keyword, animal name, tag, or pasture..." value={journalSearch} onChange={e => setJournalSearch(e.target.value)} />
          </div>
          <Select value={journalFilter} onChange={e => setJournalFilter(e.target.value)} style={{ width: "auto", minWidth: "160px" }}>
            <option value="all">All Entries</option>
            <option value="manual">Manual Entries</option>
            <option value="movement">Movement Entries</option>
          </Select>
        </div>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <Input label="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Moved herd to south pasture" style={{ marginBottom: "12px", fontSize: "16px" }} />
          <Textarea label="Entry" value={newBody} onChange={e => setNewBody(e.target.value)} rows={6} placeholder="Record observations, treatments, purchases, or anything worth noting..." />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Save Entry</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!notes.length && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📖</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>The journal awaits your first entry.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {filteredNotes.map(n => (
          <Card key={n.id} style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{n.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {n.movementId && <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)", background: "rgba(46,99,71,0.12)", padding: "2px 8px", borderRadius: "4px" }}>Movement</span>}
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>{fmt(n.date.split("T")[0])}</span>
                <Btn size="sm" variant="ghost" onClick={() => setNotes(p => p.filter(x => x.id !== n.id))}>×</Btn>
              </div>
            </div>
            <div style={{ height: "1px", background: "var(--cream2)", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", lineHeight: 1.8, color: "var(--ink2)", whiteSpace: "pre-wrap" }}>{n.body}</p>
          </Card>
        ))}
      </div>
      {notes.length > 0 && filteredNotes.length === 0 && (
        <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: "8px" }}>No entries match your search or filter.</p>
      )}
    </div>
  );
}
