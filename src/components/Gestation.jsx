import { useState } from "react";
import { SPECIES } from "../lib/constants.js";
import { getAnimalName, fmt, daysUntil, dueDate, progress, fmtDueRange, daysUntilDue, isOverdue, birthDateWithinGestationWindow, breedingDateFromDelivery, breedingDateForProgress, getOffspringTerm, isFemale } from "../lib/helpers.js";
import { Card, Btn, Input, Select, Textarea, SectionTitle, ProgressBar, Badge } from "./ui.jsx";

// ── Gestation ─────────────────────────────────────────────────────────────────
export default function Gestation({ animals, setAnimals, gestations, setGestations, user }) {
  const animalsList = animals ?? [];
  const gestationsList = gestations ?? [];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
  const [showCalfForm, setShowCalfForm] = useState(false);
  const [deliveringId, setDeliveringId] = useState(null);
  const [editingCalfGestationId, setEditingCalfGestationId] = useState(null);
  const [calfForm, setCalfForm] = useState({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });

  const females = animalsList.filter(a => isFemale(a));

  function add() {
    const start = form.breedingDate;
    const end = form.runningWithBull ? form.breedingDateEnd : form.breedingDate;
    if (!form.animalId || !start || (form.runningWithBull && !end)) return;
    const animal = animalsList.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const dueStart = dueDate(start, totalDays);
    const dueEnd = form.runningWithBull ? dueDate(end, totalDays) : dueStart;
    const record = {
      animalId: form.animalId,
      breedingDate: start,
      ...(form.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
      dueDate: dueStart,
      ...(form.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
      sire: form.sire,
      notes: form.notes,
      id: Date.now().toString(),
      gestationDays: totalDays,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    setGestations(p => [...(p ?? []), record]);
    setForm({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
    setShowAdd(false);
  }

  function markDelivered(id) {
    setEditingCalfGestationId(null);
    setDeliveringId(id);
    setShowCalfForm(true);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function saveCalfRecord(gestationId) {
    const isEdit = editingCalfGestationId === gestationId;
    const g = gestationsList.find(x => x.id === gestationId);
    const mother = g ? animalsList.find(m => m.id === g.animalId) : null;
    const stillborn = !!calfForm.stillborn;
    let newAnimalId;
    if (!stillborn && !isEdit && mother) {
      newAnimalId = Date.now().toString();
      const newAnimal = {
        id: newAnimalId,
        name: calfForm.name || undefined,
        tag: calfForm.tag || undefined,
        sex: calfForm.sex || undefined,
        species: mother.species,
        dob: undefined,
        breed: mother.breed || undefined,
        notes: undefined,
        motherId: mother.id,
        ...(g.sire && { sireName: g.sire }),
      };
      setAnimals(prev => [...prev, newAnimal]);
    }
    if (isEdit && g?.calf?.animalId && stillborn) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    const calfData = {
      name: calfForm.name || undefined,
      tag: calfForm.tag || undefined,
      sex: calfForm.sex || undefined,
      birthWeight: calfForm.birthWeight ? parseFloat(calfForm.birthWeight) : undefined,
      weaningDate: calfForm.weaningDate || undefined,
      stillborn,
      recordedAt: new Date().toISOString(),
      ...(newAnimalId && { animalId: newAnimalId }),
      ...(isEdit && g?.calf?.animalId && !stillborn && { animalId: g.calf.animalId }),
    };
    setGestations(p => (p ?? []).map(gr =>
      gr.id === gestationId
        ? { ...gr, status: "Delivered", deliveredAt: gr.deliveredAt || new Date().toISOString(), calf: calfData }
        : gr
    ));
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function skipCalfRecord() {
    if (deliveringId && !editingCalfGestationId) {
      setGestations(p => (p ?? []).map(g =>
        g.id === deliveringId
          ? { ...g, status: "Delivered", deliveredAt: g.deliveredAt || new Date().toISOString() }
          : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function deleteCalfRecord(gestationId) {
    const g = gestationsList.find(x => x.id === gestationId);
    if (!g?.calf) return;
    const mother = animalsList.find(a => a.id === g.animalId);
    const term = getOffspringTerm(mother?.species);
    const hadAnimal = g.calf.animalId && !g.calf.stillborn;
    if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this ${term.toLowerCase()} record?`)) return;
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
            <Input label="Sire (optional)" value={form.sire} onChange={e => setForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
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
              {isEditCalf ? `Edit ${offspringTerm} Record` : `Add ${offspringTerm} Record (Optional)`}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "18px" }}>
              Record details for the {offspringTerm.toLowerCase()} born to <strong>{getAnimalName(animal)}</strong>
            </div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label={`${offspringTerm} Name`} value={calfForm.name} onChange={e => setCalfForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie Jr" />
              <Input label="Tag / ID" value={calfForm.tag} onChange={e => setCalfForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1043" />
              <Select label="Sex" value={calfForm.sex} onChange={e => setCalfForm(p => ({ ...p, sex: e.target.value }))}>
                <option value="">— Select —</option>
                {(getSexOptions(animal?.species) || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
              <Input label="Birth Weight (lbs)" type="number" value={calfForm.birthWeight} onChange={e => setCalfForm(p => ({ ...p, birthWeight: e.target.value }))} placeholder="e.g. 85" />
              <Input label="Target Weaning Date" type="date" value={calfForm.weaningDate} onChange={e => setCalfForm(p => ({ ...p, weaningDate: e.target.value }))} />
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" id="calf-stillborn" checked={!!calfForm.stillborn} onChange={e => setCalfForm(p => ({ ...p, stillborn: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                <label htmlFor="calf-stillborn" style={{ fontSize: "14px", color: "var(--ink2)", cursor: "pointer" }}>Stillborn</label>
              </div>
            </div>
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={() => saveCalfRecord(deliveringId)}>{isEditCalf ? "Save Changes" : `Save ${offspringTerm} Record`}</Btn>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasCalf ? "10px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>{SPECIES[animal?.species]?.emoji}</span>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(animal)}</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{animal?.species}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Badge color="var(--green)">Delivered</Badge>
                      <span style={{ fontSize: "13px", color: "var(--muted)" }}>Due {fmtDueRange(g)}</span>
                      {!hasCalf && (
                        <Btn size="sm" onClick={() => { setDeliveringId(g.id); setShowCalfForm(true); setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false }); }}>
                          Add {offspringTerm} Record
                        </Btn>
                      )}
                      <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                    </div>
                  </div>
                  {hasCalf && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{offspringTerm} Record</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setEditingCalfGestationId(g.id); setDeliveringId(g.id); setCalfForm({ name: g.calf.name || "", tag: g.calf.tag || "", sex: g.calf.sex || "", birthWeight: g.calf.birthWeight != null ? String(g.calf.birthWeight) : "", weaningDate: g.calf.weaningDate || "", stillborn: !!g.calf.stillborn }); setShowCalfForm(true); }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => deleteCalfRecord(g.id)}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "13px" }}>
                      {g.calf.stillborn && <div><span style={{ color: "var(--muted)" }}>Status:</span> <strong>Stillborn</strong></div>}
                      {g.calf.name && <div><span style={{ color: "var(--muted)" }}>Name:</span> <strong>{g.calf.name}</strong></div>}
                      {g.calf.tag && <div><span style={{ color: "var(--muted)" }}>Tag:</span> <strong>#{g.calf.tag}</strong></div>}
                      {(g.calf.sex || g.calf.dob) && (() => { const term = getAgeBasedSexTerm({ ...g.calf, species: animal?.species }, []); return term !== "—" ? <div><span style={{ color: "var(--muted)" }}>Sex:</span> <strong>{term}</strong></div> : null; })()}
                      {g.calf.birthWeight && <div><span style={{ color: "var(--muted)" }}>Birth Weight:</span> <strong>{g.calf.birthWeight} lbs</strong></div>}
                      {g.calf.weaningDate && <div><span style={{ color: "var(--muted)" }}>Weaning:</span> <strong>{fmt(g.calf.weaningDate)}</strong></div>}
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
