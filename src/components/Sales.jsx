import { useState } from "react";
import { fmt, getAnimalName, formatCompactDollar } from "../lib/helpers.js";
import { SPECIES } from "../lib/constants.js";
import { sanitizeDate, todayLocalISODate } from "../lib/dateUtils.js";
import { Card, Btn, Input, Select, SectionTitle, Textarea } from "./ui.jsx";
import DateInputWithValidation from "./DateInputWithValidation.jsx";
import BillOfSaleModal from "./BillOfSaleModal.jsx";

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

export default function Sales({ animals, setAnimals, loadSales, setLoadSales, expenses, settings, contacts, supabase, userId, isProUser, setShowUpgradeModal }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [plYear, setPlYear] = useState(currentYear);
  const [showLoadForm, setShowLoadForm] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterSpecies, setFilterSpecies] = useState("");
  const [filterMonthYear, setFilterMonthYear] = useState("");
  const [editingSaleAnimalId, setEditingSaleAnimalId] = useState(null);
  const [expandedSaleId, setExpandedSaleId] = useState(null);
  const [saleEditForm, setSaleEditForm] = useState(emptySaleEditForm);
  const [showFlatSaleModal, setShowFlatSaleModal] = useState(false);
  const [flatSaleForm, setFlatSaleForm] = useState({
    date: todayLocalISODate(),
    species: "Cattle",
    headCount: "",
    totalAmount: "",
    buyerName: "",
    notes: "",
  });
  const [loadForm, setLoadForm] = useState({
    date: todayLocalISODate(),
    headCount: "",
    species: "Cattle",
    averageWeight: "",
    priceType: "perHead",
    priceValue: "",
    totalAmount: "",
    buyerName: "",
    notes: "",
  });

  const [bosModal, setBosModal] = useState(null); // { sale, saleType }

  const soldAnimals = (animals || []).filter(a => a.sale).sort((x, y) => (y.sale?.dateSold || "").localeCompare(x.sale?.dateSold || ""));
  const loadSalesSorted = [...(loadSales || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const speciesWithSales = Array.from(new Set([
    ...soldAnimals.map(a => a.species).filter(Boolean),
    ...(loadSales || []).map(l => l.species).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

  const filterStartSan = sanitizeDate(filterStartDate);
  const filterEndSan = sanitizeDate(filterEndDate);
  const inDateRange = (dateStr) => {
    if (!dateStr) return false;
    if (filterStartSan && dateStr < filterStartSan) return false;
    if (filterEndSan && dateStr > filterEndSan) return false;
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
    setFilterStartDate(sanitizeDate(first.toISOString().split("T")[0]) || first.toISOString().split("T")[0]);
    setFilterEndDate(sanitizeDate(last.toISOString().split("T")[0]) || last.toISOString().split("T")[0]);
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
    .filter(a => !a.excludeFromReports && a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchasePrice > 0 && a.purchaseDate && a.purchaseDate.startsWith(String(year)))
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
      date: sanitizeDate(loadForm.date) || undefined,
      headCount: headCount >= 1 ? headCount : undefined,
      species: loadForm.species || undefined,
      averageWeight: avgWt ?? undefined,
      priceType: loadForm.priceType,
      priceValue: priceVal ?? undefined,
      totalAmount: total ?? undefined,
      buyerName: loadForm.buyerName?.trim() || undefined,
      notes: loadForm.notes?.trim() || undefined,
    }]);
    setLoadForm({ date: todayLocalISODate(), headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" });
    setShowLoadForm(false);
  }

  function removeLoadSale(id) {
    setLoadSales(prev => (prev || []).filter(l => l.id !== id));
  }

  function saveFlatSale() {
    const headCount = parseInt(flatSaleForm.headCount, 10);
    if (!flatSaleForm.date || !Number.isFinite(headCount) || headCount < 1) return;
    const total = flatSaleForm.totalAmount.trim() ? parseFloat(flatSaleForm.totalAmount) : null;
    setLoadSales(prev => [...(prev || []), {
      id: Date.now().toString(),
      type: "flat",
      date: sanitizeDate(flatSaleForm.date) || undefined,
      species: flatSaleForm.species || undefined,
      headCount,
      totalAmount: total ?? undefined,
      buyerName: flatSaleForm.buyerName.trim() || undefined,
      notes: flatSaleForm.notes.trim() || undefined,
    }]);
    setFlatSaleForm({ date: todayLocalISODate(), species: "Cattle", headCount: "", totalAmount: "", buyerName: "", notes: "" });
    setShowFlatSaleModal(false);
  }

  function openSaleEdit(animal) {
    const s = animal?.sale;
    setEditingSaleAnimalId(animal.id);
    setSaleEditForm({
      dateSold: sanitizeDate(s?.dateSold ?? "") || (s?.dateSold ?? ""),
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
      dateSold: sanitizeDate(saleEditForm.dateSold) || undefined,
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
      if (a.excludeFromReports) return;
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
    (animals || []).filter(a => !a.excludeFromReports && a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchasePrice > 0).forEach(a => {
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
  const displayGroupLoadSales = displayLoadSales.filter(l => l.type !== "flat");
  const displayFlatSales = displayLoadSales.filter(l => l.type === "flat");

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

  // ── P&L report calculations ────────────────────────────────────────────────
  const plFarmName = settings?.farmName || "My Farm";
  const plOwnerName = settings?.ownerName || "";
  const plGeneratedDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const plStr = String(plYear);

  const plIndividualSalesAmt = (animals || [])
    .filter(a => a.sale?.dateSold?.startsWith(plStr))
    .reduce((s, a) => s + (Number(a.sale?.pricePerHead) || 0), 0);
  const plGroupLoadSalesAmt = (loadSales || [])
    .filter(l => l.date?.startsWith(plStr) && l.type !== "flat")
    .reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const plFlatSalesAmt = (loadSales || [])
    .filter(l => l.date?.startsWith(plStr) && l.type === "flat")
    .reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const plTotalIncome = plIndividualSalesAmt + plGroupLoadSalesAmt + plFlatSalesAmt;

  const plExpenseCategories = ["Feed", "Veterinary", "Medicine", "Equipment", "Supplies", "Labor", "Fuel", "Land/Lease", "Other"];
  const plExpenseRows = plExpenseCategories.map(cat => ({
    cat,
    amt: (expenses || []).filter(e => e.date?.startsWith(plStr) && e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  }));
  const plLivestockPurchasedAmt = (animals || [])
    .filter(a => !a.excludeFromReports && a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchaseDate?.startsWith(plStr))
    .reduce((s, a) => s + (Number(a.purchasePrice) || 0), 0);
  const plTotalExpenses = plExpenseRows.reduce((s, r) => s + r.amt, 0) + plLivestockPurchasedAmt;
  const plNetIncome = plTotalIncome - plTotalExpenses;

  const scheduleFLines = { Feed: "Line 15", Veterinary: "Line 32", Medicine: "Line 32", Equipment: "Line 18", Labor: "Line 22", Fuel: "Line 20", "Land/Lease": "Line 24", Supplies: "—", Other: "—" };
  const $pl = n => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2 });

  function printPLReport() {
    const existing = document.getElementById("hl-pl-print-root");
    if (existing) existing.remove();

    const netColor = plNetIncome >= 0 ? "#1B3A2B" : "#C0392B";
    const incomeRows = [
      { label: "Livestock Sales (Individual)", amt: plIndividualSalesAmt },
      { label: "Load / Group Sales", amt: plGroupLoadSalesAmt },
      { label: "Flat Sales", amt: plFlatSalesAmt },
    ];
    const expenseRowsWithPurchases = [
      ...plExpenseRows,
      { cat: "Livestock Purchased", amt: plLivestockPurchasedAmt },
    ].filter(r => r.amt > 0);
    const scheduleFRef = [
      ...plExpenseRows.filter(r => r.amt > 0).map(r => ({ label: r.cat, line: scheduleFLines[r.cat] || "—" })),
      ...(plLivestockPurchasedAmt > 0 ? [{ label: "Livestock Purchased", line: "Line 10" }] : []),
      { label: "Livestock Sales Income", line: "Part I, Line 1a" },
    ];

    const purchasedDetail = (animals || [])
      .filter(a => !a.excludeFromReports && a.acquisitionType === "Purchased" && a.purchasePrice != null && Number(a.purchasePrice) > 0 && a.purchaseDate?.startsWith(plStr))
      .sort((a, b) => (a.purchaseDate || "").localeCompare(b.purchaseDate || ""));

    const soldDetail = (animals || [])
      .filter(a => !a.excludeFromReports && a.sale?.dateSold?.startsWith(plStr) && (Number(a.sale?.pricePerHead) || 0) > 0)
      .sort((a, b) => (a.sale.dateSold || "").localeCompare(b.sale.dateSold || ""));

    const rowHtml = (label, amt, bold = false, color = "#141A14") =>
      `<tr style="border-bottom:1px solid #EDE6D6;">
        <td style="padding:6px 12px;font-weight:${bold ? 700 : 400};color:${color}">${label}</td>
        <td style="padding:6px 12px;text-align:right;font-weight:${bold ? 700 : 400};color:${color}">${$pl(amt)}</td>
      </tr>`;

    const html = `
      <div id="hl-pl-print-root" style="font-family:Georgia,serif;color:#141A14;background:#fff;max-width:760px;margin:0 auto;padding:0;">
        <!-- Header -->
        <div style="background:#1B3A2B;color:#fff;padding:32px 40px 28px;margin-bottom:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
            <div>
              <div style="font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;letter-spacing:0.5px;line-height:1.1;">Herd Ledger</div>
              <div style="font-size:11px;color:#F0C060;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">Livestock Management</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:13px;color:rgba(255,255,255,0.7);">Generated ${plGeneratedDate}</div>
            </div>
          </div>
          <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.2);">
            <div style="font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:600;color:#F0C060;margin-bottom:6px;">Farm Profit &amp; Loss Statement</div>
            <div style="font-size:15px;color:rgba(255,255,255,0.9);margin-bottom:2px;">
              ${plFarmName}${plOwnerName ? ` &mdash; ${plOwnerName}` : ""}
            </div>
            <div style="font-size:13px;color:rgba(255,255,255,0.6);">Tax Year ${plStr}</div>
          </div>
        </div>

        <!-- Body -->
        <div style="padding:20px 40px;">

          <!-- Income -->
          <div style="margin-bottom:18px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1B3A2B;border-bottom:2px solid #1B3A2B;padding-bottom:6px;margin-bottom:0;">Income</div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tbody>
                ${incomeRows.map(r => rowHtml(r.label, r.amt)).join("")}
                ${rowHtml("Total Income", plTotalIncome, true, "#1B3A2B")}
              </tbody>
            </table>
          </div>

          <!-- Expenses -->
          <div style="margin-bottom:18px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1B3A2B;border-bottom:2px solid #1B3A2B;padding-bottom:6px;margin-bottom:0;">Expenses</div>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tbody>
                ${expenseRowsWithPurchases.map(r => rowHtml(r.cat, r.amt)).join("")}
                ${rowHtml("Total Expenses", plTotalExpenses, true, "#C0392B")}
              </tbody>
            </table>
          </div>

          <!-- Net Farm Income -->
          <div style="background:#F7F2E8;border:2px solid ${netColor};border-radius:6px;padding:20px 24px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#6B7B6B;margin-bottom:4px;">Net Farm Income</div>
              <div style="font-size:13px;color:#6B7B6B;">Total Income &minus; Total Expenses</div>
            </div>
            <div style="font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:700;color:${netColor};">
              ${plNetIncome < 0 ? "(" : ""}${$pl(plNetIncome)}${plNetIncome < 0 ? ")" : ""}
            </div>
          </div>

          <!-- Schedule F Reference -->
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1B3A2B;border-bottom:2px solid #C9952A;padding-bottom:6px;margin-bottom:0;">Schedule F Reference</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#F7F2E8;">
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Line Item</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Schedule F Line</th>
                </tr>
              </thead>
              <tbody>
                ${scheduleFRef.map(r => `<tr style="border-bottom:1px solid #EDE6D6;"><td style="padding:6px 12px;">${r.label}</td><td style="padding:6px 12px;color:#C9952A;font-weight:600;">${r.line}</td></tr>`).join("")}
              </tbody>
            </table>
            <div style="margin-top:8px;padding:8px 16px;background:#FFF8EC;border-left:3px solid #C9952A;font-size:12px;color:#6B7B6B;line-height:1.6;">
              <strong>Disclaimer:</strong> Consult your tax professional. This report is for reference only and does not constitute tax advice. Line numbers reference IRS Schedule F (Form 1040) and are subject to change.
            </div>
          </div>

          ${purchasedDetail.length > 0 ? `
          <!-- Livestock Purchased Detail -->
          <div style="margin-top:28px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1B3A2B;border-bottom:2px solid #1B3A2B;padding-bottom:6px;margin-bottom:0;">Livestock Purchased Detail</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#F7F2E8;">
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Animal Name</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Species</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Purchase Date</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Purchased From</th>
                  <th style="text-align:right;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${purchasedDetail.map(a => {
                  const name = [a.name, a.tag ? `#${a.tag}` : ""].filter(Boolean).join(" ");
                  return `<tr style="border-bottom:1px solid #EDE6D6;">
                    <td style="padding:6px 12px;">${name || "—"}</td>
                    <td style="padding:6px 12px;color:#6B7B6B;">${a.species || "—"}</td>
                    <td style="padding:6px 12px;">${a.purchaseDate ? fmt(a.purchaseDate) : "—"}</td>
                    <td style="padding:6px 12px;">${a.purchasedFrom || "—"}</td>
                    <td style="padding:6px 12px;text-align:right;">${$pl(Number(a.purchasePrice))}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          ` : ""}

          ${soldDetail.length > 0 ? `
          <!-- Livestock Sales Detail -->
          <div style="margin-top:28px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1B3A2B;border-bottom:2px solid #1B3A2B;padding-bottom:6px;margin-bottom:0;">Livestock Sales Detail</div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#F7F2E8;">
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Animal Name</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Species</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Date Sold</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Buyer</th>
                  <th style="text-align:right;padding:8px 12px;font-weight:600;color:#6B7B6B;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${soldDetail.map(a => {
                  const name = [a.name, a.tag ? `#${a.tag}` : ""].filter(Boolean).join(" ");
                  return `<tr style="border-bottom:1px solid #EDE6D6;">
                    <td style="padding:6px 12px;">${name || "—"}</td>
                    <td style="padding:6px 12px;color:#6B7B6B;">${a.species || "—"}</td>
                    <td style="padding:6px 12px;">${a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</td>
                    <td style="padding:6px 12px;">${a.sale?.buyerName || "—"}</td>
                    <td style="padding:6px 12px;text-align:right;">${$pl(Number(a.sale?.pricePerHead) || 0)}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          ` : ""}

        </div>
      </div>
    `;

    const wrapper = document.createElement("div");
    wrapper.id = "hl-pl-print-root";
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    window.print();

    setTimeout(() => {
      const el = document.getElementById("hl-pl-print-root");
      if (el) el.remove();
    }, 1000);
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <Btn variant="secondary" onClick={() => setShowFlatSaleModal(true)}>+ Flat Sale</Btn>
          <Btn onClick={exportScheduleF}>Export Schedule F CSV</Btn>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <select
              value={plYear}
              onChange={e => setPlYear(Number(e.target.value))}
              style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: "1.5px solid var(--cream3)", fontSize: "13px", background: "#fff", height: "36px" }}
              aria-label="P&L report year"
            >
              {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <Btn onClick={printPLReport}>Download P&amp;L Report</Btn>
          </div>
        </div>
      }>
        Sales
      </SectionTitle>

      {showFlatSaleModal && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowFlatSaleModal(false)}>
          <Card style={{ maxWidth: "480px", width: "100%", margin: "20px", padding: "24px", borderLeft: "4px solid var(--brass)" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>Record Flat Sale</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <DateInputWithValidation label="Date *" value={flatSaleForm.date} onValueChange={v => setFlatSaleForm(p => ({ ...p, date: v }))} />
              <Select label="Species" value={flatSaleForm.species} onChange={e => setFlatSaleForm(p => ({ ...p, species: e.target.value }))}>
                {Object.keys(SPECIES).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Input label="Head count *" type="number" min="1" value={flatSaleForm.headCount} onChange={e => setFlatSaleForm(p => ({ ...p, headCount: e.target.value }))} placeholder="e.g. 25" />
              <Input label="Total amount ($)" type="number" min="0" step="0.01" value={flatSaleForm.totalAmount} onChange={e => setFlatSaleForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="e.g. 36250.00" />
              <Input label="Buyer name" value={flatSaleForm.buyerName} onChange={e => setFlatSaleForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Livestock" />
              <Textarea label="Notes" value={flatSaleForm.notes} onChange={e => setFlatSaleForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" rows={2} />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <Btn onClick={saveFlatSale} disabled={!flatSaleForm.date || !flatSaleForm.headCount || parseInt(flatSaleForm.headCount, 10) < 1}>Save</Btn>
              <Btn variant="secondary" onClick={() => setShowFlatSaleModal(false)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Filter bar */}
      <Card style={{ padding: "16px 20px", marginBottom: "12px", borderLeft: "4px solid var(--green3)" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" }}>Filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px" }}>
          <DateInputWithValidation label="Start date" value={filterStartDate} onValueChange={setFilterStartDate} style={{ width: "140px" }} />
          <DateInputWithValidation label="End date" value={filterEndDate} onValueChange={setFilterEndDate} style={{ width: "140px" }} />
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
                <DateInputWithValidation label="Sale date" value={saleEditForm.dateSold} onValueChange={v => setSaleEditForm(p => ({ ...p, dateSold: v }))} />
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
          <>
            {/* ── Desktop table (hidden on mobile via CSS) ── */}
            <div className="hl-sales-desktop-table">
              <table className="hl-sales-individual-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                <thead>
                  <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                    <th className="hl-sales-col-name" style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Name / Tag</th>
                    <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                    <th className="hl-sales-col-date" style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Sale date</th>
                    <th className="hl-sales-col-price" style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Sale price</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySoldAnimals.map(a => {
                    const salePrice = Number(a.sale?.pricePerHead) || 0;
                    const isExpanded = expandedSaleId === a.id;
                    const rowBg = isExpanded ? "rgba(201,149,42,0.06)" : "transparent";
                    return (
                      <>
                        <tr
                          key={a.id}
                          onClick={() => setExpandedSaleId(isExpanded ? null : a.id)}
                          style={{
                            borderBottom: isExpanded ? "none" : "1px solid var(--cream2)",
                            background: rowBg,
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          <td className="hl-sales-col-name" style={{ padding: "11px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: rowBg }}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</td>
                          <td style={{ padding: "11px 12px", color: "var(--muted)", background: rowBg }}>{a.species || "—"}</td>
                          <td className="hl-sales-col-date" style={{ padding: "11px 12px", whiteSpace: "nowrap", background: rowBg }}>{a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</td>
                          <td className="hl-sales-col-price" style={{ padding: "11px 12px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", background: rowBg }}>
                            ${salePrice.toLocaleString("en-US", { minimumFractionDigits: salePrice % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}{" "}
                            <span style={{ color: "var(--muted)", fontSize: "11px", fontWeight: 400 }}>{isExpanded ? "▲" : "▼"}</span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${a.id}-detail`} style={{ borderBottom: "1px solid var(--cream2)", background: "rgba(201,149,42,0.06)" }}>
                            <td colSpan={4} style={{ padding: "0 12px 14px" }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "13px", color: "var(--ink2)", marginBottom: setAnimals ? "12px" : "0" }}>
                                <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Buyer: </span>{a.sale?.buyerName || "—"}{a.sale?.buyerContact ? ` · ${a.sale.buyerContact}` : ""}</div>
                                <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Location: </span>{a.sale?.saleLocation || "—"}</div>
                                {a.sale?.notes && <div style={{ width: "100%" }}><span style={{ color: "var(--muted)", fontWeight: 600 }}>Notes: </span>{a.sale.notes}</div>}
                              </div>
                              {setAnimals && (
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); openSaleEdit(a); setExpandedSaleId(null); }}>Edit</Btn>
                                  <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); setBosModal({ sale: a, saleType: "individual" }); }}>Bill of Sale</Btn>
                                  <Btn size="sm" variant="danger" onClick={e => { e.stopPropagation(); deleteSaleRecord(a.id); }}>Delete</Btn>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile card rows (hidden on desktop via CSS) ── */}
            <div className="hl-sales-mobile-rows">
              {displaySoldAnimals.map(a => {
                const salePrice = Number(a.sale?.pricePerHead) || 0;
                const isExpanded = expandedSaleId === a.id;
                return (
                  <div key={a.id}>
                    <div
                      className="hl-sales-mobile-row"
                      onClick={() => setExpandedSaleId(isExpanded ? null : a.id)}
                      style={{ background: isExpanded ? "rgba(201,149,42,0.06)" : "transparent", borderBottom: isExpanded ? "none" : "1px solid var(--cream2)" }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="hl-sales-mobile-row-name">{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</div>
                        <div className="hl-sales-mobile-row-date">{a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</div>
                      </div>
                      <div className="hl-sales-mobile-row-price">
                        ${salePrice.toLocaleString("en-US", { minimumFractionDigits: salePrice % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}{" "}
                        <span style={{ color: "var(--muted)", fontSize: "11px", fontWeight: 400 }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="hl-sales-mobile-row-detail">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "13px", color: "var(--ink2)", marginBottom: setAnimals ? "12px" : "4px", paddingTop: "10px" }}>
                          <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Buyer: </span>{a.sale?.buyerName || "—"}{a.sale?.buyerContact ? ` · ${a.sale.buyerContact}` : ""}</div>
                          <div><span style={{ color: "var(--muted)", fontWeight: 600 }}>Location: </span>{a.sale?.saleLocation || "—"}</div>
                          {a.sale?.notes && <div style={{ width: "100%" }}><span style={{ color: "var(--muted)", fontWeight: 600 }}>Notes: </span>{a.sale.notes}</div>}
                        </div>
                        {setAnimals && (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); openSaleEdit(a); setExpandedSaleId(null); }}>Edit</Btn>
                            <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); setBosModal({ sale: a, saleType: "individual" }); }}>Bill of Sale</Btn>
                            <Btn size="sm" variant="danger" onClick={e => { e.stopPropagation(); deleteSaleRecord(a.id); }}>Delete</Btn>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
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
              <DateInputWithValidation label="Date" value={loadForm.date} onValueChange={v => setLoadForm(p => ({ ...p, date: v }))} />
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
              <Btn size="sm" variant="ghost" onClick={() => { setShowLoadForm(false); setLoadForm({ date: todayLocalISODate(), headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" }); }}>Cancel</Btn>
            </div>
          </div>
        )}
        {displayGroupLoadSales.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>{filterActive ? "No load sales match the current filters." : "No load sales recorded yet. Use the button above to log a sale barn load."}</div>
        ) : (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th className="hl-hide-mobile" style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Date</th>
                  <th style={{ width: "14%", textAlign: "left", padding: "10px 8px", fontWeight: 600 }}>Head</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600 }}>Species</th>
                  <th style={{ width: "22%", textAlign: "right", padding: "10px 8px", fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ width: "90px", padding: "10px 4px" }} />
                </tr>
              </thead>
              <tbody>
                {[...displayGroupLoadSales].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                    <td className="hl-hide-mobile" style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{l.date ? fmt(l.date) : "—"}</td>
                    <td style={{ padding: "10px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.headCount ?? "—"}</td>
                    <td style={{ padding: "10px 8px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.species || "—"}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>${(Number(l.totalAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "10px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.buyerName || "—"}</td>
                    <td style={{ padding: "4px 4px", whiteSpace: "nowrap", textAlign: "right" }}>
                      <button type="button" onClick={e => { e.stopPropagation(); setBosModal({ sale: l, saleType: "load" }); }} style={{ background: "transparent", border: "1.5px solid var(--green)", color: "var(--green)", borderRadius: "var(--radius)", padding: "6px 10px", fontSize: "12px", fontWeight: 600, minHeight: "36px", cursor: "pointer", touchAction: "manipulation", marginRight: "4px" }}>BOS</button>
                      <button type="button" onClick={() => removeLoadSale(l.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: "36px", minWidth: "28px", padding: "0", touchAction: "manipulation" }} aria-label="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Flat Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Flat Sales</div>
        {displayFlatSales.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>{filterActive ? "No flat sales match the current filters." : "No flat sales recorded yet. Use the \u201c+ Flat Sale\u201d button to record one."}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Head</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ width: "40px" }} />
                </tr>
              </thead>
              <tbody>
                {[...displayFlatSales].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                    <td style={{ padding: "10px 12px" }}>{l.date ? fmt(l.date) : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{l.species || "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{l.headCount ?? "—"}</td>
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

      {/* Bill of Sale Modal */}
      {bosModal && (
        <BillOfSaleModal
          isOpen={!!bosModal}
          onClose={() => setBosModal(null)}
          sale={bosModal.sale}
          saleType={bosModal.saleType}
          animals={animals || []}
          contacts={contacts || []}
          settings={settings}
          supabase={supabase}
          userId={userId}
        />
      )}

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
