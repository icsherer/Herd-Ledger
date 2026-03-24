import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { supabase } from "./supabase";
import Auth, { ResetPasswordPage } from "./components/Auth.jsx";
import { GLOBAL_CSS, USER_DATA_KEYS, GUEST_STORAGE_KEY, GUEST_USER, DEFAULT_TAB_VISIBILITY, DEFAULT_SETTINGS } from "./lib/constants.js";
import { getMoonPhase, getSeason, isFemale, cleanupOrphanedRecords } from "./lib/helpers.js";
import {
  loadAllData,
  persistAnimals, persistTasks, persistGestations, persistContacts,
  persistExpenses, persistFeederPrograms, persistLoadSales, persistNotes,
  persistPastures, persistPastureFeedLogs, persistSettings, persistOffspring,
} from './lib/db.js';
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
  const [loadDone, setLoadDone] = useState(false);

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
      setLoadDone(false);
      return;
    }
    if (user.isGuest) {
      initialLoadDone.current = false;
      setLoadDone(false);
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
      setLoadDone(true);
      return;
    }

    initialLoadDone.current = false;
    setLoadDone(false);
    loadAllData(user.id).then(({
      animals: animalsData, tasks: tasksData, gestations: gestationsData,
      contacts: contactsData, expenses: expensesData, feederPrograms: feederData,
      loadSales: salesData, notes: notesData, pastures: pasturesData,
      pastureFeedLogs: feedLogsData, settings: settingsData, offspring: offspringData,
    }) => {
      const { gestations: cleanedGestations, offspring: cleanedOffspring } =
        cleanupOrphanedRecords(animalsData, gestationsData, offspringData);
      const animalIds = new Set(animalsData.map(a => a.id));
      const filteredFeeder = feederData.filter(f => animalIds.has(f.animalId));
      setAnimals(animalsData);
      setGestations(cleanedGestations);
      setNotes(notesData);
      setOffspring(cleanedOffspring);
      setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
      setFeederPrograms(filteredFeeder);
      setPastures(pasturesData);
      setPastureFeedLogs(feedLogsData);
      setExpenses(expensesData);
      setLoadSales(salesData);
      setTasks(tasksData);
      setContacts(contactsData);
      initialLoadDone.current = true;
      setLoadDone(true);
    }).catch(err => {
      console.error('[DB] loadAllData failed:', err);
      initialLoadDone.current = true;
      setLoadDone(true);
    });
  }, [user?.id, user?.isGuest]);

  const PERSIST_DEBOUNCE_MS = 2000;

  const persistGuest = () => {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({
        animals, gestations, notes, offspring, settings, feederPrograms,
        pastures, pastureFeedLogs, expenses, loadSales, tasks, contacts,
      }));
    } catch (_) {}
  };

  useEffect(() => {
    console.log('[PERSIST] animals fired — user:', !!user, 'loadDone:', initialLoadDone.current, 'isGuest:', user?.isGuest);
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistAnimals(user.id, animals), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, animals]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistGestations(user.id, gestations), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, gestations]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistNotes(user.id, notes), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, notes]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistOffspring(user.id, offspring), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, offspring]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistSettings(user.id, settings), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, settings]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistFeederPrograms(user.id, feederPrograms), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, feederPrograms]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistPastures(user.id, pastures), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastures]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistPastureFeedLogs(user.id, pastureFeedLogs), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastureFeedLogs]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistExpenses(user.id, expenses), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, expenses]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistLoadSales(user.id, loadSales), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, loadSales]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistTasks(user.id, tasks), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, tasks]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); return; }
    const t = setTimeout(() => persistContacts(user.id, contacts), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, contacts]);

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
      {tab === "dashboard" && <TabErrorBoundary key="dashboard" setTab={setTab}><Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} setAnimalsFilterHeatDue={setAnimalsFilterHeatDue} expenses={expenses} tasks={tasks} settings={settings} loadDone={loadDone} /></TabErrorBoundary>}
      {tab === "animals"   && <TabErrorBoundary key="animals" setTab={setTab}><Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} filterHeatDue={animalsFilterHeatDue} setFilterHeatDue={setAnimalsFilterHeatDue} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} setExpenses={setExpenses} settings={settings} setSettings={setSettings} pastures={pastures} notes={notes} setNotes={setNotes} setDeliveryGestureId={setDeliveryGestureId} promptAddOffspring={promptAddOffspring} setPromptAddOffspring={setPromptAddOffspring} contacts={contacts} setContacts={setContacts} /></TabErrorBoundary>}
      {tab === "gestation" && <TabErrorBoundary key="gestation" setTab={setTab}><Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} offspring={offspring} setOffspring={setOffspring} setTab={setTab} setViewingAnimal={setViewingAnimal} deliveryGestureId={deliveryGestureId} setDeliveryGestureId={setDeliveryGestureId} setPromptAddOffspring={setPromptAddOffspring} /></TabErrorBoundary>}
      {tab === "feeder"    && <TabErrorBoundary key="feeder" setTab={setTab}><FeederCattle animals={animals} setAnimals={setAnimals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} /></TabErrorBoundary>}
      {tab === "pastures"  && <TabErrorBoundary key="pastures" setTab={setTab}><Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} pastureFeedLogs={pastureFeedLogs} setPastureFeedLogs={setPastureFeedLogs} setExpenses={setExpenses} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPrograms={feederPrograms} gestations={gestations} setGestations={setGestations} notes={notes} setNotes={setNotes} /></TabErrorBoundary>}
      {tab === "notes"     && <TabErrorBoundary key="notes" setTab={setTab}><Notes notes={notes} setNotes={setNotes} user={user} animals={animals} /></TabErrorBoundary>}
      {tab === "expenses"  && <TabErrorBoundary key="expenses" setTab={setTab}><Expenses expenses={expenses} setExpenses={setExpenses} animals={animals} pastures={pastures} setTab={setTab} setViewingAnimal={setViewingAnimal} /></TabErrorBoundary>}
      {tab === "sales"     && <TabErrorBoundary key="sales" setTab={setTab}><Sales animals={animals} setAnimals={setAnimals} loadSales={loadSales} setLoadSales={setLoadSales} expenses={expenses} settings={settings} /></TabErrorBoundary>}
      {tab === "tasks"     && <TabErrorBoundary key="tasks" setTab={setTab}><Tasks tasks={tasks} setTasks={setTasks} animals={animals} gestations={gestations} offspring={offspring} pastures={pastures} setTab={setTab} /></TabErrorBoundary>}
      {tab === "weaning"   && <TabErrorBoundary key="weaning" setTab={setTab}><Weaning animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} setViewingAnimal={setViewingAnimal} setTab={setTab} /></TabErrorBoundary>}
      {tab === "help"      && <TabErrorBoundary key="help" setTab={setTab}><Help onBack={() => setTab("settings")} /></TabErrorBoundary>}
      {tab === "settings"  && <TabErrorBoundary key="settings" setTab={setTab}><Settings settings={settings} setSettings={setSettings} contacts={contacts} setContacts={setContacts} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} setTab={setTab} /></TabErrorBoundary>}
    </div>
  );
}
