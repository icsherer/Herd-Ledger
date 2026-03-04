import { useState, useEffect } from "react";
import { SPECIES } from "../lib/constants.js";
import { getAnimalName, fmt, daysUntil, dueDate, progress, fmtDueRange, daysUntilDue, isOverdue, birthDateWithinGestationWindow, breedingDateFromDelivery, breedingDateForProgress, getOffspringTerm, isFemale, getBreedingMalesForSpecies, getAgeBasedSexTerm } from "../lib/helpers.js";
import { Card, Btn, Input, Select, Textarea, SectionTitle, ProgressBar, Badge } from "./ui.jsx";

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ── Gestation ─────────────────────────────────────────────────────────────────
export default function Gestation({ animals, setAnimals, gestations, setGestations, user, offspring, setOffspring, setTab, setViewingAnimal, deliveryGestureId, setDeliveryGestureId, setPromptAddOffspring }) {
  const animalsList = animals ?? [];
  const gestationsList = gestations ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" });
  const [showCalfForm, setShowCalfForm] = useState(false);
  const [deliveringId, setDeliveringId] = useState(null);
  const [editingCalfGestationId, setEditingCalfGestationId] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({
    deliveryDate: todayISO(),
    outcome: "live",
    offspringCount: 1,
    birthWeight: "",
    notes: "",
  });

  const females = animalsList.filter(a => isFemale(a));

  const selectedDam = form.animalId ? animalsList.find(x => x.id === form.animalId) : null;
  const sireOptions = selectedDam ? getBreedingMalesForSpecies(animalsList, selectedDam.species) : [];

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
      setDeliveryForm({ deliveryDate: todayISO(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
      setDeliveryGestureId(null);
    }
  }, [deliveryGestureId, setDeliveryGestureId]);

  function add() {
    const start = form.breedingDate;
    const end = form.runningWithBull ? form.breedingDateEnd : form.breedingDate;
    if (!form.animalId || !start || (form.runningWithBull && !end)) return;
    const animal = animalsList.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const dueStart = dueDate(start, totalDays);
    const dueEnd = form.runningWithBull ? dueDate(end, totalDays) : dueStart;
    const sireDisplay = form.sireAnimalId === "unknown" ? "Unknown" : (form.sire || undefined);
    const sireId = form.sireAnimalId && form.sireAnimalId !== "unknown" ? form.sireAnimalId : undefined;
    const record = {
      animalId: form.animalId,
      breedingDate: start,
      ...(form.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
      dueDate: dueStart,
      ...(form.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
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
    setDeliveryForm({ deliveryDate: todayISO(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
  }

  function saveDeliveryRecord(gestationId) {
    const isEdit = editingCalfGestationId === gestationId;
    const g = gestationsList.find(x => x.id === gestationId);
    const mother = g ? animalsList.find(m => m.id === g.animalId) : null;
    const stillborn = deliveryForm.outcome === "stillborn";
    const count = Math.max(1, Math.min(20, parseInt(deliveryForm.offspringCount, 10) || 1));
    const deliveryDate = deliveryForm.deliveryDate || todayISO();
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
    setDeliveryForm({ deliveryDate: todayISO(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });

    if (!stillborn && count > 0 && mother && setTab && setViewingAnimal && setPromptAddOffspring) {
      setTab("animals");
      setViewingAnimal(mother);
      setPromptAddOffspring({ animalId: mother.id, deliveryDate });
    }
  }

  function skipCalfRecord() {
    if (deliveringId && !editingCalfGestationId) {
      const deliveryDate = todayISO();
      const deliveredAt = deliveryDate + "T12:00:00.000Z";
      setGestations(p => (p ?? []).map(g =>
        g.id === deliveringId ? { ...g, status: "Delivered", deliveredAt } : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setDeliveryForm({ deliveryDate: todayISO(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" });
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

  const active = gestationsList.filter(g => g.status !== "Delivered");
  const delivered = gestationsList.filter(g => g.status === "Delivered");

  return (
    <div className="hl-page hl-page-gestation hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Log Breeding</Btn>}>
        Gestation Ledger
      </SectionTitle>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
          {!females.length && <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "12px" }}>No female animals registered. Add animals first.</p>}
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Dam) *" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— Select —</option>
              {females.filter(a => a.species !== "Mule").map(a => <option key={a.id} value={a.id}>{getAnimalName(a)} ({a.species})</option>)}
            </Select>
            {!form.runningWithBull ? (
              <Input label="Breeding Date *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
            ) : (
              <>
                <Input label="Exposure start *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
                <Input label="Exposure end *" type="date" value={form.breedingDateEnd} onChange={e => setForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
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
          {form.animalId && form.breedingDate && (form.runningWithBull ? form.breedingDateEnd : true) && (() => {
            const a = animalsList.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            if (!days) return null;
            const start = dueDate(form.breedingDate, days);
            const end = form.runningWithBull && form.breedingDateEnd ? dueDate(form.breedingDateEnd, days) : start;
            const dueStr = form.runningWithBull && form.breedingDateEnd ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
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
              <Input label="Delivery date *" type="date" value={deliveryForm.deliveryDate} onChange={e => setDeliveryForm(p => ({ ...p, deliveryDate: e.target.value }))} />
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

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {active.map(g => {
          const animal = animalsList.find(a => a.id === g.animalId);
          const dueD = daysUntilDue(g);
          const pct = progress(breedingDateForProgress(g), g.gestationDays);
          const overdue = isOverdue(g);
          const urgent = dueD.isRange ? (dueD.start <= 7 && dueD.end >= 0) : (dueD.start >= 0 && dueD.start <= 7);
          const badgeText = overdue
            ? (dueD.isRange ? "Overdue" : `${Math.abs(dueD.start)}d overdue`)
            : dueD.isRange
              ? (dueD.start === dueD.end ? (dueD.start === 0 ? "Due today" : `${dueD.start} days`) : `${dueD.start}–${dueD.end} days`)
              : (dueD.start === 0 ? "Due today" : `${dueD.start} days`);
          return (
            <Card key={g.id} className="hl-gestation-card" style={{ padding: "20px 24px", borderLeft: `4px solid ${overdue ? "var(--danger2)" : urgent ? "var(--brass)" : "var(--green3)"}` }}>
              <div className="hl-gestation-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "28px" }}>{SPECIES[animal?.species]?.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{getAnimalName(animal)}</div>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {animal?.species}{g.sire ? ` × ${g.sire}` : ""} · {g.runningWithBull ? `Exposure ${fmt(g.breedingDate)} – ${fmt(g.breedingDateEnd)}` : `Bred ${fmt(g.breedingDate)}`}
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
                <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>Remove</Btn>
              </div>
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
                        onClick={() => { setDeliveringId(g.id); setEditingCalfGestationId(null); setShowCalfForm(true); setDeliveryForm({ deliveryDate: todayISO(), outcome: "live", offspringCount: 1, birthWeight: "", notes: "" }); }}
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
                          const d = g.deliveredAt ? (g.deliveredAt.slice(0, 10) || todayISO()) : todayISO();
                          setDeliveryForm({ deliveryDate: d, outcome: g.calf.stillborn ? "stillborn" : "live", offspringCount: g.calf.offspringCount ?? 1, birthWeight: g.calf.birthWeight != null ? String(g.calf.birthWeight) : "", notes: g.calf.notes || "" });
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
