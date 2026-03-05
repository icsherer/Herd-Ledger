import { useState, useEffect } from "react";
import { SPECIES, FEED_TYPES } from "../lib/constants.js";
import { getAnimalName, fmt, feederDaysOnFeed, estimatedWeightFromADG, getLatestWeightForAnimal, getADGDefault, formatCompactDollar } from "../lib/helpers.js";
import { Card, Btn, Input, Select, SectionTitle } from "./ui.jsx";

// Feeder helpers (used only in FeederProgram)
function getFCRDefault(species, feedType) {
  if (species === "Cattle") return (feedType === "Hay" || feedType === "Silage") ? 7.5 : 6.0;
  if (species === "Pig") return 2.8;
  if (species === "Sheep" || species === "Goat") return 4.5;
  if (species === "Chicken") return 1.9;
  if (species === "Rabbit") return 3.0;
  return 6.0;
}

function profitColor(projectedNet, totalAllIn) {
  if (totalAllIn <= 0) return "var(--muted)";
  const pct = projectedNet / totalAllIn;
  if (projectedNet > 0) return "var(--green)";
  if (pct >= -0.1) return "var(--brass2)"; // within 10% of breakeven
  return "var(--danger2)";
}

export default function FeederCattle({ animals, setAnimals, feederPrograms, setFeederPrograms, setTab, setViewingAnimal, feederPreselectAnimalId, setFeederPreselectAnimalId, feederBulkAnimalIds, setFeederBulkAnimalIds }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    startDate: "",
    startingWeight: "",
    targetWeight: "",
    penName: "",
    feedType: "Corn",
    feedConversionRatio: "",
    costPerLb: "",
    adg: "",
  });
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkFormShared, setBulkFormShared] = useState({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
  const [bulkAddAnimals, setBulkAddAnimals] = useState([]);
  const [showBulkCalculator, setShowBulkCalculator] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [individualCalcAnimalId, setIndividualCalcAnimalId] = useState("");
  const [individualCalcOverrides, setIndividualCalcOverrides] = useState({ feedType: "Corn", feedConversionRatio: "", costPerLbFeed: "", additionalExpenses: "", marketPricePerLb: "" });
  const [bulkCalcForm, setBulkCalcForm] = useState({
    headCount: "",
    avgStartWeight: "",
    avgTargetWeight: "",
    avgPurchasePricePerHead: "",
    species: "Cattle",
    feedType: "Corn",
    feedConversionRatio: "6",
    adg: "3",
    costPerLbFeed: "",
    vetPerHead: "",
    medicinePerHead: "",
    beddingPerHead: "",
    laborPerHead: "",
    otherPerHead: "",
    marketPricePerLb: "",
  });

  function updateFeederCalculator(fpId, updates) {
    setFeederPrograms(prev => prev.map(f => f.id === fpId ? { ...f, ...updates } : f));
  }

  function addStartingWeightIfMissing(animalId, dateStr, weightLb) {
    if (!setAnimals || !dateStr || weightLb == null || isNaN(weightLb) || weightLb <= 0) return;
    setAnimals(prev => prev.map(an => {
      if (an.id !== animalId) return an;
      const hasExisting = (an.weights || []).some(e => e.date === dateStr);
      if (hasExisting) return an;
      const entry = { id: Date.now().toString() + "-feeder", weight: weightLb, date: dateStr, notes: "Feeder program start" };
      const nextWeights = [...(an.weights || []), entry].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
      return { ...an, weights: nextWeights };
    }));
  }

  const cattle = (animals || []).filter(a => a.species === "Cattle" && !a.deceased && !a.sale);
  const inProgramIds = new Set((feederPrograms || []).map(f => f.animalId));
  const availableCattle = cattle.filter(a => !inProgramIds.has(a.id));

  useEffect(() => {
    if (!feederPreselectAnimalId || !setFeederPreselectAnimalId) return;
    const weight = getLatestWeightForAnimal(animals, feederPreselectAnimalId);
    const today = new Date().toISOString().split("T")[0];
    setShowBulkAdd(false);
    setShowAdd(true);
    setForm(p => ({ ...p, animalId: feederPreselectAnimalId, startingWeight: weight, startDate: today }));
    setFeederPreselectAnimalId(null);
  }, [feederPreselectAnimalId, setFeederPreselectAnimalId, animals]);

  useEffect(() => {
    if (!feederBulkAnimalIds?.length || !setFeederBulkAnimalIds) return;
    const inProgram = new Set((feederPrograms || []).map(f => f.animalId));
    const toAdd = feederBulkAnimalIds.filter(id => !inProgram.has(id)).map(id => ({ animalId: id, startingWeight: getLatestWeightForAnimal(animals, id) }));
    setFeederBulkAnimalIds([]);
    if (toAdd.length === 0) return;
    setShowAdd(false);
    setShowBulkAdd(true);
    setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
    setBulkAddAnimals(toAdd);
  }, [feederBulkAnimalIds, setFeederBulkAnimalIds, animals, feederPrograms]);

  const totalHead = (feederPrograms || []).length;
  const totalEstimatedCost = (feederPrograms || []).reduce((sum, fp) => {
    const animal = (animals || []).find(a => a.id === fp.animalId);
    if (!animal) return sum;
    const latestRecorded = (() => { const w = getLatestWeightForAnimal(animals, fp.animalId); return w ? parseFloat(w) : null; })();
    const estWeight = estimatedWeightFromADG(animal, fp.startDate);
    const currentWeight = latestRecorded ?? estWeight ?? fp.startingWeight;
    const startWeight = fp.startingWeight ?? 0;
    const lbsGain = currentWeight != null && startWeight > 0 ? Math.max(0, currentWeight - startWeight) : 0;
    const fcr = fp.feedConversionRatio != null ? fp.feedConversionRatio : getFCRDefault(animal.species, fp.feedType || "Corn");
    const costPerLb = fp.costPerLb ?? 0;
    return sum + (lbsGain * fcr * costPerLb);
  }, 0);
  const totalProjectedNet = (feederPrograms || []).reduce((sum, fp) => {
    const animal = (animals || []).find(a => a.id === fp.animalId);
    if (!animal) return sum;
    const daysOnFeed = feederDaysOnFeed(fp.startDate);
    const latestRecorded = (() => { const w = getLatestWeightForAnimal(animals, fp.animalId); return w ? parseFloat(w) : null; })();
    const estWeight = estimatedWeightFromADG(animal, fp.startDate);
    const currentWeight = latestRecorded ?? estWeight ?? fp.startingWeight;
    const startWeight = fp.startingWeight ?? 0;
    const targetWeight = fp.targetWeight != null ? fp.targetWeight : (currentWeight != null ? currentWeight + 200 : 0);
    const conversion = fp.feedConversionRatio != null ? fp.feedConversionRatio : getFCRDefault(animal.species, fp.feedType || "Corn");
    const lbsGainSoFar = currentWeight != null && startWeight > 0 ? Math.max(0, currentWeight - startWeight) : 0;
    const totalFeedCostCalc = lbsGainSoFar * conversion * (fp.costPerLb ?? 0);
    const additionalExp = fp.additionalExpenses ?? 0;
    const purchasePrice = animal.acquisitionType === "Purchased" && animal.purchasePrice != null ? Number(animal.purchasePrice) : 0;
    const totalAllIn = totalFeedCostCalc + additionalExp + purchasePrice;
    const marketPricePerLb = fp.marketPricePerLb ?? 0;
    const projectedRevenue = (marketPricePerLb && targetWeight > 0) ? marketPricePerLb * targetWeight : 0;
    return sum + (projectedRevenue - totalAllIn);
  }, 0);

  function addToProgram() {
    if (!form.animalId || !form.startDate) return;
    const an = (animals || []).find(a => a.id === form.animalId);
    const feedType = form.feedType || "Corn";
    const fcr = form.feedConversionRatio?.trim() ? parseFloat(form.feedConversionRatio) : (an ? getFCRDefault(an.species, feedType) : 6);
    const startWeight = form.startingWeight?.trim() ? parseFloat(form.startingWeight) : undefined;
    const targetWeight = form.targetWeight?.trim() ? parseFloat(form.targetWeight) : undefined;
    const costPerLb = form.costPerLb?.trim() ? parseFloat(form.costPerLb) : undefined;
    const adgVal = form.adg?.trim() ? parseFloat(form.adg) : (an ? getADGDefault(an.species) : 3);
    setFeederPrograms(prev => [...prev, {
      id: Date.now().toString(),
      animalId: form.animalId,
      startDate: form.startDate,
      startingWeight: startWeight,
      targetWeight: targetWeight,
      adg: adgVal,
      dailyFeedLbs: undefined,
      feedType,
      costPerLb: costPerLb,
      penName: form.penName?.trim() || undefined,
      feedConversionRatio: fcr,
    }]);
    if (startWeight != null && startWeight > 0) addStartingWeightIfMissing(form.animalId, form.startDate, startWeight);
    setForm({ animalId: "", startDate: "", startingWeight: "", targetWeight: "", penName: "", feedType: "Corn", feedConversionRatio: "", costPerLb: "", adg: "" });
    setShowAdd(false);
  }

  function removeFromProgram(id) {
    setFeederPrograms(prev => prev.filter(f => f.id !== id));
  }

  function submitBulkAdd() {
    if (!bulkFormShared.startDate || bulkAddAnimals.length === 0) return;
    const adgVal = bulkFormShared.adg?.trim() ? parseFloat(bulkFormShared.adg) : 3;
    const dailyLbs = bulkFormShared.dailyFeedLbs?.trim() ? parseFloat(bulkFormShared.dailyFeedLbs) : undefined;
    const costPerLb = bulkFormShared.costPerLb?.trim() ? parseFloat(bulkFormShared.costPerLb) : undefined;
    const penName = bulkFormShared.penName?.trim() || undefined;
    const feedType = bulkFormShared.feedType || "Corn";
    const fcr = getFCRDefault("Cattle", feedType);
    const newRecords = bulkAddAnimals.map((row, i) => ({
      id: Date.now().toString() + "-" + i,
      animalId: row.animalId,
      startDate: bulkFormShared.startDate,
      startingWeight: row.startingWeight?.trim() ? parseFloat(row.startingWeight) : undefined,
      adg: adgVal,
      dailyFeedLbs: dailyLbs,
      feedType,
      costPerLb: costPerLb,
      penName,
      feedConversionRatio: fcr,
    }));
    setFeederPrograms(prev => [...prev, ...newRecords]);
    const startDate = bulkFormShared.startDate;
    newRecords.forEach(rec => {
      const w = rec.startingWeight;
      if (startDate && w != null && w > 0) addStartingWeightIfMissing(rec.animalId, startDate, w);
    });
    setShowBulkAdd(false);
    setBulkAddAnimals([]);
    setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
  }

  function setBulkAnimalStartingWeight(animalId, value) {
    setBulkAddAnimals(prev => prev.map(row => row.animalId === animalId ? { ...row, startingWeight: value } : row));
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => setShowCalculatorModal(true)}>Open Calculator</Btn>
          <Btn variant="secondary" onClick={() => setShowBulkCalculator(true)}>Bulk Calculator</Btn>
          <Btn onClick={() => setShowAdd(true)}>+ Add to Feeder Program</Btn>
        </div>
      }>
        Feeder Program
      </SectionTitle>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
        <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Head on feed</div>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>{totalHead}</div>
        </Card>
        <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Est. feed cost (gain × FCR × $/lb)</div>
          <div className="hl-summary-dollar" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>{formatCompactDollar(totalEstimatedCost)}</div>
        </Card>
        <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Total projected P/L</div>
          <div className="hl-summary-dollar" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: profitColor(totalProjectedNet, totalEstimatedCost || 1) }}>{formatCompactDollar(totalProjectedNet)}</div>
        </Card>
      </div>

      {showBulkCalculator && (
        <Card style={{ padding: "20px 16px", marginBottom: "24px", borderLeft: "4px solid var(--brass)", maxWidth: "900px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "clamp(18px, 4vw, 20px)", fontWeight: 600 }}>Bulk Profitability Calculator</div>
            <Btn size="sm" variant="ghost" onClick={() => setShowBulkCalculator(false)}>Close</Btn>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>Standalone what-if calculator. No animals need to be registered.</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <section className="hl-bulk-calc-inputs" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", margin: 0 }}>Inputs</h3>
              <div className="hl-bulk-calc-grid">
                <Input label="Number of head" type="number" min="1" value={bulkCalcForm.headCount} onChange={e => setBulkCalcForm(p => ({ ...p, headCount: e.target.value }))} placeholder="e.g. 50" />
                <Input label="Avg starting weight (lbs)" type="number" min="0" step="0.1" value={bulkCalcForm.avgStartWeight} onChange={e => setBulkCalcForm(p => ({ ...p, avgStartWeight: e.target.value }))} placeholder="e.g. 650" />
                <Input label="Avg target weight (lbs)" type="number" min="0" step="0.1" value={bulkCalcForm.avgTargetWeight} onChange={e => setBulkCalcForm(p => ({ ...p, avgTargetWeight: e.target.value }))} placeholder="e.g. 1400" />
                <Input label="Avg purchase price per head ($)" type="number" min="0" step="0.01" value={bulkCalcForm.avgPurchasePricePerHead} onChange={e => setBulkCalcForm(p => ({ ...p, avgPurchasePricePerHead: e.target.value }))} placeholder="e.g. 950" />
                <Select label="Species" value={bulkCalcForm.species} onChange={e => {
                  const sp = e.target.value;
                  setBulkCalcForm(p => ({ ...p, species: sp, feedConversionRatio: String(getFCRDefault(sp, p.feedType)), adg: String(getADGDefault(sp)) }));
                }}>
                  {Object.keys(SPECIES).map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select label="Feed type" value={bulkCalcForm.feedType} onChange={e => {
                  const ft = e.target.value;
                  setBulkCalcForm(p => ({ ...p, feedType: ft, feedConversionRatio: String(getFCRDefault(p.species, ft)) }));
                }}>
                  {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </Select>
                <Input label="Feed conversion ratio" type="number" min="0.1" step="0.1" value={bulkCalcForm.feedConversionRatio} onChange={e => setBulkCalcForm(p => ({ ...p, feedConversionRatio: e.target.value }))} placeholder="By species/feed" />
                <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={bulkCalcForm.adg} onChange={e => setBulkCalcForm(p => ({ ...p, adg: e.target.value }))} placeholder="By species" />
                <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={bulkCalcForm.costPerLbFeed} onChange={e => setBulkCalcForm(p => ({ ...p, costPerLbFeed: e.target.value }))} placeholder="e.g. 0.08" />
                <Input label="Vet ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.vetPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, vetPerHead: e.target.value }))} placeholder="0" />
                <Input label="Medicine ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.medicinePerHead} onChange={e => setBulkCalcForm(p => ({ ...p, medicinePerHead: e.target.value }))} placeholder="0" />
                <Input label="Bedding ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.beddingPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, beddingPerHead: e.target.value }))} placeholder="0" />
                <Input label="Labor ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.laborPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, laborPerHead: e.target.value }))} placeholder="0" />
                <Input label="Other ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.otherPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, otherPerHead: e.target.value }))} placeholder="0" />
                <Input label="Market price per lb ($)" type="number" min="0" step="0.01" value={bulkCalcForm.marketPricePerLb} onChange={e => setBulkCalcForm(p => ({ ...p, marketPricePerLb: e.target.value }))} placeholder="e.g. 1.85" />
              </div>
            </section>

            {(() => {
              const head = parseInt(bulkCalcForm.headCount, 10) || 0;
              const startWt = parseFloat(bulkCalcForm.avgStartWeight) || 0;
              const targetWt = parseFloat(bulkCalcForm.avgTargetWeight) || 0;
              const purchasePerHead = parseFloat(bulkCalcForm.avgPurchasePricePerHead) || 0;
              const conversion = parseFloat(bulkCalcForm.feedConversionRatio) || getFCRDefault(bulkCalcForm.species, bulkCalcForm.feedType);
              const adg = parseFloat(bulkCalcForm.adg) || getADGDefault(bulkCalcForm.species);
              const costPerLb = parseFloat(bulkCalcForm.costPerLbFeed) || 0;
              const addV = parseFloat(bulkCalcForm.vetPerHead) || 0; const addM = parseFloat(bulkCalcForm.medicinePerHead) || 0; const addB = parseFloat(bulkCalcForm.beddingPerHead) || 0; const addL = parseFloat(bulkCalcForm.laborPerHead) || 0; const addO = parseFloat(bulkCalcForm.otherPerHead) || 0;
              const addPerHead = addV + addM + addB + addL + addO;
              const marketPrice = parseFloat(bulkCalcForm.marketPricePerLb) || 0;
              const gainPerHead = targetWt > startWt ? targetWt - startWt : 0;
              const estimatedDaysToFinish = (gainPerHead > 0 && adg > 0) ? Math.max(0, Math.ceil(gainPerHead / adg)) : null;
              const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
              const totalLbsGain = head * gainPerHead;
              const totalFeedConsumed = totalLbsGain * conversion;
              const totalFeedCost = totalLbsGain * conversion * costPerLb;
              const totalAddExpenses = head * addPerHead;
              const totalPurchase = head * purchasePerHead;
              const totalAllIn = totalFeedCost + totalPurchase + totalAddExpenses;
              const totalAllInPerHead = head > 0 ? totalAllIn / head : 0;
              const costOfGainPerLb = totalLbsGain > 0 ? totalAllIn / totalLbsGain : 0;
              const breakevenPricePerLb = head > 0 && targetWt > 0 ? totalAllIn / (head * targetWt) : 0;
              const projectedRevenue = head * targetWt * marketPrice;
              const projectedNet = projectedRevenue - totalAllIn;
              const profitPerHead = head > 0 ? projectedNet / head : 0;
              const profitPerDay = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? projectedNet / estimatedDaysToFinish : 0;
              const netColor = profitColor(projectedNet, totalAllIn);
              return (
                <section style={{ padding: "20px 16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <h3 style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", margin: 0 }}>Results</h3>
                  {estimatedDaysToFinish != null && (
                    <div style={{ padding: "14px 16px", background: "#fff", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Estimated days to finish</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)" }}>{estimatedDaysToFinish} days</div>
                      <div style={{ fontSize: "13px", color: "var(--ink2)" }}>{estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</div>
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px 20px", fontSize: "14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Total feed consumed</span><strong>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 0 })} lb</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Total feed cost</span><strong className="hl-summary-dollar">{formatCompactDollar(totalFeedCost)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Total all-in cost</span><strong className="hl-summary-dollar">{formatCompactDollar(totalAllIn)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>All-in per head</span><strong className="hl-summary-dollar">{formatCompactDollar(totalAllInPerHead)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Cost of gain/lb</span><strong className="hl-summary-dollar">{formatCompactDollar(costOfGainPerLb)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Breakeven $/lb</span><strong className="hl-summary-dollar">{formatCompactDollar(breakevenPricePerLb)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Projected revenue</span><strong className="hl-summary-dollar">{formatCompactDollar(projectedRevenue)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Net profit (group)</span><strong className="hl-summary-dollar" style={{ color: netColor }}>{formatCompactDollar(projectedNet)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Profit/loss per head</span><strong className="hl-summary-dollar" style={{ color: netColor }}>{formatCompactDollar(profitPerHead)}</strong></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ color: "var(--muted)", fontSize: "12px" }}>Profit per day</span><strong className="hl-summary-dollar" style={{ color: netColor }}>{formatCompactDollar(profitPerDay)}</strong></div>
                  </div>
                </section>
              );
            })()}
          </div>
        </Card>
      )}

      {showBulkAdd && bulkAddAnimals.length > 0 && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add to Feeder Program ({bulkAddAnimals.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Start date *" type="date" value={bulkFormShared.startDate} onChange={e => setBulkFormShared(p => ({ ...p, startDate: e.target.value }))} />
            <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={bulkFormShared.adg} onChange={e => setBulkFormShared(p => ({ ...p, adg: e.target.value }))} placeholder="e.g. 3 (Cattle default)" />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={bulkFormShared.dailyFeedLbs} onChange={e => setBulkFormShared(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={bulkFormShared.feedType} onChange={e => setBulkFormShared(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={bulkFormShared.costPerLb} onChange={e => setBulkFormShared(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
            <Input label="Pen or Lot Name" value={bulkFormShared.penName} onChange={e => setBulkFormShared(p => ({ ...p, penName: e.target.value }))} placeholder="e.g. Pen 1, East Lot, Finishing Pen" />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Starting weight per animal (lbs)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {bulkAddAnimals.map(row => {
                const an = (animals || []).find(a => a.id === row.animalId);
                return (
                  <div key={row.animalId} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "1 1 auto", fontSize: "14px" }}>{getAnimalName(an)}{an?.name && an?.tag ? ` (#${an.tag})` : ""}</span>
                    <Input type="number" min="0" step="0.1" value={row.startingWeight} onChange={e => setBulkAnimalStartingWeight(row.animalId, e.target.value)} placeholder="e.g. 650" style={{ width: "120px" }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={submitBulkAdd}>Add all to Program</Btn>
            <Btn variant="secondary" onClick={() => { setShowBulkAdd(false); setBulkAddAnimals([]); setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" }); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add to Feeder Program</div>
          {availableCattle.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>No eligible animals. All cattle are already enrolled, or add animals from the Animals tab first.</p>
          ) : (
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Select label="Animal *" value={form.animalId} onChange={e => {
                const id = e.target.value;
                const an = (animals || []).find(a => a.id === id);
                const weightsSorted = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                const lastWeight = weightsSorted[0]?.weight;
                const adgDefault = an ? getADGDefault(an.species) : 3;
                const feedType = form.feedType || "Corn";
                const fcrDefault = an ? getFCRDefault(an.species, feedType) : 6;
                setForm(p => ({ ...p, animalId: id, startingWeight: lastWeight != null ? String(lastWeight) : "", adg: p.adg || String(adgDefault), feedConversionRatio: p.feedConversionRatio || String(fcrDefault) }));
              }}>
                <option value="">— Select —</option>
                {availableCattle.map(a => (
                  <option key={a.id} value={a.id}>{getAnimalName(a)}{a.name && a.tag ? ` (#${a.tag})` : ""}</option>
                ))}
              </Select>
              <Input label="Start date *" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
              <Input label="Starting weight (lb)" type="number" min="0" step="0.1" value={form.startingWeight} onChange={e => setForm(p => ({ ...p, startingWeight: e.target.value }))} placeholder="e.g. 650" />
              <Input label="Target weight (lb)" type="number" min="0" step="0.1" value={form.targetWeight} onChange={e => setForm(p => ({ ...p, targetWeight: e.target.value }))} placeholder="e.g. 1400" />
              <Input label="Pen name" value={form.penName} onChange={e => setForm(p => ({ ...p, penName: e.target.value }))} placeholder="e.g. Pen 1, East Lot" />
              <Select label="Feed type" value={form.feedType} onChange={e => {
                const ft = e.target.value;
                const an = (animals || []).find(a => a.id === form.animalId);
                const fcrDefault = an ? getFCRDefault(an.species, ft) : getFCRDefault("Cattle", ft);
                setForm(p => ({ ...p, feedType: ft, feedConversionRatio: p.feedConversionRatio || String(fcrDefault) }));
              }}>
                {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input label="FCR (feed conversion ratio)" type="number" min="0.1" step="0.1" value={form.feedConversionRatio} onChange={e => setForm(p => ({ ...p, feedConversionRatio: e.target.value }))} placeholder={form.animalId ? String(getFCRDefault((animals || []).find(a => a.id === form.animalId)?.species, form.feedType) ?? 6) : "e.g. 6"} />
              <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={form.costPerLb} onChange={e => setForm(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
              <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={form.adg} onChange={e => setForm(p => ({ ...p, adg: e.target.value }))} placeholder={form.animalId ? String(getADGDefault((animals || []).find(a => a.id === form.animalId)?.species) ?? 3) : "e.g. 3"} />
            </div>
          )}
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={addToProgram} disabled={!form.animalId || !form.startDate || availableCattle.length === 0}>Add to Program</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {feederPrograms.length === 0 && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🌾</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No animals in the Feeder Program yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Add livestock from your herd to track feed and growth.</p>
        </Card>
      )}

      <div className="hl-feeder-table-wrap" style={{ overflowX: "auto", marginBottom: "24px", border: "1px solid var(--cream2)", borderRadius: "var(--radius)", background: "#fff" }}>
        <table className="hl-feeder-table" style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--cream2)", background: "var(--cream)" }}>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Name / Tag</th>
              <th style={{ textAlign: "right", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Days on feed</th>
              <th style={{ textAlign: "right", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Start (lb)</th>
              <th style={{ textAlign: "right", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Current (lb)</th>
              <th style={{ textAlign: "right", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Lbs gained</th>
              <th style={{ padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", minWidth: "100px" }}>Progress</th>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Est. finish</th>
              <th style={{ padding: "12px 14px", fontWeight: 600, color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", width: "1%" }}></th>
              <th style={{ padding: "12px 14px", width: "1%" }}></th>
            </tr>
          </thead>
          <tbody>
            {(feederPrograms || []).map(fp => {
              const animal = (animals || []).find(a => a.id === fp.animalId);
              if (!animal) return null;
              const daysOnFeed = feederDaysOnFeed(fp.startDate);
              const estWeight = estimatedWeightFromADG(animal, fp.startDate);
              const latestRecorded = (() => { const w = getLatestWeightForAnimal(animals, fp.animalId); return w ? parseFloat(w) : null; })();
              const currentWeight = latestRecorded ?? estWeight ?? fp.startingWeight;
              const startWeight = fp.startingWeight ?? 0;
              const targetWeight = fp.targetWeight != null ? fp.targetWeight : (currentWeight != null ? currentWeight + 200 : 0);
              const adg = (fp.adg != null && fp.adg > 0) ? fp.adg : getADGDefault(animal.species);
              const lbsToGo = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : 0;
              const estimatedDaysToFinish = (lbsToGo > 0 && adg > 0) ? Math.max(0, Math.ceil(lbsToGo / adg)) : null;
              const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
              const lbsGainSoFar = currentWeight != null && startWeight > 0 ? Math.max(0, currentWeight - startWeight) : 0;
              const progressBarPct = (targetWeight != null && startWeight != null && targetWeight > startWeight && currentWeight != null)
                ? Math.min(100, Math.max(0, ((currentWeight - startWeight) / (targetWeight - startWeight)) * 100))
                : 0;
              const expectedGainByNow = adg * daysOnFeed;
              const gainVsExpected = expectedGainByNow > 0 ? lbsGainSoFar / expectedGainByNow : 1;
              const progressBarColor = gainVsExpected >= 0.98 ? "var(--green)" : gainVsExpected >= 0.85 ? "var(--brass2)" : "var(--danger2)";
              return (
                <tr key={fp.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{getAnimalName(animal)}{animal.name && animal.tag ? ` (#${animal.tag})` : ""}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>{daysOnFeed}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>{startWeight != null ? Math.round(startWeight) : "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>{currentWeight != null ? Math.round(currentWeight) : "—"}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "var(--green)" }}>{lbsGainSoFar.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  <td style={{ padding: "10px 14px", verticalAlign: "middle" }}>
                    {targetWeight != null && startWeight != null && targetWeight > startWeight ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "8px", background: "var(--cream2)", borderRadius: "4px", overflow: "hidden", minWidth: "60px" }}>
                          <div style={{ height: "100%", width: `${progressBarPct}%`, background: progressBarColor, borderRadius: "4px", transition: "width 0.3s ease" }} />
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{Math.round(progressBarPct)}%</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px" }}>{estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</td>
                  <td style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
                    <Btn size="sm" variant="secondary" onClick={() => { setTab("animals"); setViewingAnimal(animal); }}>Record Weight</Btn>
                  </td>
                  <td style={{ padding: "8px 14px" }}>
                    <Btn size="sm" variant="ghost" onClick={() => removeFromProgram(fp.id)} style={{ padding: "4px 8px", minWidth: 0 }} title="Remove from program">×</Btn>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCalculatorModal && (() => {
        const fp = (feederPrograms || []).find(f => f.animalId === individualCalcAnimalId);
        const animal = fp ? (animals || []).find(a => a.id === fp.animalId) : null;
        const daysOnFeedVal = individualCalcAnimalId && fp ? feederDaysOnFeed(fp.startDate) : 0;
        const latestW = individualCalcAnimalId ? getLatestWeightForAnimal(animals, individualCalcAnimalId) : "";
        const estW = animal && fp ? estimatedWeightFromADG(animal, fp.startDate) : null;
        const currentWVal = individualCalcAnimalId && fp ? (latestW ? parseFloat(latestW) : estW ?? fp.startingWeight ?? 0) : 0;
        const startWVal = fp?.startingWeight ?? 0;
        const targetWVal = fp?.targetWeight ?? (currentWVal ? currentWVal + 200 : 0);
        const startW = startWVal;
        const currentW = currentWVal;
        const daysOnFeed = daysOnFeedVal;
        const targetW = targetWVal;
        const feedType = individualCalcOverrides.feedType || fp?.feedType || "Corn";
        const conversion = individualCalcOverrides.feedConversionRatio !== "" ? parseFloat(individualCalcOverrides.feedConversionRatio) : (fp?.feedConversionRatio ?? getFCRDefault(animal?.species || "Cattle", feedType));
        const costPerLb = individualCalcOverrides.costPerLbFeed !== "" ? parseFloat(individualCalcOverrides.costPerLbFeed) : (fp?.costPerLb ?? 0);
        const additionalExp = individualCalcOverrides.additionalExpenses !== "" ? parseFloat(individualCalcOverrides.additionalExpenses) : (fp?.additionalExpenses ?? 0);
        const purchasePrice = animal?.acquisitionType === "Purchased" && animal?.purchasePrice != null ? Number(animal.purchasePrice) : 0;
        const marketPrice = individualCalcOverrides.marketPricePerLb !== "" ? parseFloat(individualCalcOverrides.marketPricePerLb) : (fp?.marketPricePerLb ?? 0);
        const lbsGain = currentW > startW ? currentW - startW : 0;
        const totalFeedCost = lbsGain * conversion * costPerLb;
        const totalAllIn = totalFeedCost + additionalExp + purchasePrice;
        const costOfGainPerLb = lbsGain > 0 ? totalAllIn / lbsGain : 0;
        const breakevenPerLb = currentW > 0 ? totalAllIn / currentW : 0;
        const projectedRevenue = targetW > 0 && marketPrice ? marketPrice * targetW : 0;
        const projectedNet = projectedRevenue - totalAllIn;
        const netColor = profitColor(projectedNet, totalAllIn);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box", overflow: "auto" }} onClick={() => setShowCalculatorModal(false)}>
            <Card style={{ maxWidth: "720px", width: "100%", maxHeight: "90vh", overflow: "auto", borderLeft: "4px solid var(--brass)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600 }}>Profitability Calculator</div>
                <Btn size="sm" variant="ghost" onClick={() => setShowCalculatorModal(false)}>Close</Btn>
              </div>
              <div style={{ marginBottom: "20px" }}>
                <Select label="Animal" value={individualCalcAnimalId} onChange={e => {
                  const id = e.target.value;
                  setIndividualCalcAnimalId(id);
                  const f = (feederPrograms || []).find(x => x.animalId === id);
                  const a = f ? (animals || []).find(x => x.id === id) : null;
                  if (!f || !a) { setIndividualCalcOverrides({ feedType: "Corn", feedConversionRatio: "", costPerLbFeed: "", additionalExpenses: "", marketPricePerLb: "" }); return; }
                  setIndividualCalcOverrides({ feedType: f.feedType || "Corn", feedConversionRatio: f.feedConversionRatio != null ? String(f.feedConversionRatio) : "", costPerLbFeed: f.costPerLb != null ? String(f.costPerLb) : "", additionalExpenses: f.additionalExpenses != null ? String(f.additionalExpenses) : "", marketPricePerLb: f.marketPricePerLb != null ? String(f.marketPricePerLb) : "" });
                }}>
                  <option value="">— Select animal —</option>
                  {(feederPrograms || []).map(f => {
                    const an = (animals || []).find(a => a.id === f.animalId);
                    return an ? <option key={f.id} value={f.animalId}>{getAnimalName(an)}{an.name && an.tag ? ` (#${an.tag})` : ""}</option> : null;
                  })}
                </Select>
              </div>
              {individualCalcAnimalId && fp && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", marginBottom: "20px", padding: "12px 0", borderTop: "1px solid var(--cream2)", borderBottom: "1px solid var(--cream2)" }}>
                    <div><span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Start weight (lb)</span><span style={{ fontSize: "14px", color: "var(--ink2)" }}>{startWVal != null ? Math.round(startWVal) : "—"}</span></div>
                    <div><span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Current weight (lb)</span><span style={{ fontSize: "14px", color: "var(--ink2)" }}>{currentWVal != null ? Math.round(currentWVal) : "—"}</span></div>
                    <div><span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Days on feed</span><span style={{ fontSize: "14px", color: "var(--ink2)" }}>{daysOnFeedVal}</span></div>
                    <div><span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Target weight (lb)</span><span style={{ fontSize: "14px", color: "var(--ink2)" }}>{targetWVal != null ? Math.round(targetWVal) : "—"}</span></div>
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Feed cost inputs</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                    <Select label="Feed type" value={individualCalcOverrides.feedType || feedType} onChange={e => { const ft = e.target.value; setIndividualCalcOverrides(p => ({ ...p, feedType: ft, feedConversionRatio: animal ? String(getFCRDefault(animal.species, ft)) : p.feedConversionRatio })); }}>
                      {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                    <Input label="FCR" type="number" min="0.1" step="0.1" value={individualCalcOverrides.feedConversionRatio} onChange={e => setIndividualCalcOverrides(p => ({ ...p, feedConversionRatio: e.target.value }))} />
                    <Input label="Cost per lb feed ($)" type="number" min="0" step="0.01" value={individualCalcOverrides.costPerLbFeed} onChange={e => setIndividualCalcOverrides(p => ({ ...p, costPerLbFeed: e.target.value }))} />
                    <Input label="Add'l expenses ($)" type="number" min="0" step="0.01" value={individualCalcOverrides.additionalExpenses} onChange={e => setIndividualCalcOverrides(p => ({ ...p, additionalExpenses: e.target.value }))} />
                    <Input label="Market $/lb" type="number" min="0" step="0.01" value={individualCalcOverrides.marketPricePerLb} onChange={e => setIndividualCalcOverrides(p => ({ ...p, marketPricePerLb: e.target.value }))} />
                  </div>
                  <section style={{ padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: "12px" }}>Results</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", fontSize: "14px" }}>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Total feed cost</span><div className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(totalFeedCost)}</div></div>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Total all-in cost</span><div className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(totalAllIn)}</div></div>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Cost of gain/lb</span><div className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(costOfGainPerLb)}</div></div>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Breakeven $/lb</span><div className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(breakevenPerLb)}</div></div>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Projected revenue</span><div className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(projectedRevenue)}</div></div>
                      <div><span style={{ color: "var(--muted)", fontSize: "12px" }}>Projected net P/L</span><div className="hl-summary-dollar" style={{ fontWeight: 600, color: netColor }}>{formatCompactDollar(projectedNet)}</div></div>
                    </div>
                  </section>
                </>
              )}
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
