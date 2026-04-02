// src/components/BillOfSaleModal.jsx
import { useState, useEffect } from "react";
import { Btn, Input, Textarea } from "./ui.jsx";
import DateInputWithValidation from "./DateInputWithValidation.jsx";
import { sanitizeDate, todayLocalISODate } from "../lib/dateUtils.js";
import { generateBillOfSale } from "../lib/generateBillOfSale.js";
import { saveBillOfSale } from "../lib/db.js";

const SUPABASE_URL = "https://ugjtrdnqrlanrenhsddf.supabase.co";

function emptyBuyer() {
  return { name: "", address: "", city: "", state: "", zip: "", phone: "", email: "" };
}

export default function BillOfSaleModal({
  isOpen,
  onClose,
  sale,
  saleType = "individual",
  animals = [],
  contacts = [],
  settings = {},
  supabase,
  userId,
}) {
  const [step, setStep] = useState("form");
  const [selectedAnimalIds, setSelectedAnimalIds] = useState([]);
  const [buyer, setBuyer] = useState(emptyBuyer());
  const [contactId, setContactId] = useState("");
  const [saleDate, setSaleDate] = useState(todayLocalISODate());
  const [saleLocation, setSaleLocation] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [additionalAgreements, setAdditionalAgreements] = useState("");
  const [pdfDataUri, setPdfDataUri] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);
  const [emailing, setEmailing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStep("form");
    setPdfDataUri(null);
    setPdfDoc(null);
    setStatusMsg(null);
    setBuyer(emptyBuyer());
    setContactId("");
    setAdditionalAgreements("");

    if (saleType === "individual" && sale) {
      setSelectedAnimalIds([sale.id]);
      setSaleDate(sanitizeDate(sale.sale?.dateSold) || todayLocalISODate());
      setSaleLocation(sale.sale?.saleLocation || "");
      setTotalPrice(sale.sale?.pricePerHead != null ? String(sale.sale.pricePerHead) : "");
      setBuyer(prev => ({ ...prev, name: sale.sale?.buyerName || "" }));
    } else if (saleType === "load" && sale) {
      setSelectedAnimalIds([]);
      setSaleDate(sanitizeDate(sale.date) || todayLocalISODate());
      setSaleLocation("");
      setTotalPrice(sale.totalAmount != null ? String(sale.totalAmount) : "");
      setBuyer(prev => ({ ...prev, name: sale.buyerName || "" }));
    }
  }, [isOpen, sale, saleType]);

  useEffect(() => {
    return () => {
      if (pdfDataUri) URL.revokeObjectURL(pdfDataUri);
    };
  }, [pdfDataUri]);

  if (!isOpen) return null;

  const selectedAnimals = saleType === "individual"
    ? animals.filter(a => selectedAnimalIds.includes(a.id))
    : [];

  const pdfAnimals = selectedAnimals.map(a => ({
    name: a.name || "",
    tag: a.tag || "",
    species: a.species || "",
    breed: a.breed || "",
    dob: a.dob || "",
    sex: a.sex || "",
    weight: a.sale?.weightAtSale || a.weight || "",
    color: a.color || "",
    price: a.sale?.pricePerHead != null ? a.sale.pricePerHead : "",
  }));

  if (saleType === "load" && sale) {
    pdfAnimals.push({
      name: `${sale.headCount || "?"} head`,
      tag: "",
      species: sale.species || "",
      breed: "",
      dob: "",
      sex: "",
      weight: sale.averageWeight ? `${sale.averageWeight} lbs avg` : "",
      color: "",
      price: totalPrice || sale.totalAmount || "",
    });
  }

  const seller = {
    farmName: settings?.farmName || "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
  };

  function handleContactChange(e) {
    const id = e.target.value;
    setContactId(id);
    if (!id) return;
    const c = contacts.find(c => c.id === id);
    if (!c) return;
    setBuyer(prev => ({
      ...prev,
      name: c.name || prev.name,
      phone: c.phone || prev.phone,
      email: c.email || prev.email,
    }));
  }

  function handleGeneratePDF() {
    const doc = generateBillOfSale({
      seller,
      buyer,
      animals: pdfAnimals,
      saleDate,
      saleLocation,
      totalPrice,
      additionalAgreements,
      farmLogoBase64: settings?.farmLogo || null,
    });
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    setPdfDoc(doc);
    setPdfDataUri(url);
    setStep("preview");
    setStatusMsg(null);
  }

  function handleDownload() {
    if (!pdfDoc) return;
    const dateStr = saleDate || new Date().toISOString().slice(0, 10);
    pdfDoc.save(`bill-of-sale-${dateStr}.pdf`);
  }

  async function handleEmail() {
    if (!pdfDoc || !buyer.email?.trim()) {
      setStatusMsg({ text: "Enter a buyer email address first.", ok: false });
      return;
    }
    setEmailing(true);
    setStatusMsg(null);
    try {
      const pdfBase64 = pdfDoc.output("datauristring").split(",")[1];
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-bill-of-sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          toEmail: buyer.email.trim(),
          toName: buyer.name.trim() || undefined,
          farmName: settings?.farmName || "",
          pdfBase64,
          animalCount: pdfAnimals.length,
          saleDate,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Email failed. Please try again.");
      }
      setStatusMsg({ text: `Bill of sale emailed to ${buyer.email.trim()}.`, ok: true });
    } catch (err) {
      setStatusMsg({ text: err.message || "Failed to send email.", ok: false });
    } finally {
      setEmailing(false);
    }
  }

  async function handleSaveToRecords() {
    if (!userId || !supabase) {
      setStatusMsg({ text: "Sign in to save records.", ok: false });
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      await saveBillOfSale(supabase, userId, {
        animal_ids: selectedAnimalIds,
        buyer_name: buyer.name || null,
        buyer_address: buyer.address || null,
        buyer_city: buyer.city || null,
        buyer_state: buyer.state || null,
        buyer_zip: buyer.zip || null,
        buyer_phone: buyer.phone || null,
        buyer_email: buyer.email || null,
        sale_date: sanitizeDate(saleDate) || null,
        sale_location: saleLocation || null,
        total_price: totalPrice !== "" ? Number(totalPrice) : null,
        additional_agreements: additionalAgreements || null,
      });
      setStatusMsg({ text: "Saved to records.", ok: true });
    } catch (err) {
      setStatusMsg({ text: err.message || "Failed to save.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "var(--radius2)",
          boxShadow: "var(--shadow)",
          border: "1px solid var(--cream2)",
          borderLeft: "4px solid var(--brass)",
          width: "100%",
          maxWidth: step === "preview" ? "860px" : "540px",
          maxHeight: "90vh",
          margin: "20px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 0", flexShrink: 0 }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600, color: "var(--ink)" }}>
            {step === "preview" ? "Review Bill of Sale" : "Bill of Sale"}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "24px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px 24px", overflowY: "auto", flex: 1 }}>
          {step === "form" ? (
            <FormStep
              saleType={saleType}
              contacts={contacts}
              contactId={contactId}
              onContactChange={handleContactChange}
              buyer={buyer}
              setBuyer={setBuyer}
              saleDate={saleDate}
              setSaleDate={setSaleDate}
              saleLocation={saleLocation}
              setSaleLocation={setSaleLocation}
              totalPrice={totalPrice}
              setTotalPrice={setTotalPrice}
              additionalAgreements={additionalAgreements}
              setAdditionalAgreements={setAdditionalAgreements}
              onGenerate={handleGeneratePDF}
              onCancel={onClose}
            />
          ) : (
            <PreviewStep
              pdfDataUri={pdfDataUri}
              buyer={buyer}
              setBuyer={setBuyer}
              onDownload={handleDownload}
              onEmail={handleEmail}
              emailing={emailing}
              onSave={handleSaveToRecords}
              saving={saving}
              statusMsg={statusMsg}
              onBack={() => setStep("form")}
              userId={userId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form step ─────────────────────────────────────────────────────────────────

function FormStep({
  saleType,
  contacts, contactId, onContactChange,
  buyer, setBuyer,
  saleDate, setSaleDate,
  saleLocation, setSaleLocation,
  totalPrice, setTotalPrice,
  additionalAgreements, setAdditionalAgreements,
  onGenerate, onCancel,
}) {
  const set = k => e => setBuyer(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

      {/* Load sale notice */}
      {saleType === "load" && (
        <div style={{ fontSize: "14px", color: "var(--ink2)", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
          Load sale — a summary row will be added to the PDF for this load.
        </div>
      )}

      {/* Contact picker */}
      {contacts.length > 0 && (
        <div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Fill from Contact</div>
          <select
            value={contactId}
            onChange={onContactChange}
            style={{ width: "100%", padding: "9px 12px", borderRadius: "var(--radius)", border: "1.5px solid var(--cream3)", fontSize: "14px", color: "var(--ink)", background: "#fff", minHeight: "44px" }}
          >
            <option value="">— Select a contact —</option>
            {contacts.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.ranchCompany ? ` — ${c.ranchCompany}` : ""}</option>
            ))}
          </select>
        </div>
      )}

      {/* Buyer info */}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Buyer Information</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Input label="Name *" value={buyer.name} onChange={set("name")} placeholder="e.g. John Smith" />
          <Input label="Address" value={buyer.address} onChange={set("address")} placeholder="123 Ranch Road" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px", gap: "10px" }}>
            <Input label="City" value={buyer.city} onChange={set("city")} placeholder="Amarillo" />
            <Input label="State" value={buyer.state} onChange={set("state")} placeholder="TX" />
            <Input label="ZIP" value={buyer.zip} onChange={set("zip")} placeholder="79101" />
          </div>
          <Input label="Phone" value={buyer.phone} onChange={set("phone")} placeholder="(806) 555-0100" />
          <Input label="Email" type="email" value={buyer.email} onChange={set("email")} placeholder="buyer@example.com" />
        </div>
      </div>

      {/* Sale details */}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Sale Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <DateInputWithValidation label="Sale date *" value={saleDate} onValueChange={setSaleDate} />
          <Input label="Sale location" value={saleLocation} onChange={e => setSaleLocation(e.target.value)} placeholder="e.g. Smith Sale Barn, Amarillo TX" />
          <Input label="Total price ($)" type="number" min="0" step="0.01" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} placeholder="e.g. 4500.00" />
        </div>
      </div>

      {/* Additional agreements */}
      <Textarea
        label="Additional Agreements"
        value={additionalAgreements}
        onChange={e => setAdditionalAgreements(e.target.value)}
        rows={3}
        placeholder="e.g. Seller warrants animals are free of known disease..."
      />

      {/* Actions */}
      <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <Btn onClick={onGenerate} disabled={!saleDate || !buyer.name?.trim()}>Generate PDF</Btn>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
      {!buyer.name?.trim() && (
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "-8px" }}>Buyer name is required to generate.</div>
      )}
    </div>
  );
}

// ── Preview step ──────────────────────────────────────────────────────────────

function PreviewStep({
  pdfDataUri, buyer, setBuyer,
  onDownload, onEmail, emailing,
  onSave, saving, statusMsg,
  onBack, userId,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* PDF iframe */}
      <div style={{ border: "1px solid var(--cream2)", borderRadius: "var(--radius)", overflow: "hidden", height: "480px" }}>
        {pdfDataUri ? (
          <iframe
            src={pdfDataUri}
            title="Bill of Sale Preview"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: "14px" }}>
            PDF not available
          </div>
        )}
      </div>

      {/* Inline email field if missing */}
      {!buyer.email?.trim() && (
        <Input
          label="Buyer email (required to send)"
          type="email"
          value={buyer.email}
          onChange={e => setBuyer(prev => ({ ...prev, email: e.target.value }))}
          placeholder="buyer@example.com"
        />
      )}

      {/* Actions */}
      <div className="hl-card-actions" style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <Btn onClick={onDownload}>Download PDF</Btn>
        <Btn variant="secondary" onClick={onEmail} disabled={emailing || !buyer.email?.trim()}>
          {emailing ? "Sending…" : "Email to Buyer"}
        </Btn>
        {userId && (
          <Btn variant="secondary" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save to Records"}
          </Btn>
        )}
        <Btn variant="ghost" onClick={onBack}>Back</Btn>
      </div>

      {/* Status message */}
      {statusMsg && (
        <div style={{
          fontSize: "14px",
          color: "var(--ink2)",
          padding: "12px 14px",
          background: statusMsg.ok ? "var(--cream)" : "#FFF3F3",
          borderRadius: "var(--radius)",
          border: `1px solid ${statusMsg.ok ? "var(--cream2)" : "#F5C6C6"}`,
          borderLeft: `3px solid ${statusMsg.ok ? "var(--green)" : "var(--danger2)"}`,
        }}>
          {statusMsg.text}
        </div>
      )}
    </div>
  );
}
