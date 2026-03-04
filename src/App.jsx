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
  const [viewingAnimal, setViewingAnimal] = useState(null);
  const [animals, setAnimals] = useState([]);
  const [gestations, setGestations] = useState([]);
  const [notes, setNotes] = useState([]);
  const [offspring, setOffspring] = useState({});
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS }));
  const [feederPrograms, setFeederPrograms] = useState([]);
  const [pastures, setPastures] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadSales, setLoadSales] = useState([]);
  const [tasks, setTasks] = useState([]);
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
      if (session?.user) {
        const ts = new Date().toISOString();
        supabase.from("user_data").upsert({ user_id: session.user.id, key: "last_seen", data: ts, updated_at: ts }, { onConflict: "user_id,key" }).then(() => {});
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(prev => {
        if (session?.user) {
          const ts = new Date().toISOString();
          supabase.from("user_data").upsert({ user_id: session.user.id, key: "last_seen", data: ts, updated_at: ts }, { onConflict: "user_id,key" }).then(() => {});
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
      setExpenses([]);
      setLoadSales([]);
      setTasks([]);
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
        setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
        setLoadSales(Array.isArray(data.loadSales) ? data.loadSales : []);
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
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
        setExpenses(Array.isArray(byKey.expenses) ? byKey.expenses : []);
        setLoadSales(Array.isArray(byKey.loadSales) ? byKey.loadSales : []);
        setTasks(Array.isArray(byKey.tasks) ? byKey.tasks : []);
        initialLoadDone.current = true;
      });
  }, [user]);

  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "animals", data: animals }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, animals]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "gestations", data: gestations }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, gestations]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "notes", data: notes }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, notes]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "offspring", data: offspring }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, offspring]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "settings", data: settings }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, settings]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "feederPrograms", data: feederPrograms }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, feederPrograms]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "pastures", data: pastures }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, pastures]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "expenses", data: expenses }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, expenses]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "loadSales", data: loadSales }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, loadSales]);
  useEffect(() => {
    if (!user || !initialLoadDone.current) return;
    if (user.isGuest) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify({ animals, gestations, notes, offspring, settings, feederPrograms, pastures, expenses, loadSales, tasks }));
      } catch (_) {}
      return;
    }
    supabase.from("user_data").upsert({ user_id: user.id, key: "tasks", data: tasks }, { onConflict: "user_id,key" }).then(() => {});
  }, [user, tasks]);

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
      {tab === "dashboard" && <TabErrorBoundary key="dashboard" setTab={setTab}><Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} expenses={expenses} tasks={tasks} settings={settings} /></TabErrorBoundary>}
      {tab === "animals"   && <TabErrorBoundary key="animals" setTab={setTab}><Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} setExpenses={setExpenses} settings={settings} setSettings={setSettings} pastures={pastures} notes={notes} setNotes={setNotes} /></TabErrorBoundary>}
      {tab === "gestation" && <TabErrorBoundary key="gestation" setTab={setTab}><Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} /></TabErrorBoundary>}
      {tab === "feeder"    && <TabErrorBoundary key="feeder" setTab={setTab}><FeederCattle animals={animals} setAnimals={setAnimals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} /></TabErrorBoundary>}
      {tab === "pastures"  && <TabErrorBoundary key="pastures" setTab={setTab}><Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPrograms={feederPrograms} gestations={gestations} setGestations={setGestations} notes={notes} setNotes={setNotes} /></TabErrorBoundary>}
      {tab === "notes"     && <TabErrorBoundary key="notes" setTab={setTab}><Notes notes={notes} setNotes={setNotes} user={user} animals={animals} /></TabErrorBoundary>}
      {tab === "expenses"  && <TabErrorBoundary key="expenses" setTab={setTab}><Expenses expenses={expenses} setExpenses={setExpenses} animals={animals} pastures={pastures} setTab={setTab} setViewingAnimal={setViewingAnimal} /></TabErrorBoundary>}
      {tab === "sales"     && <TabErrorBoundary key="sales" setTab={setTab}><Sales animals={animals} loadSales={loadSales} setLoadSales={setLoadSales} expenses={expenses} /></TabErrorBoundary>}
      {tab === "tasks"     && <TabErrorBoundary key="tasks" setTab={setTab}><Tasks tasks={tasks} setTasks={setTasks} animals={animals} gestations={gestations} offspring={offspring} pastures={pastures} setTab={setTab} /></TabErrorBoundary>}
      {tab === "weaning"   && <TabErrorBoundary key="weaning" setTab={setTab}><Weaning animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} setViewingAnimal={setViewingAnimal} setTab={setTab} /></TabErrorBoundary>}
      {tab === "help"      && <TabErrorBoundary key="help" setTab={setTab}><Help onBack={() => setTab("settings")} /></TabErrorBoundary>}
      {tab === "settings"  && <TabErrorBoundary key="settings" setTab={setTab}><Settings settings={settings} setSettings={setSettings} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} setTab={setTab} /></TabErrorBoundary>}
    </div>
  );
}
