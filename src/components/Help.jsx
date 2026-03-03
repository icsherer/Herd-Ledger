import { useState } from "react";

const HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Welcome to Herd Ledger, your free livestock management app.</p>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}><strong>How to register your first animal:</strong> tap the Animals tab, tap Register Animals, fill in the details.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}><strong>How to navigate the tabs:</strong> Dashboard, Animals, Gestation, Pastures, Feeder Program, Expenses, Sales, Journal, Settings.</p>
      </>
    ),
  },
  {
    id: "install",
    title: "Install on Your Phone",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "10px", lineHeight: 1.65, color: "var(--ink2)" }}><strong>iPhone:</strong> Open app.herdledger.app in Safari → tap the Share button at the bottom of the screen → tap Add to Home Screen → tap Add. The app will appear on your home screen like a native app.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}><strong>Android:</strong> Open app.herdledger.app in Chrome → tap the three dot menu in the top right → tap Add to Home Screen → tap Add.</p>
      </>
    ),
  },
  {
    id: "features",
    title: "Features Guide",
    renderContent: () => (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {[
          { label: "Dashboard", text: "Overview of your herd, upcoming events, financials summary." },
          { label: "Animals", text: "Register, view, and manage all your livestock. Switch between tile and list view. Import animals from Excel or CSV." },
          { label: "Gestation", text: "Track pregnancies, due dates, and calving history." },
          { label: "Pastures", text: "Manage pasture assignments and track animal movements." },
          { label: "Feeder Program", text: "Enroll animals in feeding programs, track days on feed, and calculate profitability." },
          { label: "Expenses", text: "Log all farm expenses by category, track monthly and annual totals." },
          { label: "Sales", text: "Record individual and group sales, track net gain, export for taxes." },
          { label: "Journal", text: "Searchable log of farm notes and animal movement history." },
        ].map(({ label, text }) => (
          <li key={label} style={{ marginBottom: "14px", paddingLeft: "0", lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: "var(--green)", display: "inline-block", marginBottom: "2px" }}>{label}:</span>
            <span style={{ color: "var(--ink2)" }}> {text}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "faq",
    title: "Frequently Asked Questions",
    renderContent: () => (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {[
          { q: "Is Herd Ledger free?", a: "Yes, completely free while in beta. All current users will be grandfathered in when paid plans launch." },
          { q: "Is my data safe?", a: "Yes, all data is stored securely in the cloud and synced across all your devices." },
          { q: "Can I use it on multiple devices?", a: "Yes, log in with the same account on any device." },
          { q: "How do I import existing animals?", a: "Use the Import Animals button on the Animals tab to upload a CSV or Excel file." },
          { q: "Is there an app store version coming?", a: "Yes, iOS and Android apps are coming soon." },
          { q: "How do I log a group or load sale?", a: "Go to the Sales tab and use the Group Sale button." },
          { q: "Can multiple people on my farm use it?", a: "Multi-user support is coming soon." },
          { q: "What species does Herd Ledger support?", a: "Cattle, Horses, Pigs, Sheep, Goats, Llamas, Alpacas, Rabbits, Dogs, Cats, Chickens, Bison, and Donkeys." },
        ].map(({ q, a }) => (
          <li key={q} style={{ marginBottom: "16px" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: "4px" }}>{q}</div>
            <div style={{ color: "var(--ink2)", lineHeight: 1.6, fontSize: "14px" }}>{a}</div>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Contact & Feedback",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "16px", lineHeight: 1.65, color: "var(--ink2)" }}>We build features based on your feedback. Every suggestion is read personally.</p>
        <a href="mailto:support@herdledger.app?subject=Herd%20Ledger%20Feedback" style={{ display: "inline-flex", alignItems: "center", padding: "10px 20px", background: "var(--green)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 600, textDecoration: "none", border: "none", cursor: "pointer" }}>Contact Support</a>
      </>
    ),
  },
];

export default function Help({ onBack }) {
  const [openIds, setOpenIds] = useState(() => new Set(HELP_SECTIONS.map(s => s.id)));
  const toggle = (id) => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <div className="hl-page hl-fade-in">
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", marginBottom: "20px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          ← Back to Settings
        </button>
        <div style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)", marginBottom: "24px" }}>Help & Guide</div>
        <div className="hl-help-accordion">
          {HELP_SECTIONS.map(section => {
            const isOpen = openIds.has(section.id);
            return (
              <div key={section.id} className="hl-help-section" style={{ marginBottom: "10px", border: "1px solid var(--cream3)", borderRadius: "var(--radius2)", overflow: "hidden", background: "#fff" }}>
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  style={{
                    width: "100%",
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isOpen ? "var(--green)" : "var(--cream2)",
                    color: isOpen ? "#fff" : "var(--ink)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "15px",
                    fontWeight: 600,
                  }}
                >
                  <span>{section.title}</span>
                  <span style={{ fontSize: "18px", color: isOpen ? "var(--brass3)" : "var(--brass2)" }}>{isOpen ? "−" : "+"}</span>
                </button>
                {isOpen && (
                  <div key={section.id} className="hl-help-content" style={{ padding: "20px", borderTop: "1px solid var(--cream3)", fontSize: "14px", display: "block", minHeight: "1px" }}>
                    {section.renderContent()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
