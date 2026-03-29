import { useState } from "react";
import { Card, Btn, Input, Select, Textarea } from "./ui.jsx";
import DateInputWithValidation from "./DateInputWithValidation.jsx";
import { sanitizeDate, todayLocalISODate } from "../lib/dateUtils.js";
import { formatCompactDollar } from "../lib/helpers.js";
import { saveHayLot, logHayTransaction, deleteHayLot } from "../lib/db.js";

const BALE_DEFAULTS = { square: 50, round: 1200 };

function emptyDelivery() {
  return {
    type: "Hay", baleType: "square", quantity: "",
    weightPerBale: "50", costPerBale: "", pastureId: "", date: todayLocalISODate(), notes: "",
  };
}

function emptyUsage() {
  return { quantity: "", date: todayLocalISODate(), pastureId: "", notes: "" };
}

const STAT_STYLE = {
  flex: 1,
  background: "var(--cream)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "12px 8px",
  textAlign: "center",
};

export default function HayInventory({ hayLots, setHayLots, hayLogs, setHayLogs, user, pastures }) {
  const [expandedLotId, setExpandedLotId] = useState(null);
  const [editingLotId, setEditingLotId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [usageLotId, setUsageLotId] = useState(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState(emptyDelivery);
  const [usageForm, setUsageForm] = useState(emptyUsage);
  const [showHistory, setShowHistory] = useState(false);
  const [dailyRate, setDailyRate] = useState("5");
  const [saving, setSaving] = useState(false);

  const squareBales = hayLots.reduce((s, l) => l.baleType === "square" ? s + (Number(l.quantity) || 0) : s, 0);
  const roundBales = hayLots.reduce((s, l) => l.baleType === "round" ? s + (Number(l.quantity) || 0) : s, 0);
  const totalBales = squareBales + roundBales;
  const totalTons = hayLots.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.weightPerBale) || 0) / 2000), 0);
  const totalValue = hayLots.reduce((s, l) => s + ((Number(l.quantity) || 0) * (Number(l.costPerBale) || 0)), 0);
  const rate = Number(dailyRate) || 0;
  const daysRemaining = rate > 0 && totalBales > 0 ? Math.floor(totalBales / rate) : null;
  const lowStock = daysRemaining !== null && daysRemaining < 30;

  const pastureOptions = pastures || [];
  const sortedLogs = [...hayLogs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  async function handleSaveDelivery() {
    const qty = Number(deliveryForm.quantity);
    if (!qty || qty <= 0) return;
    setSaving(true);
    const lot = {
      id: crypto.randomUUID(),
      type: deliveryForm.type,
      baleType: deliveryForm.baleType,
      quantity: qty,
      weightPerBale: Number(deliveryForm.weightPerBale) || BALE_DEFAULTS[deliveryForm.baleType] || 50,
      costPerBale: Number(deliveryForm.costPerBale) || 0,
      pastureId: deliveryForm.pastureId || null,
      notes: deliveryForm.notes || null,
    };
    const log = {
      id: crypto.randomUUID(),
      lotId: lot.id,
      action: "delivery",
      quantity: qty,
      date: sanitizeDate(deliveryForm.date) || todayLocalISODate(),
      pastureId: deliveryForm.pastureId || null,
      notes: deliveryForm.notes || null,
    };
    if (user && !user.isGuest) {
      await saveHayLot(user.id, lot);
      await logHayTransaction(user.id, log);
    }
    setHayLots(prev => [lot, ...prev]);
    setHayLogs(prev => [log, ...prev]);
    setDeliveryForm(emptyDelivery());
    setShowDelivery(false);
    setSaving(false);
  }

  async function handleSaveEdit() {
    if (!editForm || !editingLotId) return;
    const qty = Number(editForm.quantity);
    if (isNaN(qty) || qty < 0) return;
    setSaving(true);
    const updatedLot = {
      id: editingLotId,
      type: editForm.type,
      baleType: editForm.baleType,
      quantity: qty,
      weightPerBale: Number(editForm.weightPerBale) || BALE_DEFAULTS[editForm.baleType] || 50,
      costPerBale: Number(editForm.costPerBale) || 0,
      pastureId: editForm.pastureId || null,
      notes: editForm.notes || null,
    };
    if (user && !user.isGuest) {
      await saveHayLot(user.id, updatedLot);
    }
    setHayLots(prev => prev.map(l => l.id === editingLotId ? updatedLot : l));
    setEditingLotId(null);
    setEditForm(null);
    setExpandedLotId(null);
    setSaving(false);
  }

  async function handleLogUsage() {
    const qty = Number(usageForm.quantity);
    if (!qty || qty <= 0) return;
    const lot = hayLots.find(l => l.id === usageLotId);
    if (!lot) return;
    setSaving(true);
    const usedQty = Math.min(qty, lot.quantity);
    const updatedLot = { ...lot, quantity: lot.quantity - usedQty };
    const log = {
      id: crypto.randomUUID(),
      lotId: usageLotId,
      action: "usage",
      quantity: usedQty,
      date: sanitizeDate(usageForm.date) || todayLocalISODate(),
      pastureId: usageForm.pastureId || null,
      notes: usageForm.notes || null,
    };
    if (user && !user.isGuest) {
      await saveHayLot(user.id, updatedLot);
      await logHayTransaction(user.id, log);
    }
    setHayLots(prev => prev.map(l => l.id === usageLotId ? updatedLot : l));
    setHayLogs(prev => [log, ...prev]);
    setUsageForm(emptyUsage());
    setUsageLotId(null);
    setExpandedLotId(null);
    setSaving(false);
  }

  async function handleDeleteLot(lotId) {
    if (!window.confirm("Delete this lot? Transaction history will be preserved.")) return;
    if (user && !user.isGuest) {
      await deleteHayLot(user.id, lotId);
    }
    setHayLots(prev => prev.filter(l => l.id !== lotId));
  }

  function startEdit(lot) {
    setEditingLotId(lot.id);
    setEditForm({
      type: lot.type,
      baleType: lot.baleType,
      quantity: String(lot.quantity),
      weightPerBale: String(lot.weightPerBale),
      costPerBale: String(lot.costPerBale || ""),
      pastureId: lot.pastureId || "",
      notes: lot.notes || "",
    });
    setUsageLotId(null);
    setExpandedLotId(lot.id);
  }

  function startUsage(lotId) {
    setUsageLotId(lotId);
    setUsageForm(emptyUsage());
    setEditingLotId(null);
    setEditForm(null);
    setExpandedLotId(lotId);
  }

  function toggleExpand(id) {
    if (expandedLotId === id) {
      setExpandedLotId(null);
      setEditingLotId(null);
      setEditForm(null);
      setUsageLotId(null);
    } else {
      setExpandedLotId(id);
      setEditingLotId(null);
      setEditForm(null);
      setUsageLotId(null);
    }
  }

  return (
    <div style={{ padding: "16px 16px 120px", maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", color: "var(--green)", fontSize: "1.5rem", margin: "0 0 16px", fontWeight: 700 }}>
        Hay &amp; Forage
      </h2>

      {/* Stats row 1 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={STAT_STYLE}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" }}>{squareBales.toLocaleString()}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Square Bales</div>
        </div>
        <div style={STAT_STYLE}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" }}>{roundBales.toLocaleString()}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Round Bales</div>
        </div>
        <div style={STAT_STYLE}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" }}>
            {totalTons < 10 ? totalTons.toFixed(1) : Math.round(totalTons)}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Tons on Hand</div>
        </div>
      </div>

      {/* Stats row 2 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={STAT_STYLE}>
          {daysRemaining !== null ? (
            <>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: lowStock ? "var(--danger2, #c0392b)" : "var(--ink)" }}>
                {daysRemaining}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Days Remaining</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "1rem", color: "var(--muted)", paddingTop: 4 }}>—</div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Days Remaining</div>
            </>
          )}
        </div>
        <div style={STAT_STYLE}>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--ink)" }}>{formatCompactDollar(totalValue)}</div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>Inventory Value</div>
        </div>
        {lowStock && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "8px 12px", background: "#fdecea",
            border: "1px solid #f5c6cb", borderRadius: "var(--radius)",
          }}>
            <span style={{ fontSize: "0.75rem", color: "#c0392b", fontWeight: 700, textAlign: "center", lineHeight: 1.4 }}>
              ⚠️ Low<br />Stock
            </span>
          </div>
        )}
      </div>

      {/* Log Delivery button */}
      <button
        onClick={() => { setShowDelivery(s => !s); if (showDelivery) setDeliveryForm(emptyDelivery()); }}
        style={{
          width: "100%", padding: "14px", background: "var(--green)", color: "#fff",
          border: "none", borderRadius: "var(--radius)", fontSize: "1rem", fontWeight: 700,
          cursor: "pointer", marginBottom: 12, letterSpacing: "0.03em",
          fontFamily: "inherit",
        }}
      >
        {showDelivery ? "✕ Cancel" : "+ Log Delivery"}
      </button>

      {/* Delivery form */}
      {showDelivery && (
        <Card style={{ marginBottom: 16, background: "#f0f7f1" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "1rem", color: "var(--green)", marginBottom: 14 }}>
            Log Delivery
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Select
                  label="Type"
                  value={deliveryForm.type}
                  onChange={e => setDeliveryForm(f => ({ ...f, type: e.target.value }))}
                >
                  <option value="Hay">Hay</option>
                  <option value="Straw">Straw</option>
                </Select>
              </div>
              <div style={{ flex: 1 }}>
                <Select
                  label="Bale Type"
                  value={deliveryForm.baleType}
                  onChange={e => {
                    const bt = e.target.value;
                    setDeliveryForm(f => ({ ...f, baleType: bt, weightPerBale: String(BALE_DEFAULTS[bt] || 50) }));
                  }}
                >
                  <option value="square">Square</option>
                  <option value="round">Round</option>
                </Select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Input
                  label="Quantity (bales)"
                  type="number"
                  min="1"
                  value={deliveryForm.quantity}
                  onChange={e => setDeliveryForm(f => ({ ...f, quantity: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div style={{ flex: 1 }}>
                <Input
                  label="Weight/bale (lbs)"
                  type="number"
                  min="1"
                  value={deliveryForm.weightPerBale}
                  onChange={e => setDeliveryForm(f => ({ ...f, weightPerBale: e.target.value }))}
                  placeholder={String(BALE_DEFAULTS[deliveryForm.baleType] || 50)}
                />
              </div>
            </div>
            <Input
              label="Cost per bale ($)"
              type="number"
              min="0"
              step="0.01"
              value={deliveryForm.costPerBale}
              onChange={e => setDeliveryForm(f => ({ ...f, costPerBale: e.target.value }))}
              placeholder="0.00"
            />
            <DateInputWithValidation
              label="Delivery Date"
              value={deliveryForm.date}
              onChange={val => setDeliveryForm(f => ({ ...f, date: val }))}
            />
            {pastureOptions.length > 0 && (
              <Select
                label="Assign to Pasture (optional)"
                value={deliveryForm.pastureId}
                onChange={e => setDeliveryForm(f => ({ ...f, pastureId: e.target.value }))}
              >
                <option value="">— None —</option>
                {pastureOptions.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
            <Textarea
              label="Notes (optional)"
              value={deliveryForm.notes}
              onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Supplier, cutting #, quality, etc."
              rows={2}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Btn
              onClick={handleSaveDelivery}
              disabled={saving || !deliveryForm.quantity || Number(deliveryForm.quantity) <= 0}
              style={{ flex: 1 }}
            >
              {saving ? "Saving…" : "Save Delivery"}
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => { setShowDelivery(false); setDeliveryForm(emptyDelivery()); }}
              style={{ flex: 1 }}
            >
              Cancel
            </Btn>
          </div>
        </Card>
      )}

      {/* Lots */}
      {hayLots.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "32px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>🌾</div>
          <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            No hay on record.<br />Tap Log Delivery to add your first lot.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {hayLots.map(lot => {
            const isExpanded = expandedLotId === lot.id;
            const isEditing = editingLotId === lot.id;
            const isUsage = usageLotId === lot.id;
            return (
              <Card key={lot.id} style={{ cursor: "pointer" }}>
                {/* Card header */}
                <div
                  onClick={() => toggleExpand(lot.id)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>{lot.type === "Straw" ? "🌾" : "🌿"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem" }}>
                        {lot.type} · {lot.baleType.charAt(0).toUpperCase() + lot.baleType.slice(1)} Bales
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                        <span style={{ fontWeight: 600, color: lot.quantity === 0 ? "var(--danger2, #c0392b)" : "var(--green)" }}>
                          {lot.quantity.toLocaleString()} bales
                        </span>
                        {lot.pastureId && <span> · {lot.pastureId}</span>}
                        {lot.quantity === 0 && <span style={{ color: "var(--danger2, #c0392b)", marginLeft: 6 }}>Depleted</span>}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: "0.9rem", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail view */}
                {isExpanded && !isEditing && !isUsage && (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Weight/Bale</div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.92rem" }}>{lot.weightPerBale} lbs</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cost/Bale</div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.92rem" }}>
                          {lot.costPerBale > 0 ? `$${Number(lot.costPerBale).toFixed(2)}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Value</div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.92rem" }}>
                          {lot.costPerBale > 0 ? `$${(lot.quantity * lot.costPerBale).toFixed(2)}` : "—"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tonnage</div>
                        <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.92rem" }}>
                          {((lot.quantity * lot.weightPerBale) / 2000).toFixed(2)} T
                        </div>
                      </div>
                      {lot.pastureId && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pasture</div>
                          <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "0.92rem" }}>{lot.pastureId}</div>
                        </div>
                      )}
                      {lot.notes && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</div>
                          <div style={{ color: "var(--ink)", fontSize: "0.9rem" }}>{lot.notes}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn size="sm" onClick={e => { e.stopPropagation(); startUsage(lot.id); }} style={{ flex: 1 }}>
                        Log Usage
                      </Btn>
                      <Btn size="sm" variant="brass" onClick={e => { e.stopPropagation(); startEdit(lot); }} style={{ flex: 1 }}>
                        Edit
                      </Btn>
                      <Btn size="sm" variant="danger" onClick={e => { e.stopPropagation(); handleDeleteLot(lot.id); }}>
                        Delete
                      </Btn>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {isExpanded && isEditing && editForm && (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--brass2, #b8860b)", marginBottom: 12 }}>
                      Edit Lot
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Select
                            label="Type"
                            value={editForm.type}
                            onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                          >
                            <option value="Hay">Hay</option>
                            <option value="Straw">Straw</option>
                          </Select>
                        </div>
                        <div style={{ flex: 1 }}>
                          <Select
                            label="Bale Type"
                            value={editForm.baleType}
                            onChange={e => setEditForm(f => ({ ...f, baleType: e.target.value }))}
                          >
                            <option value="square">Square</option>
                            <option value="round">Round</option>
                          </Select>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <Input
                            label="Quantity (bales)"
                            type="number"
                            min="0"
                            value={editForm.quantity}
                            onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <Input
                            label="Weight/bale (lbs)"
                            type="number"
                            min="1"
                            value={editForm.weightPerBale}
                            onChange={e => setEditForm(f => ({ ...f, weightPerBale: e.target.value }))}
                          />
                        </div>
                      </div>
                      <Input
                        label="Cost per bale ($)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editForm.costPerBale}
                        onChange={e => setEditForm(f => ({ ...f, costPerBale: e.target.value }))}
                        placeholder="0.00"
                      />
                      {pastureOptions.length > 0 && (
                        <Select
                          label="Assign to Pasture (optional)"
                          value={editForm.pastureId}
                          onChange={e => setEditForm(f => ({ ...f, pastureId: e.target.value }))}
                        >
                          <option value="">— None —</option>
                          {pastureOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      )}
                      <Textarea
                        label="Notes (optional)"
                        value={editForm.notes}
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <Btn onClick={handleSaveEdit} disabled={saving} style={{ flex: 1 }}>
                        {saving ? "Saving…" : "Save Changes"}
                      </Btn>
                      <Btn variant="secondary" onClick={() => { setEditingLotId(null); setEditForm(null); }} style={{ flex: 1 }}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                )}

                {/* Usage form */}
                {isExpanded && isUsage && (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: "0.95rem", color: "var(--green)", marginBottom: 12 }}>
                      Log Usage
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <Input
                        label={`Quantity Used (bales, max ${lot.quantity})`}
                        type="number"
                        min="1"
                        max={lot.quantity}
                        value={usageForm.quantity}
                        onChange={e => setUsageForm(f => ({ ...f, quantity: e.target.value }))}
                        placeholder="0"
                      />
                      <DateInputWithValidation
                        label="Date Used"
                        value={usageForm.date}
                        onChange={val => setUsageForm(f => ({ ...f, date: val }))}
                      />
                      {pastureOptions.length > 0 && (
                        <Select
                          label="Pasture (optional)"
                          value={usageForm.pastureId}
                          onChange={e => setUsageForm(f => ({ ...f, pastureId: e.target.value }))}
                        >
                          <option value="">— None —</option>
                          {pastureOptions.map(p => <option key={p} value={p}>{p}</option>)}
                        </Select>
                      )}
                      <Textarea
                        label="Notes (optional)"
                        value={usageForm.notes}
                        onChange={e => setUsageForm(f => ({ ...f, notes: e.target.value }))}
                        rows={2}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <Btn
                        onClick={handleLogUsage}
                        disabled={saving || !usageForm.quantity || Number(usageForm.quantity) <= 0}
                        style={{ flex: 1 }}
                      >
                        {saving ? "Saving…" : "Log Usage"}
                      </Btn>
                      <Btn variant="secondary" onClick={() => setUsageLotId(null)} style={{ flex: 1 }}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Settings */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem", marginBottom: 10 }}>
          Daily Consumption Rate
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Input
            label=""
            type="number"
            min="0"
            step="0.5"
            value={dailyRate}
            onChange={e => setDailyRate(e.target.value)}
            style={{ width: 90 }}
            placeholder="5"
          />
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>bales / day</span>
        </div>
        <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 6 }}>
          Used to calculate days of hay remaining.
        </div>
      </Card>

      {/* History */}
      <Card>
        <button
          onClick={() => setShowHistory(s => !s)}
          style={{
            width: "100%", background: "none", border: "none", padding: 0,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: "var(--ink)", fontSize: "0.95rem" }}>
            Transaction History ({hayLogs.length})
          </span>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{showHistory ? "▲" : "▼"}</span>
        </button>
        {showHistory && (
          <div style={{ marginTop: 12 }}>
            {sortedLogs.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: "0.87rem", textAlign: "center", padding: "12px 0" }}>
                No transactions yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sortedLogs.map(log => {
                  const parentLot = hayLots.find(l => l.id === log.lotId);
                  const isDelivery = log.action === "delivery";
                  return (
                    <div
                      key={log.id}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px",
                        background: isDelivery ? "#f0f7f1" : "#fef9f0",
                        borderRadius: 6,
                        borderLeft: `3px solid ${isDelivery ? "var(--green)" : "var(--brass)"}`,
                      }}
                    >
                      <span style={{ fontSize: "1rem", flexShrink: 0, marginTop: 1, color: isDelivery ? "var(--green)" : "var(--brass)" }}>
                        {isDelivery ? "+" : "−"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem", color: isDelivery ? "var(--green)" : "var(--brass2, #b8860b)" }}>
                          {isDelivery ? "+" : "−"}{log.quantity} bales · {isDelivery ? "Delivery" : "Usage"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: 2 }}>
                          {log.date || "—"}
                          {parentLot && ` · ${parentLot.type} ${parentLot.baleType}`}
                          {log.pastureId && ` · ${log.pastureId}`}
                          {log.notes && ` · ${log.notes}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
