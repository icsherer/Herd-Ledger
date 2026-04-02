export default function Privacy() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "40px" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "32px", fontWeight: 700, color: "#1B3A2B", marginBottom: "8px" }}>
            Privacy Policy
          </div>
          <div style={{ fontSize: "14px", color: "var(--muted)" }}>
            Herd Ledger · Last updated April 2025
          </div>
        </div>

        <Section title="Overview">
          <P>
            Herd Ledger is a livestock management application built for ranchers and farmers. We take the
            privacy of your farm data seriously. This policy explains what information we collect, how we
            store it, and your rights as a user.
          </P>
        </Section>

        <Section title="What We Collect">
          <P>We collect only what is necessary to operate the app:</P>
          <ul style={listStyle}>
            <li style={liStyle}><strong>Account information</strong> — your email address, used to log in and send account-related emails.</li>
            <li style={liStyle}><strong>Farm profile</strong> — farm name, owner name, and optional farm logo that you provide in Settings.</li>
            <li style={liStyle}><strong>Animal records</strong> — names, tags, species, breeds, health records, vaccinations, breeding records, and any other data you enter about your animals.</li>
            <li style={liStyle}><strong>Financial records</strong> — sale prices, expense amounts, and purchase history that you record in the app.</li>
            <li style={liStyle}><strong>Usage data</strong> — basic, anonymized information about how the app is used (e.g., which features are active). No personally identifiable usage tracking.</li>
          </ul>
          <P>We do not collect your physical address, payment card details (payments are handled by Stripe), or any information beyond what you explicitly enter.</P>
        </Section>

        <Section title="How Your Data Is Stored">
          <P>
            All data is stored securely using <strong>Supabase</strong>, a managed database platform hosted
            on servers in the United States. Your data is encrypted in transit (HTTPS/TLS) and at rest.
            Each user's data is isolated — row-level security policies ensure you can only access your own records.
          </P>
          <P>
            Photos and documents you upload are stored in Supabase Storage (AWS S3-backed) in the US.
          </P>
          <P>
            If you use guest mode, your data is stored locally in your browser only and is never transmitted
            to our servers.
          </P>
        </Section>

        <Section title="How We Use Your Data">
          <ul style={listStyle}>
            <li style={liStyle}>To provide the features of the app — animal tracking, health records, sales, expenses, etc.</li>
            <li style={liStyle}>To send transactional emails you initiate, such as bills of sale or account verification.</li>
            <li style={liStyle}>To maintain and improve the app.</li>
          </ul>
          <P>
            We do not use your data to serve advertisements, build marketing profiles, or make automated decisions about you.
          </P>
        </Section>

        <Section title="Data Sharing">
          <P>
            <strong>We never sell your data to third parties.</strong> We do not share your personal information
            or farm records with anyone, except in these narrow circumstances:
          </P>
          <ul style={listStyle}>
            <li style={liStyle}><strong>Service providers</strong> — Supabase (database/storage), Stripe (payment processing), and Resend (transactional email). Each is bound by their own privacy policies and processes only what is necessary.</li>
            <li style={liStyle}><strong>Legal requirement</strong> — if required by law or valid legal process.</li>
          </ul>
        </Section>

        <Section title="Deleting Your Account">
          <P>
            You can delete your account and all associated data at any time from the Settings page.
            Deleting your account permanently removes all animal records, health records, financial data,
            photos, documents, and your email address from our systems. This action is immediate and
            cannot be undone.
          </P>
        </Section>

        <Section title="Data Retention">
          <P>
            Your data is retained for as long as your account is active. When you delete your account,
            all data is deleted immediately. We do not retain backups of deleted accounts beyond our
            standard database backup window (7 days), after which all copies are permanently removed.
          </P>
        </Section>

        <Section title="Children's Privacy">
          <P>
            Herd Ledger is not directed at children under 13. We do not knowingly collect personal
            information from children. If you believe a child has created an account, please contact us
            and we will delete the account promptly.
          </P>
        </Section>

        <Section title="Changes to This Policy">
          <P>
            If we make material changes to this policy, we will update the date at the top of this page
            and notify users by email when required. Continued use of the app after changes constitutes
            acceptance of the updated policy.
          </P>
        </Section>

        <Section title="Contact">
          <P>
            Questions about this privacy policy or your data? Email us at{" "}
            <a href="mailto:ian@herdledger.app" style={{ color: "#1B3A2B", fontWeight: 600 }}>
              ian@herdledger.app
            </a>
            .
          </P>
        </Section>

        {/* Back link */}
        <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--cream2)" }}>
          <a
            href="/"
            style={{ fontSize: "14px", color: "var(--muted)", textDecoration: "none", fontWeight: 500 }}
          >
            ← Back to Herd Ledger
          </a>
        </div>

      </div>
    </div>
  );
}

// ── Local helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "36px" }}>
      <div style={{
        fontFamily: "'Playfair Display'",
        fontSize: "18px",
        fontWeight: 600,
        color: "#1B3A2B",
        marginBottom: "12px",
        paddingBottom: "6px",
        borderBottom: "2px solid var(--cream2)",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function P({ children }) {
  return (
    <p style={{ fontSize: "15px", color: "var(--ink2)", lineHeight: 1.7, margin: "0 0 12px" }}>
      {children}
    </p>
  );
}

const listStyle = {
  margin: "0 0 12px",
  paddingLeft: "20px",
};

const liStyle = {
  fontSize: "15px",
  color: "var(--ink2)",
  lineHeight: 1.7,
  marginBottom: "6px",
};
