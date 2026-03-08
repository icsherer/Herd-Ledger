import { useState, useEffect, useRef } from "react";
import { SPECIES, PASTURE_SPECIES } from "../lib/constants.js";
import { getAnimalName, fmt, getBreedingMaleInPasture, getEligibleFemalesForRunningWithBull, pastureNameEq, getCanonicalPastureNames, resolvePastureName, createMovementJournalEntry, dueDate, feederDaysOnFeed, displaySex } from "../lib/helpers.js";
import { Card, Btn, Input, PastureCombo, SectionTitle } from "./ui.jsx";

// ── Pastures ───────────────────────────────────────────────────────────────────
export default function Pastures({ animals, setAnimals, pastures, setPastures, setTab, setViewingAnimal, feederPrograms, gestations, setGestations, notes, setNotes }) {
  const [showAddPasture, setShowAddPasture] = useState(false);
  const [newPastureName, setNewPastureName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMoveTo, setBulkMoveTo] = useState("");
  const [bulkMoveNotes, setBulkMoveNotes] = useState("");
  const [runningWithBullPrompt, setRunningWithBullPrompt] = useState(null);
  const [runningWithBullStep, setRunningWithBullStep] = useState("ask");
  const [runningWithBullForm, setRunningWithBullForm] = useState({ startDate: "", endDate: "" });
  const [runningWithBullCheckPending, setRunningWithBullCheckPending] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const runningWithBullDismissedPasturesRef = useRef(new Set());

  useEffect(() => {
    if (!runningWithBullCheckPending || (!animals && !pendingMove?.nextAnimals)) return;
    const animalsToUse = pendingMove?.nextAnimals ?? animals;
    const { pastureName, promptType, movedFemales, eligibleFemales, maleAnimal } = runningWithBullCheckPending;
    setRunningWithBullCheckPending(null);
    if (promptType === "female_moved" && movedFemales?.length > 0 && maleAnimal) {
      setRunningWithBullPrompt({ pastureName, maleAnimal, eligibleFemales: movedFemales, promptType: "female_moved" });
      setRunningWithBullStep("ask");
      setRunningWithBullForm({ startDate: "", endDate: "" });
      return;
    }
    const male = maleAnimal || getBreedingMaleInPasture(animalsToUse, pastureName);
    if (!male) {
      setPendingMove(null);
      return;
    }
    const eligible = eligibleFemales ?? getEligibleFemalesForRunningWithBull(animalsToUse, gestations, pastureName, male);
    if (eligible.length > 0) {
      setRunningWithBullPrompt({ pastureName, maleAnimal: male, eligibleFemales: eligible, promptType: "bull_moved" });
      setRunningWithBullStep("ask");
      setRunningWithBullForm({ startDate: "", endDate: "" });
    } else {
      setPendingMove(null);
    }
  }, [runningWithBullCheckPending, animals, gestations, pendingMove?.nextAnimals]);

  useEffect(() => {
    if (!animals || !gestations || runningWithBullPrompt || runningWithBullCheckPending) return;
    const pastureNames = getCanonicalPastureNames(animals, pastures);
    for (const p of pastureNames) {
      if (runningWithBullDismissedPasturesRef.current.has(p.toLowerCase())) continue;
      const male = getBreedingMaleInPasture(animals, p);
      if (!male) continue;
      const eligible = getEligibleFemalesForRunningWithBull(animals, gestations, p, male);
      if (eligible.length > 0) {
        setRunningWithBullPrompt({ pastureName: p, maleAnimal: male, eligibleFemales: eligible });
        setRunningWithBullStep("ask");
        setRunningWithBullForm({ startDate: "", endDate: "" });
        break;
      }
    }
  }, [animals, gestations, runningWithBullPrompt, runningWithBullCheckPending]);

  const pastureEligible = (animals || []).filter(a => PASTURE_SPECIES.includes(a.species) && !a.deceased && !a.sale);
  const sortedNames = getCanonicalPastureNames(animals, pastures);
  const allPastureNames = pastureEligible.some(a => !(a.movements?.[0]?.pastureName || "").trim()) ? ["— Not assigned —", ...sortedNames] : sortedNames;

  const animalsByPasture = {};
  allPastureNames.forEach(name => {
    if (name === "— Not assigned —") {
      animalsByPasture[name] = pastureEligible.filter(a => !(a.movements?.[0]?.pastureName || "").trim());
    } else {
      animalsByPasture[name] = pastureEligible.filter(a => {
        const current = (a.movements || [])[0]?.pastureName;
        if (!(current || "").trim()) return false;
        return pastureNameEq(resolvePastureName(current, sortedNames), name);
      });
    }
  });
  const selectedAnimals = pastureEligible.filter(a => selectedIds.includes(a.id));

  function addPasture() {
    const name = newPastureName?.trim();
    if (!name) return;
    const canonical = getCanonicalPastureNames(animals, pastures);
    if (canonical.some(c => pastureNameEq(c, name))) return;
    setPastures(prev => [...(prev || []), name].sort((a, b) => a.localeCompare(b)));
    setNewPastureName("");
    setShowAddPasture(false);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function doBulkMove() {
    const raw = bulkMoveTo?.trim();
    if (!raw || selectedIds.length === 0) return;
    const toPasture = resolvePastureName(raw, sortedNames);
    const dateMovedIn = new Date().toISOString().split("T")[0];
    const notes = bulkMoveNotes?.trim() || undefined;
    const journalEntries = [];
    const nextAnimals = (animals || []).map(an => {
      if (!selectedIds.includes(an.id)) return an;
      const movementId = Date.now().toString() + "-" + an.id;
      const movePayload = { pastureName: toPasture, dateMovedIn, notes, movementId };
      const prevPasture = (an.movements || [])[0]?.pastureName;
      if (setNotes) journalEntries.push(createMovementJournalEntry(an, prevPasture, toPasture, dateMovedIn, notes, movementId));
      return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
    });
    const male = getBreedingMaleInPasture(nextAnimals, toPasture);
    const eligible = male ? getEligibleFemalesForRunningWithBull(nextAnimals, gestations, toPasture, male) : [];
    if (male && eligible.length > 0) {
      const movedIds = new Set(selectedIds);
      const movedFemales = eligible.filter(f => movedIds.has(f.id));
      const promptType = movedFemales.length > 0 ? "female_moved" : "bull_moved";
      setPendingMove({ nextAnimals, journalEntries, movedIds: selectedIds.slice() });
      setRunningWithBullCheckPending({ pastureName: toPasture, promptType, movedFemales, eligibleFemales: eligible, maleAnimal: male });
      setSelectedIds([]);
      setBulkMoveTo("");
      setBulkMoveNotes("");
      return;
    }
    setAnimals(nextAnimals);
    if (setNotes && journalEntries.length > 0) setNotes(prev => [...journalEntries, ...prev]);
    setSelectedIds([]);
    setBulkMoveTo("");
    setBulkMoveNotes("");
  }

  function confirmRunningWithBull() {
    if (!runningWithBullPrompt || !setGestations || !runningWithBullForm.startDate || !runningWithBullForm.endDate) return;
    const { maleAnimal, eligibleFemales } = runningWithBullPrompt;
    const start = runningWithBullForm.startDate;
    const end = runningWithBullForm.endDate;
    const newRecords = eligibleFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = dueDate(end, totalDays);
      return {
        animalId: an.id,
        breedingDate: start,
        breedingDateEnd: end,
        runningWithBull: true,
        dueDate: dueStart,
        dueDateStart: dueStart,
        dueDateEnd: dueEnd,
        sire: getAnimalName(maleAnimal),
        notes: "Running with bull",
        id: Date.now().toString() + "-" + an.id,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
    });
    setGestations(p => [...p, ...newRecords]);
    setRunningWithBullPrompt(null);
    setRunningWithBullStep("ask");
    setRunningWithBullForm({ startDate: "", endDate: "" });
  }

  const dismissRunningWithBullPrompt = () => {
    if (runningWithBullPrompt?.pastureName) runningWithBullDismissedPasturesRef.current.add((runningWithBullPrompt.pastureName || "").trim().toLowerCase());
    setPendingMove(null);
    setRunningWithBullPrompt(null);
    setRunningWithBullStep("ask");
    setRunningWithBullForm({ startDate: "", endDate: "" });
  };

  return (
    <div className="hl-page hl-fade-in">
      {runningWithBullPrompt && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={dismissRunningWithBullPrompt}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Running with Bull</span>
              <button type="button" onClick={dismissRunningWithBullPrompt} style={{ background: "none", border: "none", fontSize: "22px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
            </div>
            {runningWithBullStep === "ask" ? (
              runningWithBullPrompt.promptType === "female_moved" ? (
                <>
                  <p style={{ color: "var(--ink2)", marginBottom: "16px", fontSize: "14px" }}>
                    There is a bull in this pasture. Do you want to add {runningWithBullPrompt.eligibleFemales.length === 1
                      ? <strong>{getAnimalName(runningWithBullPrompt.eligibleFemales[0])}</strong>
                      : <><strong>{runningWithBullPrompt.eligibleFemales.length} females</strong> ({runningWithBullPrompt.eligibleFemales.slice(0, 3).map(f => getAnimalName(f)).join(", ")}{runningWithBullPrompt.eligibleFemales.length > 3 ? "…" : ""})</>} to <strong>{runningWithBullPrompt.pastureName}</strong> and mark {runningWithBullPrompt.eligibleFemales.length === 1 ? "her" : "them"} as running with <strong>{getAnimalName(runningWithBullPrompt.maleAnimal)}</strong>?
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
                    Clicking No will cancel the move.
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Btn onClick={() => {
                      if (pendingMove) {
                        setAnimals(pendingMove.nextAnimals);
                        if (setNotes && pendingMove.journalEntries?.length > 0) setNotes(prev => [...(pendingMove.journalEntries || []), ...prev]);
                        setPendingMove(null);
                      }
                      const today = new Date().toISOString().split("T")[0];
                      const newRecords = runningWithBullPrompt.eligibleFemales.map(an => {
                        const totalDays = SPECIES[an.species]?.days || 150;
                        const dueStart = dueDate(today, totalDays);
                        return {
                          animalId: an.id,
                          breedingDate: today,
                          breedingDateEnd: today,
                          runningWithBull: true,
                          dueDate: dueStart,
                          dueDateStart: dueStart,
                          dueDateEnd: dueStart,
                          sire: getAnimalName(runningWithBullPrompt.maleAnimal),
                          notes: "Running with bull",
                          id: Date.now().toString() + "-" + an.id,
                          gestationDays: totalDays,
                          status: "Active",
                          createdAt: new Date().toISOString(),
                        };
                      });
                      setGestations(p => [...p, ...newRecords]);
                      dismissRunningWithBullPrompt();
                    }}>Yes</Btn>
                    <Btn variant="secondary" onClick={dismissRunningWithBullPrompt}>No</Btn>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ color: "var(--ink2)", marginBottom: "16px", fontSize: "14px" }}>
                    There {runningWithBullPrompt.eligibleFemales.length === 1 ? "is a" : "are"} {runningWithBullPrompt.eligibleFemales.length === 1
                      ? <strong>{displaySex(runningWithBullPrompt.eligibleFemales[0], gestations)}</strong>
                      : <strong>females</strong>} in this pasture. Do you want to mark {runningWithBullPrompt.eligibleFemales.length === 1 ? "her" : `all ${runningWithBullPrompt.eligibleFemales.length} females in this pasture`} as running with <strong>{getAnimalName(runningWithBullPrompt.maleAnimal)}</strong>?
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
                    Clicking No will cancel the move.
                  </p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <Btn onClick={() => {
                      if (pendingMove) {
                        setAnimals(pendingMove.nextAnimals);
                        if (setNotes && pendingMove.journalEntries?.length > 0) setNotes(prev => [...(pendingMove.journalEntries || []), ...prev]);
                        setPendingMove(null);
                      }
                      const today = new Date().toISOString().split("T")[0];
                      const newRecords = runningWithBullPrompt.eligibleFemales.map(an => {
                        const totalDays = SPECIES[an.species]?.days || 150;
                        const dueStart = dueDate(today, totalDays);
                        return {
                          animalId: an.id,
                          breedingDate: today,
                          breedingDateEnd: today,
                          runningWithBull: true,
                          dueDate: dueStart,
                          dueDateStart: dueStart,
                          dueDateEnd: dueStart,
                          sire: getAnimalName(runningWithBullPrompt.maleAnimal),
                          notes: "Running with bull",
                          id: Date.now().toString() + "-" + an.id,
                          gestationDays: totalDays,
                          status: "Active",
                          createdAt: new Date().toISOString(),
                        };
                      });
                      setGestations(p => [...p, ...newRecords]);
                      dismissRunningWithBullPrompt();
                    }}>Yes</Btn>
                    <Btn variant="secondary" onClick={dismissRunningWithBullPrompt}>No</Btn>
                  </div>
                </>
              )
            ) : null}
          </Card>
        </div>
      )}

      <SectionTitle action={<Btn onClick={() => setShowAddPasture(true)}>+ New Pasture</Btn>}>
        Pastures
      </SectionTitle>

      {showAddPasture && (
        <Card className="hl-pasture-assign-form" style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "12px" }}>Create new pasture</div>
          <div className="hl-pasture-assign-form-inner">
            <div className="hl-pasture-assign-field">
              <PastureCombo label="Pasture name" value={newPastureName} onChange={v => setNewPastureName(v)} options={sortedNames} placeholder="Select existing or type new name" id="pasture-list-new-pasture" />
            </div>
            <Btn onClick={addPasture}>Add Pasture</Btn>
            <Btn variant="secondary" onClick={() => { setShowAddPasture(false); setNewPastureName(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {selectedIds.length > 0 && (
        <Card className="hl-pasture-assign-form" style={{ padding: "14px 18px", marginBottom: "16px", borderLeft: "4px solid var(--green3)" }}>
          <div className="hl-pasture-assign-form-inner">
            <span style={{ fontWeight: 600 }}>{selectedIds.length} selected</span>
            <div className="hl-pasture-assign-field">
              <PastureCombo label="Move to" value={bulkMoveTo} onChange={v => setBulkMoveTo(v)} options={sortedNames} placeholder="Select or type new pasture" id="pasture-list-pastures-bulk" />
            </div>
            <div className="hl-pasture-assign-field">
              <Input value={bulkMoveNotes} onChange={e => setBulkMoveNotes(e.target.value)} placeholder="Notes (optional)" />
            </div>
            <Btn size="sm" onClick={doBulkMove} disabled={!bulkMoveTo?.trim()}>Move</Btn>
            <Btn size="sm" variant="secondary" onClick={() => { setSelectedIds([]); setBulkMoveTo(""); setBulkMoveNotes(""); }}>Clear</Btn>
          </div>
        </Card>
      )}

      {allPastureNames.length === 0 && !showAddPasture && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🟩</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No pastures yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Create a pasture or assign Cattle/Horses to a pasture from their profile.</p>
        </Card>
      )}

      <div className="hl-pastures-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {allPastureNames.map(pastureName => {
          const list = animalsByPasture[pastureName] || [];
          const totalCount = list.length;
          const bySpecies = list.reduce((acc, a) => {
            const s = a.species || "Other";
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {});
          const speciesSummary = Object.entries(bySpecies)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([species, count]) => `${count} ${species}`)
            .join(" · ");
          return (
            <Card key={pastureName} style={{ padding: "18px 20px", borderLeft: "4px solid var(--green3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>{pastureName}</div>
                <div style={{ fontSize: "13px", color: "var(--muted)", textAlign: "right" }}>
                  {totalCount === 0 ? "0 animals" : (
                    <>
                      <span>{totalCount} animal{totalCount !== 1 ? "s" : ""}</span>
                      {speciesSummary && <span style={{ display: "block", marginTop: "2px" }}>{speciesSummary}</span>}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {list.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No animals in this pasture</p>
                ) : (
                  list.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} onClick={e => e.stopPropagation()} style={{ width: "16px", height: "16px", accentColor: "var(--green)", flexShrink: 0 }} />
                      <button type="button" onClick={() => { setTab("animals"); setViewingAnimal(a); }} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: "6px 0", fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                        {getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}
                      </button>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>{a.species}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); const removed = (a.movements || [])[0]; const next = (a.movements || []).slice(1); if (removed?.movementId && setNotes) setNotes(prev => prev.filter(n => n.movementId !== removed.movementId)); setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, movements: next } : an))); }} style={{ fontSize: "12px", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} title="Remove from pasture (no movement record)">Remove</button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {(() => {
        const withPen = (feederPrograms || []).filter(f => (f.penName || "").trim());
        const feedlotPenNames = [...new Set(withPen.map(f => (f.penName || "").trim()))].filter(Boolean).sort((a, b) => a.localeCompare(b));
        if (feedlotPenNames.length === 0) return null;
        return (
          <>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600, marginTop: "28px", marginBottom: "14px" }}>Feedlot Pens</div>
            <div className="hl-pastures-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {feedlotPenNames.map(penName => {
                const entries = withPen.filter(f => (f.penName || "").trim() === penName);
                return (
                  <Card key={penName} style={{ padding: "18px 20px", borderLeft: "4px solid var(--brass)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>{penName}</div>
                      <div style={{ fontSize: "13px", color: "var(--muted)" }}>{entries.length} animal{entries.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {entries.map(fp => {
                        const animal = (animals || []).find(a => a.id === fp.animalId);
                        const daysOnFeed = feederDaysOnFeed(fp.startDate);
                        const currentWeight = getLatestWeightForAnimal(animals, fp.animalId);
                        return (
                          <div key={fp.id} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--brass2)", background: "rgba(201,149,42,0.15)", padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>Feeder</span>
                            <button type="button" onClick={() => { setTab("animals"); setViewingAnimal(animal); }} style={{ flex: "1 1 auto", minWidth: 0, textAlign: "left", background: "none", border: "none", padding: "6px 0", fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                              {animal ? getAnimalName(animal) : "—"}{animal?.tag ? ` #${animal.tag}` : ""}
                            </button>
                            <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{daysOnFeed}d on feed{currentWeight ? ` · ${currentWeight} lb` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
}

