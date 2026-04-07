import { useState } from "react";

const HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Herd Ledger is a livestock management app for ranchers and farmers. To get started, go to the Animals tab and tap Register Animal to add your first animal. You can also bulk import animals from a spreadsheet using the Import Animals button.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}>Your data is saved automatically to the cloud — sign in on any device to access your herd.</p>
      </>
    ),
  },
  {
    id: "install",
    title: "Install on Your Phone",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "10px", lineHeight: 1.65, color: "var(--ink2)" }}><strong>iPhone:</strong> Open app.herdledger.app in Safari → tap the Share button at the bottom of the screen → tap Add to Home Screen → tap Add. The app will appear on your home screen like a native app.</p>
        <p style={{ marginBottom: "10px", lineHeight: 1.65, color: "var(--ink2)" }}><strong>Android:</strong> Open app.herdledger.app in Chrome → tap the three-dot menu in the top right → tap Add to Home Screen → tap Add.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}>A native app is coming soon to the App Store and Google Play.</p>
      </>
    ),
  },
  {
    id: "features",
    title: "Features Guide",
    renderContent: () => (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {[
          {
            label: "Dashboard",
            text: "Overview of your herd at a glance. Shows active animal count, overdue gestations, animals due this month, upcoming tasks, and a weather summary. Tap any card to jump to that section.",
          },
          {
            label: "Animals",
            text: "Your full herd register. Register animals individually or import from a spreadsheet (CSV or Excel). Each animal profile tracks breed, DOB, color, photos, health records, vaccinations, weight logs, breeding history, and documents. Use Bulk Actions to mark multiple animals as sold, deceased, or moved at once.",
          },
          {
            label: "Breeding & Gestation",
            text: "Track breeding records and monitor pregnancy progress. Log turn-out and pull dates, expected due dates, and delivery outcomes. When a litter is delivered, enter the litter size and the app will auto-create offspring records for you.",
          },
          {
            label: "Pastures",
            text: "Assign animals to pastures and track movements. Log feed deliveries per pasture and view feed history. Tap the history icon on any pasture to see a full feed log in a popup.",
          },
          {
            label: "Hay & Forage",
            text: "Track hay inventory by lot. Log bales in and out, monitor inventory levels, and see cost per bale. Connect hay logs to pastures for feed cost tracking.",
          },
          {
            label: "Expenses",
            text: "Track all farm expenses by category. Expenses can be linked to individual animals or pastures. Export to CSV for tax preparation.",
          },
          {
            label: "Sales",
            text: "Record individual animal sales with buyer info, price, location, and notes. Log group/load sales for barn loads. Generate a Bill of Sale PDF for any sale and email it directly to the buyer from the app.",
          },
          {
            label: "Tasks",
            text: "Create and manage farm tasks with due dates. Tasks can be linked to animals or gestations. The dashboard shows upcoming and overdue tasks.",
          },
          {
            label: "Weaning",
            text: "Track calves and offspring approaching weaning age. Set target weaning dates and get reminders when animals are ready.",
          },
          {
            label: "Journal / Notes",
            text: "A running log of events on your farm. Health records, vaccinations, pasture moves, and sales automatically create journal entries. You can also add manual notes linked to individual animals.",
          },
          {
            label: "Finances Summary",
            text: "The Sales tab includes an Annual Summary with total revenue, expenses, and net profit. Export a Schedule F CSV for tax filing.",
          },
        ].map(({ label, text }) => (
          <li key={label} style={{ marginBottom: "16px", lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: "var(--green)", display: "inline-block", marginBottom: "2px" }}>{label}:</span>
            <span style={{ color: "var(--ink2)" }}> {text}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "importing",
    title: "Importing Animals",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Tap <strong>Import Animals</strong> in the Animals tab to upload a CSV or Excel file. Download the template first to see all supported columns.</p>
        <p style={{ marginBottom: "8px", lineHeight: 1.65, color: "var(--ink2)" }}>The template includes:</p>
        <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px", color: "var(--ink2)", lineHeight: 1.8, fontSize: "14px" }}>
          {["Name", "Tag", "Species", "Breed", "Sex", "Date of Birth", "Color", "Purchase Date", "Notes", "Acquisition Type", "Purchase Price", "Purchased From", "Current Pasture", "Dam Name", "Sire Name", "Registration Number"].map(col => (
            <li key={col}>{col}</li>
          ))}
        </ul>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>All columns except <strong>Name</strong> are optional. Valid <strong>Acquisition Type</strong> values are: Purchased, Home Raised, Gift, Lease.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}>The importer will preview your data before saving and flag any duplicates.</p>
      </>
    ),
  },
  {
    id: "bill-of-sale",
    title: "Bill of Sale PDF",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Generate a professional Bill of Sale PDF directly from any sale record. Open the <strong>Sales</strong> tab, tap a sale row to expand it, then tap <strong>Bill of Sale</strong>.</p>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Fill in the buyer details (or select from your Contacts), review the auto-filled sale information, and tap <strong>Generate PDF</strong>. You can download the PDF, email it directly to the buyer, or save it to your records.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}>Add your farm logo in Settings to have it appear on the document.</p>
      </>
    ),
  },
  {
    id: "billing",
    title: "Subscription & Billing",
    renderContent: () => (
      <>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>Herd Ledger is free for up to 10 animals. To manage unlimited animals and access all features, subscribe to <strong>Herd Ledger Pro</strong> at $9.99/month or $79.99/year.</p>
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>A 14-day free trial is included — no charge until the trial ends.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}>To manage your subscription, go to <strong>Settings → Manage Billing &amp; Subscription</strong>. You can upgrade, cancel, or update your payment method there at any time.</p>
      </>
    ),
  },
  {
    id: "faq",
    title: "Frequently Asked Questions",
    renderContent: () => (
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {[
          {
            q: "Is my data safe?",
            a: "Yes. All data is encrypted and stored securely using Supabase, hosted on US servers. You can delete your account and all data at any time from Settings.",
          },
          {
            q: "Can I use Herd Ledger on multiple devices?",
            a: "Yes. Sign in with the same account on any device and your data syncs automatically.",
          },
          {
            q: "What species does Herd Ledger support?",
            a: "Cattle, horses, sheep, goats, pigs, donkeys, llamas, alpacas, rabbits, chickens, ducks, turkeys, and more.",
          },
          {
            q: "How do I record a group or load sale?",
            a: 'Go to the Sales tab and tap "+ Log sale barn load" in the Group / Load Sales section.',
          },
          {
            q: "Can multiple people access the same farm account?",
            a: "Not yet — multi-user support is coming in a future update.",
          },
          {
            q: "How do I generate a Bill of Sale?",
            a: "Open the Sales tab, expand any sale record, and tap the Bill of Sale button.",
          },
          {
            q: "What happens when I hit the 10 animal limit?",
            a: "You'll see an upgrade prompt. Start a free 14-day trial to unlock unlimited animals and all Pro features.",
          },
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
        <p style={{ marginBottom: "12px", lineHeight: 1.65, color: "var(--ink2)" }}>We build features based on your feedback. Every suggestion is read personally.</p>
        <p style={{ marginBottom: "16px", lineHeight: 1.65, color: "var(--ink2)" }}>You can also use the thumbs down button on any response in the app to send feedback directly.</p>
        <a href="mailto:ian@herdledger.app?subject=Herd%20Ledger%20Feedback" style={{ display: "inline-flex", alignItems: "center", padding: "10px 20px", background: "var(--green)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 600, textDecoration: "none", border: "none", cursor: "pointer" }}>Contact Support</a>
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
