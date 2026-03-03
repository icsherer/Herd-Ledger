import { useState } from "react";
import { fmt, getAnimalName } from "../lib/helpers.js";
import { SPECIES } from "../lib/constants.js";
import { Card, Btn, Input, Select, SectionTitle, Textarea } from "./ui.jsx";

export default function Sales({ animals, loadSales, setLoadSales, expenses }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showLoadForm, setShowLoadForm] = useState(false);
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
  const individualSalesYTD = soldAnimals
    .filter(a => a.sale?.dateSold && a.sale.dateSold.startsWith(String(year)))
    .reduce((sum, a) => sum + (Number(a.sale?.pricePerHead) || 0), 0);
  const loadSalesYTD = (loadSales || [])
    .filter(l => l.date && l.date.startsWith(String(year)))
    .reduce((sum, l) => sum + (Number(l.totalAmount) || 0), 0);
  const totalCombinedYTD = individualSalesYTD + loadSalesYTD;

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

  const loadsInYear = (loadSales || []).filter(l => l.date && l.date.startsWith(String(year)));

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={exportScheduleF}>Export Schedule F CSV</Btn>}>
        Sales
      </SectionTitle>

      {/* Annual Summary */}
      <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "14px" }}>Annual Summary</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", color: "var(--ink2)" }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px", background: "#fff" }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Individual sales</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${individualSalesYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Load sales</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${loadSalesYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Total income ({year})</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${totalCombinedYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </Card>

      {/* Individual Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Individual Sales</div>
        {soldAnimals.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No sold animals recorded yet.</div>
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
                </tr>
              </thead>
              <tbody>
                {soldAnimals.map(a => {
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
        {loadsInYear.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No load sales recorded yet. Use the button above to log a sale barn load.</div>
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
                {[...(loadSales || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(l => (
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
    </div>
  );
}
