import { useState, useEffect } from "react";
import "./App.css";

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

// ── Storage ───────────────────────────────────────────────────────────────────
function loadData(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveData(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

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
function Card({ children, style = {}, className = "" }) {
  return (
    <div className={className} style={{
      background: "#fff",
      borderRadius: var2("radius2"),
      boxShadow: "var(--shadow)",
      border: "1px solid var(--cream3)",
      ...style
    }}>{children}</div>
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
    { id: "weather",   label: "Weather",   icon: "🌤" },
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
function Dashboard({ animals, gestations, moon, season }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];

  const speciesCounts = animals.reduce((acc, a) => { acc[a.species] = (acc[a.species] || 0) + 1; return acc; }, {});
  const activeGestations = gestations.filter(g => g.status !== "Delivered");

  const upcoming = activeGestations
    .map(g => { const a = animals.find(x => x.id === g.animalId); const due = daysUntil(g.dueDate); return { ...g, animal: a, due }; })
    .filter(g => g.due >= 0 && g.due <= 30)
    .sort((a, b) => a.due - b.due);

  const overdue = activeGestations
    .map(g => ({ ...g, due: daysUntil(g.dueDate), animal: animals.find(x => x.id === g.animalId) }))
    .filter(g => g.due < 0);

  return (
    <div className="hl-page hl-fade-in">

      {/* Top stats row */}
      <div className="hl-dash-stats">
        {[
          { label: "Total Animals", value: animals.length, sub: `${Object.keys(speciesCounts).length} species`, icon: "🐄" },
          { label: "Expecting",     value: activeGestations.length, sub: "active pregnancies", icon: "📅" },
          { label: "Due This Month",value: upcoming.length, sub: overdue.length > 0 ? `${overdue.length} overdue` : "none overdue", icon: "⚠️", alert: overdue.length > 0 },
          { label: "Moon Phase",    value: moon.icon, sub: moon.name, icon: null, large: true },
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
                    <span style={{ fontWeight: 600 }}>{g.animal?.name || "Unknown"}</span>
                    <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{g.animal?.species}</span>
                  </div>
                  <Badge color="var(--danger2)">{Math.abs(g.due)}d overdue</Badge>
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
                        <div style={{ fontWeight: 600 }}>{g.animal?.name || "Unknown"}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{g.animal?.species} · Due {fmt(g.dueDate)}</div>
                      </div>
                    </div>
                    <Badge color={g.due <= 7 ? "var(--brass2)" : "var(--green3)"}>
                      {g.due === 0 ? "Today" : `${g.due}d`}
                    </Badge>
                  </div>
                  <ProgressBar value={progress(g.breedingDate, g.gestationDays)} />
                </div>
              ))}
            </Card>
          )}

          {/* Herd breakdown */}
          {animals.length > 0 && (
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
                    <ProgressBar value={(n / animals.length) * 100} height={4} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!animals.length && !activeGestations.length && (
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
function Animals({ animals, setAnimals }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", species: "Cattle", sex: "Female", dob: "", breed: "", tag: "", notes: "" });
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState("");

  function add() {
    if (!form.name) return;
    setAnimals(p => [...p, { ...form, id: Date.now().toString() }]);
    setForm({ name: "", species: "Cattle", sex: "Female", dob: "", breed: "", tag: "", notes: "" });
    setShowAdd(false);
  }

  function remove(id) {
    if (!confirm("Remove this animal from the register?")) return;
    setAnimals(p => p.filter(a => a.id !== id));
    setViewing(null);
  }

  const filtered = animals.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.species.toLowerCase().includes(search.toLowerCase()) ||
    (a.tag || "").toLowerCase().includes(search.toLowerCase())
  );

  if (viewing) {
    const a = viewing;
    return (
      <div className="hl-page hl-page-narrow hl-fade-in">
        <button onClick={() => setViewing(null)} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", marginBottom: "20px", display: "flex", alignItems: "center", gap: "4px" }}>
          ← Back to Animals
        </button>
        <Card style={{ padding: "0", overflow: "hidden" }}>
          <div className="hl-detail-header" style={{ background: "var(--green)", padding: "28px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div style={{ fontSize: "52px" }}>{SPECIES[a.species]?.emoji}</div>
            <div>
              <div className="hl-detail-name" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#fff" }}>{a.name}</div>
              <div style={{ color: "var(--brass3)", fontSize: "14px", marginTop: "2px" }}>{a.breed || a.species} · {a.sex}</div>
            </div>
            {a.tag && <Badge color="var(--brass2)" style={{ marginLeft: "auto" }}>#{a.tag}</Badge>}
          </div>
          <div style={{ padding: "28px 32px" }}>
            <div className="hl-detail-grid" style={{ marginBottom: "24px" }}>
              {[["Species", a.species], ["Breed", a.breed || "—"], ["Sex", a.sex], ["Date of Birth", fmt(a.dob)], ["Tag / ID", a.tag || "—"], ["Gestation", `${SPECIES[a.species]?.days ?? "—"} days`]].map(([k, v]) => (
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
            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="danger" size="sm" onClick={() => remove(a.id)}>Remove Animal</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Register Animal</Btn>}>
        Animal Register
      </SectionTitle>

      {/* Search */}
      <div style={{ marginBottom: "20px" }}>
        <Input placeholder="Search by name, species, or tag..." value={search} onChange={e => setSearch(e.target.value)} />
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
          <Card key={a.id} style={{ padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s" }}
            onClick={() => setViewing(a)}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow2)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.transform = ""; }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <span style={{ fontSize: "28px" }}>{SPECIES[a.species]?.emoji}</span>
              {a.tag && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>#{a.tag}</span>}
            </div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "2px" }}>{a.name}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{a.breed || a.species} · {a.sex}</div>
            {a.dob && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>Born {fmt(a.dob)}</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Gestation ─────────────────────────────────────────────────────────────────
function Gestation({ animals, gestations, setGestations }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", sire: "", notes: "" });

  const females = animals.filter(a => a.sex === "Female" || !a.sex);

  function add() {
    if (!form.animalId || !form.breedingDate) return;
    const animal = animals.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const due = dueDate(form.breedingDate, totalDays);
    setGestations(p => [...p, { ...form, id: Date.now().toString(), dueDate: due, gestationDays: totalDays, status: "Active", createdAt: new Date().toISOString() }]);
    setForm({ animalId: "", breedingDate: "", sire: "", notes: "" });
    setShowAdd(false);
  }

  function markDelivered(id) {
    setGestations(p => p.map(g => g.id === id ? { ...g, status: "Delivered", deliveredAt: new Date().toISOString() } : g));
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
              {females.map(a => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
            </Select>
            <Input label="Breeding Date *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
            <Input label="Sire (optional)" value={form.sire} onChange={e => setForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          {form.animalId && form.breedingDate && (() => {
            const a = animals.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            const due = days ? fmt(dueDate(form.breedingDate, days)) : "—";
            return (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                📅 Estimated due: <strong>{due}</strong> · Gestation: <strong>{days} days</strong>
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Record</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!active.length && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📅</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No active breeding records.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {active.map(g => {
          const animal = animals.find(a => a.id === g.animalId);
          const due = daysUntil(g.dueDate);
          const pct = progress(g.breedingDate, g.gestationDays);
          const isOverdue = due < 0;
          const isUrgent = due >= 0 && due <= 7;
          return (
            <Card key={g.id} className="hl-gestation-card" style={{ padding: "20px 24px", borderLeft: `4px solid ${isOverdue ? "var(--danger2)" : isUrgent ? "var(--brass)" : "var(--green3)"}` }}>
              <div className="hl-gestation-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "28px" }}>{SPECIES[animal?.species]?.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{animal?.name || "Unknown"}</div>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {animal?.species}{g.sire ? ` × ${g.sire}` : ""} · Bred {fmt(g.breedingDate)}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge color={isOverdue ? "var(--danger2)" : isUrgent ? "var(--brass2)" : "var(--green3)"}>
                    {isOverdue ? `${Math.abs(due)}d overdue` : due === 0 ? "Due today" : `${due} days`}
                  </Badge>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Due {fmt(g.dueDate)}</div>
                </div>
              </div>
              <div style={{ marginBottom: "6px" }}>
                <ProgressBar value={pct} color={isOverdue ? "var(--danger2)" : "var(--green3)"} height={8} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
                <span>{Math.round(pct)}% complete</span>
                <span>{g.gestationDays} day gestation</span>
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
              return (
                <Card key={g.id} className="hl-delivered-row" style={{ padding: "14px 20px", opacity: 0.65, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span>{SPECIES[animal?.species]?.emoji}</span>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>{animal?.name || "Unknown"}</span>
                      <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{animal?.species}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Badge color="var(--green)">Delivered</Badge>
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>Due {fmt(g.dueDate)}</span>
                    <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Weather ───────────────────────────────────────────────────────────────────
function Weather() {
  const [location, setLocation] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("hl-apikey") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyVal, setKeyVal] = useState("");

  function saveKey() {
    localStorage.setItem("hl-apikey", keyVal);
    setApiKey(keyVal);
    setShowKeyInput(false);
  }

  async function fetchWeather() {
    if (!location.trim()) return;
    if (!apiKey) { setShowKeyInput(true); return; }
    setLoading(true); setError(""); setData(null);
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system: `You are a farm weather advisor. Search for current weather and 5-day forecast. Return ONLY valid JSON: {"current":{"temp":"72°F","condition":"Partly Cloudy","humidity":"65%","wind":"SW 12 mph","feels":"70°F","desc":"Brief plain-language description of current conditions for farmers."},"forecast":[{"day":"Mon","high":"74","low":"55","condition":"Fair","farmNote":"Good day for field work"},{"day":"Tue","high":"68","low":"50","condition":"Rain","farmNote":"Keep livestock sheltered"},{"day":"Wed","high":"62","low":"45","condition":"Clearing","farmNote":"Check fences post-storm"},{"day":"Thu","high":"65","low":"48","condition":"Fair","farmNote":"Good hay drying"},{"day":"Fri","high":"70","low":"52","condition":"Partly Cloudy","farmNote":"Favorable for outdoor work"}],"advice":"Two sentence farming advice for this week.","bestDays":"Which specific days are best for outdoor work."}`,
          messages: [{ role: "user", content: `Weather for: ${location}` }]
        })
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message);
      const text = json.content.filter(c => c.type === "text").map(c => c.text).join("");
      setData(JSON.parse(text.trim()));
    } catch(e) {
      setError("Could not retrieve weather. Check your API key or location.");
    }
    setLoading(false);
  }

  return (
    <div className="hl-page hl-page-gestation hl-fade-in">
      <SectionTitle>Weather Observatory</SectionTitle>

      {showKeyInput && (
        <Card style={{ padding: "20px", marginBottom: "20px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontWeight: 600, marginBottom: "4px" }}>Anthropic API Key Required</div>
          <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>Get a free key at console.anthropic.com — stored only in your browser.</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <input type="password" value={keyVal} onChange={e => setKeyVal(e.target.value)} placeholder="sk-ant-..." style={{ flex: 1, padding: "9px 12px", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", fontSize: "14px", outline: "none" }} />
            <Btn onClick={saveKey}>Save Key</Btn>
            <Btn variant="secondary" onClick={() => setShowKeyInput(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div className="hl-weather-search">
        <Input placeholder="Enter town, county, or ZIP code..." value={location} onChange={e => setLocation(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchWeather()} style={{ flex: 1 }} />
        <Btn onClick={fetchWeather} disabled={loading}>{loading ? "Loading..." : "Get Weather"}</Btn>
      </div>

      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "24px" }}>
        {apiKey ? <>API key saved · <button onClick={() => setShowKeyInput(true)} style={{ background: "none", border: "none", color: "var(--green)", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>change</button></> : <button onClick={() => setShowKeyInput(true)} style={{ background: "none", border: "none", color: "var(--brass2)", fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>Add API key to enable weather</button>}
      </div>

      {loading && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "10px" }}>🌤</div>
          <div style={{ color: "var(--muted)" }}>Fetching current conditions...</div>
        </Card>
      )}

      {error && <Card style={{ padding: "16px 20px", borderLeft: "4px solid var(--danger2)" }}><span style={{ color: "var(--danger2)" }}>{error}</span></Card>}

      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} className="hl-fade-in">
          <Card style={{ padding: "24px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "14px" }}>Current Conditions · {location}</div>
            <div className="hl-weather-current">
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "64px", fontWeight: 700, color: "var(--green)", lineHeight: 1 }}>{data.current.temp}</div>
                <div style={{ fontSize: "15px", color: "var(--ink2)", fontWeight: 500, marginTop: "4px" }}>{data.current.condition}</div>
              </div>
              <div>
                <div className="hl-weather-stats">
                  {[["Humidity", data.current.humidity], ["Wind", data.current.wind], ["Feels Like", data.current.feels]].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{k}</div>
                      <div style={{ fontSize: "15px", fontWeight: 500, marginTop: "2px" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.6, borderLeft: "3px solid var(--brass)", paddingLeft: "12px", fontStyle: "italic" }}>{data.current.desc}</p>
              </div>
            </div>
          </Card>

          <div className="hl-weather-forecast">
            {data.forecast.map((f, i) => (
              <Card key={i} style={{ padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>{f.day}</div>
                <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "6px" }}>{f.condition}</div>
                <div style={{ marginBottom: "8px" }}>
                  <span style={{ fontWeight: 700, color: "var(--green)" }}>{f.high}°</span>
                  <span style={{ color: "var(--muted)", marginLeft: "4px" }}>{f.low}°</span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--ink2)", fontStyle: "italic", lineHeight: 1.4 }}>{f.farmNote}</div>
              </Card>
            ))}
          </div>

          <div className="hl-weather-advice">
            {[["🌾 Farming Advice", data.advice], ["📅 Best Days This Week", data.bestDays]].map(([title, text]) => (
              <Card key={title} style={{ padding: "18px 20px" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>{title}</div>
                <p style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.7 }}>{text}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function Notes({ notes, setNotes }) {
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
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [animals, setAnimals]       = useState(() => loadData("hl-animals", []));
  const [gestations, setGestations] = useState(() => loadData("hl-gestations", []));
  const [notes, setNotes]           = useState(() => loadData("hl-notes", []));

  const moon   = getMoonPhase();
  const season = getSeason();

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  useEffect(() => saveData("hl-animals",    animals),    [animals]);
  useEffect(() => saveData("hl-gestations", gestations), [gestations]);
  useEffect(() => saveData("hl-notes",      notes),      [notes]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <Nav tab={tab} setTab={setTab} />
      {tab === "dashboard" && <Dashboard animals={animals} gestations={gestations} moon={moon} season={season} />}
      {tab === "animals"   && <Animals animals={animals} setAnimals={setAnimals} />}
      {tab === "gestation" && <Gestation animals={animals} gestations={gestations} setGestations={setGestations} />}
      {tab === "weather"   && <Weather />}
      {tab === "notes"     && <Notes notes={notes} setNotes={setNotes} />}
    </div>
  );
}
