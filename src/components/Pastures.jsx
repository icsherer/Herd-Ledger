import { useState, useEffect, useRef } from "react";
import { SPECIES, PASTURE_SPECIES, INTACT_MALE_TERM_BY_SPECIES } from "../lib/constants.js";
import { getAnimalName, fmt, getBreedingMaleInPasture, getEligibleFemalesForRunningWithBull, pastureNameEq, getCanonicalPastureNames, resolvePastureName, createMovementJournalEntry, dueDate, dueDateRangeFromSingleDate, feederDaysOnFeed, displaySex, isBreedingMale } from "../lib/helpers.js";
import { Card, Btn, Input, PastureCombo, SectionTitle, Select, Textarea } from "./ui.jsx";

const FEED_TYPES = ["Hay Bale", "Round Bale", "Square Bale", "Grain", "Supplement", "Other"];

// ── Pastures ───────────────────────────────────────────────────────────────────
export default function Pastures({ animals, setAnimals, pastures, setPastures, pastureFeedLogs = {}, setPastureFeedLogs, setExpenses, setTab, setViewingAnimal, feederPrograms, gestations, setGestations, notes, setNotes }) {
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
  const [twoBullsWarningPending, setTwoBullsWarningPending] = useState(null);
  /** Dismissed Running with Bull popups: Set of "pastureName|maleId" so same bull+pasture won't show again this session. */
  const runningWithBullDismissedRef = useRef(new Set());

  // Feed tracking
  const [logFeedPasture, setLogFeedPasture] = useState(null);
  const [feedForm, setFeedForm] = useState(() => ({ feedType: FEED_TYPES[0], quantity: "1", cost: "", date: new Date().toISOString().split("T")[0], notes: "" }));
  const [editingFeedEntryId, setEditingFeedEntryId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [detailPasture, setDetailPasture] = useState(null);
  const [markEmptyPasture, setMarkEmptyPasture] = useState(null);
  const [markEmptyDate, setMarkEmptyDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [deletePastureConfirm, setDeletePastureConfirm] = useState(null); // pasture name to delete
  const [expandedPastures, setExpandedPastures] = useState(new Set());

  function countIntactMalesBySpecies(animalList) {
    const bySpecies = {};
    (animalList || []).forEach(a => {
    if (!isBreedingMale(a)) return;
      const s = a.species || "Other";
      bySpecies[s] = (bySpecies[s] || 0) + 1;
    });
    return bySpecies;
  }

  function getMultipleMalesWarning(animalList) {
    const bySpecies = countIntactMalesBySpecies(animalList);
    const entry = Object.entries(bySpecies).find(([, count]) => count > 1);
    if (!entry) return null;
    const [species, count] = entry;
    const term = INTACT_MALE_TERM_BY_SPECIES[species] || "male";
    const termPlural = term + "s";
    return { count, termLabel: termPlural, label: `${count} ${termPlural}` };
  }

  useEffect(() => {
    if (!runningWithBullCheckPending || (!animals && !pendingMove?.nextAnimals)) return;
    const animalsToUse = pendingMove?.nextAnimals ?? animals;
    const { pastureName, promptType, movedFemales, eligibleFemales, maleAnimal } = runningWithBullCheckPending;
    setRunningWithBullCheckPending(null);
    const male = maleAnimal || getBreedingMaleInPasture(animalsToUse, pastureName);
    const dismissedKey = male && pastureName ? `${(pastureName || "").trim().toLowerCase()}|${male.id}` : "";
    if (dismissedKey && runningWithBullDismissedRef.current.has(dismissedKey)) {
      setPendingMove(null);
      return;
    }
    if (promptType === "female_moved" && movedFemales?.length > 0 && male) {
      setRunningWithBullPrompt({ pastureName, maleAnimal: male, eligibleFemales: movedFemales, promptType: "female_moved" });
      setRunningWithBullStep("ask");
      setRunningWithBullForm({ startDate: "", endDate: "" });
      return;
    }
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

  function getFeedLog(pastureName) {
    if (!pastureName) return [];
    const list = (pastureFeedLogs || {})[pastureName];
    return Array.isArray(list) ? [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "")) : [];
  }

  function getFeedSummary(pastureName) {
    const log = getFeedLog(pastureName);
    const lastEntry = log[0];
    const withDaysLasted = log.filter(e => e.daysLasted != null && e.daysLasted > 0);
    const totalQty = withDaysLasted.reduce((s, e) => s + (Number(e.quantity) || 0), 0);
    const totalDays = withDaysLasted.reduce((s, e) => s + (Number(e.daysLasted) || 0), 0);
    const avgDaysPerUnit = totalQty > 0 ? totalDays / totalQty : null;
    const lastDate = lastEntry?.date ? new Date(lastEntry.date + "T12:00:00") : null;
    const lastQty = lastEntry ? (Number(lastEntry.quantity) || 0) : 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceLast = lastDate ? Math.floor((today - lastDate) / (24 * 60 * 60 * 1000)) : null;
    let estimatedDaysRemaining = null;
    if (avgDaysPerUnit != null && lastQty > 0 && daysSinceLast != null) {
      const totalEstimated = lastQty * avgDaysPerUnit;
      estimatedDaysRemaining = Math.round(totalEstimated - daysSinceLast);
    }
    const avgDaysPerBale = totalQty > 0 && withDaysLasted.length > 0 ? totalDays / withDaysLasted.length : null;
    return { log, lastEntry, lastDate: lastEntry?.date ?? null, avgDaysPerUnit, daysSinceLast, estimatedDaysRemaining, avgDaysPerBale, withDaysLasted };
  }

  function feedStatusColor(summary) {
    if (summary.estimatedDaysRemaining == null) return null;
    if (summary.estimatedDaysRemaining <= 0) return "red";
    if (summary.estimatedDaysRemaining <= 3) return "yellow";
    return "green";
  }

  function mayNeedFeedBadge(summary) {
    if (!summary.lastDate || summary.avgDaysPerUnit == null) return false;
    const daysSince = summary.daysSinceLast ?? 0;
    const lastQty = summary.lastEntry ? (Number(summary.lastEntry.quantity) || 0) : 0;
    const expectedDays = (lastQty || 1) * summary.avgDaysPerUnit;
    return expectedDays > 0 && daysSince >= expectedDays;
  }

  function submitLogFeed() {
    if (!logFeedPasture || !setPastureFeedLogs) return;
    const qty = parseInt(feedForm.quantity, 10);
    if (!Number.isFinite(qty) || qty < 1) return;
    const cost = feedForm.cost.trim() ? parseFloat(feedForm.cost) : null;
    const costNum = cost != null && !Number.isNaN(cost) ? cost : 0;
    const date = feedForm.date || new Date().toISOString().split("T")[0];
    const feedType = feedForm.feedType || FEED_TYPES[0];
    const notes = (feedForm.notes || "").trim() || undefined;

    if (editingFeedEntryId) {
      const existingList = (pastureFeedLogs || {})[logFeedPasture] || [];
      const existing = existingList.find(e => e.id === editingFeedEntryId);
      if (!existing) {
        setEditingFeedEntryId(null);
        setLogFeedPasture(null);
        return;
      }
      const updatedEntry = {
        ...existing,
        feedType,
        quantity: qty,
        cost: costNum > 0 ? costNum : undefined,
        date,
        notes,
      };
      if (setExpenses && existing.expenseId) {
        if (costNum > 0) {
          setExpenses(prev => prev.map(exp => exp.id !== existing.expenseId ? exp : {
            ...exp,
            date,
            amount: costNum,
            description: `${logFeedPasture} – ${feedType}`,
          }));
          updatedEntry.expenseId = existing.expenseId;
        } else {
          setExpenses(prev => prev.filter(exp => exp.id !== existing.expenseId));
          updatedEntry.expenseId = undefined;
        }
      } else if (setExpenses && costNum > 0) {
        const expId = "exp-" + Date.now();
        setExpenses(prev => [...prev, { id: expId, date, category: "Feed", amount: costNum, description: `${logFeedPasture} – ${feedType}`, pastureName: logFeedPasture }]);
        updatedEntry.expenseId = expId;
      }
      setPastureFeedLogs(prev => ({
        ...prev,
        [logFeedPasture]: (prev[logFeedPasture] || []).map(e => e.id === editingFeedEntryId ? updatedEntry : e),
      }));
      setEditingFeedEntryId(null);
    } else {
      const entryId = Date.now().toString();
      let expenseId;
      if (setExpenses && costNum > 0) {
        expenseId = "exp-" + Date.now();
        setExpenses(prev => [...prev, {
          id: expenseId,
          date,
          category: "Feed",
          amount: costNum,
          description: `${logFeedPasture} – ${feedType}`,
          pastureName: logFeedPasture,
        }]);
      }
      const entry = {
        id: entryId,
        feedType,
        quantity: qty,
        cost: costNum > 0 ? costNum : undefined,
        date,
        notes,
        expenseId,
      };
      setPastureFeedLogs(prev => ({
        ...prev,
        [logFeedPasture]: [...(prev[logFeedPasture] || []), entry],
      }));
    }
    setFeedForm({ feedType: FEED_TYPES[0], quantity: "1", cost: "", date: new Date().toISOString().split("T")[0], notes: "" });
    setLogFeedPasture(null);
  }

  function openEditFeed(pastureName, entry) {
    setLogFeedPasture(pastureName);
    setFeedForm({
      feedType: entry.feedType || FEED_TYPES[0],
      quantity: String(entry.quantity ?? 1),
      cost: entry.cost != null && entry.cost > 0 ? String(entry.cost) : "",
      date: entry.date || new Date().toISOString().split("T")[0],
      notes: entry.notes ?? "",
    });
    setEditingFeedEntryId(entry.id);
  }

  function deleteFeedEntry(pastureName, entry) {
    if (!setPastureFeedLogs) return;
    setPastureFeedLogs(prev => ({
      ...prev,
      [pastureName]: (prev[pastureName] || []).filter(e => e.id !== entry.id),
    }));
    if (setExpenses && entry.expenseId) {
      setExpenses(prev => prev.filter(e => e.id !== entry.expenseId));
    }
    setDeleteConfirm(null);
  }

  function submitMarkEmpty() {
    if (!markEmptyPasture || !setPastureFeedLogs) return;
    const log = getFeedLog(markEmptyPasture);
    const lastWithoutEmpty = log.find(e => e.emptyDate == null);
    if (!lastWithoutEmpty) return;
    const emptyDate = markEmptyDate || new Date().toISOString().split("T")[0];
    const fromDate = new Date((lastWithoutEmpty.date || "") + "T12:00:00");
    const toDate = new Date(emptyDate + "T12:00:00");
    const daysLasted = Math.max(0, Math.floor((toDate - fromDate) / (24 * 60 * 60 * 1000)));
    setPastureFeedLogs(prev => {
      const list = prev[markEmptyPasture] || [];
      return {
        ...prev,
        [markEmptyPasture]: list.map(e => e.id === lastWithoutEmpty.id ? { ...e, emptyDate, daysLasted } : e),
      };
    });
    setMarkEmptyPasture(null);
    setMarkEmptyDate(new Date().toISOString().split("T")[0]);
  }

  function openLogFeed(pastureName) {
    setLogFeedPasture(pastureName);
    setEditingFeedEntryId(null);
    setFeedForm({ feedType: FEED_TYPES[0], quantity: "1", cost: "", date: new Date().toISOString().split("T")[0], notes: "" });
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
    const alreadyInPasture = (animals || []).filter(a => !selectedIds.includes(a.id) && pastureNameEq((a.movements || [])[0]?.pastureName, toPasture));
    const movedAnimals = (animals || []).filter(a => selectedIds.includes(a.id));
    const currentMalesBySpecies = countIntactMalesBySpecies(alreadyInPasture);
    const movedMalesBySpecies = countIntactMalesBySpecies(movedAnimals);
    let multipleMales = null;
    for (const species of Object.keys(SPECIES)) {
      const current = currentMalesBySpecies[species] || 0;
      const moved = movedMalesBySpecies[species] || 0;
      if (current + moved < 2) continue;
      const term = INTACT_MALE_TERM_BY_SPECIES[species] || "male";
      const termPlural = term + "s";
      multipleMales = { count: current, termLabel: termPlural, pastureName: toPasture };
      break;
    }
    if (multipleMales) {
      setTwoBullsWarningPending({
        nextAnimals,
        journalEntries,
        count: multipleMales.count,
        termLabel: multipleMales.termLabel,
        pastureName: toPasture,
      });
      setSelectedIds([]);
      setBulkMoveTo("");
      setBulkMoveNotes("");
      return;
    }
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
    if (!runningWithBullPrompt || !setGestations || !runningWithBullForm.startDate) return;
    const { maleAnimal, eligibleFemales } = runningWithBullPrompt;
    const start = runningWithBullForm.startDate;
    const end = (runningWithBullForm.endDate || "").trim() ? runningWithBullForm.endDate : null;
    const newRecords = eligibleFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const minDays = SPECIES[an.species]?.minDays ?? totalDays;
      const maxDays = SPECIES[an.species]?.maxDays ?? totalDays;
      let dueStart, dueEnd;
      if (end) {
        dueStart = dueDate(start, totalDays);
        dueEnd = dueDate(end, totalDays);
      } else {
        const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
        dueStart = range.dueDateStart;
        dueEnd = range.dueDateEnd;
      }
      return {
        animalId: an.id,
        breedingDate: start,
        breedingDateEnd: end || undefined,
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
    if (runningWithBullPrompt?.pastureName && runningWithBullPrompt?.maleAnimal?.id) {
      runningWithBullDismissedRef.current.add(`${(runningWithBullPrompt.pastureName || "").trim().toLowerCase()}|${runningWithBullPrompt.maleAnimal.id}`);
    }
    setPendingMove(null);
    setRunningWithBullPrompt(null);
    setRunningWithBullStep("ask");
    setRunningWithBullForm({ startDate: "", endDate: "" });
  };

  return (
    <div className="hl-page hl-fade-in">
      {twoBullsWarningPending && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setTwoBullsWarningPending(null)}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px", borderLeft: "4px solid #c45c26" }} onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: "16px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Warning</span>
            </div>
            <p style={{ color: "var(--ink2)", marginBottom: "20px", fontSize: "14px" }}>
              This pasture already contains <strong>{twoBullsWarningPending.count} intact {twoBullsWarningPending.termLabel}</strong>. Multiple males in the same pasture may fight or result in uncertain parentage. Do you want to continue?
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <Btn onClick={() => {
                setAnimals(twoBullsWarningPending.nextAnimals);
                if (setNotes && twoBullsWarningPending.journalEntries?.length > 0) setNotes(prev => [...twoBullsWarningPending.journalEntries, ...prev]);
                setTwoBullsWarningPending(null);
              }}>Continue</Btn>
              <Btn variant="secondary" onClick={() => setTwoBullsWarningPending(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}
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
                        const minDays = SPECIES[an.species]?.minDays ?? totalDays;
                        const maxDays = SPECIES[an.species]?.maxDays ?? totalDays;
                        const range = dueDateRangeFromSingleDate(today, minDays, maxDays);
                        return {
                          animalId: an.id,
                          breedingDate: today,
                          runningWithBull: true,
                          dueDate: range.dueDateStart,
                          dueDateStart: range.dueDateStart,
                          dueDateEnd: range.dueDateEnd,
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
                        const minDays = SPECIES[an.species]?.minDays ?? totalDays;
                        const maxDays = SPECIES[an.species]?.maxDays ?? totalDays;
                        const range = dueDateRangeFromSingleDate(today, minDays, maxDays);
                        return {
                          animalId: an.id,
                          breedingDate: today,
                          runningWithBull: true,
                          dueDate: range.dueDateStart,
                          dueDateStart: range.dueDateStart,
                          dueDateEnd: range.dueDateEnd,
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


      {deletePastureConfirm && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDeletePastureConfirm(null)}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px", padding: "24px", borderLeft: "4px solid var(--danger2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "12px" }}>Delete pasture?</div>
            <p style={{ fontSize: "14px", color: "var(--ink2)", marginBottom: "8px" }}>
              Are you sure you want to delete <strong>{deletePastureConfirm}</strong>?
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
              Animals currently assigned to this pasture will not be moved — they will simply have no pasture assigned. Their movement history is preserved.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <Btn onClick={() => {
                setPastures(prev => (prev || []).filter(p => p !== deletePastureConfirm));
                setDeletePastureConfirm(null);
              }}>Delete</Btn>
              <Btn variant="secondary" onClick={() => setDeletePastureConfirm(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {logFeedPasture && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setLogFeedPasture(null); setEditingFeedEntryId(null); }}>
          <Card style={{ maxWidth: "480px", width: "100%", margin: "20px", padding: "24px", borderLeft: "4px solid var(--brass)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>{editingFeedEntryId ? "Edit feed" : "Log feed"} – {logFeedPasture}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <Select label="Feed type" value={feedForm.feedType} onChange={e => setFeedForm(f => ({ ...f, feedType: e.target.value }))}>
                {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
              <div style={{ display: "flex", gap: "12px" }}>
                <Input label="Quantity" type="number" min={1} value={feedForm.quantity} onChange={e => setFeedForm(f => ({ ...f, quantity: e.target.value }))} />
                <Input label="Cost (optional)" type="number" step="0.01" min={0} value={feedForm.cost} onChange={e => setFeedForm(f => ({ ...f, cost: e.target.value }))} placeholder="0" />
              </div>
              <Input label="Date" type="date" value={feedForm.date} onChange={e => setFeedForm(f => ({ ...f, date: e.target.value }))} />
              <Textarea label="Notes" value={feedForm.notes} onChange={e => setFeedForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" rows={2} />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <Btn onClick={submitLogFeed}>Save</Btn>
              <Btn variant="secondary" onClick={() => { setLogFeedPasture(null); setEditingFeedEntryId(null); }}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {markEmptyPasture && (
        <Card style={{ padding: "18px", marginBottom: "16px", borderLeft: "4px solid #c45c26" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>Mark feed empty – {markEmptyPasture}</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "10px" }}>Records when the last feed supply ran out and calculates how many days it lasted.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
            <Input label="Date ran out" type="date" value={markEmptyDate} onChange={e => setMarkEmptyDate(e.target.value)} />
            <Btn size="sm" onClick={submitMarkEmpty}>Save</Btn>
            <Btn size="sm" variant="secondary" onClick={() => { setMarkEmptyPasture(null); setMarkEmptyDate(new Date().toISOString().split("T")[0]); }}>Cancel</Btn>
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

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {allPastureNames.map((pastureName, idx) => {
          const list = animalsByPasture[pastureName] || [];
          const totalCount = list.length;
          const multiMales = pastureName === "— Not assigned —" ? null : getMultipleMalesWarning(list);
          const isVirtualPasture = pastureName === "— Not assigned —";
          const feedSummary = !isVirtualPasture ? getFeedSummary(pastureName) : null;
          const statusColor = feedSummary ? feedStatusColor(feedSummary) : null;
          const showMayNeedFeed = feedSummary && mayNeedFeedBadge(feedSummary);
          const isExpanded = expandedPastures.has(pastureName);
          const isLast = idx === allPastureNames.length - 1;

          function toggleExpand() {
            setExpandedPastures(prev => {
              const next = new Set(prev);
              next.has(pastureName) ? next.delete(pastureName) : next.add(pastureName);
              return next;
            });
          }

          return (
            <div key={pastureName} style={{ borderBottom: isLast && !isExpanded ? "none" : "1px solid var(--cream2)" }}>
              {/* Tappable header row */}
              <button
                type="button"
                onClick={toggleExpand}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "10px",
                  padding: "16px 18px", background: isExpanded ? "rgba(201,149,42,0.05)" : "transparent",
                  border: "none", borderLeft: `4px solid ${isVirtualPasture ? "var(--cream3)" : "var(--green3)"}`,
                  cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                {/* Name + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, color: "var(--ink)" }}>{pastureName}</span>
                    {multiMales && (
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#c45c26", background: "rgba(196,92,38,0.15)", padding: "2px 6px", borderRadius: "4px" }}>{multiMales.label}</span>
                    )}
                    {showMayNeedFeed && (
                      <span style={{ fontSize: "11px", fontWeight: 600, color: "#c45c26", background: "rgba(196,92,38,0.15)", padding: "2px 6px", borderRadius: "4px" }}>May need feed</span>
                    )}
                    {statusColor && feedSummary?.estimatedDaysRemaining != null && (
                      <span style={{
                        width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                        background: statusColor === "green" ? "var(--green)" : statusColor === "yellow" ? "#b8860b" : "#c45c26",
                      }} />
                    )}
                  </div>
                </div>
                {/* Count + chevron */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ fontSize: "13px", color: "var(--muted)", fontWeight: 500 }}>
                    {totalCount} animal{totalCount !== 1 ? "s" : ""}
                  </span>
                  <span style={{
                    fontSize: "11px", color: "var(--muted)",
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    display: "inline-block",
                  }}>▶</span>
                </div>
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--cream2)", background: "rgba(201,149,42,0.03)", borderLeft: `4px solid ${isVirtualPasture ? "var(--cream3)" : "var(--green3)"}` }}>
                  {/* Feed info + buttons for real pastures */}
                  {!isVirtualPasture && (
                    <div style={{ padding: "12px 18px", borderBottom: list.length > 0 ? "1px solid var(--cream2)" : "none" }}>
                      {feedSummary?.lastDate && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Last feed: {feedSummary.lastDate}</span>
                          {feedSummary.estimatedDaysRemaining != null && (
                            <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor === "green" ? "var(--green)" : statusColor === "yellow" ? "#b8860b" : "#c45c26" }}>
                              ~{feedSummary.estimatedDaysRemaining} day{feedSummary.estimatedDaysRemaining !== 1 ? "s" : ""} left
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                        {[
                          { label: "🌾 Log Feed", onClick: () => openLogFeed(pastureName), disabled: false, style: {} },
                          { label: "✓ Mark Empty", onClick: () => { setMarkEmptyPasture(pastureName); setMarkEmptyDate(new Date().toISOString().split("T")[0]); }, disabled: !feedSummary?.lastEntry || feedSummary?.lastEntry?.emptyDate != null, style: {} },
                          { label: "📋 Feed History", onClick: () => setDetailPasture(pastureName), disabled: false, style: {} },
                        ].map(({ label, onClick, disabled, style }) => (
                          <button key={label} type="button" onClick={onClick} disabled={disabled} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "99px", border: "1px solid var(--cream3)", background: "#fff", color: disabled ? "var(--muted)" : "var(--ink)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", ...style }}>
                            {label}
                          </button>
                        ))}
                        <button type="button" onClick={() => setDeletePastureConfirm(pastureName)} style={{ fontSize: "13px", padding: "6px 12px", borderRadius: "99px", border: "none", background: "none", color: "#b94040", cursor: "pointer", fontFamily: "inherit" }}>
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Animal list */}
                  {list.length === 0 ? (
                    <div style={{ padding: "14px 18px", fontSize: "13px", color: "var(--muted)" }}>No animals in this pasture</div>
                  ) : (
                    list.map((a, aIdx) => (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 18px", borderTop: aIdx > 0 ? "1px solid var(--cream2)" : "none" }}>
                        <button
                          type="button"
                          onClick={() => { setTab("animals"); setViewingAnimal(a); }}
                          style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer" }}
                        >
                          {getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}
                        </button>
                        <span style={{ fontSize: "12px", color: "var(--muted)", flexShrink: 0 }}>{a.species}</span>
                        {pastureName !== "— Not assigned —" && setAnimals && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              const movements = a.movements || [];
                              const removed = movements[0];
                              const next = movements.slice(1);
                              if (removed?.movementId && setNotes) setNotes(prev => prev.filter(n => n.movementId !== removed.movementId));
                              setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, movements: next } : an)));
                            }}
                            style={{ fontSize: "12px", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}
                            title="Remove from pasture"
                          >Remove</button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {detailPasture && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setDetailPasture(null)}>
          <div style={{ background: "#fff", borderRadius: "var(--radius2)", boxShadow: "var(--shadow)", border: "1px solid var(--cream2)", borderLeft: "4px solid var(--brass)", width: "100%", maxWidth: "720px", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--cream2)", flexShrink: 0 }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Feed history – {detailPasture}</span>
              <button type="button" onClick={() => setDetailPasture(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "24px", color: "var(--muted)", lineHeight: 1, padding: "0 4px" }} aria-label="Close">×</button>
            </div>
            <div style={{ overflowY: "auto", padding: "16px 20px 20px" }}>
              {(() => {
                const summary = getFeedSummary(detailPasture);
                const avgDays = summary.withDaysLasted?.length > 0
                  ? summary.withDaysLasted.reduce((s, e) => s + (Number(e.daysLasted) || 0), 0) / summary.withDaysLasted.length
                  : null;
                return (
                  <>
                    {avgDays != null && (
                      <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "12px" }}>
                        This pasture averages 1 bale every {Math.round(avgDays * 10) / 10} days.
                      </p>
                    )}
                    {summary.log.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "var(--muted)" }}>No feed logged yet.</p>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                              <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Date</th>
                              <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Feed type</th>
                              <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Qty</th>
                              <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Cost</th>
                              <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Days lasted</th>
                              <th style={{ padding: "8px 10px" }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.log.map(e => {
                              const isDeleting = deleteConfirm?.pastureName === detailPasture && deleteConfirm?.entryId === e.id;
                              return (
                                <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{e.date ? fmt(e.date) : "—"}</td>
                                  <td style={{ padding: "8px 10px" }}>{e.feedType || "—"}</td>
                                  <td style={{ padding: "8px 10px" }}>{e.quantity ?? "—"}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{e.cost != null ? "$" + Number(e.cost).toFixed(2) : "—"}</td>
                                  <td style={{ padding: "8px 10px" }}>{e.daysLasted != null ? e.daysLasted : "—"}</td>
                                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                                    {isDeleting ? (
                                      <>
                                        <span style={{ fontSize: "12px", color: "var(--muted)", marginRight: "8px" }}>Delete this feed entry?</span>
                                        <button type="button" onClick={() => deleteFeedEntry(detailPasture, e)} style={{ fontSize: "12px", fontWeight: 600, color: "var(--red, #c45c26)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginRight: "6px" }}>Yes</button>
                                        <button type="button" onClick={() => setDeleteConfirm(null)} style={{ fontSize: "12px", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>No</button>
                                      </>
                                    ) : (
                                      <>
                                        <Btn size="sm" variant="secondary" onClick={() => openEditFeed(detailPasture, e)} style={{ marginRight: "6px" }}>Edit</Btn>
                                        <Btn size="sm" variant="secondary" onClick={() => setDeleteConfirm({ pastureName: detailPasture, entryId: e.id })}>Delete</Btn>
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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

