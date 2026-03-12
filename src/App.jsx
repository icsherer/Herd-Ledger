import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Auth, { ResetPasswordPage } from "./components/Auth.jsx";
import { GLOBAL_CSS, USER_DATA_KEYS, GUEST_STORAGE_KEY, GUEST_USER, DEFAULT_TAB_VISIBILITY, DEFAULT_SETTINGS } from "./lib/constants.js";
import { getMoonPhase, getSeason, isFemale, cleanupOrphanedRecords } from "./lib/helpers.js";
import Dashboard from "./components/Dashboard.jsx";
import Animals from "./components/Animals.jsx";
import Gestation from "./components/Gestation.jsx";
import Pastures from "./components/Pastures.jsx";
import Notes from "./components/Journal.jsx";
import Expenses from "./components/Expenses.jsx";
import Tasks from "./components/Tasks.jsx";
import Sales from "./components/Sales.jsx";
import FeederCattle from "./components/FeederProgram.jsx";
import Help from "./components/Help.jsx";
import Weaning from "./components/Weaning.jsx";
import Settings from "./components/Settings.jsx";

// ── Error boundary so a broken tab doesn't crash the whole app ─────────────────
class TabErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err, info) {
    console.error("Tab error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="hl-page hl-fade-in" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--ink2)", marginBottom: "16px" }}>Something went wrong on this tab.</p>
          <button type="button" onClick={() => this.props.setTab("dashboard")} style={{ padding: "10px 20px", background: "var(--green)", color: "#fff", border: "none", borderRadius: "var(--radius)", fontWeight: 600, cursor: "pointer" }}>Go to Dashboard</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function Nav({ tab, setTab, hideGestationTab, settings }) {
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "animals", label: "Animals", icon: "🐄" },
    ...(visibility.gestation !== false && !hideGestationTab ? [{ id: "gestation", label: "Gestation", icon: "📅" }] : []),
    ...(visibility.feeder !== false ? [{ id: "feeder", label: "Feeder Program", icon: "🌾" }] : []),
    ...(visibility.pastures !== false ? [{ id: "pastures", label: "Pastures", icon: "🟩" }] : []),
    ...(visibility.notes !== false ? [{ id: "notes", label: "Journal", icon: "📖" }] : []),
    ...(visibility.expenses !== false ? [{ id: "expenses", label: "Expenses", icon: "💰" }] : []),
    ...(visibility.sales !== false ? [{ id: "sales", label: "Sales", icon: "📋" }] : []),
    ...(visibility.tasks !== false ? [{ id: "tasks", label: "Tasks", icon: "✓" }] : []),
    ...(visibility.weaning !== false ? [{ id: "weaning", label: "Weaning", icon: "🥛" }] : []),
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




// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [animalsSearch, setAnimalsSearch] = useState("");
  const [animalsFilterHeatDue, setAnimalsFilterHeatDue] = useState(false);
  const [viewingAnimal, setViewingAnimal] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [gestations, setGestations] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offspring, setOffspring] = useState({});
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [feederPrograms, setFeederPrograms] = useState([]);
  const [pastures, setPastures] = useState([]);
  const [pastureFeedLogs, setPastureFeedLogs] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [loadSales, setLoadSales] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [feederPreselectAnimalId, setFeederPreselectAnimalId] = useState(null);
  const [feederBulkAnimalIds, setFeederBulkAnimalIds] = useState([]);
  const [deliveryGestureId, setDeliveryGestureId] = useState(null);
  const [promptAddOffspring, setPromptAddOffspring] = useState(null);
  const [contacts, setContacts] = useState([]);
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

  // Persist one key to Supabase (user_data table). No-op for guest or missing session.
  // On timeout (57014): retry with exponential backoff (2s, 4s, 8s), up to 3 retries before surfacing error.
  const persistToSupabase = React.useCallback((key, data) => {
    const TIMEOUT_CODE = "57014";
    const MAX_RETRIES = 3;

    const doUpsert = (uid) => {
      const payload = { user_id: uid, key, data };
      return supabase.from("user_data").upsert(payload, { onConflict: "user_id,key" });
    };

    const attempt = (uid, tryIndex) => {
      doUpsert(uid).then(({ data: resData, error }) => {
        if (!error) return;
        const isTimeout = String(error?.code) === TIMEOUT_CODE;
        if (isTimeout && tryIndex < MAX_RETRIES) {
          const delayMs = 2000 * Math.pow(2, tryIndex);
          console.warn("[Supabase] write timeout (57014), retrying in", delayMs / 1000, "s — key:", key, "attempt:", tryIndex + 1, "of", MAX_RETRIES);
          setTimeout(() => attempt(uid, tryIndex + 1), delayMs);
          return;
        }
        console.error("[Supabase] write failed — key:", key);
        console.error("[Supabase] FULL ERROR OBJECT (paste this for debugging):", error);
        console.error("[Supabase] FULL ERROR (JSON):", JSON.stringify(error, null, 2));
        console.error("[Supabase] error.message:", error.message);
        console.error("[Supabase] error.details:", error.details);
        console.error("[Supabase] error.hint:", error.hint);
        console.error("[Supabase] error.code:", error.code);
        const payload = { user_id: uid, key, data };
        console.error("[Supabase] EXACT DATA SENT (payload):", payload);
        try {
          const payloadJson = JSON.stringify(payload, null, 2);
          console.error("[Supabase] EXACT DATA SENT (JSON, full):", payloadJson.length > 50000 ? payloadJson.slice(0, 50000) + "\n... (truncated)" : payloadJson);
        } catch (e) {
          console.error("[Supabase] Could not stringify payload:", e);
        }
      });
    };

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        console.error("[Supabase] getSession failed:", sessionError);
        return;
      }
      const uid = session?.user?.id;
      if (!uid) return;
      const dataSummary = Array.isArray(data)
        ? `array(length=${data.length})`
        : data && typeof data === "object" && !Array.isArray(data)
          ? `object(keys=${Object.keys(data).join(",")})`
          : typeof data;
      console.log("[Supabase] write: key=", key, "payload summary: data=", dataSummary);
      attempt(uid, 0);
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const ts = new Date().toISOString();
        supabase.from("user_data").upsert({ user_id: session.user.id, key: "last_seen", data: ts }, { onConflict: "user_id,key" })
          .then(({ error }) => { if (error) console.error("[Supabase] last_seen write failed:", error); });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(prev => {
        if (session?.user) {
          const ts = new Date().toISOString();
          supabase.from("user_data").upsert({ user_id: session.user.id, key: "last_seen", data: ts }, { onConflict: "user_id,key" })
            .then(({ error }) => { if (error) console.error("[Supabase] last_seen write failed:", error); });
          return session.user;
        }
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
      setPastureFeedLogs({});
      setExpenses([]);
      setLoadSales([]);
      setTasks([]);
      setContacts([]);
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
        setPastureFeedLogs(data.pastureFeedLogs && typeof data.pastureFeedLogs === "object" ? data.pastureFeedLogs : {});
        setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
        setLoadSales(Array.isArray(data.loadSales) ? data.loadSales : []);
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
        setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      } catch (_) {
        setAnimals([]);
        setGestations([]);
        setNotes([]);
        setOffspring({});
        setSettings({ ...DEFAULT_SETTINGS });
        setFeederPrograms([]);
        setPastures([]);
        setPastureFeedLogs({});
        setContacts([]);
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
        if (error) {
          console.error("[Supabase] load failed:", error);
          initialLoadDone.current = true;
          return;
        }
        const byKey = (rows || []).reduce((acc, r) => { acc[r.key] = r.data; return acc; }, {});
        const keysLoaded = (rows || []).map(r => r.key);
        console.log("[Supabase] load: keys received:", keysLoaded, "gestations row present:", keysLoaded.includes("gestations"));
        const animalsData = Array.isArray(byKey.animals) ? byKey.animals : [];
        const gestationsData = Array.isArray(byKey.gestations) ? byKey.gestations : [];
        console.log("[Supabase] load: gestations count from byKey:", gestationsData.length);
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
        setPastureFeedLogs(byKey.pastureFeedLogs && typeof byKey.pastureFeedLogs === "object" ? byKey.pastureFeedLogs : {});
        setExpenses(Array.isArray(byKey.expenses) ? byKey.expenses : []);
        setLoadSales(Array.isArray(byKey.loadSales) ? byKey.loadSales : []);
        setTasks(Array.isArray(byKey.tasks) ? byKey.tasks : []);
        setContacts(Array.isArray(byKey.contacts) ? byKey.contacts : []);
        initialLoadDone.current = true;
      });
  }, [user]);

  const PERSIST_DEBOUNCE_MS = 2000;

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("animals", animals), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, animals, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("gestations", gestations), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, gestations, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("notes", notes), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, notes, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("offspring", offspring), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, offspring, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("settings", settings), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, settings, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("feederPrograms", feederPrograms), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, feederPrograms, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("pastures", pastures), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastures, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("pastureFeedLogs", pastureFeedLogs), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastureFeedLogs, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("expenses", expenses), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, expenses, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("loadSales", loadSales), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, loadSales, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("tasks", tasks), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, tasks, persistToSupabase]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts }));
      } catch (_) {}
      return;
    }
    const t = setTimeout(() => persistToSupabase("contacts", contacts), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, contacts, persistToSupabase]);

  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const visibleTabIds = new Set([
    "dashboard",
    "animals",
    ...(visibility.gestation !== false ? ["gestation"] : []),
    ...(visibility.feeder !== false ? ["feeder"] : []),
    ...(visibility.pastures !== false ? ["pastures"] : []),
    ...(visibility.notes !== false ? ["notes"] : []),
    ...(visibility.expenses !== false ? ["expenses"] : []),
    ...(visibility.sales !== false ? ["sales"] : []),
    ...(visibility.tasks !== false ? ["tasks"] : []),
    ...(visibility.weaning !== false ? ["weaning"] : []),
    "settings",
    "help",
  ]);
  useEffect(() => {
    if (!visibleTabIds.has(tab)) setTab("dashboard");
  }, [tab, visibility.gestation, visibility.feeder, visibility.pastures, visibility.notes, visibility.expenses, visibility.sales, visibility.tasks, visibility.weaning]);

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
      {tab === "dashboard" && <TabErrorBoundary key="dashboard" setTab={setTab}><Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} setAnimalsFilterHeatDue={setAnimalsFilterHeatDue} expenses={expenses} tasks={tasks} settings={settings} /></TabErrorBoundary>}
      {tab === "animals"   && <TabErrorBoundary key="animals" setTab={setTab}><Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} filterHeatDue={animalsFilterHeatDue} setFilterHeatDue={setAnimalsFilterHeatDue} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} setExpenses={setExpenses} settings={settings} setSettings={setSettings} pastures={pastures} notes={notes} setNotes={setNotes} setDeliveryGestureId={setDeliveryGestureId} promptAddOffspring={promptAddOffspring} setPromptAddOffspring={setPromptAddOffspring} contacts={contacts} setContacts={setContacts} /></TabErrorBoundary>}
      {tab === "gestation" && <TabErrorBoundary key="gestation" setTab={setTab}><Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} offspring={offspring} setOffspring={setOffspring} setTab={setTab} setViewingAnimal={setViewingAnimal} deliveryGestureId={deliveryGestureId} setDeliveryGestureId={setDeliveryGestureId} setPromptAddOffspring={setPromptAddOffspring} /></TabErrorBoundary>}
      {tab === "feeder"    && <TabErrorBoundary key="feeder" setTab={setTab}><FeederCattle animals={animals} setAnimals={setAnimals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} /></TabErrorBoundary>}
      {tab === "pastures"  && <TabErrorBoundary key="pastures" setTab={setTab}><Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} pastureFeedLogs={pastureFeedLogs} setPastureFeedLogs={setPastureFeedLogs} setExpenses={setExpenses} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPrograms={feederPrograms} gestations={gestations} setGestations={setGestations} notes={notes} setNotes={setNotes} /></TabErrorBoundary>}
      {tab === "notes"     && <TabErrorBoundary key="notes" setTab={setTab}><Notes notes={notes} setNotes={setNotes} user={user} animals={animals} /></TabErrorBoundary>}
      {tab === "expenses"  && <TabErrorBoundary key="expenses" setTab={setTab}><Expenses expenses={expenses} setExpenses={setExpenses} animals={animals} pastures={pastures} setTab={setTab} setViewingAnimal={setViewingAnimal} /></TabErrorBoundary>}
      {tab === "sales"     && <TabErrorBoundary key="sales" setTab={setTab}><Sales animals={animals} setAnimals={setAnimals} loadSales={loadSales} setLoadSales={setLoadSales} expenses={expenses} /></TabErrorBoundary>}
      {tab === "tasks"     && <TabErrorBoundary key="tasks" setTab={setTab}><Tasks tasks={tasks} setTasks={setTasks} animals={animals} gestations={gestations} offspring={offspring} pastures={pastures} setTab={setTab} /></TabErrorBoundary>}
      {tab === "weaning"   && <TabErrorBoundary key="weaning" setTab={setTab}><Weaning animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} setViewingAnimal={setViewingAnimal} setTab={setTab} /></TabErrorBoundary>}
      {tab === "help"      && <TabErrorBoundary key="help" setTab={setTab}><Help onBack={() => setTab("settings")} /></TabErrorBoundary>}
      {tab === "settings"  && <TabErrorBoundary key="settings" setTab={setTab}><Settings settings={settings} setSettings={setSettings} contacts={contacts} setContacts={setContacts} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} setTab={setTab} /></TabErrorBoundary>}
    </div>
  );
}
