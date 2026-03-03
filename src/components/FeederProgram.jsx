import { useState, useEffect } from "react";
import { SPECIES, FEED_TYPES } from "../lib/constants.js";
import { getAnimalName, fmt } from "../lib/helpers.js";
import { Card, Btn, Input, Select, SectionTitle } from "./ui.jsx";

// Feeder helpers
function getFCRDefault(species, feedType) {
  if (species === "Cattle") return (feedType === "Hay" || feedType === "Silage") ? 7.5 : 6.0;
  if (species === "Pig") return 2.8;
  if (species === "Sheep" || species === "Goat") return 4.5;
  if (species === "Chicken") return 1.9;
  if (species === "Rabbit") return 3.0;
  return 6.0;
}
// ADG defaults (lbs/day): Cattle 3.0, Pig 1.8, Sheep 0.5, Goat 0.4, Chicken 0.1
function getADGDefault(species) {
  if (species === "Cattle") return 3.0;
  if (species === "Pig") return 1.8;
  if (species === "Sheep") return 0.5;
  if (species === "Goat") return 0.4;
  if (species === "Chicken") return 0.1;
  if (species === "Rabbit") return 0.15;
  return 1.0;
}

function feederDaysOnFeed(startDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr + "T12:00:00").getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

function estimatedWeightFromADG(animal, feederStartDateStr) {
  const weights = [...(animal?.weights || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (weights.length < 2) return null;
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first?.date || !last?.date) return null;
  const daysBetween = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (daysBetween <= 0) return null;
  const adg = (last.weight - first.weight) / daysBetween;
  const lastDate = new Date(last.date + "T12:00:00").getTime();
  const daysSinceLast = (Date.now() - lastDate) / 86400000;
  return last.weight + adg * daysSinceLast;
}

function getLatestWeightForAnimal(animals, animalId) {
  const an = (animals || []).find(a => a.id === animalId);
  const weights = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const w = weights[0]?.weight;
  return w != null ? String(w) : "";
}

function profitColor(projectedNet, totalAllIn) {
  if (totalAllIn <= 0) return "var(--muted)";
  const pct = projectedNet / totalAllIn;
  if (projectedNet > 0) return "var(--green)";
  if (pct >= -0.1) return "var(--brass2)"; // within 10% of breakeven
  return "var(--danger2)";
}

export default function FeederCattle({ animals, feederPrograms, setFeederPrograms, setTab, setViewingAnimal, feederPreselectAnimalId, setFeederPreselectAnimalId, feederBulkAnimalIds, setFeederBulkAnimalIds }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    startDate: "",
    startingWeight: "",
    dailyFeedLbs: "",
    feedType: "Corn",
    costPerLb: "",
    penName: "",
    adg: "",
  });
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkFormShared, setBulkFormShared] = useState({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
  const [bulkAddAnimals, setBulkAddAnimals] = useState([]);
  const [showBulkCalculator, setShowBulkCalculator] = useState(false);
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
    const days = feederDaysOnFeed(fp.startDate);
    const costPerDay = (fp.dailyFeedLbs || 0) * (fp.costPerLb ?? 0);
    return sum + days * costPerDay;
  }, 0);

  function addToProgram() {
    if (!form.animalId || !form.startDate) return;
    const an = (animals || []).find(a => a.id === form.animalId);
    const startWeight = form.startingWeight?.trim() ? parseFloat(form.startingWeight) : undefined;
    const adgVal = form.adg?.trim() ? parseFloat(form.adg) : (an ? getADGDefault(an.species) : 3);
    const dailyLbs = form.dailyFeedLbs?.trim() ? parseFloat(form.dailyFeedLbs) : undefined;
    const costPerLb = form.costPerLb?.trim() ? parseFloat(form.costPerLb) : undefined;
    const feedType = form.feedType || "Corn";
    const fcr = an ? getFCRDefault(an.species, feedType) : 6;
    setFeederPrograms(prev => [...prev, {
      id: Date.now().toString(),
      animalId: form.animalId,
      startDate: form.startDate,
      startingWeight: startWeight,
      adg: adgVal,
      dailyFeedLbs: dailyLbs,
      feedType,
      costPerLb: costPerLb,
      penName: form.penName?.trim() || undefined,
      feedConversionRatio: fcr,
    }]);
    setForm({ animalId: "", startDate: "", startingWeight: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "" });
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
          <Btn variant="secondary" onClick={() => setShowBulkCalculator(true)}>Bulk Calculator</Btn>
          <Btn onClick={() => setShowAdd(true)} disabled={availableCattle.length === 0}>+ Add to Feeder Program</Btn>
        </div>
      }>
        Feeder Program
      </SectionTitle>

      {showBulkCalculator && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)", maxWidth: "900px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600 }}>Bulk Profitability Calculator</div>
            <Btn size="sm" variant="ghost" onClick={() => setShowBulkCalculator(false)}>Close</Btn>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "18px" }}>Standalone what-if calculator. No animals need to be registered.</p>
          <div className="hl-form-grid-3" style={{ marginBottom: "18px" }}>
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
            <Input label="Additional: Vet ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.vetPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, vetPerHead: e.target.value }))} placeholder="0" />
            <Input label="Medicine ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.medicinePerHead} onChange={e => setBulkCalcForm(p => ({ ...p, medicinePerHead: e.target.value }))} placeholder="0" />
            <Input label="Bedding ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.beddingPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, beddingPerHead: e.target.value }))} placeholder="0" />
            <Input label="Labor ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.laborPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, laborPerHead: e.target.value }))} placeholder="0" />
            <Input label="Other ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.otherPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, otherPerHead: e.target.value }))} placeholder="0" />
            <Input label="Current market price per lb ($)" type="number" min="0" step="0.01" value={bulkCalcForm.marketPricePerLb} onChange={e => setBulkCalcForm(p => ({ ...p, marketPricePerLb: e.target.value }))} placeholder="e.g. 1.85" />
          </div>
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
            const totalGainGroup = head * gainPerHead;
            const totalFeedConsumed = totalGainGroup * conversion;
            const totalFeedCost = totalFeedConsumed * costPerLb;
            const totalAddExpenses = head * addPerHead;
            const totalPurchase = head * purchasePerHead;
            const totalAllIn = totalFeedCost + totalAddExpenses + totalPurchase;
            const totalAllInPerHead = head > 0 ? totalAllIn / head : 0;
            const costOfGainPerLb = totalGainGroup > 0 ? totalAllIn / totalGainGroup : 0;
            const breakevenPricePerLb = head > 0 && targetWt > 0 ? totalAllIn / (head * targetWt) : 0;
            const projectedGrossRevenue = head * targetWt * marketPrice;
            const projectedNet = projectedGrossRevenue - totalAllIn;
            const profitPerHead = head > 0 ? projectedNet / head : 0;
            const profitPerDay = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? projectedNet / estimatedDaysToFinish : 0;
            const color = profitColor(projectedNet, totalAllIn);
            return (
              <div style={{ padding: "16px 20px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
                {estimatedDaysToFinish != null && (
                  <div style={{ marginBottom: "16px", padding: "12px 14px", background: "#fff", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Estimated days to finish</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>{estimatedDaysToFinish} days</div>
                    <div style={{ fontSize: "13px", color: "var(--ink2)" }}>Estimated finish date · {estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</div>
                  </div>
                )}
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Real-time results</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 20px", fontSize: "14px" }}>
                  <div><span style={{ color: "var(--muted)" }}>Total feed consumed</span><div style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 0 })} lb</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total feed cost</span><div style={{ fontWeight: 600 }}>${totalFeedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total all-in cost per head</span><div style={{ fontWeight: 600 }}>${totalAllInPerHead.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total all-in cost (group)</span><div style={{ fontWeight: 600 }}>${totalAllIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Cost of gain per lb</span><div style={{ fontWeight: 600 }}>${costOfGainPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Breakeven price per lb</span><div style={{ fontWeight: 600 }}>${breakevenPricePerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected gross revenue</span><div style={{ fontWeight: 600 }}>${projectedGrossRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected net (group)</span><div style={{ fontWeight: 600, color }}>${projectedNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Profit/loss per head</span><div style={{ fontWeight: 600, color }}>${profitPerHead.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected profit per day</span><div style={{ fontWeight: 600, color }}>${profitPerDay.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {totalHead > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Head on feed</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>{totalHead}</div>
          </Card>
          <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Est. feed cost to date</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>${totalEstimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </Card>
        </div>
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
                    <span style={{ flex: "1 1 auto", fontSize: "14px" }}>{getAnimalName(an)}{an?.tag ? ` #${an.tag}` : ""}</span>
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
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Cattle) *" value={form.animalId} onChange={e => {
              const id = e.target.value;
              const an = (animals || []).find(a => a.id === id);
              const weightsSorted = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
              const lastWeight = weightsSorted[0]?.weight;
              const adgDefault = an ? getADGDefault(an.species) : 3;
              setForm(p => ({ ...p, animalId: id, startingWeight: lastWeight != null ? String(lastWeight) : "", adg: p.adg || String(adgDefault) }));
            }}>
              <option value="">— Select —</option>
              {availableCattle.map(a => (
                <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>
              ))}
            </Select>
            <Input label="Start date *" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            <Input label="Starting weight (lbs)" type="number" min="0" step="0.1" value={form.startingWeight} onChange={e => setForm(p => ({ ...p, startingWeight: e.target.value }))} placeholder="e.g. 650" />
            <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={form.adg} onChange={e => setForm(p => ({ ...p, adg: e.target.value }))} placeholder={form.animalId ? String(getADGDefault((animals || []).find(a => a.id === form.animalId)?.species) ?? 3) : "e.g. 3"} />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={form.dailyFeedLbs} onChange={e => setForm(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={form.feedType} onChange={e => setForm(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={form.costPerLb} onChange={e => setForm(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
            <Input label="Pen or Lot Name" value={form.penName} onChange={e => setForm(p => ({ ...p, penName: e.target.value }))} placeholder="e.g. Pen 1, East Lot, Finishing Pen" />
          </div>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={addToProgram}>Add to Program</Btn>
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

      <div className="hl-feedlot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {(feederPrograms || []).map(fp => {
          const animal = (animals || []).find(a => a.id === fp.animalId);
          if (!animal) return null;
          const daysOnFeed = feederDaysOnFeed(fp.startDate);
          const totalFeedConsumed = daysOnFeed * (fp.dailyFeedLbs ?? 0);
          const costToDate = totalFeedConsumed * (fp.costPerLb ?? 0);
          const estWeight = estimatedWeightFromADG(animal, fp.startDate);
          const currentWeight = estWeight ?? (() => { const w = getLatestWeightForAnimal(animals, fp.animalId); return w ? parseFloat(w) : null; })() ?? fp.startingWeight;
          const startWeight = fp.startingWeight ?? 0;
          const targetWeight = fp.targetWeight != null ? fp.targetWeight : (currentWeight != null ? currentWeight + 200 : 0);
          const adg = (fp.adg != null && fp.adg > 0) ? fp.adg : getADGDefault(animal.species);
          const conversion = fp.feedConversionRatio != null ? fp.feedConversionRatio : getFCRDefault(animal.species, fp.feedType || "Corn");
          const lbsToGo = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : 0;
          const estimatedDaysToFinish = (lbsToGo > 0 && adg > 0) ? Math.max(0, Math.ceil(lbsToGo / adg)) : null;
          const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
          const daysRemaining = estimatedDaysToFinish != null ? Math.max(0, estimatedDaysToFinish - daysOnFeed) : 0;
          const progressPct = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? Math.min(100, (daysOnFeed / estimatedDaysToFinish) * 100) : 0;
          const additionalExp = fp.additionalExpenses ?? 0;
          const purchasePrice = animal.acquisitionType === "Purchased" && animal.purchasePrice != null ? Number(animal.purchasePrice) : 0;
          const marketPricePerLb = fp.marketPricePerLb ?? 0;
          const lbsGainSoFar = currentWeight != null && startWeight > 0 ? Math.max(0, currentWeight - startWeight) : 0;
          const lbsGainRemaining = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : null;
          const totalFeedForGain = lbsGainSoFar * conversion;
          const totalFeedCostCalc = totalFeedForGain * (fp.costPerLb ?? 0);
          const totalAllIn = totalFeedCostCalc + additionalExp + purchasePrice;
          const costOfGainPerLb = lbsGainSoFar > 0 ? totalAllIn / lbsGainSoFar : 0;
          const breakevenPerLb = currentWeight > 0 ? totalAllIn / currentWeight : 0;
          const projectedRevenue = (marketPricePerLb && currentWeight) ? marketPricePerLb * currentWeight : 0;
          const projectedNet = projectedRevenue - totalAllIn;
          const profitPerDayRemaining = daysRemaining > 0 ? projectedNet / daysRemaining : 0;
          const calcColor = profitColor(projectedNet, totalAllIn);
          return (
            <Card key={fp.id} style={{ padding: "18px 20px", borderLeft: "4px solid var(--brass)", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{getAnimalName(animal)}</div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>{animal.tag ? `#${animal.tag}` : animal.species}</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => removeFromProgram(fp.id)} style={{ padding: "4px 8px", minWidth: 0 }} title="Remove from program">×</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", marginBottom: "12px" }}>
                <span style={{ color: "var(--muted)" }}>Days on feed</span>
                <span style={{ fontWeight: 600 }}>{daysOnFeed}</span>
                <span style={{ color: "var(--muted)" }}>Est. weight</span>
                <span style={{ fontWeight: 600 }}>{estWeight != null ? `${Math.round(estWeight)} lb` : (fp.startingWeight != null ? `${fp.startingWeight} lb (start)` : "—")}</span>
                <span style={{ color: "var(--muted)" }}>Feed consumed</span>
                <span style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 1 })} lb</span>
                <span style={{ color: "var(--muted)" }}>Feed cost to date</span>
                <span style={{ fontWeight: 600 }}>${costToDate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              {estimatedDaysToFinish != null && (
                <div style={{ marginBottom: "12px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink2)", marginBottom: "4px" }}>Estimated days to finish</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>{estimatedDaysToFinish} days</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>Estimated finish date · {estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</div>
                </div>
              )}
              {estimatedDaysToFinish != null && estimatedDaysToFinish > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Progress · {daysOnFeed} of ~{estimatedDaysToFinish} days</div>
                  <div style={{ height: "6px", background: "var(--cream2)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--brass)", borderRadius: "3px", transition: "width 0.2s" }} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--cream2)" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Profitability Calculator</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: "10px" }}>
                  <Input label="Target weight (lb)" type="number" min="0" step="0.1" value={fp.targetWeight != null ? String(fp.targetWeight) : ""} onChange={e => updateFeederCalculator(fp.id, { targetWeight: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder={targetWeight ? String(targetWeight) : "e.g. 1400"} style={{ fontSize: "12px" }} />
                  <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={fp.adg != null ? String(fp.adg) : ""} onChange={e => updateFeederCalculator(fp.id, { adg: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder={String(getADGDefault(animal.species))} style={{ fontSize: "12px" }} />
                  <Input label="Feed conversion" type="number" min="0.1" step="0.1" value={fp.feedConversionRatio != null ? String(fp.feedConversionRatio) : String(getFCRDefault(animal.species, fp.feedType || "Corn"))} onChange={e => updateFeederCalculator(fp.id, { feedConversionRatio: e.target.value.trim() ? parseFloat(e.target.value) : getFCRDefault(animal.species, fp.feedType || "Corn") })} style={{ fontSize: "12px" }} />
                  <Input label="Add'l expenses ($)" type="number" min="0" step="0.01" value={fp.additionalExpenses != null ? String(fp.additionalExpenses) : ""} onChange={e => updateFeederCalculator(fp.id, { additionalExpenses: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder="0" style={{ fontSize: "12px" }} />
                  <Input label="Market $/lb" type="number" min="0" step="0.01" value={fp.marketPricePerLb != null ? String(fp.marketPricePerLb) : ""} onChange={e => updateFeederCalculator(fp.id, { marketPricePerLb: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder="e.g. 1.85" style={{ fontSize: "12px", gridColumn: "1 / -1" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12px", marginBottom: "8px" }}>
                  <span style={{ color: "var(--muted)" }}>Lbs gain so far</span>
                  <span style={{ fontWeight: 600 }}>{lbsGainSoFar.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
                  {lbsGainRemaining != null && (
                    <>
                      <span style={{ color: "var(--muted)" }}>Lbs gain remaining</span>
                      <span style={{ fontWeight: 600 }}>{lbsGainRemaining.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  <span style={{ color: "var(--muted)" }}>Total feed (gain)</span>
                  <span style={{ fontWeight: 600 }}>{totalFeedForGain.toLocaleString("en-US", { maximumFractionDigits: 0 })} lb</span>
                  <span style={{ color: "var(--muted)" }}>Total feed cost</span>
                  <span style={{ fontWeight: 600 }}>${totalFeedCostCalc.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Total all-in cost</span>
                  <span style={{ fontWeight: 600 }}>${totalAllIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Cost of gain/lb</span>
                  <span style={{ fontWeight: 600 }}>${costOfGainPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Breakeven $/lb</span>
                  <span style={{ fontWeight: 600 }}>${breakevenPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Projected revenue</span>
                  <span style={{ fontWeight: 600 }}>${projectedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Projected net</span>
                  <span style={{ fontWeight: 600, color: calcColor }}>${projectedNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Profit/day remain.</span>
                  <span style={{ fontWeight: 600, color: calcColor }}>${profitPerDayRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <Btn size="sm" variant="secondary" onClick={() => { setTab("animals"); setViewingAnimal(animal); }} style={{ width: "100%", marginTop: "12px" }}>Record Weight</Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
