import { useState } from "react";
import { EXPENSE_CATEGORIES } from "../lib/constants.js";
import { fmt, getAnimalName, getCanonicalPastureNames, formatCompactDollar } from "../lib/helpers.js";
import { sanitizeDate, todayLocalISODate } from "../lib/dateUtils.js";
import { Card, Btn, Input, Select, SectionTitle, Textarea, Badge } from "./ui.jsx";
import DateInputWithValidation from "./DateInputWithValidation.jsx";

const emptyForm = () => ({
  date: todayLocalISODate(),
  category: "Feed",
  amount: "",
  description: "",
  vendorPayee: "",
  notes: "",
  animalId: "",
  pastureName: "",
});

export default function Expenses({ expenses, setExpenses, animals, pastures, setTab, setViewingAnimal }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => emptyForm());

  const sortedExpenses = [...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T12:00:00");
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };
  const expensesThisMonth = (expenses || []).filter(e => isCurrentMonth(e.date));
  const byCategoryThisMonth = EXPENSE_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = expensesThisMonth.filter(e => e.category === cat).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return acc;
  }, {});

  function addExpense() {
    const amount = form.amount?.trim() ? parseFloat(form.amount) : 0;
    const dateSan = sanitizeDate(form.date);
    if (!dateSan || amount < 0) return;
    setExpenses(prev => [...prev, {
      id: Date.now().toString(),
      date: dateSan,
      category: form.category || "Other",
      amount,
      description: (form.description || "").trim() || undefined,
      vendorPayee: (form.vendorPayee || "").trim() || undefined,
      notes: (form.notes || "").trim() || undefined,
      animalId: (form.animalId || "").trim() || undefined,
      pastureName: (form.pastureName || "").trim() || undefined,
    }]);
    setForm(emptyForm());
    setEditingId(null);
    setShowAdd(false);
  }

  function updateExpense() {
    const amount = form.amount?.trim() ? parseFloat(form.amount) : 0;
    const dateSan = sanitizeDate(form.date);
    if (!editingId || !dateSan || amount < 0) return;
    setExpenses(prev => prev.map(e => e.id !== editingId ? e : {
      ...e,
      date: dateSan,
      category: form.category || "Other",
      amount,
      description: (form.description || "").trim() || undefined,
      vendorPayee: (form.vendorPayee || "").trim() || undefined,
      notes: (form.notes || "").trim() || undefined,
      animalId: (form.animalId || "").trim() || undefined,
      pastureName: (form.pastureName || "").trim() || undefined,
    }));
    setForm(emptyForm());
    setEditingId(null);
    setShowAdd(false);
  }

  function startEdit(expense) {
    setEditingId(expense.id);
    setForm({
      date: sanitizeDate(expense.date || "") || todayLocalISODate(),
      category: expense.category || "Feed",
      amount: expense.amount != null ? String(expense.amount) : "",
      description: expense.description ?? "",
      vendorPayee: expense.vendorPayee ?? "",
      notes: expense.notes ?? "",
      animalId: expense.animalId ?? "",
      pastureName: expense.pastureName ?? "",
    });
    setShowAdd(true);
  }

  function cancelForm() {
    setShowAdd(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function deleteExpense(id) {
    if (!confirm("Delete this expense?")) return;
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  const pastureNames = getCanonicalPastureNames(animals, pastures);

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => { setEditingId(null); setForm(emptyForm()); setShowAdd(true); }}>+ Add Expense</Btn>}>
        Expenses
      </SectionTitle>

      {/* Summary by category for current month/year */}
      <Card style={{ padding: "18px 20px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
          This month ({now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}) by category
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px 20px", fontSize: "13px" }}>
          {EXPENSE_CATEGORIES.map(cat => {
            const tot = byCategoryThisMonth[cat] || 0;
            if (tot === 0) return null;
            return (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ color: "var(--ink2)" }}>{cat}</span>
                <span className="hl-summary-dollar" style={{ fontWeight: 600 }}>{formatCompactDollar(tot)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cream2)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "15px" }}>
          <span>Total this month</span>
          <span className="hl-summary-dollar">{formatCompactDollar(expensesThisMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0))}</span>
        </div>
      </Card>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>{editingId ? "Edit Expense" : "Add Expense"}</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <DateInputWithValidation label="Date *" value={form.date} onValueChange={v => setForm(p => ({ ...p, date: v }))} />
            <Select label="Category *" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Amount ($) *" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            <Input label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Hay delivery" />
            <Input label="Vendor / Payee" value={form.vendorPayee} onChange={e => setForm(p => ({ ...p, vendorPayee: e.target.value }))} placeholder="e.g. Smith Feed Co." />
            <Select label="Link to animal (optional)" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— None —</option>
              {(animals || []).map(a => <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>)}
            </Select>
            <Select label="Link to pasture (optional)" value={form.pastureName} onChange={e => setForm(p => ({ ...p, pastureName: e.target.value }))}>
              <option value="">— None —</option>
              {pastureNames.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} placeholder="Optional" />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={editingId ? updateExpense : addExpense}>{editingId ? "Save Changes" : "Save Expense"}</Btn>
            <Btn variant="secondary" onClick={cancelForm}>Cancel</Btn>
          </div>
        </Card>
      )}

      {sortedExpenses.length === 0 && !showAdd ? (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>💰</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No expenses logged yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Track feed, vet, supplies, and more to see spending by category.</p>
        </Card>
      ) : (
        <Card style={{ padding: "0", overflow: "hidden" }} className="hl-card-no-padding">
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>All expenses (newest first) · Running total</div>
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {sortedExpenses.map((e, i) => {
              const amt = Number(e.amount) || 0;
              const runningTotal = sortedExpenses.slice(0, i + 1).reduce((s, x) => s + (Number(x.amount) || 0), 0);
              const animal = e.animalId ? (animals || []).find(a => a.id === e.animalId) : null;
              const baseDesc = e.description || e.category || "—";
              const animalName = animal ? getAnimalName(animal) : "";
              const descLine = animalName && baseDesc.toLowerCase().indexOf(animalName.toLowerCase()) === -1
                ? `${baseDesc} — ${animalName}`
                : baseDesc;
              const fmtAmt = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
              return (
                <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px", borderBottom: i < sortedExpenses.length - 1 ? "1px solid var(--cream2)" : "none" }}>
                  {/* Left: meta + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{e.date ? fmt(e.date) : "—"}</span>
                      <Badge color="var(--brass2)">{e.category || "Other"}</Badge>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)", wordBreak: "break-word" }}>{descLine}</div>
                  </div>
                  {/* Right: amount + icons */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "5px", flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap", color: "var(--ink)" }}>{fmtAmt(amt)}</span>
                    <span className="hl-expense-total-desktop" style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtAmt(runningTotal)} total</span>
                    <div style={{ display: "flex", gap: "2px", marginTop: "1px" }}>
                      <button type="button" onClick={() => startEdit(e)} title="Edit" style={{ background: "none", border: "none", padding: "5px", cursor: "pointer", color: "var(--muted)", display: "inline-flex", alignItems: "center" }} aria-label="Edit expense">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" onClick={() => deleteExpense(e.id)} title="Delete" style={{ background: "none", border: "none", padding: "5px", cursor: "pointer", color: "var(--muted)", display: "inline-flex", alignItems: "center" }} aria-label="Delete expense">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
