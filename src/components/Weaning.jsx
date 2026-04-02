import { useState } from "react";
import { getExpectedWeaningDate, getAnimalName, fmt, getAgeInMonths } from "../lib/helpers.js";
import { SPECIES } from "../lib/constants.js";
import { Card, Btn, SectionTitle } from "./ui.jsx";

export default function Weaning({ animals, setAnimals, offspring, setOffspring, setViewingAnimal, setTab }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [weanConfirm, setWeanConfirm] = useState(null);

  const activeAnimals = (animals || []).filter(a => !a.deceased && !a.sale && !a.cull);
  const notWeanedWithDate = activeAnimals
    .filter(a => !a.weaningDate)
    .map(a => ({ animal: a, expectedDate: getExpectedWeaningDate(a) }))
    .filter(({ expectedDate }) => expectedDate != null);

  const upcoming = notWeanedWithDate
    .filter(({ expectedDate }) => expectedDate >= todayStr)
    .sort((a, b) => (a.expectedDate || "").localeCompare(b.expectedDate || ""));

  const overdue = notWeanedWithDate
    .filter(({ expectedDate }) => expectedDate < todayStr)
    .sort((a, b) => (b.expectedDate || "").localeCompare(a.expectedDate || ""));

  const past = (animals || [])
    .filter(a => a.weaningDate && (getAgeInMonths(a.dob) == null || getAgeInMonths(a.dob) < 12))
    .sort((a, b) => (b.weaningDate || "").localeCompare(a.weaningDate || ""));

  function markAsWeaned(animal, dateStr = todayStr) {
    setAnimals(prev =>
      prev.map(a => (a.id === animal.id ? { ...a, weaningDate: dateStr } : a))
    );
    if (setOffspring && offspring) {
      const motherId = animal.damId ?? animal.motherId;
      if (motherId && offspring[motherId]) {
        setOffspring(prev => {
          const base = { ...prev };
          const list = (base[motherId] || []).map(c =>
            c.id === animal.id ? { ...c, weaningDate: dateStr } : c
          );
          return { ...base, [motherId]: list };
        });
      }
    }
  }

  function getMotherName(animal) {
    const damId = animal?.damId ?? animal?.motherId;
    if (!damId || !animals?.length) return null;
    const mother = animals.find(a => a.id === damId);
    return mother ? getAnimalName(mother) : null;
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle>Weaning</SectionTitle>
      <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "24px" }}>
        All animals with a date of birth get a suggested weaning date (by species). Adjust the target date on each animal&apos;s profile; mark as weaned when done.
      </p>

      {/* Overdue Weanings */}
      {overdue.length > 0 && (
        <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden", borderLeft: "4px solid var(--danger2)" }}>
          <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--cream2)", fontSize: "12px", fontWeight: 700, color: "var(--danger2)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Overdue Weanings
          </div>
          {overdue.map(({ animal: a, expectedDate }, idx) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: idx < overdue.length - 1 ? "1px solid var(--cream2)" : "none" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>{SPECIES[a.species]?.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(a)}</span>
                  {a.tag && <span style={{ color: "var(--muted)", fontSize: "12px" }}>#{a.tag}</span>}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.species || "—"} · DOB {a.dob ? fmt(a.dob) : "—"}{getMotherName(a) ? ` · Dam ${getMotherName(a)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--danger2)", whiteSpace: "nowrap" }}>Was {fmt(expectedDate)}</span>
                <Btn size="sm" variant="secondary" onClick={() => setWeanConfirm(a)}>Mark as Weaned</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Upcoming Weanings */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--cream2)", fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Upcoming Weanings
        </div>
        {upcoming.length === 0 ? (
          <div style={{ padding: "20px 16px", color: "var(--muted)", fontSize: "14px" }}>No animals with a weaning date in the future.</div>
        ) : (
          upcoming.map(({ animal: a, expectedDate }, idx) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: idx < upcoming.length - 1 ? "1px solid var(--cream2)" : "none" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>{SPECIES[a.species]?.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(a)}</span>
                  {a.tag && <span style={{ color: "var(--muted)", fontSize: "12px" }}>#{a.tag}</span>}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.species || "—"} · DOB {a.dob ? fmt(a.dob) : "—"}{getMotherName(a) ? ` · Dam ${getMotherName(a)}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--green)", whiteSpace: "nowrap" }}>{fmt(expectedDate)}</span>
                <Btn size="sm" variant="secondary" onClick={() => setWeanConfirm(a)}>Mark as Weaned</Btn>
              </div>
            </div>
          ))
        )}
      </Card>

      {/* Past Weanings */}
      <Card style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--cream2)", fontSize: "12px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
          Past Weanings
        </div>
        {past.length === 0 ? (
          <div style={{ padding: "20px 16px", color: "var(--muted)", fontSize: "14px" }}>No weaned animals recorded yet.</div>
        ) : (
          past.map((a, idx) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderBottom: idx < past.length - 1 ? "1px solid var(--cream2)" : "none" }}>
              <span style={{ fontSize: "20px", flexShrink: 0 }}>{SPECIES[a.species]?.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "5px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(a)}</span>
                  {a.tag && <span style={{ color: "var(--muted)", fontSize: "12px" }}>#{a.tag}</span>}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.species || "—"} · DOB {a.dob ? fmt(a.dob) : "—"}{getMotherName(a) ? ` · Dam ${getMotherName(a)}` : ""}
                </div>
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--green)", whiteSpace: "nowrap", flexShrink: 0 }}>
                Weaned {a.weaningDate ? fmt(a.weaningDate) : "—"}
              </span>
            </div>
          ))
        )}
      </Card>

      {weanConfirm && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setWeanConfirm(null)}>
          <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "24px", maxWidth: "400px", width: "calc(100% - 32px)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--cream2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, color: "var(--ink)", marginBottom: "12px" }}>Mark as Weaned?</div>
            <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.5, marginBottom: "20px" }}>
              Are you sure you want to mark <strong>{getAnimalName(weanConfirm)}</strong> as weaned? This can be undone from the animal&apos;s profile.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setWeanConfirm(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={() => { markAsWeaned(weanConfirm); setWeanConfirm(null); }}>Yes, mark as weaned</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
