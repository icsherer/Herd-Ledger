import { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Auth, { ResetPasswordPage } from "./Auth";

// ── Species Data ──────────────────────────────────────────────────────────────
const SPECIES = {
  Cattle:  { days: 283, emoji: "🐄" },
  Chicken: { days: 21,  emoji: "🐓" },
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

const PASTURE_SPECIES = ["Cattle", "Horse"];

const TREATMENT_TYPES = ["Illness", "Injury", "Medication", "Deworming", "Vitamin/Supplement", "Vet Visit", "Other"];

function getHealthStatus(animal) {
  const treatments = animal?.treatments || [];
  if (treatments.length === 0) return "green";
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const recent = treatments.filter(t => new Date(t.date || 0).getTime() >= thirtyDaysAgo);
  if (recent.some(t => t.type === "Illness")) return "red";
  if (recent.length > 0) return "yellow";
  return "green";
}

const SPECIES_SEX_OPTIONS = {
  Cattle: ["Bull", "Cow", "Heifer", "Steer", "Calf"],
  Chicken: ["Rooster", "Hen", "Pullet", "Capon", "Chick"],
  Horse: ["Stallion", "Mare", "Filly", "Colt", "Gelding"],
  Pig: ["Boar", "Sow", "Gilt", "Barrow", "Piglet"],
  Sheep: ["Ram", "Ewe", "Ewe Lamb", "Wether", "Lamb"],
  Goat: ["Buck", "Doe", "Doeling", "Wether", "Kid"],
  Llama: ["Male", "Female", "Cria"],
  Alpaca: ["Male", "Female", "Cria"],
  Donkey: ["Jack", "Jenny", "Foal", "Gelding"],
  Mule: ["Jack", "Jenny", "Foal", "Gelding"],
  Rabbit: ["Buck", "Doe", "Kitten"],
  Dog: ["Male", "Female"],
  Cat: ["Male", "Female"],
};

const SEX_TERM_GENDER = {
  Bull: "Male", Cow: "Female", Heifer: "Female", Steer: "Male", Calf: "Female",
  Rooster: "Male", Hen: "Female", Pullet: "Female", Capon: "Male", Chick: "Female",
  Stallion: "Male", Mare: "Female", Filly: "Female", Colt: "Male", Gelding: "Male",
  Boar: "Male", Sow: "Female", Gilt: "Female", Barrow: "Male", Piglet: "Female",
  Ram: "Male", Ewe: "Female", "Ewe Lamb": "Female", Wether: "Male", Lamb: "Female",
  Buck: "Male", Doe: "Female", Doeling: "Female", Kid: "Female",
  Male: "Male", Female: "Female", Cria: "Female",
  Jack: "Male", Jenny: "Female", Foal: "Female",
  Kitten: "Female",
};

function getSexOptions(species) {
  return SPECIES_SEX_OPTIONS[species] || SPECIES_SEX_OPTIONS.Cattle;
}

const OFFSPRING_TERM_BY_SPECIES = {
  Cattle: "Calf",
  Horse: "Foal",
  Pig: "Piglet",
  Sheep: "Lamb",
  Goat: "Kid",
  Llama: "Cria",
  Alpaca: "Cria",
  Donkey: "Foal",
  Mule: "Foal",
  Rabbit: "Kitten",
  Dog: "Puppy",
  Cat: "Kitten",
  Chicken: "Chick",
};
function getOffspringTerm(species) {
  return OFFSPRING_TERM_BY_SPECIES[species] || "Offspring";
}

function isFemale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Female";
}

function isMale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Male";
}

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
/** Calf DOB is within expected gestation window: due date (= breeding + gestation days) ± 30 days buffer. */
function birthDateWithinGestationWindow(calfDobStr, g) {
  if (!calfDobStr || !g) return false;
  const calf = new Date(calfDobStr + "T12:00:00").getTime();
  const day = 86400000;
  const margin = 30 * day;
  if (g.dueDateStart && g.dueDateEnd) {
    const start = new Date(g.dueDateStart + "T12:00:00").getTime() - margin;
    const end = new Date(g.dueDateEnd + "T12:00:00").getTime() + margin;
    return calf >= start && calf <= end;
  }
  const due = new Date((g.dueDate || "").split("T")[0] + "T12:00:00").getTime();
  return Math.abs(calf - due) <= margin;
}
function breedingDateFromDelivery(deliveryDateStr, gestationDays) {
  const d = new Date(deliveryDateStr + "T12:00:00");
  d.setDate(d.getDate() - (gestationDays || 283));
  return d.toISOString().split("T")[0];
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
  Chicken: "Capon",
  Pig: "Barrow",
  Sheep: "Wether",
  Goat: "Wether",
  Horse: "Gelding",
  Donkey: "Gelding",
  Mule: "Gelding",
};

const FEMALE_MAIDEN_BY_SPECIES = {
  Cattle: "Heifer",
  Chicken: "Pullet",
  Pig: "Gilt",
  Sheep: "Ewe Lamb",
  Goat: "Doeling",
};

const FEMALE_BRED_BY_SPECIES = {
  Cattle: "Cow",
  Chicken: "Hen",
  Pig: "Sow",
  Sheep: "Ewe",
  Goat: "Doe",
};

function displaySex(animal, gestations) {
  if (!animal) return "—";
  if (animal.castration && isMale(animal)) {
    return CASTRATED_TERM_BY_SPECIES[animal.species] ?? "Castrated";
  }
  if (isFemale(animal)) {
    const hasBreedingRecord = gestations?.some(g => g.animalId === animal.id);
    if (hasBreedingRecord) {
      return FEMALE_BRED_BY_SPECIES[animal.species] ?? animal.sex ?? "Female";
    }
    return FEMALE_MAIDEN_BY_SPECIES[animal.species] ?? animal.sex ?? "Female";
  }
  return animal.sex || "—";
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

  /* Date/time inputs: single-tap to open picker on mobile, no double-tap */
  input[type="date"],
  input[type="datetime-local"],
  input[type="time"] {
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    min-height: 44px;
  }

  .hl-fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--cream2); }
  ::-webkit-scrollbar-thumb { background: var(--cream3); border-radius: 3px; }

  /* Print: hide nav and interactive UI, show only print-only content */
  .print-only { display: none !important; }
  @media print {
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    body { background: #fff; }
    .hl-print-root { background: #fff; color: #141A14; padding: 0; max-width: none; }
  }
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({ children, style = {}, className = "", ...rest }) {
  return (
    <div className={`hl-card ${className}`.trim()} style={{
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

function Input({ label, type, style = {}, ...props }) {
  const isDateOrTime = type === "date" || type === "datetime-local" || type === "time";
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        type={type ?? "text"}
        {...props}
        className="hl-input"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          transition: "border-color 0.15s",
          minHeight: "44px",
          ...(isDateOrTime && {
            touchAction: "manipulation",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }),
          ...style,
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
      <select {...props} className="hl-select" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        minHeight: "44px",
        ...props.style,
      }}>{children}</select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <textarea {...props} className="hl-textarea" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        resize: "vertical",
        minHeight: "44px",
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
function Nav({ tab, setTab, hideGestationTab, settings }) {
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const tabs = [
    ...(visibility.dashboard !== false ? [{ id: "dashboard", label: "Dashboard", icon: "⊞" }] : []),
    ...(visibility.animals !== false ? [{ id: "animals", label: "Animals", icon: "🐄" }] : []),
    ...(visibility.gestation !== false && !hideGestationTab ? [{ id: "gestation", label: "Gestation", icon: "📅" }] : []),
    ...(visibility.feeder !== false ? [{ id: "feeder", label: "Feeder Cattle", icon: "🌾" }] : []),
    ...(visibility.pastures !== false ? [{ id: "pastures", label: "Pastures", icon: "🟩" }] : []),
    ...(visibility.notes !== false ? [{ id: "notes", label: "Journal", icon: "📖" }] : []),
    { id: "settings", label: "Settings", icon: "⚙" },
  ];
  return (
    <header className="no-print" style={{ background: "var(--green)", borderBottom: "3px solid var(--brass)" }}>
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
            className="hl-nav-tab"
            >
              <span className="hl-nav-tab-icon" style={{ fontSize: "16px" }}>{t.icon}</span>
              <span className="hl-nav-tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ animals, gestations, offspring, moon, season, user, setTab, setAnimalsSearch }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];

  const activeAnimals = animals.filter(a => !a.deceased && !a.sale);
  const deceasedCount = animals.filter(a => a.deceased).length;
  const soldCount = animals.filter(a => a.sale).length;
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
          { label: "Total Animals", value: activeAnimals.length, sub: `${Object.keys(speciesCounts).length} species${deceasedCount > 0 ? ` · ${deceasedCount} deceased` : ""}${soldCount > 0 ? ` · ${soldCount} sold` : ""}`, icon: "🐄", onClick: () => { setAnimalsSearch?.(""); setTab?.("animals"); } },
          { label: "Expecting",     value: activeGestations.length, sub: "active pregnancies", icon: "📅", onClick: () => setTab?.("gestation") },
          { label: "Due This Month",value: upcoming.length, sub: overdue.length > 0 ? `${overdue.length} overdue` : "none overdue", icon: "⚠️", alert: overdue.length > 0, onClick: () => setTab?.("gestation") },
          {
            label: "Next Weaning",
            value: nextWeaning ? nextWeaning.days : "—",
            sub: nextWeaning ? nextWeaning.name : "none scheduled",
            icon: "🥛",
          },
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
            <div className="hl-dash-stat-value" style={{ fontFamily: s.large ? "inherit" : "'Playfair Display'", fontSize: s.large ? "32px" : "30px", fontWeight: 700, color: s.alert ? "var(--danger2)" : "var(--green)", lineHeight: 1, marginBottom: "4px" }}>{s.value}</div>
            <div className="hl-dash-stat-sub" style={{ fontSize: "12px", color: s.alert ? "var(--danger2)" : "var(--muted)" }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="hl-dash-columns">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Overdue alerts */}
          {overdue.length > 0 && (
            <Card className="hl-card-no-padding" style={{ borderLeft: "4px solid var(--danger2)", padding: "0" }}>
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
            <Card className="hl-card-no-padding" style={{ padding: "0" }}>
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
            const byPasture = {};
            pastureAnimals.forEach(a => {
              const p = a.movements?.[0]?.pastureName?.trim() || "—";
              byPasture[p] = (byPasture[p] || 0) + 1;
            });
            return (
              <Card style={{ padding: "20px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Pasture Summary</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {Object.entries(byPasture)
                    .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b)))
                    .map(([pastureName, n]) => (
                      <div key={pastureName} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "14px", color: pastureName === "—" ? "var(--muted)" : "var(--ink2)" }}>{pastureName === "—" ? "Not in pasture" : pastureName}</span>
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

// ── Animals ───────────────────────────────────────────────────────────────────
function Animals({ animals, setAnimals, offspring, setOffspring, gestations, setGestations, user, viewingAnimal, setViewingAnimal, search: searchProp, setSearch: setSearchProp, defaultSpecies = "Cattle", feederPrograms, setTab, setFeederPreselectAnimalId, setFeederBulkAnimalIds }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => {
    const sp = defaultSpecies || "Cattle";
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", currentPasture: "" };
  });
  const viewing = viewingAnimal;
  const setViewing = setViewingAnimal;
  const [searchLocal, setSearchLocal] = useState("");
  const search = searchProp !== undefined ? searchProp : searchLocal;
  const setSearch = setSearchProp !== undefined ? setSearchProp : setSearchLocal;
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [editingOffspringId, setEditingOffspringId] = useState(null);
  const [offspringForm, setOffspringForm] = useState({
    name: "",
    tag: "",
    sex: "",
    species: "",
    birthWeight: "",
    dob: "",
    weaningDate: "",
    stillborn: false,
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
  const [showDeceasedAnimals, setShowDeceasedAnimals] = useState(false);
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [breedingForm, setBreedingForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ pastureName: "", dateMovedIn: "", notes: "" });
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight: "", date: "", notes: "" });
  const [showTreatmentForm, setShowTreatmentForm] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkFormType, setBulkFormType] = useState(null);
  const [bulkForm, setBulkForm] = useState({});
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleForm, setSaleForm] = useState({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" });

  const emptyForm = () => {
    const sp = defaultSpecies || "Cattle";
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", currentPasture: "" };
  };

  function add() {
    if (!form.name) return;
    const { currentPasture, ...rest } = form;
    const newAnimal = { ...rest, id: Date.now().toString() };
    if (currentPasture?.trim() && PASTURE_SPECIES.includes(form.species)) {
      newAnimal.movements = [{ pastureName: currentPasture.trim(), dateMovedIn: new Date().toISOString().split("T")[0] }];
    }
    setAnimals(p => [...p, newAnimal]);
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
    setGestations(p =>
      p
        .filter(g => g.animalId !== id)
        .map(g => (g.calf?.animalId === id ? { ...g, calf: undefined } : g))
    );
    setOffspring(prev => {
      const next = { ...prev };
      delete next[id];
      return Object.fromEntries(
        Object.entries(next)
          .map(([motherId, list]) => [motherId, (list || []).filter(c => c.id !== id)])
          .filter(([, list]) => list.length > 0)
      );
    });
  }

  const filtered = animals.filter(a => {
    const matchesSearch = getAnimalName(a).toLowerCase().includes(search.toLowerCase()) || a.species.toLowerCase().includes(search.toLowerCase());
    const showByDeceased = showDeceasedAnimals ? true : !a.deceased;
    return matchesSearch && showByDeceased;
  });

  if (viewing) {
    const a = viewing;
    const offspringForMother = (offspring && offspring[a.id]) || [];

    function deleteOffspring(offspringId) {
      const rec = offspringForMother.find(c => c.id === offspringId);
      const hadAnimal = rec && !rec.stillborn;
      const term = getOffspringTerm(a.species);
      if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this ${term.toLowerCase()} record?`)) return;
      setOffspring(prev => {
        const base = prev || {};
        const list = (base[a.id] || []).filter(c => c.id !== offspringId);
        return { ...base, [a.id]: list };
      });
      if (hadAnimal) setAnimals(prev => prev.filter(an => an.id !== offspringId));
    }

    function saveOffspring() {
      const isEdit = !!editingOffspringId;
      const stillborn = !!offspringForm.stillborn;
      const rec = {
        id: isEdit ? editingOffspringId : Date.now().toString(),
        motherId: a.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: offspringForm.sex || undefined,
        species: offspringForm.species || a.species,
        birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
        dob: offspringForm.dob || undefined,
        weaningDate: offspringForm.weaningDate || undefined,
        stillborn,
        createdAt: isEdit ? (offspringForMother.find(c => c.id === editingOffspringId)?.createdAt) : new Date().toISOString(),
      };
      const prevRec = isEdit ? offspringForMother.find(c => c.id === editingOffspringId) : null;
      if (isEdit && prevRec && !prevRec.stillborn && stillborn) {
        setAnimals(prev => prev.filter(an => an.id !== editingOffspringId));
      }
      setOffspring(prev => {
        const base = prev || {};
        const list = base[a.id] || [];
        if (isEdit) {
          return { ...base, [a.id]: list.map(c => c.id === editingOffspringId ? rec : c) };
        }
        return { ...base, [a.id]: [...list, rec] };
      });
      if (!stillborn) {
        const updatedAnimal = {
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
        if (isEdit) {
          setAnimals(prev => prev.map(an => an.id === editingOffspringId ? { ...an, ...updatedAnimal } : an));
        } else {
          setAnimals(prev => [...prev, updatedAnimal]);
        }
      }
      if (rec.dob) {
        const calfData = {
          name: offspringForm.name || undefined,
          tag: offspringForm.tag || undefined,
          sex: offspringForm.sex || undefined,
          birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
          weaningDate: offspringForm.weaningDate || undefined,
          stillborn,
          recordedAt: new Date().toISOString(),
          ...(!stillborn && { animalId: rec.id }),
        };
        const activeForMother = gestations.filter(g => g.animalId === a.id && g.status !== "Delivered");
        const matching = activeForMother.find(g => birthDateWithinGestationWindow(rec.dob, g));
        if (matching) {
          setGestations(prev => prev.map(gr =>
            gr.id === matching.id
              ? { ...gr, status: "Delivered", deliveredAt: rec.dob, calf: calfData }
              : gr
          ));
        } else if (activeForMother.length === 0) {
          const gestationDays = SPECIES[a.species]?.days ?? 283;
          const breedingDate = breedingDateFromDelivery(rec.dob, gestationDays);
          const newGestation = {
            id: Date.now().toString(),
            animalId: a.id,
            breedingDate,
            dueDate: rec.dob,
            gestationDays,
            status: "Delivered",
            deliveredAt: rec.dob,
            calf: calfData,
            createdAt: new Date().toISOString(),
          };
          setGestations(prev => [...prev, newGestation]);
        }
      }
      setShowOffspringForm(false);
      setEditingOffspringId(null);
      setOffspringForm({
        name: "",
        tag: "",
        sex: "",
        species: "",
        birthWeight: "",
        dob: "",
        weaningDate: "",
        stillborn: false,
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

    function saveSale() {
      const saleRec = {
        dateSold: saleForm.dateSold || undefined,
        pricePerHead: saleForm.pricePerHead?.trim() ? parseFloat(saleForm.pricePerHead) : undefined,
        buyerName: saleForm.buyerName?.trim() || undefined,
        buyerContact: saleForm.buyerContact?.trim() || undefined,
        saleLocation: saleForm.saleLocation?.trim() || undefined,
        notes: saleForm.notes?.trim() || undefined,
      };
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, sale: saleRec } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, sale: saleRec } : prev
      );
      setShowSaleForm(false);
      setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" });
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

    function saveMove() {
      const move = {
        pastureName: moveForm.pastureName?.trim() || undefined,
        dateMovedIn: moveForm.dateMovedIn || undefined,
        notes: moveForm.notes?.trim() || undefined,
      };
      const nextMovements = [move, ...(a.movements || [])];
      const updated = { ...a, movements: nextMovements };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowMoveForm(false);
      setMoveForm({ pastureName: "", dateMovedIn: "", notes: "" });
    }

    function saveWeight() {
      const w = parseFloat(weightForm.weight);
      if (!weightForm.date || isNaN(w) || w <= 0) return;
      const entry = { id: Date.now().toString(), weight: w, date: weightForm.date, notes: weightForm.notes?.trim() || undefined };
      const nextWeights = [...(a.weights || []), entry].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
      const updated = { ...a, weights: nextWeights };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowWeightForm(false);
      setWeightForm({ weight: "", date: "", notes: "" });
    }

    function deleteWeightEntry(entryId) {
      const nextWeights = (a.weights || []).filter(e => e.id !== entryId);
      const updated = { ...a, weights: nextWeights };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
    }

    const weightsSorted = [...(a.weights || [])].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
    const firstWeight = weightsSorted[0];
    const lastWeight = weightsSorted[weightsSorted.length - 1];
    const daysBetween = firstWeight && lastWeight && firstWeight !== lastWeight && firstWeight.date && lastWeight.date
      ? Math.max(1, (new Date(lastWeight.date) - new Date(firstWeight.date)) / 86400000)
      : 0;
    const adg = daysBetween > 0 && firstWeight && lastWeight ? (lastWeight.weight - firstWeight.weight) / daysBetween : null;
    const trend = adg === null ? "flat" : adg > 0 ? "up" : adg < 0 ? "down" : "flat";

    function saveTreatment() {
      if (!treatmentForm.date || !treatmentForm.type) return;
      const entry = {
        id: Date.now().toString(),
        date: treatmentForm.date,
        type: treatmentForm.type,
        description: treatmentForm.description?.trim() || undefined,
        treatmentGiven: treatmentForm.treatmentGiven?.trim() || undefined,
        dosage: treatmentForm.dosage?.trim() || undefined,
        administeredBy: treatmentForm.administeredBy || "Owner",
        cost: treatmentForm.cost?.trim() ? parseFloat(treatmentForm.cost) : undefined,
        notes: treatmentForm.notes?.trim() || undefined,
      };
      const nextTreatments = [...(a.treatments || []), entry].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      const updated = { ...a, treatments: nextTreatments };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowTreatmentForm(false);
      setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" });
    }

    function deleteTreatmentEntry(entryId) {
      const nextTreatments = (a.treatments || []).filter(e => e.id !== entryId);
      const updated = { ...a, treatments: nextTreatments };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
    }

    const treatmentsSorted = [...(a.treatments || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));

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
      <>
      <div className="no-print hl-page hl-page-narrow hl-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => { setViewing(null); setEditingId(null); }} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            ← Back to Animals
          </button>
          {editingId !== a.id && (
            <Btn onClick={() => {
                const species = a.species || "Cattle";
                const opts = getSexOptions(species);
                const sex = opts.includes(a.sex) ? a.sex : (SEX_TERM_GENDER[a.sex] === "Female" ? opts.find(o => SEX_TERM_GENDER[o] === "Female") : opts.find(o => SEX_TERM_GENDER[o] === "Male")) || opts[0];
                setEditingId(a.id);
                setForm({ name: a.name || "", species, sex: sex || opts[0], dob: a.dob || "", breed: a.breed || "", tag: a.tag || "", notes: a.notes || "" });
              }}>Edit</Btn>
          )}
        </div>

        {editingId === a.id && (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Edit Animal</div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
              <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
              <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
              <Select label="Species" value={form.species} onChange={e => {
                const newSpecies = e.target.value;
                const opts = getSexOptions(newSpecies);
                setForm(p => ({ ...p, species: newSpecies, sex: opts.includes(p.sex) ? p.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]) }));
              }}>
                {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
              </Select>
              <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
                {getSexOptions(form.species).map(opt => <option key={opt}>{opt}</option>)}
              </Select>
              <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
            </div>
            <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={saveEdit}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Cancel</Btn>
            </div>
          </Card>
        )}

        <Card className="hl-card-no-padding" style={{ padding: "0", overflow: "hidden" }}>
          <div className="hl-detail-header" style={{ background: "var(--green)", padding: "28px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ fontSize: "52px", flexShrink: 0 }}>{SPECIES[a.species]?.emoji}</div>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div className="hl-detail-name" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#fff" }}>{getAnimalName(a)}</div>
              <div className="hl-detail-meta" style={{ color: "var(--brass3)", fontSize: "14px", marginTop: "2px" }}>{a.breed || a.species} · {displaySex(a, gestations)}</div>
            </div>
            <div className="hl-detail-badges" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {a.deceased && <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>}
              {a.sale && <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>}
              {a.tag && a.name && !a.deceased && <Badge color="var(--brass2)">#{a.tag}</Badge>}
            </div>
          </div>
          <div className="hl-profile-content" style={{ padding: "28px 32px" }}>
            <div className="hl-detail-grid" style={{ marginBottom: "24px" }}>
              {[
                ["Species", a.species],
                ["Breed", a.breed || "—"],
                ["Sex", displaySex(a, gestations)],
                ["Date of Birth", fmt(a.dob)],
                ["Tag / ID", a.tag || "—"],
                ...(a.species !== "Mule" && isFemale(a) ? [["Gestation", `${SPECIES[a.species]?.days ?? "—"} days`]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>{k}</div>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Weight Tracking</div>
                <Btn size="sm" variant="secondary" onClick={() => { setShowWeightForm(true); setWeightForm({ weight: "", date: "", notes: "" }); }}>Add Weight</Btn>
              </div>
              {weightsSorted.length > 0 && (adg !== null || trend !== "flat") && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                  {adg !== null && (
                    <span style={{ fontSize: "14px", color: "var(--ink2)" }}>
                      ADG: <strong>{adg >= 0 ? "+" : ""}{adg.toFixed(3)}</strong> lb/day
                      {firstWeight && lastWeight && <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "6px" }}>({firstWeight.weight} → {lastWeight.weight} lb over {Math.round(daysBetween)} days)</span>}
                    </span>
                  )}
                  <span style={{ fontSize: "18px", color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--danger2)" : "var(--muted)" }} title={trend === "up" ? "Gaining" : trend === "down" ? "Losing" : "Stable"}>
                    {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                  </span>
                </div>
              )}
              {showWeightForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Add Weight</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Weight (lbs)" type="number" min="0" step="0.1" value={weightForm.weight} onChange={e => setWeightForm(p => ({ ...p, weight: e.target.value }))} placeholder="e.g. 850" />
                    <Input label="Date" type="date" value={weightForm.date} onChange={e => setWeightForm(p => ({ ...p, date: e.target.value }))} />
                    <Input label="Notes" value={weightForm.notes} onChange={e => setWeightForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveWeight}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowWeightForm(false); setWeightForm({ weight: "", date: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {weightsSorted.length === 0 && !showWeightForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No weight records yet.</p>
              )}
              {weightsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {weightsSorted.map(entry => (
                    <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--cream2)", background: "var(--cream)" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "15px" }}>{entry.weight} lb</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "10px" }}>{fmt(entry.date)}</span>
                        {entry.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "2px" }}>{entry.notes}</div>}
                      </div>
                      <Btn size="sm" variant="ghost" onClick={() => deleteWeightEntry(entry.id)}>×</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Health & Treatment Log</div>
                <Btn size="sm" variant="secondary" onClick={() => { setShowTreatmentForm(true); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Add Treatment</Btn>
              </div>
              {showTreatmentForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Add Treatment</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Date *" type="date" value={treatmentForm.date} onChange={e => setTreatmentForm(p => ({ ...p, date: e.target.value }))} />
                    <Select label="Type *" value={treatmentForm.type} onChange={e => setTreatmentForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="">— Select —</option>
                      {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                    <Input label="Description" value={treatmentForm.description} onChange={e => setTreatmentForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Lameness, respiratory" />
                    <Input label="Treatment given" value={treatmentForm.treatmentGiven} onChange={e => setTreatmentForm(p => ({ ...p, treatmentGiven: e.target.value }))} placeholder="e.g. Penicillin, bandage" />
                    <Input label="Dosage" value={treatmentForm.dosage} onChange={e => setTreatmentForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 5 ml" />
                    <Select label="Administered by" value={treatmentForm.administeredBy} onChange={e => setTreatmentForm(p => ({ ...p, administeredBy: e.target.value }))}>
                      <option>Owner</option>
                      <option>Vet</option>
                    </Select>
                    <Input label="Cost" type="number" min="0" step="0.01" value={treatmentForm.cost} onChange={e => setTreatmentForm(p => ({ ...p, cost: e.target.value }))} placeholder="Optional" />
                  </div>
                  <Textarea label="Notes" value={treatmentForm.notes} onChange={e => setTreatmentForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes" style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveTreatment}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowTreatmentForm(false); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {treatmentsSorted.length === 0 && !showTreatmentForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No treatment records yet.</p>
              )}
              {treatmentsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {treatmentsSorted.map(entry => (
                    <div key={entry.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--cream2)", background: "var(--cream)", marginBottom: "1px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: "14px" }}>{entry.type}</span>
                          <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{fmt(entry.date)}</span>
                          {entry.administeredBy && <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}> · {entry.administeredBy}</span>}
                          {entry.description && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "4px" }}>{entry.description}</div>}
                          {entry.treatmentGiven && <div style={{ fontSize: "13px", marginTop: "2px" }}><strong>Treatment:</strong> {entry.treatmentGiven}{entry.dosage ? ` — ${entry.dosage}` : ""}</div>}
                          {(entry.cost != null && entry.cost !== "") && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>Cost: {`$${Number(entry.cost).toFixed(2)}`}</div>}
                          {entry.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "4px" }}>{entry.notes}</div>}
                        </div>
                        <Btn size="sm" variant="ghost" onClick={() => deleteTreatmentEntry(entry.id)}>×</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {a.motherId && (() => {
              const mother = animals.find(m => m.id === a.motherId);
              const sire = a.sireId ? animals.find(s => s.id === a.sireId) : null;
              const sireName = sire ? getAnimalName(sire) : (a.sireName || null);
              return (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Parentage</div>
                  <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--ink2)" }}>
                      <div>
                        <span style={{ color: "var(--muted)", marginRight: "6px" }}>Dam:</span>
                        {mother ? (
                          <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}</button>
                        ) : (
                          <span>—</span>
                        )}
                        {mother?.breed && <span style={{ color: "var(--muted)", marginLeft: "6px" }}>({mother.breed})</span>}
                      </div>
                      {sireName && (
                        <div style={{ marginTop: "6px" }}>
                          <span style={{ color: "var(--muted)", marginRight: "6px" }}>Sire:</span>
                          <span style={{ fontWeight: 500 }}>{sireName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            {a.notes && (
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Notes</div>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--ink2)" }}>{a.notes}</p>
              </div>
            )}

            {PASTURE_SPECIES.includes(a.species) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                  Current Pasture
                </div>
                {!showMoveForm ? (
                  (a.movements?.[0]?.pastureName ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "15px", color: "var(--ink2)" }}>{a.movements[0].pastureName}</span>
                      <Btn size="sm" variant="secondary" onClick={() => setShowMoveForm(true)}>Move Animal</Btn>
                    </div>
                  ) : (
                    <Btn size="sm" onClick={() => setShowMoveForm(true)} style={{ background: "var(--green3)", color: "var(--green)" }}>Assign to Pasture</Btn>
                  ))
                ) : (
                  <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--green3)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Move Animal</div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <Input label="Pasture name" value={moveForm.pastureName} onChange={e => setMoveForm(p => ({ ...p, pastureName: e.target.value }))} placeholder="e.g. North Paddock" />
                      <Input label="Move date" type="date" value={moveForm.dateMovedIn} onChange={e => setMoveForm(p => ({ ...p, dateMovedIn: e.target.value }))} />
                    </div>
                    <Textarea label="Notes (e.g. reason for move)" value={moveForm.notes} onChange={e => setMoveForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="e.g. Rotating to fresh grass, weaning" />
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                      <Btn size="sm" onClick={saveMove}>Save Move</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => { setShowMoveForm(false); setMoveForm({ pastureName: "", dateMovedIn: "", notes: "" }); }}>Cancel</Btn>
                    </div>
                  </Card>
                )}
                {(a.movements?.length ?? 0) > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>Movement history</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                      {a.movements.map((m, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 0", borderBottom: i < a.movements.length - 1 ? "1px solid var(--cream2)" : "none" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--green3)", flexShrink: 0, marginTop: "6px" }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>{m.pastureName || "—"}</div>
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Moved in {m.dateMovedIn ? fmt(m.dateMovedIn) : "—"}</div>
                            {m.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "4px" }}>{m.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isMale(a) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
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
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
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
            {isFemale(a) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
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
                        <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={addBreedingFromProfile}>Record</Btn>
                          <Btn variant="secondary" onClick={() => { setShowBreedingForm(false); setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>Cancel</Btn>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {(() => {
                  const totalPregnancies = offspringForMother.length;
                  const liveBirths = offspringForMother.filter(c => !c.stillborn).length;
                  const stillbornCount = offspringForMother.filter(c => c.stillborn).length;
                  return (
                    <div style={{ marginBottom: "16px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Fertility Summary</div>
                      <div><strong>{totalPregnancies}</strong> total pregnancies · <strong>{liveBirths}</strong> live births · <strong>{stillbornCount}</strong> stillborn</div>
                    </div>
                  );
                })()}
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
                    {getOffspringTerm(a.species)} Records
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingOffspringId(null);
                      setShowOffspringForm(true);
                      setOffspringForm({
                        name: "",
                        tag: "",
                        sex: "",
                        species: a.species,
                        birthWeight: "",
                        dob: "",
                        weaningDate: "",
                        stillborn: false,
                      });
                    }}
                  >
                    + Add {getOffspringTerm(a.species)}
                  </Btn>
                </div>

                {offspringForMother.length === 0 && !showOffspringForm && (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No {getOffspringTerm(a.species).toLowerCase()} records yet for this dam.</p>
                )}

                {offspringForMother.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "8px" }}>
                    {offspringForMother.map(c => (
                      <div key={c.id} style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{SPECIES[c.species || a.species]?.emoji}</span>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>
                              {c.stillborn ? "Stillborn" : (c.name || "Unnamed")}{!c.stillborn && c.tag ? ` (#${c.tag})` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingOffspringId(c.id); setOffspringForm({ name: c.name || "", tag: c.tag || "", sex: c.sex || "", species: c.species || a.species || "", birthWeight: c.birthWeight != null ? String(c.birthWeight) : "", dob: c.dob || "", weaningDate: c.weaningDate || "", stillborn: !!c.stillborn }); setShowOffspringForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => deleteOffspring(c.id)}>Delete</Btn>
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
                      {editingOffspringId ? `Edit ${getOffspringTerm(a.species)}` : `Add ${getOffspringTerm(a.species)}`}
                    </div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <Input
                        label={`${getOffspringTerm(a.species)} Name`}
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
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        <input
                          type="checkbox"
                          id="offspring-stillborn"
                          checked={!!offspringForm.stillborn}
                          onChange={e => setOffspringForm(p => ({ ...p, stillborn: e.target.checked }))}
                          style={{ width: "18px", height: "18px", accentColor: "var(--green)" }}
                        />
                        <label htmlFor="offspring-stillborn" style={{ fontSize: "14px", color: "var(--ink2)", cursor: "pointer" }}>Stillborn</label>
                      </div>
                    </div>
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                      <Btn size="sm" onClick={saveOffspring}>{editingOffspringId ? "Save Changes" : "Save Offspring"}</Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowOffspringForm(false);
                          setEditingOffspringId(null);
                          setOffspringForm({
                            name: "",
                            tag: "",
                            sex: "",
                            species: "",
                            birthWeight: "",
                            dob: "",
                            weaningDate: "",
                            stillborn: false,
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
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
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
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
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

            {/* Sale */}
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Sale</div>
              {a.sale && !showSaleForm && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)", marginBottom: "10px" }}>
                  <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                    {a.sale.dateSold && <div><strong>Date sold:</strong> {fmt(a.sale.dateSold)}</div>}
                    {a.sale.pricePerHead != null && <div><strong>Price per head:</strong> ${Number(a.sale.pricePerHead).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                    {a.sale.buyerName && <div><strong>Buyer:</strong> {a.sale.buyerName}</div>}
                    {a.sale.buyerContact && <div><strong>Buyer contact:</strong> {a.sale.buyerContact}</div>}
                    {a.sale.saleLocation && <div><strong>Sale location:</strong> {a.sale.saleLocation}</div>}
                    {a.sale.notes && <div style={{ marginTop: "4px" }}><strong>Notes:</strong> {a.sale.notes}</div>}
                  </div>
                </div>
              )}
              {!a.sale && !a.deceased && !showSaleForm && (
                <Btn size="sm" variant="secondary" onClick={() => { setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); setShowSaleForm(true); }}>Mark as Sold</Btn>
              )}
              {showSaleForm && (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Sold</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Date sold" type="date" value={saleForm.dateSold} onChange={e => setSaleForm(p => ({ ...p, dateSold: e.target.value }))} />
                    <Input label="Price per head ($)" type="number" min="0" step="0.01" value={saleForm.pricePerHead} onChange={e => setSaleForm(p => ({ ...p, pricePerHead: e.target.value }))} placeholder="e.g. 1250.00" />
                    <Input label="Buyer name" value={saleForm.buyerName} onChange={e => setSaleForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Livestock" />
                    <Input label="Buyer contact (optional)" value={saleForm.buyerContact} onChange={e => setSaleForm(p => ({ ...p, buyerContact: e.target.value }))} placeholder="Phone or email" />
                    <Input label="Sale location (optional)" value={saleForm.saleLocation} onChange={e => setSaleForm(p => ({ ...p, saleLocation: e.target.value }))} placeholder="e.g. Sale barn name" />
                  </div>
                  <Textarea label="Notes" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveSale}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowSaleForm(false); setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
            </div>

            <div className="hl-profile-actions-sep">
              <div className="hl-profile-actions">
                <Btn variant="secondary" size="sm" onClick={() => window.print()}>Print / Export PDF</Btn>
                <Btn variant="secondary" size="sm" onClick={() => {
                  const species = a.species || "Cattle";
                  const opts = getSexOptions(species);
                  const sex = opts.includes(a.sex) ? a.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]);
                  setForm({ name: "", species, sex, breed: a.breed || "", tag: a.tag || "", dob: "", notes: a.notes || "" });
                  setShowAdd(true);
                  setViewing(null);
                }}>Duplicate Animal</Btn>
                <Btn variant="danger" size="sm" onClick={() => remove(a.id)}>Remove Animal</Btn>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Print-only view: visible only when printing */}
      <div className="print-only hl-print-root" style={{ display: "none", padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ background: "#1B3A2B", color: "#fff", padding: "20px 24px", marginBottom: "24px", borderBottom: "3px solid #C9952A" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, letterSpacing: "0.5px" }}>Herd Ledger</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px" }}>Livestock Management</div>
        </div>
        <h1 style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#141A14", marginBottom: "8px" }}>{getAnimalName(a)}</h1>
        <p style={{ color: "#7A8C7A", fontSize: "14px", marginBottom: "24px" }}>{a.breed || a.species} · {displaySex(a, gestations)}{a.tag ? ` · #${a.tag}` : ""}</p>

        <section style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Basic Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 24px", fontSize: "14px" }}>
            <div><strong>Species</strong> {a.species}</div>
            <div><strong>Breed</strong> {a.breed || "—"}</div>
            <div><strong>Sex</strong> {displaySex(a, gestations)}</div>
            <div><strong>Tag / ID</strong> {a.tag || "—"}</div>
            <div><strong>Date of Birth</strong> {fmt(a.dob)}</div>
            <div><strong>Age</strong> {ageFromDob(a.dob)}</div>
          </div>
        </section>

        {(a.weights?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Weight Tracking</h2>
            <div style={{ fontSize: "14px" }}>
              {weightsSorted.map(entry => (
                <div key={entry.id} style={{ padding: "4px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{entry.weight} lb</strong> — {fmt(entry.date)}{entry.notes ? ` · ${entry.notes}` : ""}
                </div>
              ))}
              {adg !== null && (
                <div style={{ marginTop: "8px", fontWeight: 600 }}>
                  ADG: {adg >= 0 ? "+" : ""}{adg.toFixed(3)} lb/day {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                </div>
              )}
            </div>
          </section>
        )}

        {(a.treatments?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Health & Treatment Log</h2>
            <div style={{ fontSize: "14px" }}>
              {treatmentsSorted.map(entry => (
                <div key={entry.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{entry.type}</strong> — {fmt(entry.date)}{entry.administeredBy ? ` · ${entry.administeredBy}` : ""}
                  {entry.description && ` · ${entry.description}`}
                  {entry.treatmentGiven && ` · Treatment: ${entry.treatmentGiven}${entry.dosage ? ` (${entry.dosage})` : ""}`}
                  {entry.cost != null && entry.cost !== "" && ` · $${Number(entry.cost).toFixed(2)}`}
                  {entry.notes && ` · ${entry.notes}`}
                </div>
              ))}
            </div>
          </section>
        )}

        {a.motherId && (() => {
          const mother = animals.find(m => m.id === a.motherId);
          const sire = a.sireId ? animals.find(s => s.id === a.sireId) : null;
          const sireName = sire ? getAnimalName(sire) : (a.sireName || null);
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Parentage</h2>
              <div style={{ fontSize: "14px" }}>
                <div><strong>Dam:</strong> {mother ? getAnimalName(mother) + (mother.breed ? ` (${mother.breed})` : "") : "—"}</div>
                {sireName && <div style={{ marginTop: "4px" }}><strong>Sire:</strong> {sireName}</div>}
              </div>
            </section>
          );
        })()}

        {(a.vaccinations?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Vaccinations</h2>
            <div style={{ fontSize: "14px" }}>
              {[...(a.vaccinations || [])].sort((x, y) => (y.dateGiven || "").localeCompare(x.dateGiven || "")).map((v, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < a.vaccinations.length - 1 ? "1px solid #EDE6D6" : "none" }}>
                  <strong>{v.vaccineName || "Vaccine"}</strong> — Given {fmt(v.dateGiven)}{v.nextDueDate ? ` · Next due ${fmt(v.nextDueDate)}` : ""}{v.administeredBy ? ` · ${v.administeredBy}` : ""}
                  {v.notes && <div style={{ fontSize: "13px", color: "#2C3A2C", marginTop: "4px" }}>{v.notes}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {a.castration && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Castration Record</h2>
            <div style={{ fontSize: "14px" }}>
              {a.castration.date ? `Performed ${fmt(a.castration.date)}` : "Date not recorded"}
              {a.castration.method && ` · Method: ${a.castration.method}`}
              {a.castration.performer && ` · Performed by: ${a.castration.performer}`}
              {a.castration.notes && <div style={{ marginTop: "6px" }}>{a.castration.notes}</div>}
            </div>
          </section>
        )}

        {isFemale(a) && (offspringForMother?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>{getOffspringTerm(a.species)} Records</h2>
            <div style={{ fontSize: "14px" }}>
              {offspringForMother.map(c => (
                <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  {c.stillborn ? "Stillborn" : (c.name || "Unnamed")}{!c.stillborn && c.tag ? ` #${c.tag}` : ""}
                  {c.sex && ` · ${c.sex}`}
                  {c.dob && ` · Born ${fmt(c.dob)}`}
                  {c.weaningDate && ` · Wean ${fmt(c.weaningDate)}`}
                </div>
              ))}
            </div>
          </section>
        )}

        {(() => {
          const gestationsForAnimal = gestations.filter(g => g.animalId === a.id);
          if (gestationsForAnimal.length === 0) return null;
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Gestation History</h2>
              <div style={{ fontSize: "14px" }}>
                {gestationsForAnimal.map(g => (
                  <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                    {g.status === "Delivered" ? `Delivered ${fmt(g.deliveredAt)}` : `Active · Due ${fmt(g.dueDate)}`}
                    {g.sire && ` · Sire: ${g.sire}`}
                    {g.calf && (g.calf.stillborn ? " · Stillborn" : (g.calf.name ? ` · ${getOffspringTerm(a.species)}: ${g.calf.name}` : ""))}
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {(a.movements?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Pasture Movement History</h2>
            <div style={{ fontSize: "14px" }}>
              {a.movements.map((m, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{m.pastureName || "—"}</strong> — Moved in {m.dateMovedIn ? fmt(m.dateMovedIn) : "—"}
                  {m.notes && <div style={{ fontSize: "13px", color: "#2C3A2C", marginTop: "2px" }}>{m.notes}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {a.notes && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Notes</h2>
            <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#2C3A2C", whiteSpace: "pre-wrap" }}>{a.notes}</p>
          </section>
        )}
      </div>
    </>
    );
  }

  const deceasedCount = animals.filter(a => a.deceased).length;

  function toggleBulkSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds([]);
    setBulkFormType(null);
    setBulkForm({});
  }
  const selectedAnimals = animals.filter(an => selectedIds.includes(an.id));
  const selectedFemales = selectedAnimals.filter(an => isFemale(an) && an.species !== "Mule");
  const selectedPastureEligible = selectedAnimals.filter(an => PASTURE_SPECIES.includes(an.species));
  const selectedMales = selectedAnimals.filter(an => isMale(an));
  const inFeedlotIds = new Set((feederPrograms || []).map(f => f.animalId));
  const selectedCattleForFeedlot = selectedAnimals.filter(an => an.species === "Cattle" && !inFeedlotIds.has(an.id));

  function saveBulkVaccination() {
    const rec = {
      vaccineName: bulkForm.vaccineName || undefined,
      dateGiven: bulkForm.dateGiven || undefined,
      nextDueDate: bulkForm.nextDueDate || undefined,
      administeredBy: bulkForm.administeredBy || undefined,
      notes: bulkForm.notes || undefined,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const entry = { ...rec, id: Date.now().toString() + "-" + an.id };
        return { ...an, vaccinations: [...(an.vaccinations || []), entry] };
      })
    );
    setBulkFormType(null);
    setBulkForm({});
  }

  function saveBulkBreeding() {
    const start = bulkForm.breedingDate;
    const end = bulkForm.runningWithBull ? bulkForm.breedingDateEnd : bulkForm.breedingDate;
    if (!start || (bulkForm.runningWithBull && !end)) return;
    const newRecords = selectedFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = bulkForm.runningWithBull ? dueDate(end, totalDays) : dueStart;
      return {
        animalId: an.id,
        breedingDate: start,
        ...(bulkForm.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
        dueDate: dueStart,
        ...(bulkForm.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
        sire: bulkForm.sire,
        notes: bulkForm.notes,
        id: Date.now().toString() + "-" + an.id,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
    });
    setGestations(p => [...p, ...newRecords]);
    setBulkFormType(null);
    setBulkForm({});
  }

  function saveBulkMove() {
    const movePayload = {
      pastureName: bulkForm.pastureName?.trim() || undefined,
      dateMovedIn: bulkForm.dateMovedIn || undefined,
      notes: bulkForm.notes?.trim() || undefined,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id) || !PASTURE_SPECIES.includes(an.species)) return an;
        return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
      })
    );
    setBulkFormType(null);
    setBulkForm({});
  }

  function saveBulkTreatment() {
    if (!bulkForm.date || !bulkForm.type) return;
    const entry = {
      date: bulkForm.date,
      type: bulkForm.type,
      description: bulkForm.description?.trim() || undefined,
      treatmentGiven: bulkForm.treatmentGiven?.trim() || undefined,
      dosage: bulkForm.dosage?.trim() || undefined,
      administeredBy: bulkForm.administeredBy || "Owner",
      cost: bulkForm.cost?.trim() ? parseFloat(bulkForm.cost) : undefined,
      notes: bulkForm.notes?.trim() || undefined,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const fullEntry = { ...entry, id: Date.now().toString() + "-" + an.id };
        const nextTreatments = [...(an.treatments || []), fullEntry].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
        return { ...an, treatments: nextTreatments };
      })
    );
    setBulkFormType(null);
    setBulkForm({});
  }

  function saveBulkCastration() {
    const rec = {
      date: bulkForm.date || undefined,
      method: bulkForm.method || undefined,
      performer: bulkForm.performer || undefined,
      notes: bulkForm.notes?.trim() || undefined,
      recordedAt: new Date().toISOString(),
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id) || !isMale(an)) return an;
        const castratedTerm = CASTRATED_TERM_BY_SPECIES[an.species];
        return {
          ...an,
          castration: rec,
          ...(castratedTerm != null && { sex: castratedTerm }),
        };
      })
    );
    setBulkFormType(null);
    setBulkForm({});
  }

  return (
    <div className={`hl-page hl-fade-in${bulkMode && selectedIds.length > 0 ? " hl-page-with-bulk-toolbar" : ""}`}>
      <SectionTitle action={
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => { setBulkMode(true); setSelectedIds([]); setBulkFormType(null); setViewing(null); }}>Bulk Actions</Btn>
          <Btn onClick={() => { setEditingId(null); setForm(emptyForm()); setShowAdd(true); }}>+ Register Animal</Btn>
        </div>
      }>
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

      {bulkMode && selectedIds.length > 0 && (
        <Card className="hl-bulk-toolbar" style={{ padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", borderLeft: "4px solid var(--brass)" }}>
          <span style={{ fontWeight: 600, marginRight: "8px" }}>{selectedIds.length} selected</span>
          <Btn size="sm" onClick={() => { setBulkFormType("vaccination"); setBulkForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "" }); }}>Apply Vaccination</Btn>
          <Btn size="sm" onClick={() => { setBulkFormType("breeding"); setBulkForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>Log Breeding</Btn>
          <Btn size="sm" onClick={() => { setBulkFormType("move"); setBulkForm({ pastureName: "", dateMovedIn: "", notes: "" }); }}>Move to Pasture</Btn>
          <Btn size="sm" onClick={() => { setBulkFormType("treatment"); setBulkForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Apply Treatment</Btn>
          {selectedMales.length > 0 && (
            <Btn size="sm" onClick={() => { setBulkFormType("castration"); setBulkForm({ date: "", method: "Banding", performer: "Owner", notes: "" }); }}>Castrate</Btn>
          )}
          {selectedCattleForFeedlot.length > 0 && setTab && setFeederBulkAnimalIds && (
            <Btn size="sm" onClick={() => { setTab("feeder"); setFeederBulkAnimalIds(selectedCattleForFeedlot.map(a => a.id)); }}>Add to Feedlot</Btn>
          )}
          <Btn size="sm" variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
        </Card>
      )}

      {bulkFormType === "vaccination" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Vaccination ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Vaccine name" value={bulkForm.vaccineName} onChange={e => setBulkForm(p => ({ ...p, vaccineName: e.target.value }))} placeholder="e.g. Clostridial 7-way" />
            <Input label="Date given" type="date" value={bulkForm.dateGiven} onChange={e => setBulkForm(p => ({ ...p, dateGiven: e.target.value }))} />
            <Input label="Next due date" type="date" value={bulkForm.nextDueDate} onChange={e => setBulkForm(p => ({ ...p, nextDueDate: e.target.value }))} />
            <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkVaccination}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "breeding" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Log Breeding ({selectedFemales.length} females)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            {!bulkForm.runningWithBull ? (
              <Input label="Breeding Date *" type="date" value={bulkForm.breedingDate} onChange={e => setBulkForm(p => ({ ...p, breedingDate: e.target.value }))} />
            ) : (
              <>
                <Input label="Exposure start *" type="date" value={bulkForm.breedingDate} onChange={e => setBulkForm(p => ({ ...p, breedingDate: e.target.value }))} />
                <Input label="Exposure end *" type="date" value={bulkForm.breedingDateEnd} onChange={e => setBulkForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
              </>
            )}
            <Input label="Sire (optional)" value={bulkForm.sire} onChange={e => setBulkForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", cursor: "pointer" }}>
            <input type="checkbox" checked={bulkForm.runningWithBull} onChange={e => setBulkForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            <span>Bull turned out with group (exposure window)</span>
          </label>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkBreeding} disabled={selectedFemales.length === 0}>Apply to {selectedFemales.length} females</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "move" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Move to Pasture ({selectedPastureEligible.length} Cattle/Horses)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Pasture name" value={bulkForm.pastureName} onChange={e => setBulkForm(p => ({ ...p, pastureName: e.target.value }))} placeholder="e.g. North Paddock" />
            <Input label="Move date" type="date" value={bulkForm.dateMovedIn} onChange={e => setBulkForm(p => ({ ...p, dateMovedIn: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkMove} disabled={selectedPastureEligible.length === 0}>Move {selectedPastureEligible.length} animals</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "treatment" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Treatment ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Date *" type="date" value={bulkForm.date} onChange={e => setBulkForm(p => ({ ...p, date: e.target.value }))} />
            <Select label="Type *" value={bulkForm.type} onChange={e => setBulkForm(p => ({ ...p, type: e.target.value }))}>
              <option value="">— Select —</option>
              {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Description" value={bulkForm.description} onChange={e => setBulkForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Lameness, respiratory" />
            <Input label="Treatment given" value={bulkForm.treatmentGiven} onChange={e => setBulkForm(p => ({ ...p, treatmentGiven: e.target.value }))} placeholder="e.g. Penicillin, bandage" />
            <Input label="Dosage" value={bulkForm.dosage} onChange={e => setBulkForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 5 ml" />
            <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
            <Input label="Cost" type="number" min="0" step="0.01" value={bulkForm.cost} onChange={e => setBulkForm(p => ({ ...p, cost: e.target.value }))} placeholder="Optional" />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkTreatment}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "castration" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Castrate ({selectedMales.length} males)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Date performed" type="date" value={bulkForm.date} onChange={e => setBulkForm(p => ({ ...p, date: e.target.value }))} />
            <Select label="Method" value={bulkForm.method} onChange={e => setBulkForm(p => ({ ...p, method: e.target.value }))}>
              <option>Banding</option>
              <option>Surgical</option>
              <option>Burdizzo</option>
            </Select>
            <Select label="Performed by" value={bulkForm.performer} onChange={e => setBulkForm(p => ({ ...p, performer: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkCastration}>Apply to {selectedMales.length} males</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>New Animal</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
            <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
            <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
            <Select label="Species" value={form.species} onChange={e => {
              const newSpecies = e.target.value;
              const opts = getSexOptions(newSpecies);
              setForm(p => ({ ...p, species: newSpecies, sex: opts.includes(p.sex) ? p.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]) }));
            }}>
              {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
            </Select>
            <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
              {getSexOptions(form.species).map(opt => <option key={opt}>{opt}</option>)}
            </Select>
            <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
            {PASTURE_SPECIES.includes(form.species) && (
              <Input label="Current Pasture (optional)" value={form.currentPasture} onChange={e => setForm(p => ({ ...p, currentPasture: e.target.value }))} placeholder="e.g. North Paddock" />
            )}
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
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
          <Card key={a.id} style={{
            padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s", position: "relative", overflow: "hidden",
            ...(bulkMode && selectedIds.includes(a.id) ? { boxShadow: "0 0 0 2px var(--brass)", borderColor: "var(--brass)" } : {})
          }}
            onClick={() => { if (bulkMode) { toggleBulkSelect(a.id); } else { setViewing(a); setShowSaleForm(false); } }}
            onMouseEnter={e => { if (!bulkMode) { e.currentTarget.style.boxShadow = "var(--shadow2)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!bulkMode) { e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.transform = ""; } }}
          >
            {bulkMode && (
              <div style={{ position: "absolute", top: "12px", left: "12px", zIndex: 1 }} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleBulkSelect(a.id)} style={{ width: "18px", height: "18px", accentColor: "var(--green)", cursor: "pointer" }} />
              </div>
            )}
            {a.deceased && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none" }}>
                  <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>
                </div>
              </>
            )}
            {a.sale && !a.deceased && (
              <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none", zIndex: 1 }}>
                <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {!a.deceased && (
                  <span style={{ width: "10px", height: "10px", flexShrink: 0, borderRadius: "50%", background: getHealthStatus(a) === "red" ? "var(--danger2)" : getHealthStatus(a) === "yellow" ? "var(--brass2)" : "var(--green3)", boxShadow: "0 0 0 2px #fff" }} title={getHealthStatus(a) === "red" ? "Recent illness" : getHealthStatus(a) === "yellow" ? "Treatment in last 30 days" : "No recent issues"} />
                )}
                <span style={{ fontSize: "28px" }}>{SPECIES[a.species]?.emoji}</span>
              </div>
              {a.name && a.tag && !a.deceased && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>#{a.tag}</span>}
            </div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "2px" }}>{getAnimalName(a)}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{a.breed || a.species} · {displaySex(a, gestations)}</div>
            {isFemale(a) && a.species !== "Mule" && (() => {
              const activeGest = gestations.find(g => g.animalId === a.id && g.status !== "Delivered");
              if (!activeGest) return null;
              const totalDays = activeGest.gestationDays ?? SPECIES[a.species]?.days ?? 283;
              const prog = progress(breedingDateForProgress(activeGest), totalDays);
              const dueInfo = daysUntilDue(activeGest);
              const daysRemaining = dueInfo.isRange ? dueInfo.end : dueInfo.start;
              const overdue = daysRemaining < 0;
              const accent = overdue ? "var(--danger2)" : "var(--brass)";
              const dueLabel = overdue ? `Overdue ${Math.abs(daysRemaining)}d` : daysRemaining === 0 ? "Due today" : `${daysRemaining} days left`;
              return (
                <div style={{ marginTop: "8px", marginBottom: "4px", padding: "8px 10px", background: overdue ? "rgba(192,57,43,0.08)" : "rgba(201,149,42,0.12)", borderRadius: "6px", borderLeft: `3px solid ${accent}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: accent, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Pregnant</div>
                  <div style={{ fontSize: "12px", color: overdue ? "var(--danger2)" : "var(--ink2)", marginBottom: "6px" }}>
                    Due {fmtDueRange(activeGest)} · {dueLabel}
                  </div>
                  <div style={{ height: "4px", background: "var(--cream2)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, prog))}%`, background: accent, borderRadius: "2px", transition: "width 0.2s ease" }} />
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>{ageFromDob(a.dob)}</div>
            {a.species === "Cattle" && !a.deceased && !a.sale && setTab && setFeederPreselectAnimalId && !inFeedlotIds.has(a.id) && (
              <div style={{ marginTop: "10px" }} onClick={e => e.stopPropagation()}>
                <Btn size="sm" variant="secondary" onClick={() => { setTab("feeder"); setFeederPreselectAnimalId(a.id); }}>Add to Feedlot</Btn>
              </div>
            )}
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
  const [editingCalfGestationId, setEditingCalfGestationId] = useState(null);
  const [calfForm, setCalfForm] = useState({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });

  const females = animals.filter(a => isFemale(a));

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
    setEditingCalfGestationId(null);
    setDeliveringId(id);
    setShowCalfForm(true);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function saveCalfRecord(gestationId) {
    const isEdit = editingCalfGestationId === gestationId;
    const g = gestations.find(x => x.id === gestationId);
    const mother = g ? animals.find(m => m.id === g.animalId) : null;
    const stillborn = !!calfForm.stillborn;
    let newAnimalId;
    if (!stillborn && !isEdit && mother) {
      newAnimalId = Date.now().toString();
      const newAnimal = {
        id: newAnimalId,
        name: calfForm.name || undefined,
        tag: calfForm.tag || undefined,
        sex: calfForm.sex || undefined,
        species: mother.species,
        dob: undefined,
        breed: mother.breed || undefined,
        notes: undefined,
        motherId: mother.id,
        ...(g.sire && { sireName: g.sire }),
      };
      setAnimals(prev => [...prev, newAnimal]);
    }
    if (isEdit && g?.calf?.animalId && stillborn) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    const calfData = {
      name: calfForm.name || undefined,
      tag: calfForm.tag || undefined,
      sex: calfForm.sex || undefined,
      birthWeight: calfForm.birthWeight ? parseFloat(calfForm.birthWeight) : undefined,
      weaningDate: calfForm.weaningDate || undefined,
      stillborn,
      recordedAt: new Date().toISOString(),
      ...(newAnimalId && { animalId: newAnimalId }),
      ...(isEdit && g?.calf?.animalId && !stillborn && { animalId: g.calf.animalId }),
    };
    setGestations(p => p.map(gr =>
      gr.id === gestationId
        ? { ...gr, status: "Delivered", deliveredAt: gr.deliveredAt || new Date().toISOString(), calf: calfData }
        : gr
    ));
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function skipCalfRecord() {
    if (deliveringId && !editingCalfGestationId) {
      setGestations(p => p.map(g =>
        g.id === deliveringId
          ? { ...g, status: "Delivered", deliveredAt: g.deliveredAt || new Date().toISOString() }
          : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function deleteCalfRecord(gestationId) {
    const g = gestations.find(x => x.id === gestationId);
    if (!g?.calf) return;
    const mother = animals.find(a => a.id === g.animalId);
    const term = getOffspringTerm(mother?.species);
    const hadAnimal = g.calf.animalId && !g.calf.stillborn;
    if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this ${term.toLowerCase()} record?`)) return;
    if (hadAnimal) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    setGestations(p => p.map(gr =>
      gr.id === gestationId ? { ...gr, calf: undefined } : gr
    ));
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
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Record</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showCalfForm && deliveringId && (() => {
        const g = gestations.find(x => x.id === deliveringId);
        const animal = animals.find(a => a.id === g?.animalId);
        const isEditCalf = !!editingCalfGestationId;
        const offspringTerm = getOffspringTerm(animal?.species);
        return (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>
              {isEditCalf ? `Edit ${offspringTerm} Record` : `Add ${offspringTerm} Record (Optional)`}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "18px" }}>
              Record details for the {offspringTerm.toLowerCase()} born to <strong>{getAnimalName(animal)}</strong>
            </div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label={`${offspringTerm} Name`} value={calfForm.name} onChange={e => setCalfForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie Jr" />
              <Input label="Tag / ID" value={calfForm.tag} onChange={e => setCalfForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1043" />
              <Select label="Sex" value={calfForm.sex} onChange={e => setCalfForm(p => ({ ...p, sex: e.target.value }))}>
                <option value="">— Select —</option>
                <option>Female</option>
                <option>Male</option>
                <option>Steer</option>
              </Select>
              <Input label="Birth Weight (lbs)" type="number" value={calfForm.birthWeight} onChange={e => setCalfForm(p => ({ ...p, birthWeight: e.target.value }))} placeholder="e.g. 85" />
              <Input label="Target Weaning Date" type="date" value={calfForm.weaningDate} onChange={e => setCalfForm(p => ({ ...p, weaningDate: e.target.value }))} />
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" id="calf-stillborn" checked={!!calfForm.stillborn} onChange={e => setCalfForm(p => ({ ...p, stillborn: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                <label htmlFor="calf-stillborn" style={{ fontSize: "14px", color: "var(--ink2)", cursor: "pointer" }}>Stillborn</label>
              </div>
            </div>
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={() => saveCalfRecord(deliveringId)}>{isEditCalf ? "Save Changes" : `Save ${offspringTerm} Record`}</Btn>
              <Btn variant="secondary" onClick={skipCalfRecord}>{isEditCalf ? "Cancel" : "Skip"}</Btn>
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
              const hasCalf = g.calf && (g.calf.stillborn || g.calf.name || g.calf.tag || g.calf.sex || g.calf.birthWeight || g.calf.weaningDate);
              const offspringTerm = getOffspringTerm(animal?.species);
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
                        <Btn size="sm" onClick={() => { setDeliveringId(g.id); setShowCalfForm(true); setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false }); }}>
                          Add {offspringTerm} Record
                        </Btn>
                      )}
                      <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                    </div>
                  </div>
                  {hasCalf && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{offspringTerm} Record</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setEditingCalfGestationId(g.id); setDeliveringId(g.id); setCalfForm({ name: g.calf.name || "", tag: g.calf.tag || "", sex: g.calf.sex || "", birthWeight: g.calf.birthWeight != null ? String(g.calf.birthWeight) : "", weaningDate: g.calf.weaningDate || "", stillborn: !!g.calf.stillborn }); setShowCalfForm(true); }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => deleteCalfRecord(g.id)}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "13px" }}>
                      {g.calf.stillborn && <div><span style={{ color: "var(--muted)" }}>Status:</span> <strong>Stillborn</strong></div>}
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

// ── Pastures ───────────────────────────────────────────────────────────────────
function Pastures({ animals, setAnimals, pastures, setPastures, setTab, setViewingAnimal }) {
  const [showAddPasture, setShowAddPasture] = useState(false);
  const [newPastureName, setNewPastureName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMoveTo, setBulkMoveTo] = useState("");
  const [bulkMoveNotes, setBulkMoveNotes] = useState("");

  const pastureEligible = (animals || []).filter(a => PASTURE_SPECIES.includes(a.species) && !a.deceased && !a.sale);
  const namesFromAnimals = new Set(pastureEligible.map(a => a.movements?.[0]?.pastureName).filter(Boolean));
  const sortedNames = [...new Set([...(pastures || []), ...namesFromAnimals])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const allPastureNames = pastureEligible.some(a => !(a.movements?.[0]?.pastureName || "").trim()) ? ["— Not assigned —", ...sortedNames] : sortedNames;

  const animalsByPasture = {};
  allPastureNames.forEach(name => {
    if (name === "— Not assigned —") {
      animalsByPasture[name] = pastureEligible.filter(a => !(a.movements?.[0]?.pastureName || "").trim());
    } else {
      animalsByPasture[name] = pastureEligible.filter(a => (a.movements?.[0]?.pastureName || "").trim() === name);
    }
  });
  const selectedAnimals = pastureEligible.filter(a => selectedIds.includes(a.id));

  function addPasture() {
    const name = newPastureName?.trim();
    if (!name) return;
    if (!(pastures || []).includes(name)) setPastures(prev => [...(prev || []), name].sort((a, b) => a.localeCompare(b)));
    setNewPastureName("");
    setShowAddPasture(false);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function doBulkMove() {
    const toPasture = bulkMoveTo?.trim();
    if (!toPasture || selectedIds.length === 0) return;
    const movePayload = { pastureName: toPasture, dateMovedIn: new Date().toISOString().split("T")[0], notes: bulkMoveNotes?.trim() || undefined };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
      })
    );
    setSelectedIds([]);
    setBulkMoveTo("");
    setBulkMoveNotes("");
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAddPasture(true)}>+ New Pasture</Btn>}>
        Pastures
      </SectionTitle>

      {showAddPasture && (
        <Card style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "12px" }}>Create new pasture</div>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <Input label="Pasture name" value={newPastureName} onChange={e => setNewPastureName(e.target.value)} placeholder="e.g. North Paddock" style={{ minWidth: "200px" }} />
            <Btn onClick={addPasture}>Add Pasture</Btn>
            <Btn variant="secondary" onClick={() => { setShowAddPasture(false); setNewPastureName(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {selectedIds.length > 0 && (
        <Card style={{ padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", borderLeft: "4px solid var(--green3)" }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.length} selected</span>
          <Select label="Move to" value={bulkMoveTo} onChange={e => setBulkMoveTo(e.target.value)}>
            <option value="">— Select pasture —</option>
            {allPastureNames.filter(n => n !== "— Not assigned —").map(n => <option key={n} value={n}>{n}</option>)}
          </Select>
          <Input value={bulkMoveNotes} onChange={e => setBulkMoveNotes(e.target.value)} placeholder="Notes (optional)" style={{ minWidth: "180px" }} />
          <Btn size="sm" onClick={doBulkMove} disabled={!bulkMoveTo?.trim()}>Move</Btn>
          <Btn size="sm" variant="secondary" onClick={() => { setSelectedIds([]); setBulkMoveTo(""); setBulkMoveNotes(""); }}>Clear</Btn>
        </Card>
      )}

      {allPastureNames.length === 0 && !showAddPasture && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🟩</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No pastures yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Create a pasture or assign Cattle/Horses to a pasture from their profile.</p>
        </Card>
      )}

      <div className="hl-pastures-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {allPastureNames.map(pastureName => {
          const list = animalsByPasture[pastureName] || [];
          const cattleCount = list.filter(a => a.species === "Cattle").length;
          const horseCount = list.filter(a => a.species === "Horse").length;
          return (
            <Card key={pastureName} style={{ padding: "18px 20px", borderLeft: "4px solid var(--green3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>{pastureName}</div>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                  {cattleCount > 0 && <span>{cattleCount} Cattle</span>}
                  {cattleCount > 0 && horseCount > 0 && " · "}
                  {horseCount > 0 && <span>{horseCount} Horse{horseCount !== 1 ? "s" : ""}</span>}
                  {cattleCount === 0 && horseCount === 0 && "0 animals"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {list.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No animals in this pasture</p>
                ) : (
                  list.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} onClick={e => e.stopPropagation()} style={{ width: "16px", height: "16px", accentColor: "var(--green)", flexShrink: 0 }} />
                      <button type="button" onClick={() => { setTab("animals"); setViewingAnimal(a); }} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: "6px 0", fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                        {getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}
                      </button>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>{a.species}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>
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
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
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

// ── Feeder Cattle ─────────────────────────────────────────────────────────────
const FEED_TYPES = ["Corn", "Silage", "Hay", "Mixed Ration", "Custom"];

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

function FeederCattle({ animals, feederPrograms, setFeederPrograms, setTab, setViewingAnimal, feederPreselectAnimalId, setFeederPreselectAnimalId, feederBulkAnimalIds, setFeederBulkAnimalIds }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    startDate: "",
    startingWeight: "",
    targetDaysOnFeed: "",
    dailyFeedLbs: "",
    feedType: "Corn",
    costPerLb: "",
  });
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkFormShared, setBulkFormShared] = useState({ startDate: "", targetDaysOnFeed: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "" });
  const [bulkAddAnimals, setBulkAddAnimals] = useState([]);

  const cattle = (animals || []).filter(a => a.species === "Cattle" && !a.deceased && !a.sale);
  const inProgramIds = new Set((feederPrograms || []).map(f => f.animalId));
  const availableCattle = cattle.filter(a => !inProgramIds.has(a.id));

  useEffect(() => {
    if (!feederPreselectAnimalId || !setFeederPreselectAnimalId) return;
    const weight = getLatestWeightForAnimal(animals, feederPreselectAnimalId);
    setShowBulkAdd(false);
    setShowAdd(true);
    setForm(p => ({ ...p, animalId: feederPreselectAnimalId, startingWeight: weight }));
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
    setBulkFormShared({ startDate: "", targetDaysOnFeed: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "" });
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
    const startWeight = form.startingWeight?.trim() ? parseFloat(form.startingWeight) : undefined;
    const targetDays = form.targetDaysOnFeed?.trim() ? parseInt(form.targetDaysOnFeed, 10) : undefined;
    const dailyLbs = form.dailyFeedLbs?.trim() ? parseFloat(form.dailyFeedLbs) : undefined;
    const costPerLb = form.costPerLb?.trim() ? parseFloat(form.costPerLb) : undefined;
    setFeederPrograms(prev => [...prev, {
      id: Date.now().toString(),
      animalId: form.animalId,
      startDate: form.startDate,
      startingWeight: startWeight,
      targetDaysOnFeed: targetDays,
      dailyFeedLbs: dailyLbs,
      feedType: form.feedType || "Corn",
      costPerLb: costPerLb,
    }]);
    setForm({ animalId: "", startDate: "", startingWeight: "", targetDaysOnFeed: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "" });
    setShowAdd(false);
  }

  function removeFromProgram(id) {
    setFeederPrograms(prev => prev.filter(f => f.id !== id));
  }

  function submitBulkAdd() {
    if (!bulkFormShared.startDate || bulkAddAnimals.length === 0) return;
    const targetDays = bulkFormShared.targetDaysOnFeed?.trim() ? parseInt(bulkFormShared.targetDaysOnFeed, 10) : undefined;
    const dailyLbs = bulkFormShared.dailyFeedLbs?.trim() ? parseFloat(bulkFormShared.dailyFeedLbs) : undefined;
    const costPerLb = bulkFormShared.costPerLb?.trim() ? parseFloat(bulkFormShared.costPerLb) : undefined;
    const newRecords = bulkAddAnimals.map((row, i) => ({
      id: Date.now().toString() + "-" + i,
      animalId: row.animalId,
      startDate: bulkFormShared.startDate,
      startingWeight: row.startingWeight?.trim() ? parseFloat(row.startingWeight) : undefined,
      targetDaysOnFeed: targetDays,
      dailyFeedLbs: dailyLbs,
      feedType: bulkFormShared.feedType || "Corn",
      costPerLb: costPerLb,
    }));
    setFeederPrograms(prev => [...prev, ...newRecords]);
    setShowBulkAdd(false);
    setBulkAddAnimals([]);
    setBulkFormShared({ startDate: "", targetDaysOnFeed: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "" });
  }

  function setBulkAnimalStartingWeight(animalId, value) {
    setBulkAddAnimals(prev => prev.map(row => row.animalId === animalId ? { ...row, startingWeight: value } : row));
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)} disabled={availableCattle.length === 0}>+ Add to Feeder Program</Btn>}>
        Feeder Cattle
      </SectionTitle>

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
            <Input label="Target days on feed" type="number" min="1" value={bulkFormShared.targetDaysOnFeed} onChange={e => setBulkFormShared(p => ({ ...p, targetDaysOnFeed: e.target.value }))} placeholder="e.g. 120" />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={bulkFormShared.dailyFeedLbs} onChange={e => setBulkFormShared(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={bulkFormShared.feedType} onChange={e => setBulkFormShared(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={bulkFormShared.costPerLb} onChange={e => setBulkFormShared(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
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
            <Btn variant="secondary" onClick={() => { setShowBulkAdd(false); setBulkAddAnimals([]); setBulkFormShared({ startDate: "", targetDaysOnFeed: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "" }); }}>Cancel</Btn>
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
              setForm(p => ({ ...p, animalId: id, startingWeight: lastWeight != null ? String(lastWeight) : "" }));
            }}>
              <option value="">— Select —</option>
              {availableCattle.map(a => (
                <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>
              ))}
            </Select>
            <Input label="Starting weight (lbs)" type="number" min="0" step="0.1" value={form.startingWeight} onChange={e => setForm(p => ({ ...p, startingWeight: e.target.value }))} placeholder="e.g. 650" />
            <Input label="Target days on feed" type="number" min="1" value={form.targetDaysOnFeed} onChange={e => setForm(p => ({ ...p, targetDaysOnFeed: e.target.value }))} placeholder="e.g. 120" />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={form.dailyFeedLbs} onChange={e => setForm(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={form.feedType} onChange={e => setForm(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={form.costPerLb} onChange={e => setForm(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
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
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No animals in the feeder program yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Add Cattle from your herd to track feed and growth.</p>
        </Card>
      )}

      <div className="hl-feedlot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {(feederPrograms || []).map(fp => {
          const animal = (animals || []).find(a => a.id === fp.animalId);
          if (!animal) return null;
          const daysOnFeed = feederDaysOnFeed(fp.startDate);
          const targetDays = fp.targetDaysOnFeed ?? 0;
          const daysRemaining = Math.max(0, targetDays - daysOnFeed);
          const finishDate = fp.startDate && targetDays ? (() => { const d = new Date(fp.startDate); d.setDate(d.getDate() + targetDays); return d.toISOString().split("T")[0]; })() : null;
          const progressPct = targetDays > 0 ? Math.min(100, (daysOnFeed / targetDays) * 100) : 0;
          const totalFeedConsumed = daysOnFeed * (fp.dailyFeedLbs ?? 0);
          const costToDate = totalFeedConsumed * (fp.costPerLb ?? 0);
          const estWeight = estimatedWeightFromADG(animal, fp.startDate);
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
                <span style={{ color: "var(--muted)" }}>Days remaining</span>
                <span style={{ fontWeight: 600 }}>{targetDays ? daysRemaining : "—"}</span>
                <span style={{ color: "var(--muted)" }}>Est. weight</span>
                <span style={{ fontWeight: 600 }}>{estWeight != null ? `${Math.round(estWeight)} lb` : (fp.startingWeight != null ? `${fp.startingWeight} lb (start)` : "—")}</span>
                <span style={{ color: "var(--muted)" }}>Feed consumed</span>
                <span style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 1 })} lb</span>
                <span style={{ color: "var(--muted)" }}>Feed cost to date</span>
                <span style={{ fontWeight: 600 }}>${costToDate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              {targetDays > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Progress to target · {finishDate ? fmt(finishDate) : ""}</div>
                  <div style={{ height: "6px", background: "var(--cream2)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--brass)", borderRadius: "3px", transition: "width 0.2s" }} />
                  </div>
                </div>
              )}
              <Btn size="sm" variant="secondary" onClick={() => { setTab("animals"); setViewingAnimal(animal); }} style={{ width: "100%" }}>Record Weight</Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
const TAB_OPTIONS = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "animals", label: "Animals", icon: "🐄" },
  { id: "gestation", label: "Gestation", icon: "📅" },
  { id: "feeder", label: "Feeder Cattle", icon: "🌾" },
  { id: "pastures", label: "Pastures", icon: "🟩" },
  { id: "notes", label: "Journal", icon: "📖" },
];

function Settings({ settings, setSettings, onLogout, animals = [] }) {
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const setVisibility = (id, value) => {
    setSettings(prev => ({
      ...prev,
      tabVisibility: { ...(prev?.tabVisibility ?? DEFAULT_TAB_VISIBILITY), [id]: value },
    }));
  };
  const soldAnimals = (animals || []).filter(a => a.sale).sort((x, y) => (y.sale?.dateSold || "").localeCompare(x.sale?.dateSold || ""));
  function exportSalesReport() {
    const headers = ["Name", "Species", "Tag", "Date Sold", "Price", "Buyer", "Buyer Contact", "Sale Location", "Notes"];
    const rows = soldAnimals.map(a => [
      getAnimalName(a),
      a.species || "",
      a.tag || "",
      a.sale?.dateSold ? fmt(a.sale.dateSold) : "",
      a.sale?.pricePerHead != null ? String(a.sale.pricePerHead) : "",
      a.sale?.buyerName || "",
      a.sale?.buyerContact || "",
      a.sale?.saleLocation || "",
      a.sale?.notes || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="hl-page hl-fade-in">
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)", marginBottom: "24px" }}>Settings</div>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Farm Profile</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Input
              label="Farm name"
              value={settings?.farmName ?? ""}
              onChange={e => setSettings(prev => ({ ...prev, farmName: e.target.value }))}
              placeholder="e.g. Green Valley Ranch"
            />
            <Input
              label="Owner name"
              value={settings?.ownerName ?? ""}
              onChange={e => setSettings(prev => ({ ...prev, ownerName: e.target.value }))}
              placeholder="e.g. Jane Smith"
            />
          </div>
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Default Species</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>Pre-select this species when adding a new animal.</p>
          <Select
            value={settings?.defaultSpecies ?? "Cattle"}
            onChange={e => setSettings(prev => ({ ...prev, defaultSpecies: e.target.value }))}
          >
            {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
          </Select>
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Tab Visibility</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Show or hide tabs in the navigation. Settings is always visible.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {TAB_OPTIONS.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}><span>{t.icon}</span> {t.label}</span>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={visibility[t.id] !== false}
                    onChange={e => setVisibility(t.id, e.target.checked)}
                    style={{ width: "18px", height: "18px", accentColor: "var(--green)" }}
                  />
                </label>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: "24px", marginBottom: "20px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "16px" }}>Sales Report</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>All sold animals with sale date, price, and buyer — for tax and records.</p>
          {soldAnimals.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--muted)" }}>No sales recorded yet.</p>
          ) : (
            <>
              <div style={{ maxHeight: "280px", overflowY: "auto", marginBottom: "14px", border: "1px solid var(--cream2)", borderRadius: "var(--radius)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                      <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Animal</th>
                      <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Date Sold</th>
                      <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Price</th>
                      <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldAnimals.map(a => (
                      <tr key={a.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                        <td style={{ padding: "10px 12px" }}>{getAnimalName(a)}{a.species ? ` · ${a.species}` : ""}</td>
                        <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right" }}>{a.sale?.pricePerHead != null ? `$${Number(a.sale.pricePerHead).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>{a.sale?.buyerName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Btn size="sm" onClick={exportSalesReport}>Export as CSV (for taxes)</Btn>
            </>
          )}
        </Card>

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
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
const USER_DATA_KEYS = ["animals", "gestations", "notes", "offspring", "settings", "feederPrograms", "pastures"];
const GUEST_STORAGE_KEY = "herd_ledger_guest_data";
const GUEST_USER = { id: "guest", isGuest: true };

const DEFAULT_TAB_VISIBILITY = { dashboard: true, animals: true, gestation: true, notes: true, feeder: true, pastures: true };
const DEFAULT_SETTINGS = {
  farmName: "",
  ownerName: "",
  defaultSpecies: "Cattle",
  tabVisibility: { ...DEFAULT_TAB_VISIBILITY },
};

function cleanupOrphanedRecords(animals, gestations, offspring) {
  const animalIds = new Set((animals || []).map(a => a.id));
  const cleanedGestations = (gestations || [])
    .filter(g => animalIds.has(g.animalId))
    .map(g => (g.calf?.animalId && !animalIds.has(g.calf.animalId) ? { ...g, calf: undefined } : g));
  const rawOffspring = offspring && typeof offspring === "object" ? offspring : {};
  const cleanedOffspring = Object.fromEntries(
    Object.entries(rawOffspring)
      .filter(([motherId]) => animalIds.has(motherId))
      .map(([motherId, list]) => [
        motherId,
        (list || []).filter(c => c.stillborn || animalIds.has(c.id)),
      ])
      .filter(([, list]) => list.length > 0)
  );
  return { gestations: cleanedGestations, offspring: cleanedOffspring };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [animalsSearch, setAnimalsSearch] = useState("");
  const [viewingAnimal, setViewingAnimal] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [gestations, setGestations] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offspring, setOffspring] = useState({});
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [feederPrograms, setFeederPrograms] = useState([]);
  const [pastures, setPastures] = useState([]);
  const [feederPreselectAnimalId, setFeederPreselectAnimalId] = useState(null);
  const [feederBulkAnimalIds, setFeederBulkAnimalIds] = useState([]);
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
      setSettings({ ...DEFAULT_SETTINGS });
      setFeederPrograms([]);
      setPastures([]);
      initialLoadDone.current = false;
      return;
    }
    if (user.isGuest) {
      initialLoadDone.current = false;
      try {
        const raw = localStorage.getItem(GUEST_STORAGE_KEY);
        const data = raw ? JSON.parse(raw) : {};
        const animalsData = Array.isArray(data.animals) ? data.animals : [];
        const gestationsData = Array.isArray(data.gestations) ? data.gestations : [];
        const offspringData = data.offspring && typeof data.offspring === "object" ? data.offspring : {};
        const settingsData = data.settings && typeof data.settings === "object" ? { ...DEFAULT_SETTINGS, ...data.settings } : { ...DEFAULT_SETTINGS };
        const { gestations: cleanedGestations, offspring: cleanedOffspring } = cleanupOrphanedRecords(animalsData, gestationsData, offspringData);
        const animalIds = new Set(animalsData.map(a => a.id));
        const feederData = Array.isArray(data.feederPrograms) ? data.feederPrograms.filter(f => animalIds.has(f.animalId)) : [];
        setAnimals(animalsData);
        setGestations(cleanedGestations);
        setNotes(Array.isArray(data.notes) ? data.notes : []);
        setOffspring(cleanedOffspring);
        setSettings(settingsData);
        setFeederPrograms(feederData);
        setPastures(Array.isArray(data.pastures) ? data.pastures : []);
      } catch (_) {
        setAnimals([]);
        setGestations([]);
        setNotes([]);
        setOffspring({});
        setSettings({ ...DEFAULT_SETTINGS });
        setFeederPrograms([]);
        setPastures([]);
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
        const animalsData = Array.isArray(byKey.animals) ? byKey.animals : [];
        const gestationsData = Array.isArray(byKey.gestations) ? byKey.gestations : [];
        const offspringData = byKey.offspring && typeof byKey.offspring === "object" ? byKey.offspring : {};
        const settingsData = byKey.settings && typeof byKey.settings === "object" ? { ...DEFAULT_SETTINGS, ...byKey.settings } : { ...DEFAULT_SETTINGS };
        const { gestations: cleanedGestations, offspring: cleanedOffspring } = cleanupOrphanedRecords(animalsData, gestationsData, offspringData);
        const animalIds = new Set(animalsData.map(a => a.id));
        const feederData = Array.isArray(byKey.feederPrograms) ? byKey.feederPrograms.filter(f => animalIds.has(f.animalId)) : [];
        setAnimals(animalsData);
        setGestations(cleanedGestations);
        setNotes(Array.isArray(byKey.notes) ? byKey.notes : []);
        setOffspring(cleanedOffspring);
        setSettings(settingsData);
        setFeederPrograms(feederData);
        setPastures(Array.isArray(byKey.pastures) ? byKey.pastures : []);
        initialLoadDone.current = true;
      });
  }, [user]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "animals", data: animals }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, animals]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "gestations", data: gestations }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, gestations]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "notes", data: notes }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, notes]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "offspring", data: offspring }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, offspring]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "settings", data: settings }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, settings]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "feederPrograms", data: feederPrograms }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, feederPrograms]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "pastures", data: pastures }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, pastures]);

  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const visibleTabIds = new Set([
    ...(visibility.dashboard !== false ? ["dashboard"] : []),
    ...(visibility.animals !== false ? ["animals"] : []),
    ...(visibility.gestation !== false ? ["gestation"] : []),
    ...(visibility.feeder !== false ? ["feeder"] : []),
    ...(visibility.pastures !== false ? ["pastures"] : []),
    ...(visibility.notes !== false ? ["notes"] : []),
    "settings",
  ]);
  useEffect(() => {
    if (!visibleTabIds.has(tab)) setTab(visibility.dashboard !== false ? "dashboard" : "settings");
  }, [tab, visibility.dashboard, visibility.animals, visibility.gestation, visibility.feeder, visibility.pastures, visibility.notes]);

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
      <Nav tab={tab} setTab={setTab} hideGestationTab={viewingAnimal != null && !isFemale(viewingAnimal)} settings={settings} />
      {tab === "dashboard" && <Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} />}
      {tab === "animals"   && <Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} />}
      {tab === "gestation" && <Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} />}
      {tab === "feeder"    && <FeederCattle animals={animals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} />}
      {tab === "pastures"  && <Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} setTab={setTab} setViewingAnimal={setViewingAnimal} />}
      {tab === "notes"     && <Notes notes={notes} setNotes={setNotes} user={user} />}
      {tab === "settings"  && <Settings settings={settings} setSettings={setSettings} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} animals={animals} />}
    </div>
  );
}
