import { useState, useEffect, useMemo } from "react";
import { SPECIES } from "../lib/constants.js";
import { getAnimalName, fmt, dueDate, dueDateRangeFromSingleDate, progress, fmtDueRange, fmtExposure, daysUntilDue, isOverdue, formatGestationDaysRemaining, birthDateWithinGestationWindow, breedingDateFromDelivery, breedingDateForProgress, getOffspringTerm, isFemale, getBreedingMalesForSpecies, getAgeBasedSexTerm } from "../lib/helpers.js";
import { sanitizeDate, sanitizeBirthDate, todayLocalISODate } from "../lib/dateUtils.js";
import { Card, Btn, Input, Select, Textarea, SectionTitle, ProgressBar, Badge } from "./ui.jsx";
import DateInputWithValidation from "./DateInputWithValidation.jsx";

const ACTIVE_SORT_OPTIONS = [
  { id: "dueSoonest", label: "Due Soonest" },
  { id: "overdueFirst", label: "Overdue First" },
  { id: "byAnimalName", label: "By Animal Name" },
  { id: "bySpecies", label: "By Species" },
];

function sortActiveGestations(items, mode, animalsList) {
  const list = [...items];
  const animalOf = g => animalsList.find(a => a.id === g.animalId);
  const dueKey = g => g.dueDateStart || g.dueDate || "";
  const cmpDueAsc = (a, b) => dueKey(a).localeCompare(dueKey(b)) || String(a.id).localeCompare(String(b.id));
  switch (mode) {
    case "dueSoonest":
      return list.sort(cmpDueAsc);
    case "overdueFirst":
      return list.sort((a, b) => {
        const oa = isOverdue(a);
        const ob = isOverdue(b);
        if (oa !== ob) return oa ? -1 : 1;
        if (oa && ob) {
          const da = daysUntilDue(a);
          const db = daysUntilDue(b);
          const sa = da.isRange ? da.end : da.start;
          const sb = db.isRange ? db.end : db.start;
          if (sa !== sb) return sa - sb;
          return String(a.id).localeCompare(String(b.id));
        }
        return cmpDueAsc(a, b);
      });
    case "byAnimalName":
      return list.sort((a, b) => {
        const na = getAnimalName(animalOf(a));
        const nb = getAnimalName(animalOf(b));
        const c = na.localeCompare(nb, undefined, { sensitivity: "base" });
        if (c !== 0) return c;
        return cmpDueAsc(a, b);
      });
    case "bySpecies":
      return list.sort((a, b) => {
        const sa = animalOf(a)?.species || "";
        const sb = animalOf(b)?.species || "";
        const c = sa.localeCompare(sb, undefined, { sensitivity: "base" });
        if (c !== 0) return c;
        const na = getAnimalName(animalOf(a));
        const nb = getAnimalName(animalOf(b));
        const n = na.localeCompare(nb, undefined, { sensitivity: "base" });
        if (n !== 0) return n;
        return cmpDueAsc(a, b);
      });
    default:
      return list.sort(cmpDueAsc);
  }
}

// ── Gestation ─────────────────────────────────────────────────────────────────
export default function Gestation({ animals, setAnimals, gestations, setGestations, user, offspring, setOffspring, setTab, setViewingAnimal, deliveryGestureId, setDeliveryGestureId, setPromptAddOffspring, highlightGestationId, setHighlightGestationId, isProUser, setShowUpgradeModal }) {
  const animalsList = animals ?? [];
  const gestationsList = gestations ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" });
  const [showCalfForm, setShowCalfForm] = useState(false);
  const [deliveringId, setDeliveringId] = useState(null);
  const [editingCalfGestationId, setEditingCalfGestationId] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({
    deliveryDate: todayLocalISODate(),
    outcome: "live",
    offspringCount: 1,
    birthWeight: "",
    notes: "",
  });
  const [activeSort, setActiveSort] = useState("dueSoonest");
  const [editingGestationId, setEditingGestationId] = useState(null);
  const [highlightedId, setHighlightedId] = useState(null);
  const [editForm, setEditForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", sireNotInHerd: false });

  const females = animalsList.filter(a => isFemale(a) && !a.cull);

  const selectedDam = form.animalId ? animalsList.find(x => x.id === form.animalId) : null;
  const sireOptions = selectedDam ? getBreedingMalesForSpecies(animalsList, selectedDam.species) : [];

  const active = useMemo(() => gestationsList.filter(g => g.status !== "Delivered" && animalsList.some(a => a.id === g.animalId)), [gestationsList, animalsList]);
  const activeSorted = useMemo(() => sortActiveGestations(active, activeSort, animalsList), [active, activeSort, animalsList]);

  useEffect(() => {
    if (!form.animalId) return;
    const damGestations = (gestationsList || []).filter(g => g.animalId === form.animalId).sort((a, b) => (b.breedingDate || "").localeCompare(a.breedingDate || ""));
    const latest = damGestations[0];
    if (!latest) return;
    if (latest.sireAnimalId) {
      const male = animalsList.find(m => m.id === latest.sireAnimalId);
      setForm(prev => ({ ...prev, sireAnimalId: latest.sireAnimalId, sire: male ? getAnimalName(male) : (latest.sire || "") }));
    } else if (latest.sire === "Unknown" || (latest.sire && latest.sire.trim().toLowerCase() === "unknown")) {
      setForm(prev => ({ ...prev, sireAnimalId: "unknown", sire: "Unknown" }));
    } else if (latest.sire) {
      setForm(prev => ({ ...prev, sireAnimalId: "", sire: latest.sire }));
    }
  }, [form.animalId]);

  useEffect(() => {
    if (deliveryGestureId && setDeliveryGestureId) {
      setDeliveringId(deliveryGestureId);
      setShowCalfForm(true);
      setEditingCalfGestationId(null);
      setDeliveryForm({ deliveryDate: todayLocalISODate(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
      setDeliveryGestureId(null);
    }
  }, [deliveryGestureId, setDeliveryGestureId]);

  useEffect(() => {
    if (!highlightGestationId) return;
    setHighlightedId(highlightGestationId);
    setHighlightGestationId?.(null);
    const scrollTimer = setTimeout(() => {
      const el = document.getElementById(`gestation-card-${highlightGestationId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const clearTimer = setTimeout(() => setHighlightedId(null), 2400);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [highlightGestationId]);

  function add() {
    const start = sanitizeDate(form.breedingDate);
    if (!form.animalId || !start) return;
    const animal = animalsList.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const minDays = SPECIES[animal.species]?.minDays ?? totalDays;
    const maxDays = SPECIES[animal.species]?.maxDays ?? totalDays;
    const end = (form.runningWithBull && (form.breedingDateEnd || "").trim()) ? (sanitizeDate(form.breedingDateEnd) || null) : null;
    let dueStart, dueEnd;
    if (end) {
      dueStart = dueDate(start, totalDays);
      dueEnd = dueDate(end, totalDays);
    } else {
      const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
      dueStart = range.dueDateStart;
      dueEnd = range.dueDateEnd;
    }
    const sireDisplay = form.sireAnimalId === "unknown" ? "Unknown" : (form.sire || undefined);
    const sireId = form.sireAnimalId && form.sireAnimalId !== "unknown" ? form.sireAnimalId : undefined;
    const record = {
      animalId: form.animalId,
      breedingDate: start,
      ...(form.runningWithBull && { breedingDateEnd: end || undefined, runningWithBull: true }),
      dueDate: dueStart,
      dueDateStart: dueStart,
      dueDateEnd: dueEnd,
      sire: sireDisplay,
      ...(sireId && { sireAnimalId: sireId }),
      notes: form.notes,
      id: Date.now().toString(),
      gestationDays: totalDays,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    setGestations(p => [...(p ?? []), record]);
    setForm({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" });
    setShowAdd(false);
  }

  function markDelivered(id) {
    setEditingCalfGestationId(null);
    setDeliveringId(id);
    setShowCalfForm(true);
    setDeliveryForm({ deliveryDate: todayLocalISODate(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
  }

  function saveDeliveryRecord(gestationId) {
    const isEdit = editingCalfGestationId === gestationId;
    const g = gestationsList.find(x => x.id === gestationId);
    const mother = g ? animalsList.find(m => m.id === g.animalId) : null;
    const stillborn = deliveryForm.outcome === "stillborn";
    const count = Math.max(1, Math.min(20, parseInt(deliveryForm.offspringCount, 10) || 1));
    const deliveryDate = sanitizeBirthDate(deliveryForm.deliveryDate) || todayLocalISODate();
    const deliveredAt = deliveryDate.includes("T") ? deliveryDate : deliveryDate + "T12:00:00.000Z";
    const birthWeightVal = deliveryForm.birthWeight.trim() ? parseFloat(deliveryForm.birthWeight) : undefined;

    if (stillborn && mother && setOffspring) {
      const newRecords = Array.from({ length: count }, (_, i) => ({
        id: (Date.now() + i).toString(),
        motherId: mother.id,
        stillborn: true,
        dob: deliveryDate,
        createdAt: new Date().toISOString(),
      }));
      setOffspring(prev => {
        const list = prev?.[mother.id] ?? [];
        return { ...prev, [mother.id]: [...list, ...newRecords] };
      });
    }

    const calfData = {
      stillborn,
      offspringCount: count,
      birthWeight: birthWeightVal,
      notes: deliveryForm.notes?.trim() || undefined,
      recordedAt: new Date().toISOString(),
      ...(isEdit && g?.calf?.animalId && !stillborn && { animalId: g.calf.animalId }),
      ...(isEdit && g?.calf?.name !== undefined && { name: g.calf.name }),
      ...(isEdit && g?.calf?.tag !== undefined && { tag: g.calf.tag }),
      ...(isEdit && g?.calf?.sex !== undefined && { sex: g.calf.sex }),
      ...(isEdit && g?.calf?.weaningDate !== undefined && { weaningDate: g.calf.weaningDate }),
    };

    setGestations(p => (p ?? []).map(gr =>
      gr.id === gestationId
        ? { ...gr, status: "Delivered", deliveredAt, calf: calfData }
        : gr
    ));
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setDeliveryForm({ deliveryDate: todayLocalISODate(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });

    if (!stillborn && count > 0 && mother) {
      if (count > 1 && setAnimals) {
        const termLower = getOffspringTerm(mother.species).toLowerCase();
        const plural = termLower === "calf" ? "calves" : termLower === "puppy" ? "puppies" : termLower + "s";
        const stubs = Array.from({ length: count }, (_, i) => ({
          id: (Date.now() + i).toString(),
          species: mother.species,
          acquisitionType: "Home Raised",
          dob: deliveryDate,
          motherId: mother.id,
          damId: mother.id,
          motherName: getAnimalName(mother),
          damName: getAnimalName(mother),
          name: `${getOffspringTerm(mother.species)} ${i + 1}`,
          excludeFromReports: false,
        }));
        setAnimals(prev => [...(prev ?? []), ...stubs]);
        if (setTab) setTab("animals");
        window.alert(`${count} ${plural} added to your herd — tap each to add details.`);
      } else if (setTab && setViewingAnimal && setPromptAddOffspring) {
        setTab("animals");
        setViewingAnimal(mother);
        setPromptAddOffspring({ animalId: mother.id, deliveryDate });
      }
    }
  }

  function skipCalfRecord() {
    if (deliveringId && !editingCalfGestationId) {
      const deliveryDate = todayLocalISODate();
      const deliveredAt = deliveryDate + "T12:00:00.000Z";
      setGestations(p => (p ?? []).map(g =>
        g.id === deliveringId ? { ...g, status: "Delivered", deliveredAt } : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setDeliveryForm({ deliveryDate: todayLocalISODate(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
  }

  function deleteCalfRecord(gestationId) {
    const g = gestationsList.find(x => x.id === gestationId);
    if (!g?.calf) return;
    const mother = animalsList.find(a => a.id === g.animalId);
    const term = getOffspringTerm(mother?.species);
    const hadAnimal = g.calf.animalId && !g.calf.stillborn;
    if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this delivery record?`)) return;
    if (hadAnimal) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    setGestations(p => (p ?? []).map(gr =>
      gr.id === gestationId ? { ...gr, calf: undefined } : gr
    ));
  }

  function remove(id) {
    if (!confirm("Remove this breeding record?")) return;
    setGestations(p => (p ?? []).filter(g => g.id !== id));
  }

  function startEdit(g) {
    const hasSireAnimalId = g.sireAnimalId && g.sireAnimalId !== "unknown";
    const isUnknown = !hasSireAnimalId && g.sire === "Unknown";
    const sireNotInHerd = !hasSireAnimalId && !isUnknown && !!g.sire;
    setEditForm({
      breedingDate: g.breedingDate || "",
      breedingDateEnd: g.breedingDateEnd || "",
      runningWithBull: g.runningWithBull || false,
      sire: sireNotInHerd ? (g.sire || "") : "",
      sireAnimalId: hasSireAnimalId ? g.sireAnimalId : (isUnknown ? "unknown" : ""),
      sireNotInHerd,
    });
    setEditingGestationId(g.id);
  }

  function saveEdit(gestationId) {
    const g = gestationsList.find(x => x.id === gestationId);
    const animal = animalsList.find(a => a.id === g?.animalId);
    if (!g || !animal) return;
    const start = sanitizeDate(editForm.breedingDate);
    if (!start) return;
    const totalDays = g.gestationDays || SPECIES[animal.species]?.days || 150;
    const minDays = SPECIES[animal.species]?.minDays ?? totalDays;
    const maxDays = SPECIES[animal.species]?.maxDays ?? totalDays;
    const end = (editForm.runningWithBull && (editForm.breedingDateEnd || "").trim()) ? (sanitizeDate(editForm.breedingDateEnd) || null) : null;
    let dueStart, dueEnd;
    if (end) {
      dueStart = dueDate(start, totalDays);
      dueEnd = dueDate(end, totalDays);
    } else {
      const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
      dueStart = range.dueDateStart;
      dueEnd = range.dueDateEnd;
    }
    const sireDisplay = editForm.sireNotInHerd
      ? ((editForm.sire || "").trim() || "Unknown")
      : (editForm.sireAnimalId === "unknown" ? "Unknown" : (editForm.sire || undefined));
    const sireId = editForm.sireNotInHerd ? undefined : (editForm.sireAnimalId && editForm.sireAnimalId !== "unknown" ? editForm.sireAnimalId : undefined);
    setGestations(p => (p ?? []).map(gr =>
      gr.id === gestationId
        ? {
            ...gr,
            breedingDate: start,
            breedingDateEnd: end || undefined,
            runningWithBull: editForm.runningWithBull || false,
            dueDate: dueStart,
            dueDateStart: dueStart,
            dueDateEnd: dueEnd,
            sire: sireDisplay,
            sireAnimalId: sireId,
          }
        : gr
    ));
    setEditingGestationId(null);
  }

  const delivered = gestationsList.filter(g => g.status === "Delivered");

  return (
    <div className="hl-page hl-page-gestation hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Log Breeding</Btn>}>
        Gestation Ledger
      </SectionTitle>

      {showAdd && (
        <Card className="hl-add-form-card" style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)", overflow: "hidden", boxSizing: "border-box", maxWidth: "100%" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
          {!females.length && <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "12px" }}>No female animals registered. Add animals first.</p>}
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Dam) *" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— Select —</option>
              {females.filter(a => a.species !== "Mule").map(a => <option key={a.id} value={a.id}>{getAnimalName(a)} ({a.species})</option>)}
            </Select>
            {!form.runningWithBull ? (
              <DateInputWithValidation label="Breeding Date *" breedingDueTwoDigitYear value={form.breedingDate} onValueChange={v => setForm(p => ({ ...p, breedingDate: v }))} />
            ) : (
              <>
                <DateInputWithValidation label="Turn Out Date *" breedingDueTwoDigitYear value={form.breedingDate} onValueChange={v => setForm(p => ({ ...p, breedingDate: v }))} />
                <DateInputWithValidation label="Pull Date (optional)" breedingDueTwoDigitYear value={form.breedingDateEnd} onValueChange={v => setForm(p => ({ ...p, breedingDateEnd: v }))} />
              </>
            )}
            <Select label="Sire (optional)" value={form.sireAnimalId || ""} onChange={e => {
              const v = e.target.value;
              if (v === "unknown") setForm(p => ({ ...p, sireAnimalId: "unknown", sire: "Unknown" }));
              else if (!v) setForm(p => ({ ...p, sireAnimalId: "", sire: "" }));
              else { const m = animalsList.find(x => x.id === v); setForm(p => ({ ...p, sireAnimalId: v, sire: m ? getAnimalName(m) : "" })); }
            }}>
              <option value="">— None —</option>
              <option value="unknown">Unknown</option>
              {sireOptions.map(m => (
                <option key={m.id} value={m.id}>{getAnimalName(m)}{m.tag ? ` #${m.tag}` : ""}</option>
              ))}
            </Select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
            <input type="checkbox" checked={form.runningWithBull} onChange={e => setForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            <span>Running with Bull (date range for bull exposure)</span>
          </label>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          {form.animalId && form.breedingDate && (() => {
            const a = animalsList.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            const minDays = SPECIES[a?.species]?.minDays ?? days;
            const maxDays = SPECIES[a?.species]?.maxDays ?? days;
            if (!days) return null;
            const hasEnd = form.runningWithBull && (form.breedingDateEnd || "").trim();
            const dueStr = hasEnd
              ? `${fmt(dueDate(form.breedingDate, days))} – ${fmt(dueDate(form.breedingDateEnd, days))}`
              : (() => { const r = dueDateRangeFromSingleDate(form.breedingDate, minDays, maxDays); return `${fmt(r.dueDateStart)} – ${fmt(r.dueDateEnd)}`; })();
            return (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
              </div>
            );
          })()}
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Record</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showCalfForm && deliveringId && (() => {
        const g = gestationsList.find(x => x.id === deliveringId);
        const animal = animalsList.find(a => a.id === g?.animalId);
        const isEditCalf = !!editingCalfGestationId;
        const offspringTerm = getOffspringTerm(animal?.species);
        return (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>
              {isEditCalf ? `Edit Delivery Record` : `Record Delivery`}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "18px" }}>
              Record birth for <strong>{getAnimalName(animal)}</strong>
            </div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <DateInputWithValidation label="Delivery date *" birthDate value={deliveryForm.deliveryDate} onValueChange={v => setDeliveryForm(p => ({ ...p, deliveryDate: v }))} />
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)" }}>Outcome</span>
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                    <input type="radio" name="delivery-outcome" checked={deliveryForm.outcome === "live"} onChange={() => setDeliveryForm(p => ({ ...p, outcome: "live" }))} style={{ accentColor: "var(--green)" }} />
                    Live Birth
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                    <input type="radio" name="delivery-outcome" checked={deliveryForm.outcome === "stillborn"} onChange={() => setDeliveryForm(p => ({ ...p, outcome: "stillborn" }))} style={{ accentColor: "var(--green)" }} />
                    Stillborn
                  </label>
                </div>
              </div>
              <Input label="Number of offspring" type="number" min={1} max={20} value={deliveryForm.offspringCount} onChange={e => setDeliveryForm(p => ({ ...p, offspringCount: e.target.value }))} />
              <Input label="Birth weight (lbs, if known)" type="number" value={deliveryForm.birthWeight} onChange={e => setDeliveryForm(p => ({ ...p, birthWeight: e.target.value }))} placeholder="e.g. 85" />
            </div>
            <Textarea label="Notes" value={deliveryForm.notes} onChange={e => setDeliveryForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={() => saveDeliveryRecord(deliveringId)}>{isEditCalf ? "Save Changes" : "Save Delivery"}</Btn>
              <Btn variant="secondary" onClick={skipCalfRecord}>{isEditCalf ? "Cancel" : "Skip"}</Btn>
            </div>
          </Card>
        );
      })()}

      {!active.length && !showAdd && !showCalfForm && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📅</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No active breeding records.</div>
        </Card>
      )}

      {active.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <label htmlFor="gestation-sort" style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>Sort by:</label>
          <div style={{ position: "relative", flex: 1, maxWidth: "260px" }}>
            <select
              id="gestation-sort"
              value={activeSort}
              onChange={e => setActiveSort(e.target.value)}
              style={{
                width: "100%",
                appearance: "none",
                WebkitAppearance: "none",
                padding: "8px 36px 8px 12px",
                fontSize: "14px",
                fontWeight: 500,
                fontFamily: "inherit",
                color: "var(--ink)",
                background: "var(--cream)",
                border: "1.5px solid var(--green)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                outline: "none",
              }}
              onFocus={e => { e.target.style.borderColor = "var(--brass)"; e.target.style.boxShadow = "0 0 0 2px rgba(201,149,42,0.18)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--green)"; e.target.style.boxShadow = "none"; }}
            >
              {ACTIVE_SORT_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            {/* Chevron */}
            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--green)", fontSize: "11px" }}>▼</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {activeSorted.map(g => {
          const animal = animalsList.find(a => a.id === g.animalId);
          const dueD = daysUntilDue(g);
          const pct = progress(breedingDateForProgress(g), g.gestationDays);
          const overdue = isOverdue(g);
          const urgent = dueD.isRange ? (dueD.start <= 7 && dueD.end >= 0) : (dueD.start >= 0 && dueD.start <= 7);
          const badgeText = formatGestationDaysRemaining(dueD);
          return (
            <Card key={g.id} id={`gestation-card-${g.id}`} className="hl-gestation-card" style={{ padding: "20px 24px", borderLeft: `4px solid ${overdue ? "var(--danger2)" : urgent ? "var(--brass)" : "var(--green3)"}`, boxShadow: g.id === highlightedId ? "0 0 0 3px var(--brass), var(--shadow)" : undefined, transition: "box-shadow 0.6s ease-out" }}>
              <div className="hl-gestation-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (animal) { setViewingAnimal(animal); setTab("animals"); } }}
                  onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && animal) { e.preventDefault(); setViewingAnimal(animal); setTab("animals"); } }}
                  style={{ display: "flex", alignItems: "center", gap: "12px", cursor: animal ? "pointer" : undefined }}
                >
                  <span style={{ fontSize: "28px" }}>{SPECIES[animal?.species]?.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", textDecoration: "underline", textDecorationColor: "var(--green3)", textUnderlineOffset: "3px" }}>
                      {getAnimalName(animal)}
                      {g.inbreedingWarning && (
                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#c45c26", background: "rgba(196,92,38,0.2)", padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.5px", textDecoration: "none" }}>INBRED WARNING</span>
                      )}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {getAnimalName(animal)}{g.sire ? ` × ${g.sire}` : ""} · {fmtExposure(g)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge color={overdue ? "var(--danger2)" : urgent ? "var(--brass2)" : "var(--green3)"}>
                    {badgeText}
                  </Badge>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Due {fmtDueRange(g)}</div>
                </div>
              </div>
              <div style={{ marginBottom: "6px" }}>
                <ProgressBar value={pct} color={overdue ? "var(--danger2)" : "var(--green3)"} height={8} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
                <span>{Math.round(pct)}% complete</span>
                <span>{g.gestationDays} day gestation{g.runningWithBull ? " (range)" : ""}</span>
              </div>
              {g.notes && <p style={{ fontSize: "13px", color: "var(--ink2)", fontStyle: "italic", marginBottom: "12px" }}>{g.notes}</p>}
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn size="sm" onClick={() => markDelivered(g.id)}>✓ Mark Delivered</Btn>
                <Btn size="sm" variant="secondary" onClick={() => editingGestationId === g.id ? setEditingGestationId(null) : startEdit(g)}>
                  {editingGestationId === g.id ? "Cancel Edit" : "Edit"}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>Remove</Btn>
              </div>
              {editingGestationId === g.id && (() => {
                const editSireOptions = getBreedingMalesForSpecies(animalsList, animal?.species);
                return (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "12px" }}>Edit Breeding Record</div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <DateInputWithValidation
                        label={editForm.runningWithBull ? "Turn Out Date *" : "Breeding Date *"}
                        breedingDueTwoDigitYear
                        value={editForm.breedingDate}
                        onValueChange={v => setEditForm(p => ({ ...p, breedingDate: v }))}
                      />
                      {editForm.runningWithBull && (
                        <DateInputWithValidation
                          label="Pull Date (optional)"
                          breedingDueTwoDigitYear
                          value={editForm.breedingDateEnd}
                          onValueChange={v => setEditForm(p => ({ ...p, breedingDateEnd: v }))}
                        />
                      )}
                      {!editForm.sireNotInHerd ? (
                        <Select label="Sire (optional)" value={editForm.sireAnimalId || ""} onChange={e => {
                          const v = e.target.value;
                          if (v === "unknown") setEditForm(p => ({ ...p, sireAnimalId: "unknown", sire: "Unknown" }));
                          else if (!v) setEditForm(p => ({ ...p, sireAnimalId: "", sire: "" }));
                          else { const m = animalsList.find(x => x.id === v); setEditForm(p => ({ ...p, sireAnimalId: v, sire: m ? getAnimalName(m) : "" })); }
                        }}>
                          <option value="">— None —</option>
                          <option value="unknown">Unknown</option>
                          {editSireOptions.map(m => (
                            <option key={m.id} value={m.id}>{getAnimalName(m)}{m.tag ? ` #${m.tag}` : ""}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input label="Sire (outside bull)" value={editForm.sire} onChange={e => setEditForm(p => ({ ...p, sire: e.target.value }))} placeholder="Unknown or type bull name" />
                      )}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                      <input type="checkbox" checked={editForm.runningWithBull} onChange={e => setEditForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDateEnd : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                      <span>Running with Bull (date range)</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                      <input type="checkbox" checked={editForm.sireNotInHerd} onChange={e => setEditForm(p => ({ ...p, sireNotInHerd: e.target.checked, ...(e.target.checked ? { sireAnimalId: "", sire: p.sire || "" } : { sireAnimalId: "", sire: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                      <span>Bull not in my herd</span>
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Btn size="sm" onClick={() => saveEdit(g.id)}>Save Changes</Btn>
                      <Btn size="sm" variant="secondary" onClick={() => setEditingGestationId(null)}>Cancel</Btn>
                    </div>
                  </div>
                );
              })()}
            </Card>
          );
        })}
      </div>

      {delivered.length > 0 && (
        <>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, color: "var(--muted)", marginBottom: "12px" }}>Delivered Records</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {delivered.map(g => {
              const animal = animalsList.find(a => a.id === g.animalId);
              const hasCalf = g.calf && (g.calf.stillborn || g.calf.name || g.calf.tag || g.calf.sex || g.calf.birthWeight || g.calf.weaningDate);
              const offspringTerm = getOffspringTerm(animal?.species);
              return (
                <Card key={g.id} className="hl-delivered-row" style={{ padding: "14px 20px", opacity: 0.65 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", marginBottom: !hasCalf ? "8px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>{SPECIES[animal?.species]?.emoji}</span>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(animal)}</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{animal?.species}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "auto" }}>
                      <Badge color="var(--green)">Delivered</Badge>
                      <span style={{ fontSize: "13px", color: "var(--muted)" }}>Due {fmtDueRange(g)}</span>
                      <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                    </div>
                  </div>
                  {!hasCalf && (
                    <div style={{ marginTop: "2px" }}>
                      <button
                        type="button"
                        onClick={() => { setDeliveringId(g.id); setEditingCalfGestationId(null); setShowCalfForm(true); setDeliveryForm({ deliveryDate: todayLocalISODate(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" }); }}
                        style={{ background: "none", border: "none", padding: 0, fontSize: "13px", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
                      >
                        Add delivery record
                      </button>
                    </div>
                  )}
                  {hasCalf && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>Delivery</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Btn size="sm" variant="ghost" onClick={() => {
                          setEditingCalfGestationId(g.id); setDeliveringId(g.id);
                          const rawD = g.deliveredAt ? (g.deliveredAt.slice(0, 10) || todayLocalISODate()) : todayLocalISODate();
                          setDeliveryForm({ deliveryDate: sanitizeDate(rawD) || todayLocalISODate(), outcome: g.calf.stillborn ? "stillborn" : "live", offspringCount: g.calf.offspringCount ?? 1, birthWeight: g.calf.birthWeight != null ? String(g.calf.birthWeight) : "", notes: g.calf.notes || "" });
                          setShowCalfForm(true);
                        }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => deleteCalfRecord(g.id)}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "13px" }}>
                      {g.calf.stillborn ? <div><span style={{ color: "var(--muted)" }}>Outcome:</span> <strong>Stillborn</strong>{(g.calf.offspringCount ?? 1) > 1 ? ` · ${g.calf.offspringCount} offspring` : ""}</div> : <div><span style={{ color: "var(--muted)" }}>Outcome:</span> <strong>Live birth</strong>{(g.calf.offspringCount ?? 1) > 1 ? ` · ${g.calf.offspringCount} offspring` : ""}</div>}
                      {g.calf.name && <div><span style={{ color: "var(--muted)" }}>Name:</span> <strong>{g.calf.name}</strong></div>}
                      {g.calf.tag && <div><span style={{ color: "var(--muted)" }}>Tag:</span> <strong>#{g.calf.tag}</strong></div>}
                      {(g.calf.sex || g.calf.dob) && (() => { const term = getAgeBasedSexTerm({ ...g.calf, species: animal?.species }, []); return term !== "—" ? <div><span style={{ color: "var(--muted)" }}>Sex:</span> <strong>{term}</strong></div> : null; })()}
                      {g.calf.birthWeight != null && <div><span style={{ color: "var(--muted)" }}>Birth Weight:</span> <strong>{g.calf.birthWeight} lbs</strong></div>}
                      {g.calf.weaningDate && <div><span style={{ color: "var(--muted)" }}>Weaning:</span> <strong>{fmt(g.calf.weaningDate)}</strong></div>}
                      {g.calf.notes && <div><span style={{ color: "var(--muted)" }}>Notes:</span> <strong>{g.calf.notes}</strong></div>}
                    </div>
                  </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
