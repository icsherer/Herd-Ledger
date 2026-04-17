import { TIPS, SPECIES, DEFAULT_TAB_VISIBILITY, PASTURE_SPECIES } from "../lib/constants.js";
import { getExpectedWeaningDate, getAnimalName, daysUntilDue, fmtDueRange, formatGestationDaysRemaining, progress, breedingDateForProgress, formatCompactDollar, getNextExpectedHeatDate, isFemale } from "../lib/helpers.js";
import { Card, Badge, ProgressBar } from "./ui.jsx";

export default function Dashboard({ animals, gestations, offspring, moon, season, user, setTab, setAnimalsSearch, setAnimalsFilterHeatDue, expenses, tasks, settings, loadDone, setHighlightGestationId }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const todayStr = today.toISOString().split("T")[0];
  const upcomingTasks = (tasks || [])
    .filter(t => !t.completed && t.dueDate && t.dueDate >= todayStr)
    .sort((a, b) => (a.dueDate !== b.dueDate ? a.dueDate.localeCompare(b.dueDate) : (a.dueTime || "").localeCompare(b.dueTime || "")))
    .slice(0, 3);

  const activeAnimals = animals.filter(a => !a.deceased && !a.butchered && !a.sale);
  const deceasedCount = animals.filter(a => a.deceased).length;
  const butcheredCount = animals.filter(a => a.butchered).length;
  const soldCount = animals.filter(a => a.sale).length;
  const cullCount = (animals || []).filter(a => a.cull && !a.deceased && !a.butchered && !a.sale).length;
  const speciesCounts = activeAnimals.reduce((acc, a) => { acc[a.species] = (acc[a.species] || 0) + 1; return acc; }, {});
  const gestationsList = Array.isArray(gestations) ? gestations : [];
  const activeGestations = gestationsList.filter(g => {
    if (g.status === "Delivered") return false;
    const a = (animals || []).find(x => x.id === g.animalId);
    if (!a) return false;
    const isSold = a.sale && a.sale.dateSold;
    return !isSold && !a.deceased && !a.butchered && !a.transfer;
  });
  if (gestationsList.length === 0 && (animals?.length > 0)) {
    console.warn("[Dashboard] gestations prop is empty (length 0) — Dashboard receives same gestations state from App as Gestation tab. If Gestation tab shows data, check that both use the same prop. Keys from App: animals, gestations, offspring, ...");
  }
  console.log("Dashboard gestations (full array for verification):", gestationsList);
  console.log("Dashboard active gestations (no delivered):", activeGestations);

  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T12:00:00");
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };
  const incomeThisMonth = (animals || []).filter(a => a.sale && isCurrentMonth(a.sale.dateSold)).reduce((sum, a) => sum + (Number(a.sale?.pricePerHead) || 0), 0);
  const expensesThisMonth = (expenses || []).filter(e => isCurrentMonth(e.date)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Next weaning: animals (not weaned) with expected weaning date within next 7 days (today through today+7)
  const todayStrDash = today.toISOString().split("T")[0];
  const todayPlus7 = new Date(today);
  todayPlus7.setDate(todayPlus7.getDate() + 7);
  const todayPlus7Str = todayPlus7.toISOString().split("T")[0];
  const nextWeaningCount = (animals || [])
    .filter(a => !a.deceased && !a.butchered && !a.sale && !a.weaningDate)
    .filter(a => {
      const expected = getExpectedWeaningDate(a);
      if (!expected) return false;
      return expected >= todayStrDash && expected <= todayPlus7Str;
    })
    .length;

  const activeGestationAnimalIds = new Set((activeGestations || []).map(g => g.animalId));
  const heatDueNext7 = (activeAnimals || []).filter(a => {
    if (!isFemale(a)) return false;
    if (activeGestationAnimalIds.has(a.id)) return false;
    const next = getNextExpectedHeatDate(a);
    return next && next >= todayStrDash && next <= todayPlus7Str;
  });

  // Overdue: only if dueDateEnd is strictly less than today (YYYY-MM-DD). Today = new Date().toISOString().split('T')[0].
  const todayYYYYMMDD = new Date().toISOString().split("T")[0];
  const toDateOnly = (dateStr) => (dateStr && typeof dateStr === "string") ? String(dateStr).trim().split("T")[0].split(" ")[0] : "";
  const isGestationOverdue = (g) => {
    const d = daysUntilDue(g);
    if (d.isRange) return d.end < 0;
    return d.start < 0;
  };
  const overdueList = activeGestations.filter(g => isGestationOverdue(g));
  const overdueIds = new Set(overdueList.map(g => g.id));
  // Single overdue count used everywhere (card sub, alert, Overdue section).
  const overdueCount = overdueList.length;
  const overdue = overdueList.map(g => {
    const d = daysUntilDue(g);
    const due = d.isRange ? d.end : d.start;
    return { ...g, due, dueD: d, animal: animals.find(x => x.id === g.animalId) };
  });

  // DUE THIS MONTH: due this month, including overdue ones whose due date falls in the current month.
  const dueThisMonth = activeGestations.filter(g => {
    if (g.dueDateStart && isCurrentMonth(g.dueDateStart)) return true;
    if (g.dueDateEnd && isCurrentMonth(g.dueDateEnd)) return true;
    if (g.dueDate && !g.dueDateStart && !g.dueDateEnd && isCurrentMonth(g.dueDate)) return true;
    return false;
  });

  // Console: verify buckets — each animal name, dueDateStart, dueDateEnd, bucket
  const bucketLog = activeGestations.map(g => {
    const animal = activeAnimals.find(x => x.id === g.animalId);
    const name = animal ? getAnimalName(animal) : g.animalId;
    const bucket = overdueIds.has(g.id) ? "overdue" : dueThisMonth.some(d => d.id === g.id) ? "dueThisMonth" : "neither";
    return { name, dueDateStart: g.dueDateStart ?? null, dueDateEnd: g.dueDateEnd ?? g.dueDate ?? null, bucket };
  });
  console.log("Dashboard gestation buckets (overdue / dueThisMonth / neither):", bucketLog);
  console.log("Dashboard OVERDUE count (single source of truth):", overdueCount, overdue.map(g => getAnimalName(g.animal)));
  console.log("Dashboard DUE THIS MONTH count:", dueThisMonth.length, dueThisMonth.map(g => getAnimalName(activeAnimals.find(x => x.id === g.animalId))));

  const upcoming = activeGestations
    .map(g => {
      const a = animals.find(x => x.id === g.animalId);
      const d = daysUntilDue(g);
      const due = d.isRange ? d.start : d.start;
      const dueEnd = d.isRange ? d.end : d.start;
      return { ...g, animal: a, due, dueEnd, dueD: d };
    })
    .filter(g => g.dueEnd >= 0)
    .sort((a, b) => (a.due - b.due) || (a.dueEnd - b.dueEnd));

  return (
    <div className="hl-page hl-fade-in">

      {/* Top stats row */}
      <div className="hl-dash-stats">
        {[
          { label: "Total Animals", value: activeAnimals.length, sub: `${Object.keys(speciesCounts).length} species${deceasedCount > 0 ? ` · ${deceasedCount} deceased` : ""}${butcheredCount > 0 ? ` · ${butcheredCount} butchered` : ""}${soldCount > 0 ? ` · ${soldCount} sold` : ""}${cullCount > 0 ? ` · ${cullCount} marked for cull` : ""}`, icon: "🐄", onClick: () => { setAnimalsSearch?.(""); setTab?.("animals"); } },
          { label: "Marked for Cull", value: cullCount, sub: cullCount === 1 ? "animal to cull" : "animals to cull", icon: "⚠️", onClick: () => setTab?.("animals"), alert: cullCount > 0 },
          { label: "Expecting",     value: activeGestations.length, sub: "active pregnancies", icon: "📅", onClick: () => setTab?.("gestation") },
          { label: "Due This Month", value: dueThisMonth.length, sub: overdueCount > 0 ? `${overdueCount} overdue` : "none overdue", icon: "⚠️", alert: overdueCount > 0, onClick: () => setTab?.("gestation") },
          ...((settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY).weaning !== false ? [{
            label: "Next Weaning",
            value: nextWeaningCount,
            sub: nextWeaningCount === 1 ? "due in next 7 days" : nextWeaningCount > 1 ? "due in next 7 days" : "none due",
            icon: "🥛",
            onClick: () => setTab?.("weaning"),
          }] : []),
          { label: "Heat Due (7 days)", value: heatDueNext7.length, sub: "plan breeding", icon: "🔥", onClick: () => { setAnimalsFilterHeatDue?.(true); setTab?.("animals"); } },
          { label: "Financials (this month)", value: (() => { const net = incomeThisMonth - expensesThisMonth; return net >= 0 ? `+${formatCompactDollar(net)}` : formatCompactDollar(net); })(), sub: `Income ${formatCompactDollar(incomeThisMonth)} · Expenses ${formatCompactDollar(expensesThisMonth)}`, icon: "💰", onClick: () => setTab?.("expenses"), large: false },
        ].map((s, i) => (
          <Card
            key={i}
            onClick={s.onClick}
            role={s.onClick ? "button" : undefined}
            tabIndex={s.onClick ? 0 : undefined}
            onKeyDown={s.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.onClick(); } } : undefined}
            style={{
              padding: "18px 20px",
              borderLeft: s.alert ? "4px solid var(--danger2)" : "4px solid var(--brass)",
              cursor: s.onClick ? "pointer" : undefined,
              textAlign: "left",
              width: "100%",
              transition: "box-shadow 0.2s ease, transform 0.2s ease",
            }}
            onMouseEnter={e => { if (s.onClick) { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (s.onClick) { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; } }}
          >
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{s.label}</div>
            <div className="hl-dash-stat-value" style={{ fontFamily: s.large ? "inherit" : "'Playfair Display'", fontSize: s.large ? "32px" : "30px", fontWeight: 700, color: s.alert ? "var(--danger2)" : "var(--green)", lineHeight: 1, marginBottom: "4px" }}>{s.value != null ? s.value : "—"}</div>
            <div className="hl-dash-stat-sub" style={{ fontSize: "12px", color: s.alert ? "var(--danger2)" : "var(--muted)" }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="hl-dash-columns">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Overdue alerts */}
          {!loadDone ? null : overdueCount > 0 && (
            <Card className="hl-card-no-padding" style={{ borderLeft: "4px solid var(--danger2)", padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⚠️</span>
                <span style={{ fontWeight: 700, color: "var(--danger2)", fontSize: "14px" }}>Overdue — Check Immediately</span>
              </div>
              {overdue.map(g => (
                <div key={g.id} style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--cream2)" }}>
                  <div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => { setHighlightGestationId?.(g.id); setTab?.("gestation"); }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHighlightGestationId?.(g.id); setTab?.("gestation"); } }}
                      style={{ fontWeight: 600, cursor: "pointer", color: "var(--green)", textDecoration: "underline", textDecorationColor: "var(--green3)" }}
                    >{getAnimalName(g.animal)}</span>
                    <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{g.animal?.species}</span>
                  </div>
                  <Badge color="var(--danger2)">{g.dueD?.isRange ? "Overdue" : `${Math.abs(g.due)}d overdue`}</Badge>
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming births */}
          {!loadDone ? null : upcoming.length > 0 && (
            <Card className="hl-card-no-padding" style={{ padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                <span style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600 }}>Upcoming Births</span>
                <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>all due dates</span>
              </div>
              {upcoming.map(g => (
                <div key={g.id} style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px" }}>{SPECIES[g.animal?.species]?.emoji}</span>
                      <div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { setHighlightGestationId?.(g.id); setTab?.("gestation"); }}
                          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setHighlightGestationId?.(g.id); setTab?.("gestation"); } }}
                          style={{ fontWeight: 600, cursor: "pointer", color: "var(--green)", textDecoration: "underline", textDecorationColor: "var(--green3)" }}
                        >{getAnimalName(g.animal)}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{g.animal?.species} · Due {fmtDueRange(g)}</div>
                      </div>
                    </div>
                    <Badge color={g.dueD && (g.dueD.isRange && g.dueD.start <= 0 && g.dueD.end >= 0 || (g.dueD.start >= 0 && g.dueD.start <= 7)) ? "var(--brass2)" : "var(--green3)"}>
                      {formatGestationDaysRemaining(g.dueD)}
                    </Badge>
                  </div>
                  <ProgressBar value={progress(breedingDateForProgress(g), g.gestationDays)} />
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming Tasks */}
          {upcomingTasks.length > 0 && (
            <Card
              className="hl-card-no-padding"
              style={{ padding: "0", cursor: "pointer" }}
              role="button"
              tabIndex={0}
              onClick={() => setTab?.("tasks")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab?.("tasks"); } }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600 }}>Upcoming Tasks</span>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>next 3</span>
              </div>
              {upcomingTasks.map(t => (
                <div key={t.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: t.priority === "High" ? "var(--danger2)" : t.priority === "Medium" ? "var(--brass)" : "var(--green3)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>{t.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {t.dueDate}{t.dueTime ? ` · ${t.dueTime}` : ""}{t.category ? ` · ${t.category}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Herd breakdown */}
          {activeAnimals.length > 0 && (
            <Card style={{ padding: "20px" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Herd Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {Object.entries(speciesCounts).map(([sp, n]) => (
                  <div
                    key={sp}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setAnimalsSearch?.(sp); setTab?.("animals"); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAnimalsSearch?.(sp); setTab?.("animals"); } }}
                    style={{
                      cursor: "pointer",
                      padding: "6px 8px",
                      margin: "-6px -8px",
                      borderRadius: "var(--radius1)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--cream2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{SPECIES[sp]?.emoji}</span> {sp}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--green)" }}>{n}</span>
                    </div>
                    <ProgressBar value={(n / activeAnimals.length) * 100} height={4} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pasture summary — only if at least one Cattle or Horse is registered */}
          {(() => {
            const hasCattleOrHorse = activeAnimals.some(a => PASTURE_SPECIES.includes(a.species));
            if (!hasCattleOrHorse) return null;
            const pastureAnimals = activeAnimals.filter(a => PASTURE_SPECIES.includes(a.species));
            const byLower = {};
            const canonicalName = {};
            pastureAnimals.forEach(a => {
              const p = (a.movements?.[0]?.pastureName || "").trim();
              const key = p || "—";
              const lower = key === "—" ? "—" : key.toLowerCase();
              if (!byLower[lower]) {
                byLower[lower] = 0;
                canonicalName[lower] = key === "—" ? "—" : p;
              }
              byLower[lower]++;
            });
            return (
              <Card style={{ padding: "20px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: "600", marginBottom: "14px" }}>Pasture Summary</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {Object.entries(byLower)
                    .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : (canonicalName[a] || "").localeCompare(canonicalName[b] || "")))
                    .map(([lower, n]) => (
                      <div
                        key={lower}
                        role={lower !== "—" ? "button" : undefined}
                        tabIndex={lower !== "—" ? 0 : undefined}
                        onClick={lower !== "—" ? () => setTab?.("pastures") : undefined}
                        onKeyDown={lower !== "—" ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab?.("pastures"); } } : undefined}
                        style={{
                          display: "flex", justifyContent: "space-between", marginBottom: "4px",
                          cursor: lower !== "—" ? "pointer" : undefined,
                          padding: lower !== "—" ? "3px 6px" : undefined,
                          margin: lower !== "—" ? "-3px -6px 4px" : undefined,
                          borderRadius: lower !== "—" ? "var(--radius1)" : undefined,
                          transition: lower !== "—" ? "background 0.15s" : undefined,
                        }}
                        onMouseEnter={lower !== "—" ? e => { e.currentTarget.style.background = "var(--cream2)"; } : undefined}
                        onMouseLeave={lower !== "—" ? e => { e.currentTarget.style.background = ""; } : undefined}
                      >
                        <span style={{ fontSize: "14px", color: lower === "—" ? "var(--muted)" : "var(--ink2)" }}>{lower === "—" ? "Not in pasture" : canonicalName[lower]}</span>
                        <span style={{ fontWeight: 600, color: "var(--green)" }}>{n}</span>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })()}

          {!activeAnimals.length && !activeGestations.length && (
            <Card style={{ padding: "48px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🐄</div>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Welcome to Herd Ledger</div>
              <div style={{ color: "var(--muted)", fontSize: "14px" }}>Start by registering your first animal in the Animals tab.</div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Date & Season */}
          <Card style={{ padding: "20px", textAlign: "center", background: "var(--green)", border: "none" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--brass3)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "4px" }}>{season}</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "52px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{today.getDate()}</div>
            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", marginTop: "4px" }}>
              {today.toLocaleDateString("en-US", { weekday: "long", month: "long", year: "numeric" })}
            </div>
          </Card>

          {/* Moon */}
          <Card style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Moon Phase</div>
            <div style={{ fontSize: "52px", lineHeight: 1, marginBottom: "6px" }}>{moon.icon}</div>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "14px" }}>{moon.name}</div>
          </Card>

          {/* Almanac Wisdom */}
          <Card style={{ padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--brass2)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>
              Almanac Wisdom
            </div>
            <p style={{ fontFamily: "'Playfair Display'", fontStyle: "italic", fontSize: "15px", color: "var(--ink2)", lineHeight: 1.7 }}>
              "{tip}"
            </p>
          </Card>

        </div>
      </div>
    </div>
  );
}
