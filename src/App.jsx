import { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Auth, { ResetPasswordPage } from "./Auth";

// ── Species Data ──────────────────────────────────────────────────────────────
const SPECIES = {
  Cattle:  { days: 283, emoji: "🐄" },
  Horse:   { days: 340, emoji: "🐎" },
  Pig:     { days: 114, emoji: "🐖" },
  Sheep:   { days: 147, emoji: "🐑" },
  Goat:    { days: 150, emoji: "🐐" },
  Llama:   { days: 350, emoji: "🦙" },
  Alpaca:  { days: 345, emoji: "🦙" },
  Donkey:  { days: 365, emoji: "🫏" },
  Mule:    { days: 360, emoji: "🐴" },
  Rabbit:  { days: 31,  emoji: "🐇" },
  Dog:     { days: 63,  emoji: "🐕" },
  Cat:     { days: 65,  emoji: "🐈" },
};

const MOON_ICONS  = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
const MOON_NAMES  = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];

function getMoonPhase(date = new Date()) {
  let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (m < 3) { y--; m += 12; } m++;
  const jd = Math.floor(365.25 * y) + Math.floor(30.6 * m) + d - 694039.09;
  const b = Math.round((jd / 29.5305882 % 1) * 8) % 8;
  return { icon: MOON_ICONS[b], name: MOON_NAMES[b] };
}

function getSeason(d = new Date()) {
  const doy = Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000);
  if (doy < 80 || doy >= 355) return "Winter";
  if (doy < 172) return "Spring";
  if (doy < 266) return "Summer";
  return "Autumn";
}

const TIPS = {
  Winter: ["A ring round the moon foretells rain within three days.","Feed extra grain when the cold bites deep.","Trust the woolly bear — a thick coat means hard winter ahead.","Count your stores twice; winter is long and forgiving of nothing."],
  Spring: ["Plant above-ground crops under a waxing moon.","A warm March foretells a cold May — do not thin your stores early.","Spring lambs born at full moon tend to grow the sturdiest.","Listen to the robins; when they return, the last frost is near."],
  Summer: ["When cows lie down before noon, rain comes soon.","Morning dew means a dry afternoon.","Shear before the Dog Days — shorn sheep fare better in heat.","Watch the swallows; low flight means rain before nightfall."],
  Autumn: ["Mark your breeding dates carefully — spring arrives quickly.","Stock the hayloft full; winter feeds the heaviest animals hardest.","Thicker woolly bears predict harsher winters.","Harvest when the moon wanes for longest storage."],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((d - t) / 86400000);
}
function dueDate(breedingStr, days) {
  const d = new Date(breedingStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function progress(breedingStr, totalDays) {
  const elapsed = (Date.now() - new Date(breedingStr)) / 86400000;
  return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
}
function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDueRange(g) {
  if (g.dueDateStart && g.dueDateEnd) return `${fmt(g.dueDateStart)} – ${fmt(g.dueDateEnd)}`;
  return fmt(g.dueDate);
}
function breedingDateForProgress(g) {
  return g.breedingDateEnd || g.breedingDate;
}
function daysUntilDue(g) {
  if (g.dueDateStart && g.dueDateEnd) {
    const start = daysUntil(g.dueDateStart);
    const end = daysUntil(g.dueDateEnd);
    return { start, end, isRange: true };
  }
  return { start: daysUntil(g.dueDate), end: daysUntil(g.dueDate), isRange: false };
}
function isOverdue(g) {
  const d = daysUntilDue(g);
  return d.isRange ? d.end < 0 : d.start < 0;
}
function ageFromDob(dobStr) {
  if (!dobStr) return "Unknown";
  const birth = new Date(dobStr + "T12:00:00");
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) return ageFromDobMonths(months - 1);
  return ageFromDobMonths(months);
}
function ageFromDobMonths(months) {
  if (months < 0) return "Unknown";
  if (months >= 24) return `${Math.floor(months / 12)} years`;
  if (months >= 12) return "1 year";
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  return "Under 1 month";
}

const CASTRATED_TERM_BY_SPECIES = {
  Cattle: "Steer",
  Pig: "Barrow",
  Sheep: "Wether",
  Goat: "Wether",
  Horse: "Gelding",
  Donkey: "Gelding",
  Mule: "Gelding",
};

function displaySex(animal) {
  if (animal?.castration && (animal.sex === "Male" || !animal.sex)) {
    return CASTRATED_TERM_BY_SPECIES[animal.species] ?? "Castrated";
  }
  return animal?.sex || "—";
}

function getAnimalName(animal) {
  if (!animal) return "Unnamed";
  return animal.name || (animal.tag ? `#${animal.tag}` : "Unnamed");
}

// ── Global Styles ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:    #1B3A2B;
    --green2:   #254D39;
    --green3:   #2E6347;
    --brass:    #C9952A;
    --brass2:   #A67A1E;
    --brass3:   #F0C060;
    --cream:    #F7F2E8;
    --cream2:   #EDE6D6;
    --cream3:   #E0D5C0;
    --ink:      #141A14;
    --ink2:     #2C3A2C;
    --muted:    #7A8C7A;
    --danger:   #8B2020;
    --danger2:  #C0392B;
    --white:    #FFFFFF;
    --shadow:   0 1px 3px rgba(20,26,20,0.10), 0 4px 12px rgba(20,26,20,0.06);
    --shadow2:  0 2px 8px rgba(20,26,20,0.14), 0 8px 24px rgba(20,26,20,0.08);
    --radius:   6px;
    --radius2:  10px;
  }

  body {
    background: var(--cream);
    color: var(--ink);
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  button { cursor: pointer; font-family: 'Source Sans 3', sans-serif; }
  input, select, textarea { font-family: 'Source Sans 3', sans-serif; }

  .hl-fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--cream2); }
  ::-webkit-scrollbar-thumb { background: var(--cream3); border-radius: 3px; }
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({ children, style = {}, className = "", ...rest }) {
  return (
    <div className={className} style={{
      background: "#fff",
      borderRadius: var2("radius2"),
      boxShadow: "var(--shadow)",
      border: "1px solid var(--cream3)",
      ...style
    }} {...rest}>{children}</div>
  );
}

function Badge({ children, color = "var(--green)" }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
      background: color,
      color: "#fff",
      letterSpacing: "0.3px",
    }}>{children}</span>
  );
}

function ProgressBar({ value, color = "var(--green3)", height = 6 }) {
  return (
    <div style={{ background: "var(--cream2)", height, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="hl-section-title">
      <h2 style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)" }}>{children}</h2>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, size = "md" }) {
  const sizes = { sm: "6px 14px", md: "9px 20px", lg: "12px 28px" };
  const styles = {
    primary:   { background: "var(--green)",  color: "#fff",           border: "none" },
    secondary: { background: "transparent",   color: "var(--green)",   border: "1.5px solid var(--green)" },
    brass:     { background: "var(--brass)",   color: "#fff",           border: "none" },
    danger:    { background: "var(--danger2)", color: "#fff",           border: "none" },
    ghost:     { background: "transparent",   color: "var(--muted)",   border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant],
      padding: sizes[size],
      borderRadius: "var(--radius)",
      fontSize: size === "sm" ? "13px" : "14px",
      fontWeight: 600,
      letterSpacing: "0.2px",
      transition: "all 0.15s",
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.filter = ""; }}
    >{children}</button>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input {...props} style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        transition: "border-color 0.15s",
        ...props.style,
      }}
      onFocus={e => e.target.style.borderColor = "var(--green3)"}
      onBlur={e => e.target.style.borderColor = "var(--cream3)"}
      />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <select {...props} style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        ...props.style,
      }}>{children}</select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <textarea {...props} style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        resize: "vertical",
        ...props.style,
      }}
      onFocus={e => e.target.style.borderColor = "var(--green3)"}
      onBlur={e => e.target.style.borderColor = "var(--cream3)"}
      />
    </div>
  );
}

function var2(name) { return `var(--${name})`; }

// ── Navigation ────────────────────────────────────────────────────────────────
function Nav({ tab, setTab }) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "animals",   label: "Animals",   icon: "🐄" },
    { id: "gestation", label: "Gestation", icon: "📅" },
    { id: "notes",     label: "Journal",   icon: "📖" },
  ];
  return (
    <header style={{ background: "var(--green)", borderBottom: "3px solid var(--brass)" }}>
      <div className="hl-nav-inner" style={{ padding: "0 24px", display: "flex", alignItems: "center", gap: "0" }}>
        {/* Logo */}
        <div style={{ padding: "14px 0", marginRight: "32px", flexShrink: 0 }}>
          <div className="hl-nav-logo-title" style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 700, color: "#fff", letterSpacing: "0.5px", lineHeight: 1 }}>
            Herd Ledger
          </div>
          <div className="hl-nav-logo-sub" style={{ fontSize: "10px", color: "var(--brass3)", letterSpacing: "2px", textTransform: "uppercase", marginTop: "2px" }}>
            Livestock Management
          </div>
        </div>

        {/* Tabs */}
        <nav className="hl-nav-tabs" style={{ display: "flex", gap: "2px" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "16px 18px",
              background: tab === t.id ? "rgba(255,255,255,0.12)" : "transparent",
              color: tab === t.id ? "#fff" : "rgba(255,255,255,0.6)",
              border: "none",
              borderBottom: tab === t.id ? "3px solid var(--brass)" : "3px solid transparent",
              fontSize: "14px", fontWeight: tab === t.id ? 600 : 400,
              whiteSpace: "nowrap",
              transition: "all 0.15s",
              cursor: "pointer",
              marginBottom: "-3px",
            }}
            onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
            >
              <span style={{ fontSize: "16px" }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ animals, gestations, offspring, moon, season, user, onLogout }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];

  const activeAnimals = animals.filter(a => !a.deceased);
  const deceasedCount = animals.filter(a => a.deceased).length;
  const speciesCounts = activeAnimals.reduce((acc, a) => { acc[a.species] = (acc[a.species] || 0) + 1; return acc; }, {});
  const activeGestations = gestations.filter(g => g.status !== "Delivered");

  // Next weaning across all offspring
  let nextWeaning = null;
  if (offspring) {
    Object.values(offspring).forEach(list => {
      (list || []).forEach(c => {
        if (!c.weaningDate) return;
        const d = daysUntil(c.weaningDate);
        if (d < 0) return; // already past
        if (!nextWeaning || d < nextWeaning.days) {
          nextWeaning = {
            days: d,
            name: c.name || "Unnamed",
          };
        }
      });
    });
  }

  const upcoming = activeGestations
    .map(g => {
      const a = activeAnimals.find(x => x.id === g.animalId);
      const d = daysUntilDue(g);
      const due = d.isRange ? d.start : d.start;
      const dueEnd = d.isRange ? d.end : d.start;
      return { ...g, animal: a, due, dueEnd, dueD: d };
    })
    .filter(g => g.dueEnd >= 0 && g.due <= 30)
    .sort((a, b) => a.due - b.due);

  const overdue = activeGestations
    .map(g => {
      const d = daysUntilDue(g);
      const due = d.isRange ? d.end : d.start;
      return { ...g, due, dueD: d, animal: activeAnimals.find(x => x.id === g.animalId) };
    })
    .filter(g => g.due < 0);

  return (
    <div className="hl-page hl-fade-in">

      {/* Top stats row */}
      <div className="hl-dash-stats">
        {[
          { label: "Total Animals", value: activeAnimals.length, sub: `${Object.keys(speciesCounts).length} species${deceasedCount > 0 ? ` · ${deceasedCount} deceased` : ""}`, icon: "🐄" },
          { label: "Expecting",     value: activeGestations.length, sub: "active pregnancies", icon: "📅" },
          { label: "Due This Month",value: upcoming.length, sub: overdue.length > 0 ? `${overdue.length} overdue` : "none overdue", icon: "⚠️", alert: overdue.length > 0 },
          {
            label: "Next Weaning",
            value: nextWeaning ? nextWeaning.days : "—",
            sub: nextWeaning ? nextWeaning.name : "none scheduled",
            icon: "🥛",
          },
        ].map((s, i) => (
          <Card key={i} style={{ padding: "18px 20px", borderLeft: s.alert ? "4px solid var(--danger2)" : "4px solid var(--brass)" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{s.label}</div>
            <div style={{ fontFamily: s.large ? "inherit" : "'Playfair Display'", fontSize: s.large ? "32px" : "30px", fontWeight: 700, color: s.alert ? "var(--danger2)" : "var(--green)", lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
            <div style={{ fontSize: "12px", color: s.alert ? "var(--danger2)" : "var(--muted)" }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="hl-dash-columns">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Overdue alerts */}
          {overdue.length > 0 && (
            <Card style={{ borderLeft: "4px solid var(--danger2)", padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⚠️</span>
                <span style={{ fontWeight: 700, color: "var(--danger2)", fontSize: "14px" }}>Overdue — Check Immediately</span>
              </div>
              {overdue.map(g => (
                <div key={g.id} style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--cream2)" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{getAnimalName(g.animal)}</span>
                    <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{g.animal?.species}</span>
                  </div>
                  <Badge color="var(--danger2)">{g.dueD?.isRange ? "Overdue" : `${Math.abs(g.due)}d overdue`}</Badge>
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming births */}
          {upcoming.length > 0 && (
            <Card style={{ padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                <span style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600 }}>Upcoming Births</span>
                <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>next 30 days</span>
              </div>
              {upcoming.map(g => (
                <div key={g.id} style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px" }}>{SPECIES[g.animal?.species]?.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{getAnimalName(g.animal)}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{g.animal?.species} · Due {fmtDueRange(g)}</div>
                      </div>
                    </div>
                    <Badge color={g.due <= 7 ? "var(--brass2)" : "var(--green3)"}>
                      {g.dueD?.isRange && g.due !== g.dueEnd ? `${g.due}–${g.dueEnd}d` : g.due === 0 ? "Today" : `${g.due}d`}
                    </Badge>
                  </div>
                  <ProgressBar value={progress(breedingDateForProgress(g), g.gestationDays)} />
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
                  <div key={sp}>
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

          {/* Log Out */}
          <Card
            role="button"
            tabIndex={0}
            onClick={onLogout}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLogout(); } }}
            style={{
              padding: "16px 20px",
              textAlign: "center",
              background: "#f8f0f0",
              border: "1px solid #e8d8d8",
              color: "#8b6b6b",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Log Out
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Animals ───────────────────────────────────────────────────────────────────
function Animals({ animals, setAnimals, offspring, setOffspring, gestations, setGestations, user }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", species: "Cattle", sex: "Female", dob: "", breed: "", tag: "", notes: "" });
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState("");
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [offspringForm, setOffspringForm] = useState({
    name: "",
    tag: "",
    sex: "",
    species: "",
    birthWeight: "",
    dob: "",
    weaningDate: "",
  });
  const [showCastrationForm, setShowCastrationForm] = useState(false);
  const [castrationForm, setCastrationForm] = useState({
    date: "",
    method: "Banding",
    performer: "Owner",
    notes: "",
  });
  const [showVaccinationForm, setShowVaccinationForm] = useState(false);
  const [editingVaccinationId, setEditingVaccinationId] = useState(null);
  const [vaccinationForm, setVaccinationForm] = useState({
    vaccineName: "",
    dateGiven: "",
    nextDueDate: "",
    administeredBy: "Owner",
    notes: "",
  });
  const [showDeceasedForm, setShowDeceasedForm] = useState(false);
  const [deceasedForm, setDeceasedForm] = useState({ date: "", cause: "Unknown", notes: "" });
  const [showDeceasedAnimals, setShowDeceasedAnimals] = useState(false);
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [breedingForm, setBreedingForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });

  const DECEASED_CAUSES = ["Natural Causes", "Illness", "Injury", "Predator", "Culled", "Unknown"];

  const emptyForm = () => ({ name: "", species: "Cattle", sex: "Female", dob: "", breed: "", tag: "", notes: "" });

  function add() {
    if (!form.name) return;
    setAnimals(p => [...p, { ...form, id: Date.now().toString() }]);
    setForm(emptyForm());
    setShowAdd(false);
  }

  function saveEdit() {
    if (!editingId) return;
    const updated = { ...viewing, name: form.name || undefined, species: form.species, sex: form.sex, dob: form.dob || undefined, breed: form.breed || undefined, tag: form.tag || undefined, notes: form.notes || undefined };
    setAnimals(p => p.map(x => x.id === editingId ? updated : x));
    setViewing(updated);
    setEditingId(null);
    setForm(emptyForm());
  }

  function remove(id) {
    if (!confirm("Remove this animal from the register?")) return;
    setAnimals(p => p.filter(a => a.id !== id));
    setViewing(null);
  }

  const filtered = animals.filter(a => {
    const matchesSearch = getAnimalName(a).toLowerCase().includes(search.toLowerCase()) || a.species.toLowerCase().includes(search.toLowerCase());
    const showByDeceased = showDeceasedAnimals ? true : !a.deceased;
    return matchesSearch && showByDeceased;
  });

  if (viewing) {
    const a = viewing;
    const offspringForMother = (offspring && offspring[a.id]) || [];
    const isFemale = a.sex === "Female";
    const isMale = a.sex === "Male";

    function saveOffspring() {
      const rec = {
        id: Date.now().toString(),
        motherId: a.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: offspringForm.sex || undefined,
        species: offspringForm.species || a.species,
        birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
        dob: offspringForm.dob || undefined,
        weaningDate: offspringForm.weaningDate || undefined,
        createdAt: new Date().toISOString(),
      };
      setOffspring(prev => {
        const base = prev || {};
        const list = base[a.id] || [];
        return { ...base, [a.id]: [...list, rec] };
      });
      const newAnimal = {
        id: rec.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: offspringForm.sex || undefined,
        species: offspringForm.species || a.species,
        dob: offspringForm.dob || undefined,
        breed: a.breed || undefined,
        notes: undefined,
        motherId: a.id,
      };
      setAnimals(prev => [...prev, newAnimal]);
      setShowOffspringForm(false);
      setOffspringForm({
        name: "",
        tag: "",
        sex: "",
        species: "",
        birthWeight: "",
        dob: "",
        weaningDate: "",
      });
    }

    function saveCastration() {
      const rec = {
        date: castrationForm.date || undefined,
        method: castrationForm.method || undefined,
        performer: castrationForm.performer || undefined,
        notes: castrationForm.notes || undefined,
        recordedAt: new Date().toISOString(),
      };
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, castration: rec } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, castration: rec } : prev
      );
      setShowCastrationForm(false);
      setCastrationForm({
        date: "",
        method: "Banding",
        performer: "Owner",
        notes: "",
      });
    }

    function deleteCastration() {
      if (!confirm("Remove this castration record? The animal's sex will display as Male again.")) return;
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, castration: undefined } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, castration: undefined } : prev
      );
      setShowCastrationForm(false);
      setCastrationForm({ date: "", method: "Banding", performer: "Owner", notes: "" });
    }

    function saveVaccination() {
      const rec = editingVaccinationId
        ? {
            id: editingVaccinationId,
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: vaccinationForm.nextDueDate || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
          }
        : {
            id: Date.now().toString(),
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: vaccinationForm.nextDueDate || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
          };
      const nextList = editingVaccinationId
        ? (a.vaccinations || []).map(v => (v.id === editingVaccinationId ? rec : v))
        : [...(a.vaccinations || []), rec];
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev
      );
      setShowVaccinationForm(false);
      setEditingVaccinationId(null);
      setVaccinationForm({
        vaccineName: "",
        dateGiven: "",
        nextDueDate: "",
        administeredBy: "Owner",
        notes: "",
      });
    }

    function deleteVaccination(vaccinationId) {
      if (!confirm("Remove this vaccination record?")) return;
      const nextList = (a.vaccinations || []).filter(v => v.id !== vaccinationId);
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev
      );
    }

    function saveDeceased() {
      const deceased = {
        date: deceasedForm.date || undefined,
        cause: deceasedForm.cause || "Unknown",
        notes: deceasedForm.notes || undefined,
      };
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, deceased } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, deceased } : prev
      );
      setShowDeceasedForm(false);
      setDeceasedForm({ date: "", cause: "Unknown", notes: "" });
    }

    function addBreedingFromProfile() {
      const start = breedingForm.breedingDate;
      const end = breedingForm.runningWithBull ? breedingForm.breedingDateEnd : breedingForm.breedingDate;
      if (!start || (breedingForm.runningWithBull && !end)) return;
      const totalDays = SPECIES[a.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = breedingForm.runningWithBull ? dueDate(end, totalDays) : dueStart;
      const record = {
        animalId: a.id,
        breedingDate: start,
        ...(breedingForm.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
        dueDate: dueStart,
        ...(breedingForm.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
        sire: breedingForm.sire,
        notes: breedingForm.notes,
        id: Date.now().toString(),
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
      setGestations(p => [...p, record]);
      setShowBreedingForm(false);
      setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
    }

    const vaccinationsSorted = [...(a.vaccinations || [])].sort((x, y) => {
      const d1 = x.dateGiven || "";
      const d2 = y.dateGiven || "";
      return d2.localeCompare(d1);
    });

    return (
      <div className="hl-page hl-page-narrow hl-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => { setViewing(null); setEditingId(null); }} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            ← Back to Animals
          </button>
          {editingId !== a.id && (
            <Btn onClick={() => { setEditingId(a.id); setForm({ name: a.name || "", species: a.species || "Cattle", sex: a.sex || "Female", dob: a.dob || "", breed: a.breed || "", tag: a.tag || "", notes: a.notes || "" }); }}>Edit</Btn>
          )}
        </div>

        {editingId === a.id && (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Edit Animal</div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
              <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
              <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
              <Select label="Species" value={form.species} onChange={e => setForm(p => ({ ...p, species: e.target.value }))}>
                {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
              </Select>
              <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
                <option>Female</option><option>Male</option><option>Wether/Steer</option>
              </Select>
              <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
            </div>
            <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={saveEdit}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Cancel</Btn>
            </div>
          </Card>
        )}

        <Card style={{ padding: "0", overflow: "hidden" }}>
          <div className="hl-detail-header" style={{ background: "var(--green)", padding: "28px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ fontSize: "52px" }}>{SPECIES[a.species]?.emoji}</div>
            <div>
              <div className="hl-detail-name" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#fff" }}>{getAnimalName(a)}</div>
              <div style={{ color: "var(--brass3)", fontSize: "14px", marginTop: "2px" }}>{a.breed || a.species} · {displaySex(a)}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              {a.deceased && <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>}
              {a.tag && a.name && !a.deceased && <Badge color="var(--brass2)">#{a.tag}</Badge>}
            </div>
          </div>
          <div style={{ padding: "28px 32px" }}>
            <div className="hl-detail-grid" style={{ marginBottom: "24px" }}>
              {[
                ["Species", a.species],
                ["Breed", a.breed || "—"],
                ["Sex", displaySex(a)],
                ["Date of Birth", fmt(a.dob)],
                ["Tag / ID", a.tag || "—"],
                ...(a.species !== "Mule" ? [["Gestation", `${SPECIES[a.species]?.days ?? "—"} days`]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>{k}</div>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>
            {a.notes && (
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Notes</div>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--ink2)" }}>{a.notes}</p>
              </div>
            )}

            {/* Deceased */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                Status
              </div>
              {a.deceased ? (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "#f5f5f5", borderLeft: "3px solid #888" }}>
                  <div style={{ fontWeight: 600, color: "#555", marginBottom: "4px" }}>Deceased</div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                    {a.deceased.date && <span>Date: {fmt(a.deceased.date)}</span>}
                    {a.deceased.cause && <span>{a.deceased.date ? " · " : ""}Cause: {a.deceased.cause}</span>}
                  </div>
                  {a.deceased.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "6px" }}>{a.deceased.notes}</div>}
                </div>
              ) : showDeceasedForm ? (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid #888" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Deceased</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Date of death" type="date" value={deceasedForm.date} onChange={e => setDeceasedForm(p => ({ ...p, date: e.target.value }))} />
                    <Select label="Cause of death" value={deceasedForm.cause} onChange={e => setDeceasedForm(p => ({ ...p, cause: e.target.value }))}>
                      {DECEASED_CAUSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </div>
                  <Textarea label="Notes" value={deceasedForm.notes} onChange={e => setDeceasedForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." />
                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <Btn size="sm" onClick={saveDeceased}>Confirm</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowDeceasedForm(false); setDeceasedForm({ date: "", cause: "Unknown", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              ) : (
                <Btn size="sm" variant="secondary" onClick={() => setShowDeceasedForm(true)}>Mark as Deceased</Btn>
              )}
            </div>

            {isMale && (
              <div style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                    Castration Record
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const existing = a.castration || {};
                      setShowCastrationForm(true);
                      setCastrationForm({
                        date: existing.date || "",
                        method: existing.method || "Banding",
                        performer: existing.performer || "Owner",
                        notes: existing.notes || "",
                      });
                    }}
                  >
                    Log Castration
                  </Btn>
                </div>

                {!a.castration && !showCastrationForm && (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No castration recorded for this animal.</p>
                )}

                {a.castration && (
                  <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {a.castration.date ? <>Performed {fmt(a.castration.date)}</> : "Date not recorded"}
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setCastrationForm({ date: a.castration.date || "", method: a.castration.method || "Banding", performer: a.castration.performer || "Owner", notes: a.castration.notes || "" }); setShowCastrationForm(true); }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={deleteCastration}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                      {a.castration.method && <div><strong>Method:</strong> {a.castration.method}</div>}
                      {a.castration.performer && <div><strong>Performed by:</strong> {a.castration.performer}</div>}
                      {a.castration.notes && (
                        <div style={{ marginTop: "4px" }}>
                          <strong>Notes:</strong> {a.castration.notes}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showCastrationForm && (
                  <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      {a.castration ? "Edit Castration" : "Log Castration"}
                    </div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <Input
                        label="Date performed"
                        type="date"
                        value={castrationForm.date}
                        onChange={e => setCastrationForm(p => ({ ...p, date: e.target.value }))}
                      />
                      <Select
                        label="Method"
                        value={castrationForm.method}
                        onChange={e => setCastrationForm(p => ({ ...p, method: e.target.value }))}
                      >
                        <option>Banding</option>
                        <option>Surgical</option>
                        <option>Burdizzo</option>
                      </Select>
                      <Select
                        label="Performed by"
                        value={castrationForm.performer}
                        onChange={e => setCastrationForm(p => ({ ...p, performer: e.target.value }))}
                      >
                        <option>Owner</option>
                        <option>Vet</option>
                      </Select>
                    </div>
                    <Textarea
                      label="Notes"
                      value={castrationForm.notes}
                      onChange={e => setCastrationForm(p => ({ ...p, notes: e.target.value }))}
                      rows={3}
                    />
                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <Btn size="sm" onClick={saveCastration}>Save Record</Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowCastrationForm(false);
                          setCastrationForm({
                            date: "",
                            method: "Banding",
                            performer: "Owner",
                            notes: "",
                          });
                        }}
                      >
                        Cancel
                      </Btn>
                    </div>
                  </Card>
                )}
              </div>
            )}
            {isFemale && (
              <div style={{ marginTop: "24px" }}>
                {a.species !== "Mule" && (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                      Breeding
                    </div>
                    {!showBreedingForm ? (
                      <Btn size="sm" variant="secondary" onClick={() => setShowBreedingForm(true)}>Log Breeding</Btn>
                    ) : (
                      <Card style={{ padding: "24px", borderLeft: "4px solid var(--brass)" }}>
                        <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
                        <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Dam: <strong>{getAnimalName(a)}</strong> ({a.species})</div>
                        <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
                          {!breedingForm.runningWithBull ? (
                            <Input label="Breeding Date *" type="date" value={breedingForm.breedingDate} onChange={e => setBreedingForm(p => ({ ...p, breedingDate: e.target.value }))} />
                          ) : (
                            <>
                              <Input label="Exposure start *" type="date" value={breedingForm.breedingDate} onChange={e => setBreedingForm(p => ({ ...p, breedingDate: e.target.value }))} />
                              <Input label="Exposure end *" type="date" value={breedingForm.breedingDateEnd} onChange={e => setBreedingForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
                            </>
                          )}
                          <Input label="Sire (optional)" value={breedingForm.sire} onChange={e => setBreedingForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                          <input type="checkbox" checked={breedingForm.runningWithBull} onChange={e => setBreedingForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Running with Bull (date range for bull exposure)</span>
                        </label>
                        <Textarea label="Notes" value={breedingForm.notes} onChange={e => setBreedingForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                        {breedingForm.breedingDate && (breedingForm.runningWithBull ? breedingForm.breedingDateEnd : true) && (() => {
                          const days = SPECIES[a.species]?.days;
                          if (!days) return null;
                          const start = dueDate(breedingForm.breedingDate, days);
                          const end = breedingForm.runningWithBull && breedingForm.breedingDateEnd ? dueDate(breedingForm.breedingDateEnd, days) : start;
                          const dueStr = breedingForm.runningWithBull && breedingForm.breedingDateEnd ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
                          return (
                            <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                              📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
                            </div>
                          );
                        })()}
                        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={addBreedingFromProfile}>Record</Btn>
                          <Btn variant="secondary" onClick={() => { setShowBreedingForm(false); setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>Cancel</Btn>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Total Offspring</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)" }}>{offspringForMother.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Success Rate (%)</div>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={a.successRate != null ? a.successRate : ""}
                      onChange={e => {
                        const v = e.target.value;
                        const num = v === "" ? undefined : parseFloat(v);
                        setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, successRate: num } : an)));
                        setViewing(prev => (prev && prev.id === a.id ? { ...prev, successRate: num } : prev));
                      }}
                      placeholder="e.g. 85"
                      style={{ width: "100%", padding: "8px 12px", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", fontSize: "14px", color: "var(--ink)", background: "#fff", outline: "none" }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                    Offspring Records
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowOffspringForm(true);
                      setOffspringForm({
                        name: "",
                        tag: "",
                        sex: "",
                        species: a.species,
                        birthWeight: "",
                        dob: "",
                        weaningDate: "",
                      });
                    }}
                  >
                    + Add Offspring
                  </Btn>
                </div>

                {offspringForMother.length === 0 && !showOffspringForm && (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No offspring recorded yet for this dam.</p>
                )}

                {offspringForMother.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "8px" }}>
                    {offspringForMother.map(c => (
                      <div key={c.id} style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span>{SPECIES[c.species || a.species]?.emoji}</span>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>
                            {c.name || "Unnamed"}{c.tag ? ` (#${c.tag})` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {c.sex && <span>{c.sex}</span>}
                          {c.birthWeight && <span>{c.sex ? " · " : ""}{c.birthWeight} lbs at birth</span>}
                        </div>
                        {(c.dob || c.weaningDate) && (
                          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                            {c.dob && <span>Born {fmt(c.dob)}</span>}
                            {c.weaningDate && <span>{c.dob ? " · " : ""}Wean {fmt(c.weaningDate)}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {showOffspringForm && (
                  <Card style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      Add Offspring
                    </div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <Input
                        label="Offspring Name"
                        value={offspringForm.name}
                        onChange={e => setOffspringForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Bessie Jr"
                      />
                      <Input
                        label="Tag / ID"
                        value={offspringForm.tag}
                        onChange={e => setOffspringForm(p => ({ ...p, tag: e.target.value }))}
                        placeholder="e.g. 2043"
                      />
                      <Select
                        label="Sex"
                        value={offspringForm.sex}
                        onChange={e => setOffspringForm(p => ({ ...p, sex: e.target.value }))}
                      >
                        <option value="">— Select —</option>
                        <option>Female</option>
                        <option>Male</option>
                        <option>Steer</option>
                      </Select>
                      <Select
                        label="Species"
                        value={offspringForm.species || a.species}
                        onChange={e => setOffspringForm(p => ({ ...p, species: e.target.value }))}
                      >
                        {Object.keys(SPECIES).map(s => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                      <Input
                        label="Birth Weight (lbs)"
                        type="number"
                        value={offspringForm.birthWeight}
                        onChange={e => setOffspringForm(p => ({ ...p, birthWeight: e.target.value }))}
                        placeholder="e.g. 85"
                      />
                      <Input
                        label="Birthday"
                        type="date"
                        value={offspringForm.dob}
                        onChange={e => setOffspringForm(p => ({ ...p, dob: e.target.value }))}
                      />
                      <Input
                        label="Target Weaning Date"
                        type="date"
                        value={offspringForm.weaningDate}
                        onChange={e => setOffspringForm(p => ({ ...p, weaningDate: e.target.value }))}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                      <Btn size="sm" onClick={saveOffspring}>Save Offspring</Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowOffspringForm(false);
                          setOffspringForm({
                            name: "",
                            tag: "",
                            sex: "",
                            species: "",
                            birthWeight: "",
                            dob: "",
                            weaningDate: "",
                          });
                        }}
                      >
                        Cancel
                      </Btn>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Vaccination Records — all animals */}
            <div style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Vaccination Records
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingVaccinationId(null);
                    setShowVaccinationForm(true);
                    setVaccinationForm({
                      vaccineName: "",
                      dateGiven: "",
                      nextDueDate: "",
                      administeredBy: "Owner",
                      notes: "",
                    });
                  }}
                >
                  Add Vaccination
                </Btn>
              </div>

              {vaccinationsSorted.length === 0 && !showVaccinationForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No vaccinations recorded for this animal.</p>
              )}

              {vaccinationsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {vaccinationsSorted.map(v => (
                    <div key={v.id} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{v.vaccineName || "Unnamed vaccine"}</div>
                        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                          <Btn size="sm" variant="ghost" onClick={() => { setEditingVaccinationId(v.id); setVaccinationForm({ vaccineName: v.vaccineName || "", dateGiven: v.dateGiven || "", nextDueDate: v.nextDueDate || "", administeredBy: v.administeredBy || "Owner", notes: v.notes || "" }); setShowVaccinationForm(true); }}>Edit</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => deleteVaccination(v.id)}>Delete</Btn>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {v.dateGiven && <span>Given {fmt(v.dateGiven)}</span>}
                        {v.nextDueDate && <span>{v.dateGiven ? " · " : ""}Next due {fmt(v.nextDueDate)}</span>}
                        {v.administeredBy && <span>{v.dateGiven || v.nextDueDate ? " · " : ""}{v.administeredBy}</span>}
                      </div>
                      {v.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "6px" }}>{v.notes}</div>}
                    </div>
                  ))}
                </div>
              )}

              {showVaccinationForm && (
                <Card style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                    {editingVaccinationId ? "Edit Vaccination" : "Add Vaccination"}
                  </div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input
                      label="Vaccine name"
                      value={vaccinationForm.vaccineName}
                      onChange={e => setVaccinationForm(p => ({ ...p, vaccineName: e.target.value }))}
                      placeholder="e.g. Clostridial 7-way"
                    />
                    <Input
                      label="Date given"
                      type="date"
                      value={vaccinationForm.dateGiven}
                      onChange={e => setVaccinationForm(p => ({ ...p, dateGiven: e.target.value }))}
                    />
                    <Input
                      label="Next due date"
                      type="date"
                      value={vaccinationForm.nextDueDate}
                      onChange={e => setVaccinationForm(p => ({ ...p, nextDueDate: e.target.value }))}
                    />
                    <Select
                      label="Administered by"
                      value={vaccinationForm.administeredBy}
                      onChange={e => setVaccinationForm(p => ({ ...p, administeredBy: e.target.value }))}
                    >
                      <option>Owner</option>
                      <option>Vet</option>
                    </Select>
                  </div>
                  <Textarea
                    label="Notes"
                    value={vaccinationForm.notes}
                    onChange={e => setVaccinationForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Btn size="sm" onClick={saveVaccination}>{editingVaccinationId ? "Save Changes" : "Save Vaccination"}</Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowVaccinationForm(false);
                        setEditingVaccinationId(null);
                        setVaccinationForm({
                          vaccineName: "",
                          dateGiven: "",
                          nextDueDate: "",
                          administeredBy: "Owner",
                          notes: "",
                        });
                      }}
                    >
                      Cancel
                    </Btn>
                  </div>
                </Card>
              )}
            </div>

            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="danger" size="sm" onClick={() => remove(a.id)}>Remove Animal</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const deceasedCount = animals.filter(a => a.deceased).length;

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => { setEditingId(null); setShowAdd(true); }}>+ Register Animal</Btn>}>
        Animal Register
      </SectionTitle>

      {/* Show/hide deceased + Search */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        {deceasedCount > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={showDeceasedAnimals} onChange={e => setShowDeceasedAnimals(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            Show deceased animals ({deceasedCount})
          </label>
        )}
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <Input placeholder="Search by name, species, or tag..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>New Animal</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
            <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
            <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
            <Select label="Species" value={form.species} onChange={e => setForm(p => ({ ...p, species: e.target.value }))}>
              {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
            </Select>
            <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
              <option>Female</option><option>Male</option><option>Wether/Steer</option>
            </Select>
            <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Register</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!filtered.length && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🐄</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>{search ? "No animals match your search." : "No animals registered yet."}</div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
        {filtered.map(a => (
          <Card key={a.id} style={{ padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s", position: "relative", overflow: "hidden" }}
            onClick={() => setViewing(a)}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.transform = ""; }}
          >
            {a.deceased && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none" }}>
                  <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <span style={{ fontSize: "28px" }}>{SPECIES[a.species]?.emoji}</span>
              {a.name && a.tag && !a.deceased && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>#{a.tag}</span>}
            </div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "2px" }}>{getAnimalName(a)}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{a.breed || a.species} · {displaySex(a)}</div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>{ageFromDob(a.dob)}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Gestation ─────────────────────────────────────────────────────────────────
function Gestation({ animals, setAnimals, gestations, setGestations, user }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
  const [showCalfForm, setShowCalfForm] = useState(false);
  const [deliveringId, setDeliveringId] = useState(null);
  const [calfForm, setCalfForm] = useState({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "" });

  const females = animals.filter(a => a.sex === "Female" || !a.sex);

  function add() {
    const start = form.breedingDate;
    const end = form.runningWithBull ? form.breedingDateEnd : form.breedingDate;
    if (!form.animalId || !start || (form.runningWithBull && !end)) return;
    const animal = animals.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const dueStart = dueDate(start, totalDays);
    const dueEnd = form.runningWithBull ? dueDate(end, totalDays) : dueStart;
    const record = {
      animalId: form.animalId,
      breedingDate: start,
      ...(form.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
      dueDate: dueStart,
      ...(form.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
      sire: form.sire,
      notes: form.notes,
      id: Date.now().toString(),
      gestationDays: totalDays,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    setGestations(p => [...p, record]);
    setForm({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
    setShowAdd(false);
  }

  function markDelivered(id) {
    setDeliveringId(id);
    setShowCalfForm(true);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "" });
  }

  function saveCalfRecord(gestationId) {
    const calfData = {
      name: calfForm.name || undefined,
      tag: calfForm.tag || undefined,
      sex: calfForm.sex || undefined,
      birthWeight: calfForm.birthWeight ? parseFloat(calfForm.birthWeight) : undefined,
      weaningDate: calfForm.weaningDate || undefined,
      recordedAt: new Date().toISOString(),
    };
    const g = gestations.find(x => x.id === gestationId);
    const mother = g ? animals.find(m => m.id === g.animalId) : null;
    if (mother) {
      const newAnimal = {
        id: Date.now().toString(),
        name: calfForm.name || undefined,
        tag: calfForm.tag || undefined,
        sex: calfForm.sex || undefined,
        species: mother.species,
        dob: undefined,
        breed: mother.breed || undefined,
        notes: undefined,
        motherId: mother.id,
      };
      setAnimals(prev => [...prev, newAnimal]);
    }
    setGestations(p => p.map(g =>
      g.id === gestationId
        ? { ...g, status: "Delivered", deliveredAt: g.deliveredAt || new Date().toISOString(), calf: calfData }
        : g
    ));
    setShowCalfForm(false);
    setDeliveringId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "" });
  }

  function skipCalfRecord() {
    if (deliveringId) {
      setGestations(p => p.map(g => 
        g.id === deliveringId 
          ? { ...g, status: "Delivered", deliveredAt: g.deliveredAt || new Date().toISOString() }
          : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "" });
  }

  function remove(id) {
    if (!confirm("Remove this breeding record?")) return;
    setGestations(p => p.filter(g => g.id !== id));
  }

  const active = gestations.filter(g => g.status !== "Delivered");
  const delivered = gestations.filter(g => g.status === "Delivered");

  return (
    <div className="hl-page hl-page-gestation hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Log Breeding</Btn>}>
        Gestation Ledger
      </SectionTitle>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
          {!females.length && <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "12px" }}>No female animals registered. Add animals first.</p>}
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Dam) *" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— Select —</option>
              {females.filter(a => a.species !== "Mule").map(a => <option key={a.id} value={a.id}>{getAnimalName(a)} ({a.species})</option>)}
            </Select>
            {!form.runningWithBull ? (
              <Input label="Breeding Date *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
            ) : (
              <>
                <Input label="Exposure start *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
                <Input label="Exposure end *" type="date" value={form.breedingDateEnd} onChange={e => setForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
              </>
            )}
            <Input label="Sire (optional)" value={form.sire} onChange={e => setForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
            <input type="checkbox" checked={form.runningWithBull} onChange={e => setForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            <span>Running with Bull (date range for bull exposure)</span>
          </label>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          {form.animalId && form.breedingDate && (form.runningWithBull ? form.breedingDateEnd : true) && (() => {
            const a = animals.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            if (!days) return null;
            const start = dueDate(form.breedingDate, days);
            const end = form.runningWithBull && form.breedingDateEnd ? dueDate(form.breedingDateEnd, days) : start;
            const dueStr = form.runningWithBull && form.breedingDateEnd ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
            return (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Record</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showCalfForm && deliveringId && (() => {
        const g = gestations.find(x => x.id === deliveringId);
        const animal = animals.find(a => a.id === g?.animalId);
        return (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>
              Add Calf Record (Optional)
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "18px" }}>
              Record details for the calf born to <strong>{getAnimalName(animal)}</strong>
            </div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label="Calf Name" value={calfForm.name} onChange={e => setCalfForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie Jr" />
              <Input label="Tag / ID" value={calfForm.tag} onChange={e => setCalfForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1043" />
              <Select label="Sex" value={calfForm.sex} onChange={e => setCalfForm(p => ({ ...p, sex: e.target.value }))}>
                <option value="">— Select —</option>
                <option>Female</option>
                <option>Male</option>
                <option>Steer</option>
              </Select>
              <Input label="Birth Weight (lbs)" type="number" value={calfForm.birthWeight} onChange={e => setCalfForm(p => ({ ...p, birthWeight: e.target.value }))} placeholder="e.g. 85" />
              <Input label="Target Weaning Date" type="date" value={calfForm.weaningDate} onChange={e => setCalfForm(p => ({ ...p, weaningDate: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={() => saveCalfRecord(deliveringId)}>Save Calf Record</Btn>
              <Btn variant="secondary" onClick={skipCalfRecord}>Skip</Btn>
            </div>
          </Card>
        );
      })()}

      {!active.length && !showAdd && !showCalfForm && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📅</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No active breeding records.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {active.map(g => {
          const animal = animals.find(a => a.id === g.animalId);
          const dueD = daysUntilDue(g);
          const pct = progress(breedingDateForProgress(g), g.gestationDays);
          const overdue = isOverdue(g);
          const urgent = dueD.isRange ? (dueD.start <= 7 && dueD.end >= 0) : (dueD.start >= 0 && dueD.start <= 7);
          const badgeText = overdue
            ? (dueD.isRange ? "Overdue" : `${Math.abs(dueD.start)}d overdue`)
            : dueD.isRange
              ? (dueD.start === dueD.end ? (dueD.start === 0 ? "Due today" : `${dueD.start} days`) : `${dueD.start}–${dueD.end} days`)
              : (dueD.start === 0 ? "Due today" : `${dueD.start} days`);
          return (
            <Card key={g.id} className="hl-gestation-card" style={{ padding: "20px 24px", borderLeft: `4px solid ${overdue ? "var(--danger2)" : urgent ? "var(--brass)" : "var(--green3)"}` }}>
              <div className="hl-gestation-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "28px" }}>{SPECIES[animal?.species]?.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{getAnimalName(animal)}</div>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {animal?.species}{g.sire ? ` × ${g.sire}` : ""} · {g.runningWithBull ? `Exposure ${fmt(g.breedingDate)} – ${fmt(g.breedingDateEnd)}` : `Bred ${fmt(g.breedingDate)}`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge color={overdue ? "var(--danger2)" : urgent ? "var(--brass2)" : "var(--green3)"}>
                    {badgeText}
                  </Badge>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Due {fmtDueRange(g)}</div>
                </div>
              </div>
              <div style={{ marginBottom: "6px" }}>
                <ProgressBar value={pct} color={overdue ? "var(--danger2)" : "var(--green3)"} height={8} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
                <span>{Math.round(pct)}% complete</span>
                <span>{g.gestationDays} day gestation{g.runningWithBull ? " (range)" : ""}</span>
              </div>
              {g.notes && <p style={{ fontSize: "13px", color: "var(--ink2)", fontStyle: "italic", marginBottom: "12px" }}>{g.notes}</p>}
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn size="sm" onClick={() => markDelivered(g.id)}>✓ Mark Delivered</Btn>
                <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>Remove</Btn>
              </div>
            </Card>
          );
        })}
      </div>

      {delivered.length > 0 && (
        <>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, color: "var(--muted)", marginBottom: "12px" }}>Delivered Records</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {delivered.map(g => {
              const animal = animals.find(a => a.id === g.animalId);
              const hasCalf = g.calf && (g.calf.name || g.calf.tag || g.calf.sex || g.calf.birthWeight || g.calf.weaningDate);
              return (
                <Card key={g.id} className="hl-delivered-row" style={{ padding: "14px 20px", opacity: 0.65 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasCalf ? "10px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>{SPECIES[animal?.species]?.emoji}</span>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(animal)}</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{animal?.species}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Badge color="var(--green)">Delivered</Badge>
                      <span style={{ fontSize: "13px", color: "var(--muted)" }}>Due {fmtDueRange(g)}</span>
                      {!hasCalf && (
                        <Btn size="sm" onClick={() => { setDeliveringId(g.id); setShowCalfForm(true); setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "" }); }}>
                          Add Calf Record
                        </Btn>
                      )}
                      <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                    </div>
                  </div>
                  {hasCalf && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>Calf Record</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "13px" }}>
                      {g.calf.name && <div><span style={{ color: "var(--muted)" }}>Name:</span> <strong>{g.calf.name}</strong></div>}
                      {g.calf.tag && <div><span style={{ color: "var(--muted)" }}>Tag:</span> <strong>#{g.calf.tag}</strong></div>}
                      {g.calf.sex && <div><span style={{ color: "var(--muted)" }}>Sex:</span> <strong>{g.calf.sex}</strong></div>}
                      {g.calf.birthWeight && <div><span style={{ color: "var(--muted)" }}>Birth Weight:</span> <strong>{g.calf.birthWeight} lbs</strong></div>}
                      {g.calf.weaningDate && <div><span style={{ color: "var(--muted)" }}>Weaning:</span> <strong>{fmt(g.calf.weaningDate)}</strong></div>}
                    </div>
                  </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function Notes({ notes, setNotes, user }) {
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function add() {
    if (!newBody.trim()) return;
    setNotes(p => [{ id: Date.now().toString(), title: newTitle || `Entry — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, body: newBody, date: new Date().toISOString() }, ...p]);
    setNewTitle(""); setNewBody(""); setShowAdd(false);
  }

  return (
    <div className="hl-page hl-page-narrow hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ New Entry</Btn>}>
        Farm Journal
      </SectionTitle>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <Input label="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Moved herd to south pasture" style={{ marginBottom: "12px", fontSize: "16px" }} />
          <Textarea label="Entry" value={newBody} onChange={e => setNewBody(e.target.value)} rows={6} placeholder="Record observations, treatments, purchases, or anything worth noting..." />
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Save Entry</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!notes.length && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📖</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>The journal awaits your first entry.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {notes.map(n => (
          <Card key={n.id} style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{n.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>{fmt(n.date.split("T")[0])}</span>
                <Btn size="sm" variant="ghost" onClick={() => setNotes(p => p.filter(x => x.id !== n.id))}>×</Btn>
              </div>
            </div>
            <div style={{ height: "1px", background: "var(--cream2)", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", lineHeight: 1.8, color: "var(--ink2)", whiteSpace: "pre-wrap" }}>{n.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
const USER_DATA_KEYS = ["animals", "gestations", "notes", "offspring"];
const GUEST_STORAGE_KEY = "herd_ledger_guest_data";
const GUEST_USER = { id: "guest", isGuest: true };

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [animals, setAnimals] = useState([]);
  const [gestations, setGestations] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offspring, setOffspring] = useState({});
  const initialLoadDone = useRef(false);

  const isGuest = user?.isGuest === true;
  const moon = getMoonPhase();
  const season = getSeason();

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(prev => {
        if (session?.user) return session.user;
        if (prev?.isGuest) return prev;
        return null;
      });
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAnimals([]);
      setGestations([]);
      setNotes([]);
      setOffspring({});
      initialLoadDone.current = false;
      return;
    }
    if (user.isGuest) {
      initialLoadDone.current = false;
      try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        setAnimals(Array.isArray(data.animals) ? data.animals : []);
        setGestations(Array.isArray(data.gestations) ? data.gestations : []);
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        setOffspring(data.offspring && typeof data.offspring === "object" ? data.offspring : {});
      } catch (_) {
        setAnimals([]);
        setGestations([]);
        setNotes([]);
        setOffspring({});
      }
      initialLoadDone.current = true;
      return;
    }
    initialLoadDone.current = false;
    supabase
      .from("user_data")
      .select("key, data")
      .eq("user_id", user.id)
      .in("key", USER_DATA_KEYS)
      .then(({ data: rows, error }) => {
        if (error) return;
        const byKey = (rows || []).reduce((acc, r) => { acc[r.key] = r.data; return acc; }, {});
        setAnimals(Array.isArray(byKey.animals) ? byKey.animals : []);
        setGestations(Array.isArray(byKey.gestations) ? byKey.gestations : []);
        setNotes(Array.isArray(byKey.notes) ? byKey.notes : []);
        setOffspring(byKey.offspring && typeof byKey.offspring === "object" ? byKey.offspring : {});
        initialLoadDone.current = true;
      });
  }, [user]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "animals", data: animals }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, animals]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "gestations", data: gestations }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, gestations]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "notes", data: notes }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, notes]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "offspring", data: offspring }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, offspring]);

  if (user === null) {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      return <ResetPasswordPage />;
    }
    return <Auth onLogin={() => {}} onContinueAsGuest={() => setUser(GUEST_USER)} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      {isGuest && (
        <div style={{ background: "#1B3A2B", color: "rgba(255,255,255,0.9)", fontSize: "13px", padding: "10px 20px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
          <span>You're using guest mode — your data is saved on this device only.</span>
          <button type="button" onClick={() => setUser(null)} style={{ background: "none", border: "none", color: "var(--brass3)", textDecoration: "underline", cursor: "pointer", fontWeight: 600 }}>Sign up</button>
          <span>to sync across devices.</span>
        </div>
      )}
      <Nav tab={tab} setTab={setTab} />
      {tab === "dashboard" && <Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} />}
      {tab === "animals"   && <Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} />}
      {tab === "gestation" && <Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} />}
      {tab === "notes"     && <Notes notes={notes} setNotes={setNotes} user={user} />}
    </div>
  );
}
