import { DEFAULT_TAB_VISIBILITY, TAB_OPTIONS, SPECIES } from "../lib/constants.js";
import { Card, Input, Select } from "./ui.jsx";

export default function Settings({ settings, setSettings, onLogout, setTab }) {
  const visibility = settings?.tabVisibility ?? DEFAULT_TAB_VISIBILITY;
  const setVisibility = (id, value) => {
    setSettings(prev => ({
      ...prev,
      tabVisibility: { ...(prev?.tabVisibility ?? DEFAULT_TAB_VISIBILITY), [id]: value },
    }));
  };
  return (
    <div className="hl-page hl-fade-in">
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <div style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)", marginBottom: "24px" }}>Settings</div>

        {setTab && (
          <Card
            role="button"
            tabIndex={0}
            onClick={() => setTab("help")}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab("help"); } }}
            style={{ padding: "16px 20px", marginBottom: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", borderLeft: "4px solid var(--brass)" }}
          >
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>Help & Guide</span>
            <span style={{ color: "var(--brass2)", fontSize: "18px" }}>→</span>
          </Card>
        )}

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
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Show or hide tabs in the navigation. Dashboard and Animals are always visible. Settings is always visible.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {TAB_OPTIONS.filter(t => t.id !== "dashboard" && t.id !== "animals").map(t => (
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
