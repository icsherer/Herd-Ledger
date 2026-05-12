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
  loadHayInventory, loadSubscription, logAnimalHistory,
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
import HayInventory from "./components/HayInventory.jsx";
import Help from "./components/Help.jsx";
import Weaning from "./components/Weaning.jsx";
import Settings from "./components/Settings.jsx";
import UpgradeModal from "./components/UpgradeModal.jsx";
import Privacy from "./components/Privacy.jsx";
import Account from "./components/Account.jsx";

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
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;

  // Desktop top-nav: all tabs
  const allTabs = [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "animals", label: "Animals", icon: "🐄" },
    ...(visibility.gestation !== false && !hideGestationTab ? [{ id: "gestation", label: "Gestation", icon: "📅" }] : []),
    ...(visibility.feeder !== false ? [{ id: "feeder", label: "Feeder Program", icon: "🌾" }] : []),
    ...(visibility.pastures !== false ? [{ id: "pastures", label: "Pastures", icon: "🌿" }] : []),
    ...(visibility.notes !== false ? [{ id: "notes", label: "Journal", icon: "📓" }] : []),
    ...(visibility.expenses !== false ? [{ id: "expenses", label: "Expenses", icon: "💰" }] : []),
    ...(visibility.sales !== false ? [{ id: "sales", label: "Ledger", icon: "💰" }] : []),
    ...(visibility.tasks !== false ? [{ id: "tasks", label: "Tasks", icon: "✅" }] : []),
    ...(visibility.weaning !== false ? [{ id: "weaning", label: "Weaning", icon: "🐄" }] : []),
    ...(visibility.hay !== false ? [{ id: "hay", label: "Hay & Forage", icon: "🌾" }] : []),
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  // Mobile "More" drawer items
  const moreItems = [
    ...(visibility.pastures !== false ? [{ id: "pastures", label: "Pastures", icon: "🌿", tile: "#3A7D44" }] : []),
    ...(visibility.notes !== false ? [{ id: "notes", label: "Journal", icon: "📓", tile: "#C17F3A" }] : []),
    ...(visibility.tasks !== false ? [{ id: "tasks", label: "Tasks", icon: "✅", tile: "#4A7B9D" }] : []),
    ...(visibility.feeder !== false ? [{ id: "feeder", label: "Feeder Program", icon: "🌾", tile: "#B8972A" }] : []),
    ...(visibility.weaning !== false ? [{ id: "weaning", label: "Weaning", icon: "🐄", tile: "#8B5E3C" }] : []),
    ...(visibility.sales !== false ? [{ id: "sales", label: "Ledger", icon: "💰", tile: "#6B8C52" }] : []),
    ...(visibility.hay !== false ? [{ id: "hay", label: "Hay & Forage", icon: "🌾", tile: "#B8972A" }] : []),
    { id: "settings", label: "Settings", icon: "⚙️", tile: "#7A6A5A" },
  ];

  const moreTabs = new Set(["pastures", "notes", "tasks", "feeder", "weaning", "sales", "hay", "settings", "help"]);
  const isMoreActive = moreTabs.has(tab);
  const isFinancesActive = tab === "expenses" || tab === "sales";

  function handleMoreItem(id) {
    setTab(id);
    setShowMoreDrawer(false);
  }

  return (
    <>
      {/* ── Header (logo + desktop top nav) ── */}
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

          {/* Desktop tabs (hidden on mobile via CSS) */}
          <nav className="hl-nav-tabs" style={{ display: "flex", gap: "2px" }}>
            {allTabs.map(t => (
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

      {/* ── Mobile bottom tab bar (hidden on desktop via CSS) ── */}
      <nav className="hl-bottom-nav no-print" aria-label="Main navigation">
        <button className={`hl-bottom-tab${tab === "dashboard" ? " hl-bottom-tab-active" : ""}`} onClick={() => setTab("dashboard")}>
          <span className="hl-bottom-tab-icon">⊞</span>
          <span className="hl-bottom-tab-label">Dashboard</span>
        </button>
        <button className={`hl-bottom-tab${tab === "animals" ? " hl-bottom-tab-active" : ""}`} onClick={() => setTab("animals")}>
          <span className="hl-bottom-tab-icon">🐄</span>
          <span className="hl-bottom-tab-label">Animals</span>
        </button>
        <button className={`hl-bottom-tab${tab === "gestation" ? " hl-bottom-tab-active" : ""}`} onClick={() => setTab("gestation")}>
          <span className="hl-bottom-tab-icon">📅</span>
          <span className="hl-bottom-tab-label">Breeding</span>
        </button>
        <button className={`hl-bottom-tab${isFinancesActive ? " hl-bottom-tab-active" : ""}`} onClick={() => setTab("expenses")}>
          <span className="hl-bottom-tab-icon">💰</span>
          <span className="hl-bottom-tab-label">Expenses</span>
        </button>
        <button className={`hl-bottom-tab${isMoreActive ? " hl-bottom-tab-active" : ""}`} onClick={() => setShowMoreDrawer(true)}>
          <span className="hl-bottom-tab-icon">☰</span>
          <span className="hl-bottom-tab-label">More</span>
        </button>
      </nav>

      {/* ── More slide-up drawer ── */}
      {showMoreDrawer && (
        <div className="hl-more-overlay no-print" onClick={() => setShowMoreDrawer(false)}>
          <div className="hl-more-drawer" onClick={e => e.stopPropagation()} style={{ background: "var(--cream)" }}>
            {/* Drag handle */}
            <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--cream3)", margin: "0 auto 16px" }} />
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", padding: "0 4px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 700, color: "var(--ink)" }}>More</span>
              <button onClick={() => setShowMoreDrawer(false)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "22px", lineHeight: 1, cursor: "pointer", padding: "4px 8px" }}>✕</button>
            </div>
            {/* Items — iOS Settings-style list */}
            <div style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--cream3)" }}>
              {moreItems.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => handleMoreItem(item.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    width: "100%", minHeight: "56px", padding: "8px 14px",
                    background: tab === item.id ? "rgba(201,149,42,0.07)" : "transparent",
                    border: "none",
                    borderTop: idx > 0 ? "1px solid var(--cream2)" : "none",
                    cursor: "pointer",
                    textAlign: "left",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onMouseDown={e => { e.currentTarget.style.background = "var(--cream2)"; }}
                  onMouseUp={e => { e.currentTarget.style.background = tab === item.id ? "rgba(201,149,42,0.07)" : "transparent"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = tab === item.id ? "rgba(201,149,42,0.07)" : "transparent"; }}
                  onTouchStart={e => { e.currentTarget.style.background = "var(--cream2)"; }}
                  onTouchEnd={e => { e.currentTarget.style.background = tab === item.id ? "rgba(201,149,42,0.07)" : "transparent"; }}
                >
                  {/* Colored tile */}
                  <span style={{
                    width: "40px", height: "40px", borderRadius: "10px",
                    background: item.tile, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "22px", lineHeight: 1,
                  }}>{item.icon}</span>
                  {/* Label */}
                  <span style={{ flex: 1, fontSize: "16px", fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{item.label}</span>
                  {/* Chevron */}
                  <span style={{ fontSize: "18px", color: "var(--cream3)", fontWeight: 300, lineHeight: 1 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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
  const [highlightGestationId, setHighlightGestationId] = useState(null);
  const [promptAddOffspring, setPromptAddOffspring] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [hayLots, setHayLots] = useState([]);
  const [hayLogs, setHayLogs] = useState([]);
  const [subscription, setSubscription] = useState({ status: 'free', grandfathered: false, plan: null });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const initialLoadDone = useRef(false);
  const [loadDone, setLoadDone] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | "saving" | "saved" | "error"
  const saveStatusTimeoutRef = useRef(null);
  const saveIndicatorEnabled = useRef(false);

  const isGuest = user?.isGuest === true;
  const isProUser = subscription.status === 'active' || subscription.status === 'trialing' || subscription.grandfathered;
  const moon = getMoonPhase();
  const season = getSeason();

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = `
      @keyframes hl-saved-fadeout { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
      @keyframes hl-spinner-pulse { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.25; } }
      @media (max-width: 768px) { .hl-save-indicator { bottom: 72px !important; } }
    `;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  // Enable the save indicator only after initial load settles (prevents showing on first data fetch)
  useEffect(() => {
    if (!loadDone) { saveIndicatorEnabled.current = false; return; }
    const t = setTimeout(() => { saveIndicatorEnabled.current = true; }, 3000);
    return () => clearTimeout(t);
  }, [loadDone]);

  function completeSave() {
    if (!saveIndicatorEnabled.current) return;
    setSaveStatus("saved");
    if (saveStatusTimeoutRef.current) clearTimeout(saveStatusTimeoutRef.current);
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(null), 2000);
  }

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
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    return () => authListener.unsubscribe();
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
      lastLoadedAt.current = Date.now();
      setLoadDone(true);
    }).catch(err => {
      console.error('[DB] loadAllData failed:', err);
      setLoadDone(true);
    });
  }, [user?.id, user?.isGuest]);

  const PERSIST_DEBOUNCE_MS = 2000;

  // Tracks when data was last loaded or persisted — used to detect external DB changes
  const lastLoadedAt = useRef(0);

  // Refs always mirror latest state so debounced callbacks never close over stale values
  const animalsRef = useRef(animals);
  animalsRef.current = animals;
  const gestationsRef = useRef(gestations);
  gestationsRef.current = gestations;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const offspringRef = useRef(offspring);
  offspringRef.current = offspring;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const feederProgramsRef = useRef(feederPrograms);
  feederProgramsRef.current = feederPrograms;
  const pasturesRef = useRef(pastures);
  pasturesRef.current = pastures;
  const pastureFeedLogsRef = useRef(pastureFeedLogs);
  pastureFeedLogsRef.current = pastureFeedLogs;
  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;
  const loadSalesRef = useRef(loadSales);
  loadSalesRef.current = loadSales;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const persistGuest = () => {
    try {
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({
        animals: animalsRef.current,
        gestations: gestationsRef.current,
        notes: notesRef.current,
        offspring: offspringRef.current,
        settings: settingsRef.current,
        feederPrograms: feederProgramsRef.current,
        pastures: pasturesRef.current,
        pastureFeedLogs: pastureFeedLogsRef.current,
        expenses: expensesRef.current,
        loadSales: loadSalesRef.current,
        tasks: tasksRef.current,
        contacts: contactsRef.current,
      }));
    } catch (_) {}
  };

  useEffect(() => {
    console.log('[PERSIST] animals fired — user:', !!user, 'loadDone:', initialLoadDone.current, 'isGuest:', user?.isGuest);
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try {
        await persistAnimals(user.id, animalsRef.current, {
          lastLoadedAt: lastLoadedAt.current,
          onStaleData: async () => {
            const fresh = await loadAllData(user.id);
            lastLoadedAt.current = Date.now();
            setAnimals(fresh.animals);
          },
        });
        lastLoadedAt.current = Date.now();
        logAnimalHistory(user.id, animalsRef.current);
        completeSave();
      } catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, animals]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistGestations(user.id, gestationsRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, gestations]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistNotes(user.id, notesRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, notes]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistOffspring(user.id, offspringRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, offspring]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistSettings(user.id, settingsRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, settings]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistFeederPrograms(user.id, feederProgramsRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, feederPrograms]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistPastures(user.id, pasturesRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastures]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistPastureFeedLogs(user.id, pastureFeedLogsRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, pastureFeedLogs]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistExpenses(user.id, expensesRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, expenses]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistLoadSales(user.id, loadSalesRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, loadSales]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistTasks(user.id, tasksRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, tasks]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) { persistGuest(); completeSave(); return; }
    const t = setTimeout(async () => {
      if (saveIndicatorEnabled.current) setSaveStatus("saving");
      try { await persistContacts(user.id, contactsRef.current); completeSave(); }
      catch (_) { if (saveIndicatorEnabled.current) setSaveStatus("error"); }
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [user, contacts]);

  // Mirror loadDone into the ref AFTER all persist effects run (effects fire in source order).
  // This ensures persist effects see initialLoadDone.current === false on the first post-load
  // render and skip it; subsequent renders from user edits see true and persist normally.
  useEffect(() => {
    initialLoadDone.current = loadDone;
  }, [loadDone]);

  useEffect(() => {
    if (!user || user.isGuest) return;
    loadHayInventory(user.id).then(({ hayLots: lots, hayLogs: logs }) => {
      setHayLots(lots);
      setHayLogs(logs);
    }).catch(err => console.error('[DB] loadHayInventory failed:', err));
  }, [user?.id]);

  useEffect(() => {
    if (!user || user.isGuest) {
      setSubscription({ status: 'free', grandfathered: false, plan: null });
      return;
    }
    loadSubscription(user.id).then(setSubscription).catch(() => {});
  }, [user?.id, user?.isGuest]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success" && user && !user.isGuest) {
      loadSubscription(user.id).then(setSubscription).catch(() => {});
      params.delete("payment");
      const newSearch = params.toString();
      window.history.replaceState(null, "", newSearch ? `?${newSearch}` : window.location.pathname);
    }
  }, [user?.id, user?.isGuest]);

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
    ...(visibility.hay !== false ? ["hay"] : []),
    "settings",
    "help",
  ]);
  useEffect(() => {
    if (!visibleTabIds.has(tab)) setTab("dashboard");
  }, [tab, visibility.gestation, visibility.feeder, visibility.pastures, visibility.notes, visibility.expenses, visibility.sales, visibility.tasks, visibility.weaning]);

  if (typeof window !== "undefined" && window.location.pathname === "/privacy") {
    return <Privacy />;
  }

  if (user === null) {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      return <ResetPasswordPage />;
    }
    return <Auth onLogin={() => {}} onContinueAsGuest={() => setUser(GUEST_USER)} />;
  }

  if (typeof window !== "undefined" && window.location.pathname === "/account") {
    if (user.isGuest) return <Auth onLogin={() => {}} onContinueAsGuest={() => setUser(GUEST_USER)} />;
    return <Account user={user} subscription={subscription} />;
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
      {tab === "dashboard" && <TabErrorBoundary key="dashboard" setTab={setTab}><Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} setAnimalsFilterHeatDue={setAnimalsFilterHeatDue} expenses={expenses} tasks={tasks} settings={settings} loadDone={loadDone} setHighlightGestationId={setHighlightGestationId} setViewingAnimal={setViewingAnimal} /></TabErrorBoundary>}
      {tab === "animals"   && <TabErrorBoundary key="animals" setTab={setTab}><Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} filterHeatDue={animalsFilterHeatDue} setFilterHeatDue={setAnimalsFilterHeatDue} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} setExpenses={setExpenses} settings={settings} setSettings={setSettings} pastures={pastures} notes={notes} setNotes={setNotes} setDeliveryGestureId={setDeliveryGestureId} promptAddOffspring={promptAddOffspring} setPromptAddOffspring={setPromptAddOffspring} contacts={contacts} setContacts={setContacts} isProUser={isProUser} setShowUpgradeModal={setShowUpgradeModal} /></TabErrorBoundary>}
      {tab === "gestation" && <TabErrorBoundary key="gestation" setTab={setTab}><Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} offspring={offspring} setOffspring={setOffspring} setTab={setTab} setViewingAnimal={setViewingAnimal} deliveryGestureId={deliveryGestureId} setDeliveryGestureId={setDeliveryGestureId} setPromptAddOffspring={setPromptAddOffspring} highlightGestationId={highlightGestationId} setHighlightGestationId={setHighlightGestationId} isProUser={isProUser} setShowUpgradeModal={setShowUpgradeModal} /></TabErrorBoundary>}
      {tab === "feeder"    && <TabErrorBoundary key="feeder" setTab={setTab}><FeederCattle animals={animals} setAnimals={setAnimals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} /></TabErrorBoundary>}
      {tab === "pastures"  && <TabErrorBoundary key="pastures" setTab={setTab}><Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} pastureFeedLogs={pastureFeedLogs} setPastureFeedLogs={setPastureFeedLogs} setExpenses={setExpenses} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPrograms={feederPrograms} gestations={gestations} setGestations={setGestations} notes={notes} setNotes={setNotes} isProUser={isProUser} setShowUpgradeModal={setShowUpgradeModal} /></TabErrorBoundary>}
      {tab === "notes"     && <TabErrorBoundary key="notes" setTab={setTab}><Notes notes={notes} setNotes={setNotes} user={user} animals={animals} /></TabErrorBoundary>}
      {tab === "expenses"  && <TabErrorBoundary key="expenses" setTab={setTab}><Expenses expenses={expenses} setExpenses={setExpenses} animals={animals} pastures={pastures} setTab={setTab} setViewingAnimal={setViewingAnimal} /></TabErrorBoundary>}
      {tab === "sales"     && <TabErrorBoundary key="sales" setTab={setTab}><Sales animals={animals} setAnimals={setAnimals} loadSales={loadSales} setLoadSales={setLoadSales} expenses={expenses} settings={settings} contacts={contacts} supabase={supabase} userId={user?.id} isProUser={isProUser} setShowUpgradeModal={setShowUpgradeModal} /></TabErrorBoundary>}
      {tab === "tasks"     && <TabErrorBoundary key="tasks" setTab={setTab}><Tasks tasks={tasks} setTasks={setTasks} animals={animals} gestations={gestations} offspring={offspring} pastures={pastures} setTab={setTab} /></TabErrorBoundary>}
      {tab === "weaning"   && <TabErrorBoundary key="weaning" setTab={setTab}><Weaning animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} setViewingAnimal={setViewingAnimal} setTab={setTab} /></TabErrorBoundary>}
      {tab === "hay"       && <TabErrorBoundary key="hay" setTab={setTab}><HayInventory hayLots={hayLots} setHayLots={setHayLots} hayLogs={hayLogs} setHayLogs={setHayLogs} user={user} pastures={pastures} isProUser={isProUser} setShowUpgradeModal={setShowUpgradeModal} /></TabErrorBoundary>}
      {tab === "help"      && <TabErrorBoundary key="help" setTab={setTab}><Help onBack={() => setTab("settings")} /></TabErrorBoundary>}
      {tab === "settings"  && <TabErrorBoundary key="settings" setTab={setTab}><Settings settings={settings} setSettings={setSettings} contacts={contacts} setContacts={setContacts} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} setTab={setTab} /></TabErrorBoundary>}
      {showUpgradeModal && <UpgradeModal user={user} onClose={() => setShowUpgradeModal(false)} />}
      {saveStatus && (
        <div
          className="hl-save-indicator no-print"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "16px",
            zIndex: 9999,
            fontSize: "12px",
            fontWeight: 500,
            padding: "6px 12px",
            borderRadius: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            pointerEvents: "none",
            userSelect: "none",
            lineHeight: 1.4,
            ...(saveStatus === "saving" ? {
              background: "rgba(255,255,255,0.96)",
              color: "var(--brass)",
              border: "1px solid rgba(201,149,42,0.35)",
            } : saveStatus === "saved" ? {
              background: "rgba(255,255,255,0.96)",
              color: "var(--green)",
              border: "1px solid rgba(42,100,74,0.3)",
              animation: "hl-saved-fadeout 2s forwards",
            } : {
              background: "rgba(255,255,255,0.97)",
              color: "#c0392b",
              border: "1px solid rgba(192,57,43,0.3)",
            }),
          }}
        >
          {saveStatus === "saving" && (
            <><span style={{ animation: "hl-spinner-pulse 1s ease-in-out infinite", display: "inline-block" }}>●</span>Saving...</>
          )}
          {saveStatus === "saved" && "✓ Saved"}
          {saveStatus === "error" && "⚠ Save failed — check connection"}
        </div>
      )}
    </div>
  );
}
