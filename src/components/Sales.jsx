import { useState } from "react";
import { fmt, getAnimalName, formatCompactDollar } from "../lib/helpers.js";
import { SPECIES } from "../lib/constants.js";
import { Card, Btn, Input, Select, SectionTitle, Textarea } from "./ui.jsx";

const emptySaleEditForm = () => ({
  dateSold: "",
  pricePerHead: "",
  buyerName: "",
  buyerContact: "",
  saleType: "",
  weightAtSale: "",
  saleLocation: "",
  notes: "",
});

export default function Sales({ animals, setAnimals, loadSales, setLoadSales, expenses }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showLoadForm, setShowLoadForm] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("");
  const [filterMonthYear, setFilterMonthYear] = useState("");
  const [editingSaleAnimalId, setEditingSaleAnimalId] = useState(null);
  const [saleEditForm, setSaleEditForm] = useState(emptySaleEditForm);
  const [loadForm, setLoadForm] = useState({
    date: new Date().toISOString().split("T")[0],
    headCount: "",
    species: "Cattle",
    averageWeight: "",
    priceType: "perHead",
    priceValue: "",
    totalAmount: "",
    buyerName: "",
    notes: "",
  });

  const soldAnimals = (animals || []).filter(a => a.sale).sort((x, y) => (y.sale?.dateSold || "").localeCompare(x.sale?.dateSold || ""));
  const loadSalesSorted = [...(loadSales || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const speciesWithSales = Array.from(new Set([
    ...soldAnimals.map(a => a.species).filter(Boolean),
    ...(loadSales || []).map(l => l.species).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

  const inDateRange = (dateStr) => {
    if (!dateStr) return false;
    if (filterStartDate && dateStr < filterStartDate) return false;
    if (filterEndDate && dateStr > filterEndDate) return false;
    return true;
  };

  const filteredSoldAnimals = soldAnimals.filter(a => {
    if (!inDateRange(a.sale?.dateSold)) return false;
    if (filterSpecies && a.species !== filterSpecies) return false;
    return true;
  });
  const filteredLoadSales = (loadSales || []).filter(l => {
    if (!inDateRange(l.date)) return false;
    if (filterSpecies && l.species !== filterSpecies) return false;
    return true;
  });

  const filterActive = filterStartDate || filterEndDate || filterSpecies || filterMonthYear;

  const filteredHeadCount = filteredSoldAnimals.length + filteredLoadSales.reduce((s, l) => s + (Number(l.headCount) || 0), 0);
  const filteredRevenue = filteredSoldAnimals.reduce((s, a) => s + (Number(a.sale?.pricePerHead) || 0), 0) + filteredLoadSales.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const filteredNetGain = filteredSoldAnimals.reduce((s, a) => {
    const salePrice = Number(a.sale?.pricePerHead) || 0;
    const purchasePrice = a.acquisitionType === "Purchased" && a.purchasePrice != null ? Number(a.purchasePrice) : 0;
    return s + (salePrice - purchasePrice);
  }, 0) + filteredLoadSales.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);

  function setMonthYear(value) {
    setFilterMonthYear(value);
    if (!value) {
      setFilterStartDate("");
      setFilterEndDate("");
      return;
    }
    const [y, m] = value.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    setFilterStartDate(first.toISOString().split("T")[0]);
    setFilterEndDate(last.toISOString().split("T")[0]);
  }

  function clearFilters() {
    setFilterStartDate("");
    setFilterEndDate("");
    setFilterSpecies("");
    setFilterMonthYear("");
  }

  const individualSalesYTD = soldAnimals
    .filter(a => a.sale?.dateSold && a.sale.dateSold.startsWith(String(year)))
    .reduce((sum, a) => sum + (Number(a.sale?.pricePerHead) || 0), 0);
  const loadSalesYTD = (loadSales || [])
    .filter(l => l.date && l.date.startsWith(String(year)))
    .reduce((sum, l) => sum + (Number(l.totalAmount) || 0), 0);
  const totalSalesRevenueYTD = individualSalesYTD + loadSalesYTD;
  const purchasesYTD = (animals || [])
    .filter(a => a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchasePrice > 0 && a.purchaseDate && a.purchaseDate.startsWith(String(year)))
    .reduce((sum, a) => sum + (Number(a.purchasePrice) || 0), 0);
  const expensesYTD = (expenses || [])
    .filter(e => e.date && e.date.startsWith(String(year)))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfitLossYTD = totalSalesRevenueYTD - purchasesYTD - expensesYTD;

  function saveLoadSale() {
    const headCount = parseInt(loadForm.headCount, 10);
    const avgWt = loadForm.averageWeight?.trim() ? parseFloat(loadForm.averageWeight) : null;
    const priceVal = loadForm.priceValue?.trim() ? parseFloat(loadForm.priceValue) : null;
    let total = loadForm.totalAmount?.trim() ? parseFloat(loadForm.totalAmount) : null;
    if (total == null && priceVal != null && headCount >= 1) {
      if (loadForm.priceType === "perHead") total = headCount * priceVal;
      else if (loadForm.priceType === "perLb" && avgWt != null) total = headCount * avgWt * priceVal;
    }
    setLoadSales(prev => [...(prev || []), {
      id: Date.now().toString(),
      date: loadForm.date || undefined,
      headCount: headCount >= 1 ? headCount : undefined,
      species: loadForm.species || undefined,
      averageWeight: avgWt ?? undefined,
      priceType: loadForm.priceType,
      priceValue: priceVal ?? undefined,
      totalAmount: total ?? undefined,
      buyerName: loadForm.buyerName?.trim() || undefined,
      notes: loadForm.notes?.trim() || undefined,
    }]);
    setLoadForm({ date: new Date().toISOString().split("T")[0], headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" });
    setShowLoadForm(false);
  }

  function removeLoadSale(id) {
    setLoadSales(prev => (prev || []).filter(l => l.id !== id));
  }

  function openSaleEdit(animal) {
    const s = animal?.sale;
    setEditingSaleAnimalId(animal.id);
    setSaleEditForm({
      dateSold: s?.dateSold ?? "",
      pricePerHead: s?.pricePerHead != null ? String(s.pricePerHead) : "",
      buyerName: s?.buyerName ?? "",
      buyerContact: s?.buyerContact ?? "",
      saleType: s?.saleType ?? "",
      weightAtSale: s?.weightAtSale != null ? String(s.weightAtSale) : "",
      saleLocation: s?.saleLocation ?? "",
      notes: s?.notes ?? "",
    });
  }

  function closeSaleEdit() {
    setEditingSaleAnimalId(null);
    setSaleEditForm(emptySaleEditForm());
  }

  function saveSaleEdit() {
    if (!setAnimals || !editingSaleAnimalId) return;
    const priceVal = saleEditForm.pricePerHead?.trim() ? parseFloat(saleEditForm.pricePerHead) : undefined;
    const weightVal = saleEditForm.weightAtSale?.trim() ? parseFloat(saleEditForm.weightAtSale) : undefined;
    const saleRec = {
      dateSold: saleEditForm.dateSold?.trim() || undefined,
      pricePerHead: priceVal,
      buyerName: saleEditForm.buyerName?.trim() || undefined,
      buyerContact: saleEditForm.buyerContact?.trim() || undefined,
      saleType: saleEditForm.saleType?.trim() || undefined,
      weightAtSale: weightVal,
      saleLocation: saleEditForm.saleLocation?.trim() || undefined,
      notes: saleEditForm.notes?.trim() || undefined,
    };
    setAnimals(prev =>
      prev.map(an => (an.id === editingSaleAnimalId ? { ...an, sale: saleRec } : an))
    );
    closeSaleEdit();
  }

  function deleteSaleRecord(animalId) {
    const msg = "Are you sure you want to delete this sale record? The animal will be returned to your active herd.";
    if (!window.confirm(msg)) return;
    if (!setAnimals) return;
    setAnimals(prev =>
      prev.map(an => (an.id === animalId ? { ...an, sale: undefined } : an))
    );
    if (editingSaleAnimalId === animalId) closeSaleEdit();
  }

  function exportAnnualSummaryCSV() {
    const rows = [
      ["Schedule F Tax Summary", ""],
      ["Year", year],
      ["", ""],
      ["Income", ""],
      ["Total livestock sales (individual + load)", totalSalesRevenueYTD.toFixed(2)],
      ["", ""],
      ["Expenses / Cost of goods", ""],
      ["Total livestock purchased", purchasesYTD.toFixed(2)],
      ["Total farm expenses", expensesYTD.toFixed(2)],
      ["", ""],
      ["Net profit (loss)", netProfitLossYTD.toFixed(2)],
    ];
    const csv = rows.map(r => r.map(c => (typeof c === "string" && (c.includes(",") || c.includes('"')) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-f-summary-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportScheduleF() {
    const rows = [];
    soldAnimals.forEach(a => {
      if (!a.sale?.dateSold) return;
      const amt = Number(a.sale?.pricePerHead) || 0;
      if (amt === 0) return;
      rows.push({
        date: a.sale.dateSold,
        description: `Livestock sale — ${getAnimalName(a)}${a.species ? ` ${a.species}` : ""}`,
        category: "Livestock Sales",
        amount: amt,
        animalTag: a.tag || "",
        notes: a.sale?.notes || "",
      });
    });
    (loadSales || []).forEach(l => {
      const amt = Number(l.totalAmount) || 0;
      if (!l.date || amt === 0) return;
      rows.push({
        date: l.date,
        description: `Load sale — ${l.headCount || 0} head ${l.species || ""}${l.buyerName ? ` to ${l.buyerName}` : ""}`,
        category: "Livestock Sales",
        amount: amt,
        animalTag: "",
        notes: l.notes || "",
      });
    });
    (animals || []).filter(a => a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchasePrice > 0).forEach(a => {
      rows.push({
        date: a.purchaseDate || "",
        description: `Purchase — ${getAnimalName(a)}${a.species ? ` ${a.species}` : ""}${a.purchasedFrom ? ` from ${a.purchasedFrom}` : ""}`,
        category: "Livestock Purchased",
        amount: -(Number(a.purchasePrice) || 0),
        animalTag: a.tag || "",
        notes: "",
      });
    });
    (expenses || []).forEach(e => {
      const amt = -(Number(e.amount) || 0);
      if (amt === 0) return;
      let category = "Other Farm Expense";
      const cat = (e.category || "").toLowerCase();
      if (cat.includes("feed")) category = "Feed Expense";
      else if (cat.includes("vet") || cat.includes("medic")) category = "Veterinary";
      rows.push({
        date: e.date || "",
        description: (e.description || e.category || "Expense").slice(0, 200),
        category,
        amount: amt,
        animalTag: e.animalId ? ((animals || []).find(a => a.id === e.animalId)?.tag || "") : "",
        notes: e.notes || "",
      });
    });
    rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const headers = ["Date", "Description", "Category", "Amount", "Animal Tag", "Notes"];
    const csv = [headers.join(","), ...rows.map(r => [
      r.date,
      `"${String(r.description).replace(/"/g, '""')}"`,
      r.category,
      r.amount,
      r.animalTag,
      `"${String(r.notes || "").replace(/"/g, '""')}"`,
    ].join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-f-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const displaySoldAnimals = filterActive ? filteredSoldAnimals : soldAnimals;
  const displayLoadSales = filterActive ? filteredLoadSales : loadSalesSorted;

  const monthYearOptions = (() => {
    const seen = new Set();
    (soldAnimals || []).forEach(a => {
      const d = a.sale?.dateSold;
      if (d && d.length >= 7) {
        const ym = d.slice(0, 7);
        seen.add(ym);
      }
    });
    (loadSales || []).forEach(l => {
      const d = l.date;
      if (d && d.length >= 7) {
        const ym = d.slice(0, 7);
        seen.add(ym);
      }
    });
    return Array.from(seen)
      .sort((a, b) => b.localeCompare(a))
      .map(ym => {
        const [y, m] = ym.split("-").map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
        return { value: ym, label };
      });
  })();
  const hasAnySales = soldAnimals.length > 0 || (loadSales || []).length > 0;

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={exportScheduleF}>Export Schedule F CSV</Btn>}>
        Sales
      </SectionTitle>

      {/* Filter bar */}
      <Card style={{ padding: "16px 20px", marginBottom: "12px", borderLeft: "4px solid var(--green3)" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" }}>Filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px" }}>
          <Input label="Start date" type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} style={{ width: "140px" }} />
          <Input label="End date" type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} style={{ width: "140px" }} />
          <div style={{ minWidth: "140px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Month / Year</label>
            {!hasAnySales ? (
              <div style={{ padding: "9px 12px", borderRadius: "var(--radius)", border: "1.5px solid var(--cream3)", fontSize: "14px", background: "var(--cream)", color: "var(--muted)" }}>No sales recorded yet</div>
            ) : (
              <select value={filterMonthYear} onChange={e => setMonthYear(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius)", border: "1.5px solid var(--cream3)", fontSize: "14px", background: "#fff" }}>
                <option value="">— Select —</option>
                {monthYearOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
          <div style={{ minWidth: "160px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Species</label>
            <select value={filterSpecies} onChange={e => setFilterSpecies(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius)", border: "1.5px solid var(--cream3)", fontSize: "14px", background: "#fff" }}>
              <option value="">All Species</option>
              {speciesWithSales.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <Btn size="sm" variant="secondary" onClick={clearFilters} disabled={!filterActive}>Clear Filters</Btn>
        </div>
        {filterActive && (
          <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--cream2)", display: "flex", flexWrap: "wrap", gap: "20px", fontSize: "14px" }}>
            <span><strong>Filtered total:</strong> <span style={{ color: "var(--ink2)" }}>{filteredHeadCount}</span> head sold</span>
            <span><strong>Revenue:</strong> <span style={{ fontWeight: 600, color: "var(--green)" }}>${filteredRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
            <span><strong>Net gain:</strong> <span style={{ fontWeight: 600, color: filteredNetGain >= 0 ? "var(--green)" : "var(--danger2)" }}>${filteredNetGain.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></span>
          </div>
        )}
      </Card>

      {/* Individual Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Individual Sales</div>
        {editingSaleAnimalId && (() => {
          const animal = (animals || []).find(a => a.id === editingSaleAnimalId);
          return animal ? (
            <div style={{ padding: "20px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Edit sale — {getAnimalName(animal)}{animal.tag ? ` #${animal.tag}` : ""}</div>
              <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                <Input label="Sale date" type="date" value={saleEditForm.dateSold} onChange={e => setSaleEditForm(p => ({ ...p, dateSold: e.target.value }))} />
                <Input label="Sale price ($)" type="number" min="0" step="0.01" value={saleEditForm.pricePerHead} onChange={e => setSaleEditForm(p => ({ ...p, pricePerHead: e.target.value }))} placeholder="e.g. 1250.00" />
                <Input label="Buyer name" value={saleEditForm.buyerName} onChange={e => setSaleEditForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Livestock" />
                <Input label="Buyer contact" value={saleEditForm.buyerContact} onChange={e => setSaleEditForm(p => ({ ...p, buyerContact: e.target.value }))} placeholder="Phone or email" />
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Sale type</label>
                  <select value={saleEditForm.saleType} onChange={e => setSaleEditForm(p => ({ ...p, saleType: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px" }}>
                    <option value="">— Select —</option>
                    <option value="Private">Private</option>
                    <option value="Auction">Auction</option>
                    <option value="Sale barn">Sale barn</option>
                  </select>
                </div>
                <Input label="Weight at sale (lbs)" type="number" min="0" step="0.1" value={saleEditForm.weightAtSale} onChange={e => setSaleEditForm(p => ({ ...p, weightAtSale: e.target.value }))} placeholder="Optional" />
                <Input label="Sale location" value={saleEditForm.saleLocation} onChange={e => setSaleEditForm(p => ({ ...p, saleLocation: e.target.value }))} placeholder="e.g. Sale barn name" style={{ gridColumn: "1 / -1" }} />
              </div>
              <Textarea label="Notes" value={saleEditForm.notes} onChange={e => setSaleEditForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
              <div style={{ display: "flex", gap: "10px" }}>
                <Btn size="sm" onClick={saveSaleEdit}>Save</Btn>
                <Btn size="sm" variant="ghost" onClick={closeSaleEdit}>Cancel</Btn>
              </div>
            </div>
          ) : null;
        })()}
        {displaySoldAnimals.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>{filterActive ? "No sales match the current filters." : "No sold animals recorded yet."}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Name / Tag</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Sale date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Sale price</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Acquisition</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Purchase price</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Net gain</th>
                  <th style={{ width: "120px", padding: "10px 12px", fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displaySoldAnimals.map(a => {
                  const salePrice = Number(a.sale?.pricePerHead) || 0;
                  const purchasePrice = a.acquisitionType === "Purchased" && a.purchasePrice != null ? Number(a.purchasePrice) : 0;
                  const netGain = salePrice - purchasePrice;
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                      <td style={{ padding: "10px 12px" }}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</td>
                      <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{a.species || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sale?.buyerName || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>${salePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "10px 12px" }}>{a.acquisitionType === "Purchased" ? "Purchased" : "Home Raised"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{a.acquisitionType === "Purchased" && a.purchasePrice != null ? `$${Number(a.purchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: netGain >= 0 ? "var(--green)" : "var(--danger2)" }}>{a.acquisitionType === "Purchased" || purchasePrice !== 0 ? `$${netGain.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {setAnimals && (
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <Btn size="sm" variant="secondary" onClick={() => openSaleEdit(a)}>Edit</Btn>
                            <Btn size="sm" variant="danger" onClick={() => deleteSaleRecord(a.id)}>Delete</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Group / Load Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Group / Load Sales</span>
          <Btn size="sm" onClick={() => setShowLoadForm(true)}>+ Log sale barn load</Btn>
        </div>
        {showLoadForm && (
          <div style={{ padding: "20px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Log sale barn load</div>
            <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
              <Input label="Date" type="date" value={loadForm.date} onChange={e => setLoadForm(p => ({ ...p, date: e.target.value }))} />
              <Input label="Number of head" type="number" min="1" value={loadForm.headCount} onChange={e => setLoadForm(p => ({ ...p, headCount: e.target.value }))} placeholder="e.g. 12" />
              <Select label="Species" value={loadForm.species} onChange={e => setLoadForm(p => ({ ...p, species: e.target.value }))}>
                {Object.keys(SPECIES).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Input label="Average weight (lbs)" type="number" min="0" step="0.1" value={loadForm.averageWeight} onChange={e => setLoadForm(p => ({ ...p, averageWeight: e.target.value }))} placeholder="Optional" />
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Pricing</label>
                <select value={loadForm.priceType} onChange={e => setLoadForm(p => ({ ...p, priceType: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px" }}>
                  <option value="perHead">Price per head</option>
                  <option value="perLb">Price per lb</option>
                </select>
              </div>
              <Input label={loadForm.priceType === "perHead" ? "Price per head ($)" : "Price per lb ($)"} type="number" min="0" step="0.01" value={loadForm.priceValue} onChange={e => setLoadForm(p => ({ ...p, priceValue: e.target.value }))} placeholder="e.g. 1.25" />
              <Input label="Total sale amount ($) — optional" type="number" min="0" step="0.01" value={loadForm.totalAmount} onChange={e => setLoadForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="Override calculated total" />
              <Input label="Buyer / sale barn name" value={loadForm.buyerName} onChange={e => setLoadForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Sale Barn" style={{ gridColumn: "1 / -1" }} />
            </div>
            <Textarea label="Notes" value={loadForm.notes} onChange={e => setLoadForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <Btn size="sm" onClick={saveLoadSale} disabled={!loadForm.date || !loadForm.headCount || parseInt(loadForm.headCount, 10) < 1}>Save load sale</Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setShowLoadForm(false); setLoadForm({ date: new Date().toISOString().split("T")[0], headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" }); }}>Cancel</Btn>
            </div>
          </div>
        )}
        {[...displayLoadSales].sort((a, b) => (b.date || "").localeCompare(a.date || "")).length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>{filterActive ? "No load sales match the current filters." : "No load sales recorded yet. Use the button above to log a sale barn load."}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Head</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ width: "40px" }} />
                </tr>
              </thead>
              <tbody>
                {[...displayLoadSales].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                    <td style={{ padding: "10px 12px" }}>{l.date ? fmt(l.date) : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{l.headCount ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{l.species || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>${(Number(l.totalAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "10px 12px" }}>{l.buyerName || "—"}</td>
                    <td style={{ padding: "8px" }}>
                      <button type="button" onClick={() => removeLoadSale(l.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }} aria-label="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Annual Summary — bottom */}
      <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "14px" }}>Annual Summary ({year})</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
          <label style={{ fontSize: "14px", color: "var(--ink2)" }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px", background: "#fff" }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Btn size="sm" variant="secondary" onClick={exportAnnualSummaryCSV}>Export Summary</Btn>
        </div>
        <div className="hl-sales-summary-tiles" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px", marginBottom: "20px" }}>
          {[
            { label: "Total revenue (animal sales)", value: totalSalesRevenueYTD, color: "var(--green)" },
            { label: "Total purchases (animals)", value: purchasesYTD, color: "var(--ink2)" },
            { label: "Total expenses", value: expensesYTD, color: "var(--ink2)" },
          ].map(({ label, value, color }) => (
              <div key={label} className="hl-sales-summary-tile">
                <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "6px", lineHeight: 1.3 }}>{label}</div>
                <div className="hl-sales-summary-value" style={{ fontFamily: "'Playfair Display'", fontWeight: 700, color }}>{formatCompactDollar(value)}</div>
              </div>
            ))}
        </div>
        <div style={{ paddingTop: "16px", borderTop: "1px solid var(--cream2)" }}>
          <div style={{ fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>Net profit (loss) for {year}</div>
          <div className="hl-sales-summary-value hl-sales-summary-net" style={{ fontFamily: "'Playfair Display'", fontWeight: 700, color: netProfitLossYTD >= 0 ? "var(--green)" : "var(--danger2)" }}>
            {formatCompactDollar(netProfitLossYTD)}
          </div>
          <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>Sales − Purchases − Expenses</div>
        </div>
      </Card>
    </div>
  );
}
