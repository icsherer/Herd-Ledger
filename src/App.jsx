import { useState, useEffect } from "react";

// ── Data ─────────────────────────────────────────────────────────────────────
const SPECIES = {
  Cattle:  { days: 283, sign: "♉", color: "#7a4f2e" },
  Horse:   { days: 340, sign: "♐", color: "#5a3e28" },
  Pig:     { days: 114, sign: "♓", color: "#b97b72" },
  Sheep:   { days: 147, sign: "♈", color: "#8a7a6a" },
  Goat:    { days: 150, sign: "♑", color: "#6b5e4a" },
  Llama:   { days: 350, sign: "♊", color: "#a08866" },
  Alpaca:  { days: 345, sign: "♊", color: "#b8a48c" },
  Donkey:  { days: 365, sign: "♑", color: "#7a6a5a" },
  Rabbit:  { days: 31,  sign: "♋", color: "#a8886a" },
  Dog:     { days: 63,  sign: "♌", color: "#c49060" },
  Cat:     { days: 65,  sign: "♍", color: "#9a8878" },
};

const MOON_ICONS = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
const MOON_NAMES = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];

function getMoonPhase(date = new Date()) {
  let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (m < 3) { y--; m += 12; } m++;
  const jd = Math.floor(365.25 * y) + Math.floor(30.6 * m) + d - 694039.09;
  const b = Math.round((jd / 29.5305882 % 1) * 8) % 8;
  return { icon: MOON_ICONS[b], name: MOON_NAMES[b], index: b };
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

const DIVIDER = "✦ ✦ ✦";

// ── Storage (localStorage) ────────────────────────────────────────────────────
function loadData(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
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
function var_(name) { return `var(--${name})`; }

// ── CSS ───────────────────────────────────────────────────────────────────────
const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Cardo:ital,wght@0,400;0,700;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --parch: #f2e8d0;
    --parch2: #e8d8b8;
    --parch3: #d8c8a0;
    --ink: #1c0f06;
    --ink2: #3a2010;
    --red: #8b1a1a;
    --red2: #6b1010;
    --brown: #5a3a1a;
    --brown2: #8b6040;
    --faded: #9a8060;
    --border: 2px solid #5a3a1a;
  }

  body {
    background: var(--parch);
    color: var(--ink);
    font-family: 'Cardo', Georgia, serif;
    min-height: 100vh;
  }

  .paper-texture {
    background-image:
      repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(90,58,26,0.04) 28px, rgba(90,58,26,0.04) 29px),
      radial-gradient(ellipse at 20% 50%, rgba(180,140,80,0.08) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 20%, rgba(160,120,60,0.06) 0%, transparent 50%);
  }

  .ornament { color: var(--red); text-align: center; letter-spacing: 8px; font-size: 12px; margin: 12px 0; }

  button { cursor: pointer; font-family: 'Cardo', Georgia, serif; }
  input, select, textarea { font-family: 'Cardo', Georgia, serif; }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function Nav({ tab, setTab }) {
  const tabs = ["Dashboard", "Animals", "Gestation", "Weather", "Notes"];
  return (
    <nav style={{ background: var_("ink2"), borderBottom: "3px solid var(--red)", display: "flex", gap: 0, overflowX: "auto" }}>
      {tabs.map(t => (
        <button key={t} onClick={() => setTab(t.toLowerCase())} style={{
          padding: "10px 20px",
          background: tab === t.toLowerCase() ? "var(--red2)" : "transparent",
          color: tab === t.toLowerCase() ? "var(--parch)" : "var(--parch3)",
          border: "none",
          borderRight: "1px solid rgba(255,255,255,0.1)",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontSize: "15px", letterSpacing: "1px",
          transition: "all 0.2s", whiteSpace: "nowrap",
        }}>{t}</button>
      ))}
    </nav>
  );
}

function MoonWidget({ moon }) {
  return (
    <div style={{ textAlign: "center", padding: "16px" }}>
      <div style={{ fontSize: "48px", lineHeight: 1 }}>{moon.icon}</div>
      <div style={{ fontFamily: "'IM Fell English'", color: "var(--red)", fontSize: "13px", marginTop: "4px", letterSpacing: "1px" }}>{moon.name}</div>
    </div>
  );
}

function ProgressBar({ value, color = "var(--red)" }) {
  return (
    <div style={{ background: "var(--parch3)", height: "8px", borderRadius: 0, border: "1px solid var(--brown2)", overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, transition: "width 0.5s" }} />
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ textAlign: "center", margin: "24px 0 16px" }}>
      <div style={{ fontFamily: "'IM Fell English'", fontSize: "22px", color: "var(--ink2)", letterSpacing: "2px" }}>{children}</div>
      <div className="ornament">{DIVIDER}</div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ animals, gestations, moon, season }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];
  const month = today.toLocaleString("default", { month: "long" });
  const year = today.getFullYear();

  const upcoming = gestations
    .filter(g => g.status !== "Delivered")
    .map(g => { const a = animals.find(x => x.id === g.animalId); const due = daysUntil(g.dueDate); return { ...g, animal: a, due }; })
    .filter(g => g.due >= 0 && g.due <= 30)
    .sort((a, b) => a.due - b.due);

  const overdue = gestations
    .filter(g => g.status !== "Delivered")
    .map(g => ({ ...g, due: daysUntil(g.dueDate), animal: animals.find(x => x.id === g.animalId) }))
    .filter(g => g.due < 0);

  return (
    <div>
      <div style={{ textAlign: "center", padding: "32px 24px 16px", borderBottom: "3px double var(--brown)", background: "linear-gradient(180deg, var(--parch2) 0%, var(--parch) 100%)" }}>
        <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", letterSpacing: "6px", color: "var(--faded)", textTransform: "uppercase", marginBottom: "4px" }}>The Stockman's</div>
        <div style={{ fontFamily: "'IM Fell English'", fontStyle: "italic", fontSize: "42px", color: "var(--ink)", lineHeight: 1, marginBottom: "4px" }}>Farmer's Almanac</div>
        <div style={{ fontFamily: "'IM Fell English'", fontSize: "13px", color: "var(--red)", letterSpacing: "3px" }}>{month.toUpperCase()} · {year}</div>
        <div className="ornament" style={{ marginTop: "12px" }}>— {season} —</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", background: "var(--brown)", borderBottom: "2px solid var(--brown)" }}>
        <div style={{ background: "var(--parch)", padding: "16px", textAlign: "center" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", color: "var(--faded)", letterSpacing: "3px", marginBottom: "4px" }}>MOON</div>
          <MoonWidget moon={moon} />
        </div>
        <div style={{ background: "var(--parch)", padding: "16px" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", color: "var(--faded)", letterSpacing: "3px", marginBottom: "12px", textAlign: "center" }}>STOCK COUNT</div>
          {Object.entries(animals.reduce((acc, a) => { acc[a.species] = (acc[a.species] || 0) + 1; return acc; }, {})).map(([sp, n]) => (
            <div key={sp} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dotted var(--parch3)", padding: "3px 0", fontSize: "15px" }}>
              <span>{sp}</span><span style={{ fontWeight: "bold", color: "var(--red2)" }}>{n}</span>
            </div>
          ))}
          {!animals.length && <div style={{ color: "var(--faded)", fontStyle: "italic", textAlign: "center", fontSize: "14px" }}>No animals registered</div>}
        </div>
        <div style={{ background: "var(--parch)", padding: "16px", textAlign: "center" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", color: "var(--faded)", letterSpacing: "3px", marginBottom: "8px" }}>TODAY</div>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "36px", color: "var(--red)", lineHeight: 1 }}>{today.getDate()}</div>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "14px", color: "var(--ink2)", marginTop: "2px" }}>{today.toLocaleDateString("en-US", { weekday: "long" })}</div>
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--faded)", letterSpacing: "1px" }}>{gestations.filter(g => g.status !== "Delivered").length} Expecting</div>
        </div>
      </div>

      <div style={{ margin: "24px", padding: "20px 28px", border: "2px solid var(--brown2)", background: "var(--parch2)", position: "relative" }}>
        <div style={{ position: "absolute", top: "-11px", left: "50%", transform: "translateX(-50%)", background: "var(--parch2)", padding: "0 12px", fontFamily: "'IM Fell English'", fontSize: "11px", color: "var(--red)", letterSpacing: "4px" }}>ALMANAC WISDOM</div>
        <p style={{ fontFamily: "'IM Fell English'", fontStyle: "italic", fontSize: "18px", color: "var(--ink2)", textAlign: "center", lineHeight: 1.6 }}>"{tip}"</p>
      </div>

      {(upcoming.length > 0 || overdue.length > 0) && (
        <div style={{ margin: "0 24px 24px" }}>
          <SectionHeader>Births Expected Within 30 Days</SectionHeader>
          {overdue.map(g => (
            <div key={g.id} style={{ background: "#5a1a1a", color: "var(--parch)", padding: "12px 16px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><span style={{ fontFamily: "'IM Fell English'", fontSize: "16px" }}>{g.animal?.name || "Unknown"}</span><span style={{ fontSize: "13px", marginLeft: "8px", opacity: 0.8 }}>{g.animal?.species}</span></div>
              <div style={{ fontFamily: "'IM Fell English'", color: "#ffcccc" }}>OVERDUE — CHECK NOW</div>
            </div>
          ))}
          {upcoming.map(g => (
            <div key={g.id} style={{ background: "var(--parch2)", border: "1px solid var(--brown2)", padding: "12px 16px", marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <div><span style={{ fontFamily: "'IM Fell English'", fontSize: "16px" }}>{g.animal?.name || "Unknown"}</span><span style={{ fontSize: "13px", color: "var(--faded)", marginLeft: "8px" }}>{g.animal?.species}</span></div>
                <div style={{ fontFamily: "'IM Fell English'", color: "var(--red)", fontSize: "14px" }}>{g.due === 0 ? "Due Today!" : `${g.due} day${g.due !== 1 ? "s" : ""}`}</div>
              </div>
              <ProgressBar value={progress(g.breedingDate, g.gestationDays)} />
              <div style={{ fontSize: "12px", color: "var(--faded)", marginTop: "4px" }}>Due {fmt(g.dueDate)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Animals ───────────────────────────────────────────────────────────────────
function Animals({ animals, setAnimals }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", species: "Cattle", sex: "Female", dob: "", color: "", tag: "", notes: "" });
  const [viewing, setViewing] = useState(null);

  function add() {
    if (!form.name) return;
    setAnimals(p => [...p, { ...form, id: Date.now().toString() }]);
    setForm({ name: "", species: "Cattle", sex: "Female", dob: "", color: "", tag: "", notes: "" });
    setShowAdd(false);
  }

  function remove(id) {
    if (!confirm("Remove this animal from the register?")) return;
    setAnimals(p => p.filter(a => a.id !== id));
  }

  const inputStyle = { width: "100%", padding: "8px 10px", background: "var(--parch)", border: "1px solid var(--brown2)", color: "var(--ink)", fontSize: "15px", outline: "none" };
  const labelStyle = { fontFamily: "'IM Fell English'", fontSize: "12px", letterSpacing: "2px", color: "var(--faded)", display: "block", marginBottom: "4px" };

  if (viewing) {
    const a = viewing;
    return (
      <div style={{ padding: "24px" }}>
        <button onClick={() => setViewing(null)} style={{ background: "none", border: "none", color: "var(--red)", fontFamily: "'IM Fell English'", fontSize: "14px", letterSpacing: "1px", marginBottom: "16px" }}>← Back to Register</button>
        <div style={{ border: "2px solid var(--brown)", background: "var(--parch2)", padding: "28px" }}>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontFamily: "'IM Fell English'", fontSize: "32px", color: "var(--ink)" }}>{a.name}</div>
            <div style={{ color: "var(--red)", letterSpacing: "4px", fontSize: "12px", fontFamily: "'IM Fell English'" }}>{a.species.toUpperCase()} · {a.sex?.toUpperCase()}</div>
          </div>
          <div className="ornament">{DIVIDER}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
            {[["Date of Birth", fmt(a.dob)], ["Tag / ID", a.tag || "—"], ["Color / Markings", a.color || "—"]].map(([k, v]) => (
              <div key={k}><div style={labelStyle}>{k}</div><div style={{ fontSize: "16px" }}>{v}</div></div>
            ))}
          </div>
          {a.notes && (
            <div style={{ marginTop: "20px", padding: "16px", background: "var(--parch)", borderLeft: "3px solid var(--red)" }}>
              <div style={labelStyle}>NOTES</div>
              <p style={{ fontStyle: "italic", fontSize: "15px", lineHeight: 1.6 }}>{a.notes}</p>
            </div>
          )}
          <div style={{ marginTop: "20px", padding: "12px", background: "var(--parch3)", borderLeft: "3px solid var(--brown2)" }}>
            <div style={labelStyle}>GESTATION PERIOD</div>
            <div style={{ fontSize: "16px" }}>{SPECIES[a.species]?.days ?? "—"} days</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontFamily: "'IM Fell English'", fontSize: "24px" }}>Animal Register</div>
        <button onClick={() => setShowAdd(true)} style={{ background: "var(--red2)", color: "var(--parch)", border: "none", padding: "8px 18px", fontFamily: "'IM Fell English'", fontSize: "14px", letterSpacing: "1px" }}>+ Register Animal</button>
      </div>

      {showAdd && (
        <div style={{ background: "var(--parch2)", border: "2px solid var(--brown)", padding: "24px", marginBottom: "24px" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "18px", marginBottom: "16px", color: "var(--red)" }}>New Animal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[["Name", "name", "text"], ["Tag / ID", "tag", "text"], ["Color / Markings", "color", "text"], ["Date of Birth", "dob", "date"]].map(([label, key, type]) => (
              <div key={key}>
                <label style={labelStyle}>{label.toUpperCase()}</label>
                <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>SPECIES</label>
              <select value={form.species} onChange={e => setForm(p => ({ ...p, species: e.target.value }))} style={inputStyle}>
                {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>SEX</label>
              <select value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))} style={inputStyle}>
                <option>Female</option><option>Male</option><option>Wether/Steer</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <label style={labelStyle}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={add} style={{ background: "var(--ink2)", color: "var(--parch)", border: "none", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Register</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid var(--brown2)", color: "var(--ink2)", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Cancel</button>
          </div>
        </div>
      )}

      {!animals.length && !showAdd && (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--faded)", fontStyle: "italic", fontSize: "18px" }}>No animals in the register yet.</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
        {animals.map(a => (
          <div key={a.id} onClick={() => setViewing(a)} style={{ background: "var(--parch2)", border: "1px solid var(--brown2)", padding: "16px", cursor: "pointer", boxShadow: "2px 2px 0 var(--parch3)" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "3px 3px 0 var(--brown2)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "2px 2px 0 var(--parch3)"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "'IM Fell English'", fontSize: "20px", color: "var(--ink)" }}>{a.name}</div>
                <div style={{ fontSize: "13px", color: "var(--faded)", letterSpacing: "1px" }}>{a.species} · {a.sex}</div>
              </div>
              <div style={{ color: "var(--red)", fontSize: "18px" }}>{SPECIES[a.species]?.sign}</div>
            </div>
            {a.tag && <div style={{ fontSize: "12px", color: "var(--faded)", marginTop: "8px" }}>Tag: {a.tag}</div>}
            {a.dob && <div style={{ fontSize: "12px", color: "var(--faded)" }}>Born: {fmt(a.dob)}</div>}
            <div style={{ marginTop: "10px", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={e => { e.stopPropagation(); remove(a.id); }} style={{ background: "none", border: "none", color: "var(--faded)", fontSize: "12px", fontFamily: "'IM Fell English'" }}>Remove</button>
            </div>
          </div>
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
  const inputStyle = { width: "100%", padding: "8px 10px", background: "var(--parch)", border: "1px solid var(--brown2)", color: "var(--ink)", fontSize: "15px", outline: "none" };
  const labelStyle = { fontFamily: "'IM Fell English'", fontSize: "12px", letterSpacing: "2px", color: "var(--faded)", display: "block", marginBottom: "4px" };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontFamily: "'IM Fell English'", fontSize: "24px" }}>Gestation Ledger</div>
        <button onClick={() => setShowAdd(true)} style={{ background: "var(--red2)", color: "var(--parch)", border: "none", padding: "8px 18px", fontFamily: "'IM Fell English'", fontSize: "14px", letterSpacing: "1px" }}>+ Log Breeding</button>
      </div>

      {showAdd && (
        <div style={{ background: "var(--parch2)", border: "2px solid var(--brown)", padding: "24px", marginBottom: "24px" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "18px", marginBottom: "16px", color: "var(--red)" }}>Log Breeding Date</div>
          {!females.length && <p style={{ color: "var(--faded)", fontStyle: "italic" }}>No female animals registered. Add animals first.</p>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>ANIMAL (DAM)</label>
              <select value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))} style={inputStyle}>
                <option value="">— Select Animal —</option>
                {females.map(a => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>BREEDING DATE</label>
              <input type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>SIRE (OPTIONAL)</label>
              <input type="text" value={form.sire} onChange={e => setForm(p => ({ ...p, sire: e.target.value }))} style={inputStyle} placeholder="Sire name or ID" />
            </div>
          </div>
          <div style={{ marginTop: "12px" }}>
            <label style={labelStyle}>NOTES</label>
            <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          {form.animalId && form.breedingDate && (() => {
            const a = animals.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            const due = days ? fmt(dueDate(form.breedingDate, days)) : "—";
            return <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--parch3)", fontSize: "14px", color: "var(--ink2)" }}>Estimated due date: <strong>{due}</strong> · Gestation: <strong>{days} days</strong></div>;
          })()}
          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button onClick={add} style={{ background: "var(--ink2)", color: "var(--parch)", border: "none", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Record</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid var(--brown2)", color: "var(--ink2)", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Cancel</button>
          </div>
        </div>
      )}

      {!active.length && !showAdd && <div style={{ textAlign: "center", padding: "40px", color: "var(--faded)", fontStyle: "italic", fontSize: "18px" }}>No active breeding records.</div>}

      {active.map(g => {
        const animal = animals.find(a => a.id === g.animalId);
        const due = daysUntil(g.dueDate);
        const pct = progress(g.breedingDate, g.gestationDays);
        const overdue = due < 0;
        return (
          <div key={g.id} style={{ background: overdue ? "#3a0a0a" : "var(--parch2)", border: `2px solid ${overdue ? "#8b1a1a" : "var(--brown2)"}`, padding: "18px 20px", marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <span style={{ fontFamily: "'IM Fell English'", fontSize: "20px", color: overdue ? "#ffcccc" : "var(--ink)" }}>{animal?.name || "Unknown"}</span>
                <span style={{ fontSize: "13px", color: overdue ? "#cc8888" : "var(--faded)", marginLeft: "10px" }}>{animal?.species} {g.sire ? `× ${g.sire}` : ""}</span>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'IM Fell English'", color: overdue ? "#ff8888" : "var(--red)", fontSize: "18px" }}>{overdue ? `${Math.abs(due)}d Overdue` : due === 0 ? "Due Today!" : `${due} days`}</div>
                <div style={{ fontSize: "12px", color: overdue ? "#cc8888" : "var(--faded)" }}>Due {fmt(g.dueDate)}</div>
              </div>
            </div>
            <ProgressBar value={pct} color={overdue ? "#8b1a1a" : "var(--red)"} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "12px", color: overdue ? "#cc8888" : "var(--faded)" }}>
              <span>Bred {fmt(g.breedingDate)}</span><span>{Math.round(pct)}% of {g.gestationDays}d</span>
            </div>
            {g.notes && <div style={{ marginTop: "8px", fontStyle: "italic", fontSize: "14px", color: overdue ? "#cc8888" : "var(--ink2)" }}>{g.notes}</div>}
            <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
              <button onClick={() => markDelivered(g.id)} style={{ background: "var(--brown)", color: "var(--parch)", border: "none", padding: "6px 14px", fontFamily: "'IM Fell English'", fontSize: "13px" }}>✓ Mark Delivered</button>
              <button onClick={() => remove(g.id)} style={{ background: "none", border: "none", color: "var(--faded)", fontFamily: "'IM Fell English'", fontSize: "13px" }}>Remove</button>
            </div>
          </div>
        );
      })}

      {delivered.length > 0 && (
        <>
          <SectionHeader>Delivered Records</SectionHeader>
          {delivered.map(g => {
            const animal = animals.find(a => a.id === g.animalId);
            return (
              <div key={g.id} style={{ background: "var(--parch)", border: "1px solid var(--parch3)", padding: "12px 16px", marginBottom: "8px", opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><span style={{ fontFamily: "'IM Fell English'", fontSize: "16px" }}>{animal?.name || "Unknown"}</span><span style={{ fontSize: "13px", color: "var(--faded)", marginLeft: "8px" }}>{animal?.species}</span></div>
                <div style={{ fontSize: "13px", color: "var(--faded)" }}>Delivered · Due {fmt(g.dueDate)}</div>
                <button onClick={() => remove(g.id)} style={{ background: "none", border: "none", color: "var(--faded)", fontFamily: "'IM Fell English'", fontSize: "12px" }}>×</button>
              </div>
            );
          })}
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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lsa-apikey") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);

  function saveKey(k) {
    localStorage.setItem("lsa-apikey", k);
    setApiKey(k);
    setShowKeyInput(false);
  }

  async function fetch_weather() {
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
          system: `You are a 19th-century almanac weather correspondent. Search for current weather and 5-day forecast for the given location. Return ONLY valid JSON (no markdown, no backticks) with this structure: {"current":{"temp":"72°F","condition":"Partly Cloudy","humidity":"65%","wind":"SW 12 mph","feels":"70°F","almanacDesc":"A fair autumnal morning..."},"forecast":[{"day":"Mon","high":"74","low":"55","condition":"Fair","farmNote":"Good plowing weather"},{"day":"Tue","high":"68","low":"50","condition":"Rain","farmNote":"Keep livestock sheltered"},{"day":"Wed","high":"62","low":"45","condition":"Clearing","farmNote":"Inspect fences after rain"},{"day":"Thu","high":"65","low":"48","condition":"Fair","farmNote":"Good hay drying conditions"},{"day":"Fri","high":"70","low":"52","condition":"Partly Cloudy","farmNote":"Favorable for outdoor work"}],"farmingAdvice":"Brief farming advice.","bestDaysToWork":"Which days are best."}`,
          messages: [{ role: "user", content: `Current weather and 5-day forecast for: ${location}` }]
        })
      });
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message);
      const text = json.content.filter(c => c.type === "text").map(c => c.text).join("");
      setData(JSON.parse(text.trim()));
    } catch(e) {
      setError("Could not retrieve weather. Check your API key or location and try again.");
    }
    setLoading(false);
  }

  const inputStyle = { flex: 1, padding: "10px 14px", background: "var(--parch)", border: "2px solid var(--brown2)", color: "var(--ink)", fontSize: "16px", outline: "none", fontFamily: "'Cardo', serif" };

  return (
    <div style={{ padding: "24px" }}>
      <SectionHeader>Weather Observatory</SectionHeader>

      {showKeyInput && (
        <div style={{ background: "var(--parch2)", border: "2px solid var(--brown)", padding: "20px", marginBottom: "20px" }}>
          <div style={{ fontFamily: "'IM Fell English'", fontSize: "14px", color: "var(--red)", marginBottom: "8px" }}>Enter your Anthropic API Key to enable weather</div>
          <p style={{ fontSize: "13px", color: "var(--faded)", marginBottom: "12px" }}>Get one free at console.anthropic.com — stored only in your browser.</p>
          <ApiKeyEntry onSave={saveKey} onCancel={() => setShowKeyInput(false)} />
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input type="text" value={location} onChange={e => setLocation(e.target.value)} onKeyDown={e => e.key === "Enter" && fetch_weather()} placeholder="Enter town, county, or ZIP..." style={inputStyle} />
        <button onClick={fetch_weather} disabled={loading} style={{ background: "var(--red2)", color: "var(--parch)", border: "none", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "15px", letterSpacing: "1px", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Consulting..." : "Consult"}
        </button>
      </div>

      {apiKey && <div style={{ fontSize: "12px", color: "var(--faded)", marginBottom: "16px" }}>API key saved · <button onClick={() => setShowKeyInput(true)} style={{ background: "none", border: "none", color: "var(--faded)", fontSize: "12px", textDecoration: "underline", cursor: "pointer" }}>change</button></div>}
      {!apiKey && !showKeyInput && <div style={{ fontSize: "13px", color: "var(--faded)", marginBottom: "16px", fontStyle: "italic" }}>No API key set — <button onClick={() => setShowKeyInput(true)} style={{ background: "none", border: "none", color: "var(--red)", fontSize: "13px", textDecoration: "underline", cursor: "pointer" }}>add one to enable weather</button></div>}

      {loading && <div style={{ textAlign: "center", padding: "48px", fontStyle: "italic", color: "var(--faded)", fontSize: "18px" }}>Consulting the celestial instruments...</div>}
      {error && <div style={{ padding: "16px", background: "#3a0a0a", color: "#ffcccc", fontStyle: "italic" }}>{error}</div>}

      {data && (
        <>
          <div style={{ border: "2px solid var(--brown)", background: "var(--parch2)", padding: "24px", marginBottom: "16px" }}>
            <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", letterSpacing: "4px", color: "var(--faded)", marginBottom: "8px" }}>CURRENT CONDITIONS · {location.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "24px", alignItems: "start" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'IM Fell English'", fontSize: "56px", color: "var(--ink)", lineHeight: 1 }}>{data.current.temp}</div>
                <div style={{ fontFamily: "'IM Fell English'", color: "var(--red)", fontSize: "16px" }}>{data.current.condition}</div>
              </div>
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  {[["Humidity", data.current.humidity], ["Wind", data.current.wind], ["Feels Like", data.current.feels]].map(([k, v]) => (
                    <div key={k}><div style={{ fontFamily: "'IM Fell English'", fontSize: "10px", letterSpacing: "2px", color: "var(--faded)" }}>{k}</div><div style={{ fontSize: "15px" }}>{v}</div></div>
                  ))}
                </div>
                <p style={{ fontStyle: "italic", fontSize: "15px", color: "var(--ink2)", lineHeight: 1.6, borderLeft: "3px solid var(--red)", paddingLeft: "12px" }}>{data.current.almanacDesc}</p>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "6px", marginBottom: "16px" }}>
            {data.forecast.map((f, i) => (
              <div key={i} style={{ background: "var(--parch2)", border: "1px solid var(--brown2)", padding: "12px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: "'IM Fell English'", fontSize: "13px", color: "var(--faded)", marginBottom: "6px" }}>{f.day}</div>
                <div style={{ fontFamily: "'IM Fell English'", fontSize: "15px", color: "var(--ink)" }}>{f.condition}</div>
                <div style={{ marginTop: "6px", fontSize: "13px" }}><span style={{ color: "var(--red2)", fontWeight: "bold" }}>{f.high}°</span><span style={{ color: "var(--faded)", marginLeft: "4px" }}>{f.low}°</span></div>
                <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--ink2)", fontStyle: "italic", lineHeight: 1.4 }}>{f.farmNote}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[["Farming Advice", data.farmingAdvice], ["Best Days to Work", data.bestDaysToWork]].map(([title, text]) => (
              <div key={title} style={{ background: "var(--parch2)", border: "1px solid var(--brown2)", padding: "16px" }}>
                <div style={{ fontFamily: "'IM Fell English'", fontSize: "11px", letterSpacing: "3px", color: "var(--red)", marginBottom: "8px" }}>{title.toUpperCase()}</div>
                <p style={{ fontSize: "14px", lineHeight: 1.7, fontStyle: "italic" }}>{text}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ApiKeyEntry({ onSave, onCancel }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: "8px" }}>
      <input type="password" value={val} onChange={e => setVal(e.target.value)} placeholder="sk-ant-..." style={{ flex: 1, padding: "8px 10px", background: "var(--parch)", border: "1px solid var(--brown2)", color: "var(--ink)", fontSize: "14px", outline: "none" }} />
      <button onClick={() => onSave(val)} style={{ background: "var(--ink2)", color: "var(--parch)", border: "none", padding: "8px 16px", fontFamily: "'IM Fell English'", fontSize: "13px" }}>Save</button>
      <button onClick={onCancel} style={{ background: "none", border: "1px solid var(--brown2)", color: "var(--ink2)", padding: "8px 16px", fontFamily: "'IM Fell English'", fontSize: "13px" }}>Cancel</button>
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

  const inputStyle = { width: "100%", padding: "8px 10px", background: "var(--parch)", border: "1px solid var(--brown2)", color: "var(--ink)", fontSize: "15px", outline: "none", fontFamily: "'Cardo', serif" };

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div style={{ fontFamily: "'IM Fell English'", fontSize: "24px" }}>Farm Journal</div>
        <button onClick={() => setShowAdd(true)} style={{ background: "var(--red2)", color: "var(--parch)", border: "none", padding: "8px 18px", fontFamily: "'IM Fell English'", fontSize: "14px", letterSpacing: "1px" }}>+ New Entry</button>
      </div>
      {showAdd && (
        <div style={{ background: "var(--parch2)", border: "2px solid var(--brown)", padding: "24px", marginBottom: "24px" }}>
          <input type="text" placeholder="Entry title (optional)..." value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ ...inputStyle, marginBottom: "12px", fontSize: "18px" }} />
          <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={6} placeholder="Record your observations, treatments, purchases..." style={{ ...inputStyle, resize: "vertical", lineHeight: "1.7" }} />
          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button onClick={add} style={{ background: "var(--ink2)", color: "var(--parch)", border: "none", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Record Entry</button>
            <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "1px solid var(--brown2)", color: "var(--ink2)", padding: "10px 24px", fontFamily: "'IM Fell English'", fontSize: "14px" }}>Cancel</button>
          </div>
        </div>
      )}
      {!notes.length && !showAdd && <div style={{ textAlign: "center", padding: "60px", color: "var(--faded)", fontStyle: "italic", fontSize: "18px" }}>The journal awaits your first entry.</div>}
      {notes.map(n => (
        <div key={n.id} style={{ background: "var(--parch2)", border: "1px solid var(--brown2)", padding: "20px", marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
            <div style={{ fontFamily: "'IM Fell English'", fontSize: "19px", color: "var(--ink2)" }}>{n.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ fontSize: "12px", color: "var(--faded)" }}>{fmt(n.date.split("T")[0])}</div>
              <button onClick={() => setNotes(p => p.filter(x => x.id !== n.id))} style={{ background: "none", border: "none", color: "var(--faded)", fontFamily: "'IM Fell English'", fontSize: "13px" }}>×</button>
            </div>
          </div>
          <div className="ornament" style={{ margin: "0 0 10px" }}>—</div>
          <p style={{ fontSize: "15px", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{n.body}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [animals, setAnimals] = useState(() => loadData("lsa-animals", []));
  const [gestations, setGestations] = useState(() => loadData("lsa-gestations", []));
  const [notes, setNotes] = useState(() => loadData("lsa-notes", []));

  const moon = getMoonPhase();
  const season = getSeason();

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = FONTS;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => saveData("lsa-animals", animals), [animals]);
  useEffect(() => saveData("lsa-gestations", gestations), [gestations]);
  useEffect(() => saveData("lsa-notes", notes), [notes]);

  return (
    <div className="paper-texture" style={{ minHeight: "100vh", fontFamily: "'Cardo', Georgia, serif" }}>
      <Nav tab={tab} setTab={setTab} />
      {tab === "dashboard" && <Dashboard animals={animals} gestations={gestations} moon={moon} season={season} />}
      {tab === "animals"   && <Animals animals={animals} setAnimals={setAnimals} />}
      {tab === "gestation" && <Gestation animals={animals} gestations={gestations} setGestations={setGestations} />}
      {tab === "weather"   && <Weather />}
      {tab === "notes"     && <Notes notes={notes} setNotes={setNotes} />}
    </div>
  );
}
