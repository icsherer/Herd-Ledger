import {
  SPECIES,
  PASTURE_SPECIES,
  IMPORT_HL_FIELDS,
  CULL_REASONS,
  VACCINE_ROUTES,
  TREATMENT_TYPES,
  TREATMENT_TYPE_TO_EXPENSE_CATEGORY,
  SEX_TERM_GENDER,
  DEFAULT_SETTINGS,
  CASTRATED_TERM_BY_SPECIES,
  INTACT_MALE_TERM_BY_SPECIES,
  EQUINE_VACCINE_SUGGESTIONS,
  HORSE_DISCIPLINES,
  HORSE_HEALTH_EXPENSE_CATEGORY,
  REGISTER_OTHER_SPECIES,
  REGISTER_SPECIES_TABS,
  BREEDING_MALE_SEX_TERMS,
} from "../lib/constants.js";
import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { getSexOptions, getOffspringSexOptions, getOffspringDefaultSex, getOffspringTerm, getCalculatedWeaningDate, getExpectedWeaningDate, getHealthStatus, getAnimalName, fmt, ageFromDob, getAgeInMonths, getAgeBasedSexTerm, getCanonicalPastureNames, resolvePastureName, pastureNameEq, getBreedingMaleInPasture, getEligibleFemalesForRunningWithBull, getRunningWithMaleForFemale, createMovementJournalEntry, compressImageToBase64, isFemale, isMale, dueDate, dueDateRangeFromSingleDate, displaySex, fmtDueRange, fmtExposure, progress, breedingDateForProgress, daysUntilDue, birthDateWithinGestationWindow, breedingDateFromDelivery, isBreedingMale, feederDaysOnFeed, estimatedWeightFromADG, getLatestWeightForAnimal, getADGDefault, getNextExpectedHeatDate, checkInbreedingByParentIds } from "../lib/helpers.js";
import { Card, Badge, Btn, Input, Select, Textarea, PastureCombo, SectionTitle } from "./ui.jsx";
import ContactPicker from "./ContactPicker.jsx";
import { supabase } from "../supabase";
import { sanitizeDate, sanitizeBirthDate, isValidDate, fixBreedingDueTwoDigitYear, DATE_WARN_INVALID } from "../lib/dateUtils.js";
import DateInputWithValidation from "./DateInputWithValidation.jsx";

/** Intact males of the species for sire dropdowns (edit / register / breeding / offspring). No age or DOB requirement — differs from getBreedingMalesForSpecies → isBreedingMale used elsewhere. */
function getSireDropdownMalesForSpecies(animals, species) {
  if (!species) return [];
  return (animals || []).filter(
    a => !a.deceased && !a.sale && a.species === species && BREEDING_MALE_SEX_TERMS.includes(a.sex)
  );
}

export function animalToEditInitialValues(a) {
  const species = a.species || "Cattle";
  const opts = getSexOptions(species);
  const sex = opts.includes(a.sex) ? a.sex : (SEX_TERM_GENDER[a.sex] === "Female" ? opts.find(o => SEX_TERM_GENDER[o] === "Female") : opts.find(o => SEX_TERM_GENDER[o] === "Male")) || opts[0];
  return {
    name: a.name || "",
    species,
    sex: sex || opts[0],
    dob: a.dob || "",
    breed: a.breed || "",
    tag: a.tag || "",
    notes: a.notes || "",
    color: a.color || "",
    acquisitionType: a.acquisitionType || "Home Raised",
    purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : "",
    purchaseDate: a.purchaseDate || "",
    purchasedFrom: a.purchasedFrom || "",
    targetWeaningDate: a.targetWeaningDate || "",
    heightHands: a.heightHands || "",
    discipline: a.discipline || "",
    registrationNumber: a.registrationNumber || "",
    markings: a.markings || "",
    damId: a.damId || a.motherId || "",
    damName: (a.damName || a.motherName) || "",
    damNotInHerd: !(a.damId || a.motherId),
    damSearch: "",
    sireId: a.sireId || "",
    sireName: a.sireName || "",
    sireNotInHerd: !a.sireId,
    sireSearch: "",
    excludeFromReports: a.excludeFromReports ?? false,
  };
}

function buildRegisterSingleForm(defaultSpecies, seed) {
  const sp = defaultSpecies || "Cattle";
  const opts = getSexOptions(sp);
  const base = {
    name: "",
    species: sp,
    sex: opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0],
    dob: "",
    breed: "",
    tag: "",
    notes: "",
    color: "",
    currentPasture: "",
    acquisitionType: "Home Raised",
    purchasePrice: "",
    purchaseDate: "",
    purchasedFrom: "",
    targetWeaningDate: "",
    heightHands: "",
    discipline: "",
    registrationNumber: "",
    markings: "",
    damId: "",
    damName: "",
    damNotInHerd: false,
    sireId: "",
    sireName: "",
    sireNotInHerd: false,
    damSearch: "",
    sireSearch: "",
    excludeFromReports: sp === "Horse",
  };
  return seed ? { ...base, ...seed } : base;
}

/** Edit animal card — all form state internal; onSave receives the merged animal record (same shape saveEdit produced). */
export function EditAnimalForm({
  editingAnimal,
  initialValues,
  editingAnimalId,
  animals,
  pastures,
  contacts,
  setContacts,
  gestations: _gestations,
  onSave,
  onCancel,
}) {
  const [form, setForm] = useState(() => ({ ...initialValues }));

  function handleSave() {
    const current = editingAnimal;
    if (!current) return;
    const purchasePriceNum = form.purchasePrice?.trim() ? parseFloat(form.purchasePrice) : undefined;
    const opts = getSexOptions(form.species);
    const validSex = (form.sex && opts.includes(form.sex)) ? form.sex : (current.sex && opts.includes(current.sex) ? current.sex : opts[0]);
    const dob = sanitizeBirthDate(form.dob) || undefined;
    const months = getAgeInMonths(dob);
    const targetWeaningDate = (months != null && months >= 12) ? undefined : (sanitizeDate(form.targetWeaningDate) || undefined);
    const updated = {
      ...current,
      name: (form.name || "").trim() || undefined,
      species: form.species,
      sex: validSex,
      dob,
      breed: (form.breed || "").trim() || undefined,
      tag: (form.tag || "").trim() || undefined,
      notes: (form.notes || "").trim() || undefined,
      color: (form.color || "").trim() || undefined,
      acquisitionType: form.acquisitionType || "Home Raised",
      purchasePrice: purchasePriceNum,
      purchaseDate: sanitizeDate(form.purchaseDate) || undefined,
      purchasedFrom: (form.purchasedFrom || "").trim() || undefined,
      targetWeaningDate,
      damId: form.damNotInHerd ? undefined : (form.damId || undefined),
      damName: form.damNotInHerd ? (form.damName?.trim() || undefined) : (form.damId ? form.damName : undefined),
      motherId: form.damNotInHerd ? undefined : (form.damId || undefined),
      motherName: form.damNotInHerd ? (form.damName?.trim() || undefined) : (form.damId ? form.damName : undefined),
      sireId: form.sireNotInHerd ? undefined : (form.sireId || undefined),
      sireName: form.sireNotInHerd ? (form.sireName?.trim() || undefined) : (form.sireId ? form.sireName : undefined),
      excludeFromReports: form.excludeFromReports ?? false,
      ...(form.species === "Horse" && {
        heightHands: (form.heightHands || "").trim() || undefined,
        discipline: (form.discipline || "").trim() || undefined,
        registrationNumber: (form.registrationNumber || "").trim() || undefined,
        markings: (form.markings || "").trim() || undefined,
      }),
    };
    onSave(updated);
  }

  const femalesSameSpecies = (animals || []).filter(an => isFemale(an) && an.species === form.species && an.id !== editingAnimalId && !an.deceased && !an.sale);
  const malesSameSpecies = getSireDropdownMalesForSpecies(animals, form.species).filter(m => m.id !== editingAnimalId);
  const damOptionsEdit = femalesSameSpecies.filter(f => getAnimalName(f).toLowerCase().includes((form.damSearch || "").toLowerCase().trim()));
  const sireOptionsEdit = malesSameSpecies.filter(m => getAnimalName(m).toLowerCase().includes((form.sireSearch || "").toLowerCase().trim()));

  return (
    <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
      <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Edit Animal</div>
      <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
        <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
        <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
        <DateInputWithValidation label="Date of Birth" value={form.dob} onValueChange={v => setForm(p => ({ ...p, dob: v }))} birthDate />
        <Select label="Species" value={form.species} onChange={e => {
          const newSpecies = e.target.value;
          const opts = getSexOptions(newSpecies);
          setForm(p => ({ ...p, species: newSpecies, sex: opts.includes(p.sex) ? p.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]) }));
        }}>
          {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
        </Select>
        <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
          {getSexOptions(form.species).map(opt => <option key={opt}>{opt}</option>)}
        </Select>
        <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
        <Input label="Color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} placeholder="e.g. Black, Red Baldy, Roan" />
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink2)" }}>Acquisition</span>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
            <input type="radio" name="acquisitionType" checked={form.acquisitionType === "Home Raised"} onChange={() => setForm(p => ({ ...p, acquisitionType: "Home Raised" }))} style={{ accentColor: "var(--green)" }} />
            Home Raised
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
            <input type="radio" name="acquisitionType" checked={form.acquisitionType === "Purchased"} onChange={() => setForm(p => ({ ...p, acquisitionType: "Purchased" }))} style={{ accentColor: "var(--green)" }} />
            Purchased
          </label>
        </div>
        {form.acquisitionType === "Purchased" && (
          <>
            <Input label="Purchase price ($)" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="e.g. 850.00" />
            <DateInputWithValidation label="Purchase date" value={form.purchaseDate} onValueChange={v => setForm(p => ({ ...p, purchaseDate: v }))} />
            {setContacts ? <ContactPicker label="Purchased from (seller)" value={form.purchasedFrom} onChange={v => setForm(p => ({ ...p, purchasedFrom: v }))} contacts={contacts} setContacts={setContacts} placeholder="Search contacts or type name" /> : <Input label="Purchased from (seller)" value={form.purchasedFrom} onChange={e => setForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />}
          </>
        )}
      </div>
      {form.species === "Horse" && (
        <div style={{ marginBottom: "14px", padding: "14px", background: "var(--cream)", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Horse details</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "0" }}>
            <Input label="Height (hands)" value={form.heightHands} onChange={e => setForm(p => ({ ...p, heightHands: e.target.value }))} placeholder="e.g. 15.2" />
            <Select label="Discipline" value={form.discipline} onChange={e => setForm(p => ({ ...p, discipline: e.target.value }))}>
              <option value="">— Select —</option>
              {HORSE_DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Input label="Registration number" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} placeholder="e.g. AQHA 123456" />
            <Input label="Markings" value={form.markings} onChange={e => setForm(p => ({ ...p, markings: e.target.value }))} placeholder="e.g. Star, sock LF" style={{ gridColumn: "1 / -1" }} />
          </div>
        </div>
      )}
      <div style={{ marginBottom: "14px", paddingTop: "14px", borderTop: "1px solid var(--cream2)" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Lineage (optional)</div>
        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", cursor: "pointer", fontSize: "14px" }}>
          <input type="checkbox" checked={form.damNotInHerd} onChange={e => setForm(p => ({ ...p, damNotInHerd: e.target.checked, ...(e.target.checked ? { damId: "", damSearch: "" } : { damName: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
          <span>Dam not in my herd</span>
        </label>
        {!form.damNotInHerd ? (
          <div style={{ marginBottom: "12px" }}>
            <Input label="Search dams" value={form.damSearch || ""} onChange={e => setForm(p => ({ ...p, damSearch: e.target.value }))} placeholder="Type to filter..." />
            <Select label="Dam" value={form.damId || ""} onChange={e => { const v = e.target.value; if (!v) setForm(p => ({ ...p, damId: "", damName: "" })); else { const an = animals.find(x => x.id === v); setForm(p => ({ ...p, damId: v, damName: an ? getAnimalName(an) : "" })); } }} style={{ marginTop: "6px" }}>
              <option value="">— None —</option>
              {damOptionsEdit.map(f => <option key={f.id} value={f.id}>{getAnimalName(f)}{f.tag ? ` #${f.tag}` : ""}</option>)}
            </Select>
          </div>
        ) : (
          <div style={{ marginBottom: "12px" }}><Input label="Dam name" value={form.damName || ""} onChange={e => setForm(p => ({ ...p, damName: e.target.value }))} placeholder="e.g. Unknown or name" /></div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", cursor: "pointer", fontSize: "14px" }}>
          <input type="checkbox" checked={form.sireNotInHerd} onChange={e => setForm(p => ({ ...p, sireNotInHerd: e.target.checked, ...(e.target.checked ? { sireId: "", sireSearch: "" } : { sireName: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
          <span>Sire not in my herd</span>
        </label>
        {!form.sireNotInHerd ? (
          <div style={{ marginBottom: "12px" }}>
            <Input label="Search sires" value={form.sireSearch || ""} onChange={e => setForm(p => ({ ...p, sireSearch: e.target.value }))} placeholder="Type to filter..." />
            <Select label="Sire" value={form.sireId || ""} onChange={e => { const v = e.target.value; if (!v) setForm(p => ({ ...p, sireId: "", sireName: "" })); else { const an = animals.find(x => x.id === v); setForm(p => ({ ...p, sireId: v, sireName: an ? getAnimalName(an) : "" })); } }} style={{ marginTop: "6px" }}>
              <option value="">— None —</option>
              {sireOptionsEdit.map(m => <option key={m.id} value={m.id}>{getAnimalName(m)}{m.tag ? ` #${m.tag}` : ""}</option>)}
            </Select>
          </div>
        ) : (
          <div style={{ marginBottom: "12px" }}><Input label="Sire name" value={form.sireName || ""} onChange={e => setForm(p => ({ ...p, sireName: e.target.value }))} placeholder="e.g. Unknown or name" /></div>
        )}
      </div>
      <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
      <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", cursor: "pointer", fontSize: "14px" }}>
        <input type="checkbox" checked={form.excludeFromReports ?? false} onChange={e => setForm(p => ({ ...p, excludeFromReports: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--brass)" }} />
        <span>Exclude from financial reports</span>
      </label>
      <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
        <Btn onClick={handleSave}>Save Changes</Btn>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

function findDuplicateAnimal(formData, animals) {
  const tag = (formData.tag || "").trim();
  const name = (formData.name || "").trim();
  const species = (formData.species || "").trim().toLowerCase();
  if (!tag && !name) return null;
  return (animals || []).find(a => {
    if (tag && (a.tag || "").toString().trim().toLowerCase() === tag.toLowerCase()) return true;
    if (name && species && (a.name || "").trim().toLowerCase() === name.toLowerCase() && (a.species || "").toLowerCase() === species) return true;
    return false;
  }) || null;
}

/** Register animals card (single + bulk) — internal state; onRegister({ kind, animal(s) }) then caller updates herd. */
export function RegisterAnimalForm({
  defaultSpecies,
  initialSingleValues,
  animals,
  pastures,
  contacts,
  setContacts,
  setNotes,
  onRegister,
  onCancel,
}) {
  const [registerMode, setRegisterMode] = useState("single");
  const [form, setForm] = useState(() => buildRegisterSingleForm(defaultSpecies, initialSingleValues));
  const [bulkRegisterForm, setBulkRegisterForm] = useState(() => {
    const sp = defaultSpecies || "Cattle";
    return { species: sp, breed: "", sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", startingTag: "", count: "1", notes: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
  });
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [duplicateConfirmExisting, setDuplicateConfirmExisting] = useState(null);

  function addSubmit() {
    if (!form.name) return;
    const {
      currentPasture,
      purchasePrice: _pp,
      damSearch: _ds,
      sireSearch: _ss,
      damNotInHerd: _dnh,
      sireNotInHerd: _snh,
      dob: _dobF,
      purchaseDate: _pdF,
      targetWeaningDate: _twF,
      ...rest
    } = form;
    const dobSan = sanitizeBirthDate(form.dob) || undefined;
    const monthsReg = getAgeInMonths(dobSan);
    const newAnimal = {
      ...rest,
      id: Date.now().toString(),
      acquisitionType: form.acquisitionType || "Home Raised",
      purchasePrice: form.purchasePrice?.trim() ? parseFloat(form.purchasePrice) : undefined,
      purchaseDate: sanitizeDate(form.purchaseDate) || undefined,
      purchasedFrom: form.purchasedFrom?.trim() || undefined,
      dob: dobSan,
      targetWeaningDate: (monthsReg != null && monthsReg >= 12) ? undefined : (sanitizeDate(form.targetWeaningDate) || undefined),
      damId: form.damNotInHerd ? undefined : (form.damId || undefined),
      damName: form.damNotInHerd ? (form.damName?.trim() || undefined) : (form.damId ? form.damName : undefined),
      motherId: form.damNotInHerd ? undefined : (form.damId || undefined),
      motherName: form.damNotInHerd ? (form.damName?.trim() || undefined) : (form.damId ? form.damName : undefined),
      sireId: form.sireNotInHerd ? undefined : (form.sireId || undefined),
      sireName: form.sireNotInHerd ? (form.sireName?.trim() || undefined) : (form.sireId ? form.sireName : undefined),
      excludeFromReports: form.excludeFromReports ?? false,
      ...(form.species === "Horse" && {
        heightHands: form.heightHands?.trim() || undefined,
        discipline: form.discipline?.trim() || undefined,
        registrationNumber: form.registrationNumber?.trim() || undefined,
        markings: form.markings?.trim() || undefined,
      }),
    };
    if (currentPasture?.trim() && PASTURE_SPECIES.includes(form.species)) {
      const canonical = getCanonicalPastureNames(animals, pastures);
      const resolved = resolvePastureName(currentPasture.trim(), canonical);
      const dateMovedIn = new Date().toISOString().split("T")[0];
      const movementId = Date.now().toString() + "-" + newAnimal.id;
      newAnimal.movements = [{ pastureName: resolved, dateMovedIn, movementId }];
      if (setNotes) {
        const journalEntry = createMovementJournalEntry(newAnimal, null, resolved, dateMovedIn, undefined, movementId);
        setNotes(prev => [journalEntry, ...prev]);
      }
    }
    onRegister({ kind: "single", animal: newAnimal });
    setShowDuplicateConfirm(false);
    setDuplicateConfirmExisting(null);
    onCancel();
  }

  function add() {
    if (!form.name) return;
    const existing = findDuplicateAnimal(form, animals);
    if (existing) {
      setDuplicateConfirmExisting(existing);
      setShowDuplicateConfirm(true);
      return;
    }
    addSubmit();
  }

  function submitBulkRegister() {
    const startTag = String(bulkRegisterForm.startingTag || "").trim();
    const count = parseInt(bulkRegisterForm.count, 10);
    if (!startTag || !Number.isInteger(count) || count < 1) return;
    const base = parseInt(startTag, 10);
    if (isNaN(base)) return;
    const sp = bulkRegisterForm.species || "Cattle";
    const opts = getSexOptions(sp);
    const sex = opts.includes(bulkRegisterForm.sex) ? bulkRegisterForm.sex : opts[0];
    const dob = sanitizeBirthDate(bulkRegisterForm.dob) || undefined;
    const notes = bulkRegisterForm.notes?.trim() || undefined;
    const breed = bulkRegisterForm.breed?.trim() || undefined;
    const newAnimals = [];
    for (let i = 0; i < count; i++) {
      const tag = String(base + i);
      newAnimals.push({
        id: Date.now().toString() + "-" + i,
        species: sp,
        sex,
        dob,
        breed,
        tag,
        notes,
        name: undefined,
        acquisitionType: bulkRegisterForm.acquisitionType || "Home Raised",
        purchasePrice: bulkRegisterForm.purchasePrice?.trim() ? parseFloat(bulkRegisterForm.purchasePrice) : undefined,
        purchaseDate: sanitizeDate(bulkRegisterForm.purchaseDate) || undefined,
        purchasedFrom: bulkRegisterForm.purchasedFrom?.trim() || undefined,
      });
    }
    onRegister({ kind: "bulk", animals: newAnimals });
    const sp2 = defaultSpecies || "Cattle";
    setBulkRegisterForm({
      species: sp2,
      breed: "",
      sex: getSexOptions(sp2).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp2)[0],
      dob: "",
      startingTag: String(base + count),
      count: "1",
      notes: "",
      acquisitionType: "Home Raised",
      purchasePrice: "",
      purchaseDate: "",
      purchasedFrom: "",
    });
    onCancel();
  }

  const femalesSameSpecies = (animals || []).filter(an => isFemale(an) && an.species === form.species && !an.deceased && !an.sale);
  const malesSameSpecies = getSireDropdownMalesForSpecies(animals, form.species);
  const damOptions = femalesSameSpecies.filter(f => getAnimalName(f).toLowerCase().includes((form.damSearch || "").toLowerCase().trim()));
  const sireOptions = malesSameSpecies.filter(m => getAnimalName(m).toLowerCase().includes((form.sireSearch || "").toLowerCase().trim()));

  return (
    <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
      <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>Register Animals</div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        <Btn variant={registerMode === "single" ? undefined : "ghost"} size="sm" onClick={() => setRegisterMode("single")} style={registerMode === "single" ? { background: "var(--green3)", color: "var(--green)" } : {}}>Single Animal</Btn>
        <Btn variant={registerMode === "bulk" ? undefined : "ghost"} size="sm" onClick={() => setRegisterMode("bulk")} style={registerMode === "bulk" ? { background: "var(--green3)", color: "var(--green)" } : {}}>Bulk Register</Btn>
      </div>

      {registerMode === "single" ? (
        <>
          <div style={{ marginBottom: "14px" }}>
            <Select label="Species" value={REGISTER_OTHER_SPECIES.includes(form.species) ? "Other" : form.species} onChange={e => {
              const v = e.target.value;
              if (!v) return;
              const newSpecies = v === "Other" ? REGISTER_OTHER_SPECIES[0] : v;
              const opts = getSexOptions(newSpecies);
              setForm(p => ({ ...p, species: newSpecies, sex: opts.includes(p.sex) ? p.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]), excludeFromReports: newSpecies === "Horse" }));
            }}>
              <option value="">— Select Species —</option>
              {["Cattle", "Horse", "Sheep", "Goat", "Pig", "Rabbit", "Chicken"].map(s => (
                <option key={s} value={s}>{SPECIES[s]?.emoji ? SPECIES[s].emoji + " " + s : s}</option>
              ))}
              <option value="Other">Other</option>
            </Select>
            {REGISTER_OTHER_SPECIES.includes(form.species) && (
              <Select value={form.species} onChange={e => { const v = e.target.value; const opts = getSexOptions(v); setForm(p => ({ ...p, species: v, sex: opts.includes(p.sex) ? p.sex : opts[0], excludeFromReports: false })); }} style={{ marginTop: "8px" }}>
                {REGISTER_OTHER_SPECIES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            )}
          </div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
            <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
            <DateInputWithValidation label="Date of Birth" value={form.dob} onValueChange={v => setForm(p => ({ ...p, dob: v }))} birthDate />
            <Select label="Sex" value={form.sex} onChange={e => setForm(p => ({ ...p, sex: e.target.value }))}>
              {getSexOptions(form.species).map(opt => <option key={opt}>{opt}</option>)}
            </Select>
            <Input label="Breed" value={form.breed} onChange={e => setForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
            <Input label="Color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} placeholder="e.g. Black, Red Baldy, Roan" />
            {PASTURE_SPECIES.includes(form.species) && (
              <PastureCombo label="Current Pasture (optional)" value={form.currentPasture} onChange={v => setForm(p => ({ ...p, currentPasture: v }))} options={getCanonicalPastureNames(animals, pastures)} placeholder="Select or type new pasture" id="pasture-list-add-animal" />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", gridColumn: "1 / -1" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink2)" }}>Acquisition</span>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                <input type="radio" name="addAcquisitionType" checked={form.acquisitionType === "Home Raised"} onChange={() => setForm(p => ({ ...p, acquisitionType: "Home Raised" }))} style={{ accentColor: "var(--green)" }} />
                Home Raised
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                <input type="radio" name="addAcquisitionType" checked={form.acquisitionType === "Purchased"} onChange={() => setForm(p => ({ ...p, acquisitionType: "Purchased" }))} style={{ accentColor: "var(--green)" }} />
                Purchased
              </label>
            </div>
            {form.acquisitionType === "Purchased" && (
              <>
                <Input label="Purchase price ($)" type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="e.g. 850.00" />
                <DateInputWithValidation label="Purchase date" value={form.purchaseDate} onValueChange={v => setForm(p => ({ ...p, purchaseDate: v }))} />
                {setContacts ? <ContactPicker label="Purchased from (seller)" value={form.purchasedFrom} onChange={v => setForm(p => ({ ...p, purchasedFrom: v }))} contacts={contacts} setContacts={setContacts} placeholder="Search contacts or type name" /> : <Input label="Purchased from (seller)" value={form.purchasedFrom} onChange={e => setForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />}
              </>
            )}
          </div>
          {form.species === "Horse" && (
            <div style={{ marginBottom: "14px", padding: "14px", background: "var(--cream)", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px" }}>Horse details</div>
              <div className="hl-form-grid-3" style={{ marginBottom: "0" }}>
                <Input label="Height (hands)" value={form.heightHands} onChange={e => setForm(p => ({ ...p, heightHands: e.target.value }))} placeholder="e.g. 15.2" />
                <Select label="Discipline" value={form.discipline} onChange={e => setForm(p => ({ ...p, discipline: e.target.value }))}>
                  <option value="">— Select —</option>
                  {HORSE_DISCIPLINES.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
                <Input label="Registration number" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} placeholder="e.g. AQHA 123456" />
                <Input label="Markings" value={form.markings} onChange={e => setForm(p => ({ ...p, markings: e.target.value }))} placeholder="e.g. Star, sock LF" style={{ gridColumn: "1 / -1" }} />
              </div>
            </div>
          )}
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
          <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid var(--cream2)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "12px" }}>Lineage (optional)</div>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer", fontSize: "14px" }}>
              <input type="checkbox" checked={form.damNotInHerd} onChange={e => setForm(p => ({ ...p, damNotInHerd: e.target.checked, ...(e.target.checked ? { damId: "", damSearch: "" } : { damName: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
              <span>Dam not in my herd</span>
            </label>
            {!form.damNotInHerd ? (
              <div style={{ marginBottom: "14px" }}>
                <Input label="Search dams" value={form.damSearch || ""} onChange={e => setForm(p => ({ ...p, damSearch: e.target.value }))} placeholder="Type to filter..." />
                <Select label="Dam" value={form.damId || ""} onChange={e => { const v = e.target.value; if (!v) setForm(p => ({ ...p, damId: "", damName: "" })); else { const an = animals.find(x => x.id === v); setForm(p => ({ ...p, damId: v, damName: an ? getAnimalName(an) : "" })); } }} style={{ marginTop: "6px" }}>
                  <option value="">— None —</option>
                  {damOptions.map(f => <option key={f.id} value={f.id}>{getAnimalName(f)}{f.tag ? ` #${f.tag}` : ""}</option>)}
                </Select>
              </div>
            ) : (
              <div style={{ marginBottom: "14px" }}>
                <Input label="Dam name" value={form.damName || ""} onChange={e => setForm(p => ({ ...p, damName: e.target.value }))} placeholder="e.g. Unknown or name" />
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer", fontSize: "14px" }}>
              <input type="checkbox" checked={form.sireNotInHerd} onChange={e => setForm(p => ({ ...p, sireNotInHerd: e.target.checked, ...(e.target.checked ? { sireId: "", sireSearch: "" } : { sireName: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
              <span>Sire not in my herd (outside sire)</span>
            </label>
            {!form.sireNotInHerd ? (
              <div style={{ marginBottom: "14px" }}>
                <Input label="Search sires" value={form.sireSearch || ""} onChange={e => setForm(p => ({ ...p, sireSearch: e.target.value }))} placeholder="Type to filter..." />
                <Select label="Sire" value={form.sireId || ""} onChange={e => { const v = e.target.value; if (!v) setForm(p => ({ ...p, sireId: "", sireName: "" })); else { const an = animals.find(x => x.id === v); setForm(p => ({ ...p, sireId: v, sireName: an ? getAnimalName(an) : "" })); } }} style={{ marginTop: "6px" }}>
                  <option value="">— None —</option>
                  {sireOptions.map(m => <option key={m.id} value={m.id}>{getAnimalName(m)}{m.tag ? ` #${m.tag}` : ""}</option>)}
                </Select>
              </div>
            ) : (
              <div style={{ marginBottom: "14px" }}>
                <Input label="Sire name" value={form.sireName || ""} onChange={e => setForm(p => ({ ...p, sireName: e.target.value }))} placeholder="e.g. Unknown or name" />
              </div>
            )}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", cursor: "pointer", fontSize: "14px" }}>
            <input type="checkbox" checked={form.excludeFromReports ?? false} onChange={e => setForm(p => ({ ...p, excludeFromReports: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--brass)" }} />
            <span>Exclude from financial reports</span>
          </label>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Register</Btn>
            <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          </div>
          {showDuplicateConfirm && duplicateConfirmExisting && (
            <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setShowDuplicateConfirm(false); setDuplicateConfirmExisting(null); }}>
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "24px", maxWidth: "400px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--cream2)" }} onClick={e => e.stopPropagation()}>
                <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                  An animal named <strong>{getAnimalName(duplicateConfirmExisting)}</strong> or with tag <strong>{duplicateConfirmExisting.tag ? `#${duplicateConfirmExisting.tag}` : "—"}</strong> already exists in your herd. Are you sure you want to add another?
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <Btn variant="secondary" onClick={() => { setShowDuplicateConfirm(false); setDuplicateConfirmExisting(null); }}>Cancel</Btn>
                  <Btn onClick={addSubmit}>Continue</Btn>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>Create multiple animals with the same species, breed, sex, and optional DOB. Tag numbers will auto-increment from the starting tag.</p>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Species" value={bulkRegisterForm.species} onChange={e => {
              const newSpecies = e.target.value;
              const opts = getSexOptions(newSpecies);
              setBulkRegisterForm(p => ({ ...p, species: newSpecies, sex: opts.includes(p.sex) ? p.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]) }));
            }}>
              {Object.keys(SPECIES).map(s => <option key={s}>{s}</option>)}
            </Select>
            <Select label="Sex" value={bulkRegisterForm.sex} onChange={e => setBulkRegisterForm(p => ({ ...p, sex: e.target.value }))}>
              {getSexOptions(bulkRegisterForm.species).map(opt => <option key={opt}>{opt}</option>)}
            </Select>
            <Input label="Breed" value={bulkRegisterForm.breed} onChange={e => setBulkRegisterForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" />
            <DateInputWithValidation label="Date of birth (optional)" value={bulkRegisterForm.dob} onValueChange={v => setBulkRegisterForm(p => ({ ...p, dob: v }))} birthDate />
            <Input label="Starting tag number" value={bulkRegisterForm.startingTag} onChange={e => setBulkRegisterForm(p => ({ ...p, startingTag: e.target.value }))} placeholder="e.g. 1001" />
            <Input label="Number of animals" type="number" min={1} value={bulkRegisterForm.count} onChange={e => setBulkRegisterForm(p => ({ ...p, count: e.target.value }))} placeholder="e.g. 10" />
            <div style={{ display: "flex", alignItems: "center", gap: "12px", gridColumn: "1 / -1" }}>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--ink2)" }}>Acquisition</span>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                <input type="radio" name="bulkAcquisitionType" checked={bulkRegisterForm.acquisitionType === "Home Raised"} onChange={() => setBulkRegisterForm(p => ({ ...p, acquisitionType: "Home Raised" }))} style={{ accentColor: "var(--green)" }} />
                Home Raised
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px" }}>
                <input type="radio" name="bulkAcquisitionType" checked={bulkRegisterForm.acquisitionType === "Purchased"} onChange={() => setBulkRegisterForm(p => ({ ...p, acquisitionType: "Purchased" }))} style={{ accentColor: "var(--green)" }} />
                Purchased
              </label>
            </div>
            {bulkRegisterForm.acquisitionType === "Purchased" && (
              <>
                <Input label="Purchase price per head ($)" type="number" min="0" step="0.01" value={bulkRegisterForm.purchasePrice} onChange={e => setBulkRegisterForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="e.g. 850.00" />
                <DateInputWithValidation label="Purchase date" value={bulkRegisterForm.purchaseDate} onValueChange={v => setBulkRegisterForm(p => ({ ...p, purchaseDate: v }))} />
                {setContacts ? <ContactPicker label="Purchased from (seller)" value={bulkRegisterForm.purchasedFrom} onChange={v => setBulkRegisterForm(p => ({ ...p, purchasedFrom: v }))} contacts={contacts} setContacts={setContacts} placeholder="Search contacts or type name" /> : <Input label="Purchased from (seller)" value={bulkRegisterForm.purchasedFrom} onChange={e => setBulkRegisterForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />}
              </>
            )}
          </div>
          <Textarea label="Notes" value={bulkRegisterForm.notes} onChange={e => setBulkRegisterForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Applied to all animals (optional)" style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={submitBulkRegister} disabled={!bulkRegisterForm.startingTag?.trim() || parseInt(bulkRegisterForm.count, 10) < 1}>Register {Math.max(0, parseInt(bulkRegisterForm.count, 10) || 0)} animals</Btn>
            <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          </div>
        </>
      )}
    </Card>
  );
}


const HORSE_DOCUMENT_TYPES = ["Registration Papers", "Coggins Test", "Health Certificate", "Brand Inspection", "Vaccination Record", "Insurance", "Other"];
const GENERAL_DOCUMENT_TYPES = ["Health Certificate", "Registration Papers", "Brand Inspection", "Vaccination Record", "Purchase Receipt", "Lease Agreement", "Insurance", "Other"];
const ANIMAL_DOCUMENTS_BUCKET = "animal-documents";
const ANIMAL_PHOTOS_BUCKET = "animal-photos";

// ── Animals ───────────────────────────────────────────────────────────────────
export default function Animals({ animals, setAnimals, offspring, setOffspring, gestations, setGestations, user, viewingAnimal, setViewingAnimal, search: searchProp, setSearch: setSearchProp, filterHeatDue = false, setFilterHeatDue, defaultSpecies = "Cattle", feederPrograms, setFeederPrograms, setTab, setFeederPreselectAnimalId, setFeederBulkAnimalIds, setExpenses, settings, setSettings, pastures, notes, setNotes, setDeliveryGestureId, promptAddOffspring, setPromptAddOffspring, contacts = [], setContacts }) {
  const [showAdd, setShowAdd] = useState(false);
  const forceList = (animals || []).length > 50;
  const viewMode = forceList ? "list" : (settings?.animalsViewMode || "tile");
  useEffect(() => {
    if (!setSettings || !forceList) return;
    if ((settings?.animalsViewMode || "tile") !== "list") {
      setSettings(prev => ({ ...prev, animalsViewMode: "list" }));
    }
  }, [forceList, setSettings, settings?.animalsViewMode]);
  const [editingId, setEditingId] = useState(null);
  const [registerFormKey, setRegisterFormKey] = useState(0);
  const [registerInitialSingle, setRegisterInitialSingle] = useState(null);
  const viewing = viewingAnimal;
  const setViewing = setViewingAnimal;
  const [searchLocal, setSearchLocal] = useState("");
  const search = searchProp !== undefined ? searchProp : searchLocal;
  const setSearch = setSearchProp !== undefined ? setSearchProp : setSearchLocal;
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [editingOffspringId, setEditingOffspringId] = useState(null);
  const [linkExistingAnimalId, setLinkExistingAnimalId] = useState(null);
  const [addCalfMode, setAddCalfMode] = useState("register"); // "link" | "register"
  const [linkExistingSearch, setLinkExistingSearch] = useState("");
  const [offspringForm, setOffspringForm] = useState({
    name: "",
    tag: "",
    sex: "",
    species: "",
    birthWeight: "",
    dob: "",
    weaningDate: "",
    stillborn: false,
    sireId: "",
    sireName: "",
    color: "",
    markings: "",
  });
  const [showCastrationForm, setShowCastrationForm] = useState(false);
  const [castrationForm, setCastrationForm] = useState({
    date: "",
    method: "Banding",
    performer: "Owner",
    notes: "",
  });
  const [showVaccinationForm, setShowVaccinationForm] = useState(false);
  const [editingVaccinationId, setEditingVaccinationId] = useState(null);
  const [vaccinationForm, setVaccinationForm] = useState({
    vaccineName: "",
    dateGiven: "",
    nextDueDate: "",
    administeredBy: "Owner",
    notes: "",
    dosage: "",
    route: "IM (Intramuscular)",
    boosterIntervalDays: "",
  });
  const [vaccinationProtocolId, setVaccinationProtocolId] = useState("");
  const [showArchivedAnimals, setShowArchivedAnimals] = useState(false);
  const [showButcheredForm, setShowButcheredForm] = useState(false);
  const [butcheredForm, setButcheredForm] = useState({ date: "", notes: "" });
  const [showDeceasedForm, setShowDeceasedForm] = useState(false);
  const [deceasedForm, setDeceasedForm] = useState({ date: "", notes: "" });
  const [filterSpecies, setFilterSpecies] = useState("All Species");
  const [filterSexStatus, setFilterSexStatus] = useState("All");
  const [filterPasture, setFilterPasture] = useState("All Pastures");
  const [filterCull, setFilterCull] = useState("All");
  const [sortBy, setSortBy] = useState("dateAddedNewest");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [breedingForm, setBreedingForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", sireNotInHerd: false, notes: "" });
  const [showHeatForm, setShowHeatForm] = useState(false);
  const [heatForm, setHeatForm] = useState({ observedDate: "", intensity: "Moderate", notes: "" });
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ pastureName: "", dateMovedIn: "", notes: "" });
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight: "", date: "", notes: "" });
  const [horseHealthTab, setHorseHealthTab] = useState("Vet Work");
  const [showHorseHealthForm, setShowHorseHealthForm] = useState(false);
  const [horseHealthForm, setHorseHealthForm] = useState({
    vetDate: "", vetName: "", vetProcedure: "", vetNextAppointment: "", vetCost: "",
    farrierDate: "", farrierName: "", farrierServiceType: "", farrierNextAppointment: "", farrierCost: "",
    wormingDate: "", wormingProduct: "", wormingDosage: "", wormingNextDate: "", wormingCost: "",
    suppName: "", suppDosage: "", suppCost: "", suppDate: "", suppFrequency: "Daily",
    dentalDate: "", dentalProvider: "", dentalNextFloatDate: "", dentalCost: "",
  });
  const [showTreatmentForm, setShowTreatmentForm] = useState(false);
  const [editingTreatmentId, setEditingTreatmentId] = useState(null);
  const [treatmentForm, setTreatmentForm] = useState({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" });
  const [editingHorseHealth, setEditingHorseHealth] = useState(null); // { section: 'Vet Work'|'Farrier'|'Worming'|'Supplements'|'Dental', index: number } | null
  const [editingUpcomingKey, setEditingUpcomingKey] = useState(null); // string e.g. 'farrier-0' or 'vaccination-abc123'
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkGrid, setShowBulkGrid] = useState(false);
  const [bulkFormType, setBulkFormType] = useState(null);
  const [bulkForm, setBulkForm] = useState({});
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleForm, setSaleForm] = useState({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" });
  const [showCullForm, setShowCullForm] = useState(false);
  const [cullForm, setCullForm] = useState({ reason: "", notes: "", targetCullDate: "" });
  const [showLineageForm, setShowLineageForm] = useState(false);
  const [lineageForm, setLineageForm] = useState({ damInHerd: true, motherId: "", motherName: "", sireInHerd: true, sireId: "", sireName: "" });
  const [inbreedingWarningPending, setInbreedingWarningPending] = useState(null);
  const [breedingInbreedingCheck, setBreedingInbreedingCheck] = useState(null);
  const lineageMigrationDoneRef = useRef(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState(1); // 1=Upload, 2=Map, 3=Preview, 4=Duplicates, 5=Result
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importMapping, setImportMapping] = useState({});
  const [importSuccess, setImportSuccess] = useState(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importDuplicateChoices, setImportDuplicateChoices] = useState({}); // rowIndex -> "skip" | "overwrite"
  const [importPreviewRowIndex, setImportPreviewRowIndex] = useState(0); // 0-4 for first 5 rows
  const [showImportInstructions, setShowImportInstructions] = useState(false);
  const importFileInputRef = useRef(null);
  useEffect(() => {
    setShowCullForm(false);
    setCullForm({ reason: "", notes: "", targetCullDate: "" });
    setShowLineageForm(false);
    setShowDocumentForm(false);
    setEditingDocumentId(null);
    setDocumentPreview(null);
    setDocumentDeleteConfirmId(null);
  }, [viewingAnimal?.id]);

  useEffect(() => {
    if (!setAnimals || lineageMigrationDoneRef.current || !animals?.length) return;
    lineageMigrationDoneRef.current = true;
    const list = [...animals];
    let changed = false;
    for (const animal of list) {
      const updates = {};
      const damId = animal.damId || animal.motherId;
      const damName = (animal.damName || animal.motherName) || "";
      const sireId = animal.sireId;
      const sireName = (animal.sireName || "").trim();
      if (damName && !damId) {
        const match = list.find(an => an.id !== animal.id && getAnimalName(an).trim().toLowerCase() === damName.trim().toLowerCase());
        if (match) {
          updates.motherId = match.id;
          updates.motherName = getAnimalName(match);
          updates.damId = match.id;
          updates.damName = getAnimalName(match);
          changed = true;
        }
      }
      if (sireName && sireName.toLowerCase() !== "unknown" && !sireId) {
        const match = list.find(an => an.id !== animal.id && getAnimalName(an).trim().toLowerCase() === sireName.trim().toLowerCase());
        if (match) {
          updates.sireId = match.id;
          updates.sireName = getAnimalName(match);
          changed = true;
        }
      }
      if (Object.keys(updates).length) {
        const idx = list.findIndex(an => an.id === animal.id);
        if (idx !== -1) list[idx] = { ...list[idx], ...updates };
      }
    }
    if (changed) setAnimals(list);
  }, [animals, setAnimals]);

  const IMPORT_FUZZY_ALIASES = {
    "Name": ["name", "cow name", "animal name", "id", "animal id", "identification", "nickname"],
    "Tag": ["tag", "tag number", "ear tag", "id#", "id #", "tag no", "tagno", "number", "ear tag number"],
    "Species": ["species", "type", "kind", "animal type", "livestock type", "animal kind"],
    "Breed": ["breed", "breeding", "breed type"],
    "Sex": ["sex", "gender"],
    "Date of Birth": ["dob", "born", "birth date", "date of birth", "birthday", "birth", "calving date"],
    "Color": ["color", "coat", "markings", "colour"],
    "Purchase Date": ["purchase date", "bought", "date purchased", "acquisition date"],
    "Notes": ["notes", "note", "comments", "remarks", "comments notes"],
  };

  function fuzzyMapHeaders(headers) {
    const mapping = {};
    const normalized = headers.map(h => String(h ?? "").trim().toLowerCase());
    for (const hl of IMPORT_HL_FIELDS) {
      const aliases = IMPORT_FUZZY_ALIASES[hl] || [hl.toLowerCase().replace(/\s+/g, " ")];
      let bestScore = 0;
      let bestCol = null;
      for (let i = 0; i < normalized.length; i++) {
        const h = normalized[i];
        if (!h) continue;
        for (const alias of aliases) {
          if (h === alias) { bestScore = 100; bestCol = headers[i]; break; }
          if (h.includes(alias) || alias.includes(h)) {
            const score = 50 + Math.min(h.length, alias.length) / Math.max(h.length, alias.length) * 30;
            if (score > bestScore) { bestScore = score; bestCol = headers[i]; }
          }
        }
      }
      if (bestCol !== null) mapping[hl] = bestCol;
    }
    return mapping;
  }
  const animalPhotoInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [documentForm, setDocumentForm] = useState({
    documentType: "Coggins Test",
    documentName: "",
    dateIssued: "",
    expirationDate: "",
    issuingAuthority: "",
    notes: "",
  });
  const [documentFormFile, setDocumentFormFile] = useState(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentPreview, setDocumentPreview] = useState(null); // selected doc object for preview modal
  const [documentDeleteConfirmId, setDocumentDeleteConfirmId] = useState(null);
  const documentFileInputRef = useRef(null);
  const [runningWithBullPrompt, setRunningWithBullPrompt] = useState(null);
  const [runningWithBullStep, setRunningWithBullStep] = useState("ask");
  const [runningWithBullForm, setRunningWithBullForm] = useState({ startDate: "", endDate: "" });
  const [runningWithBullCheckPending, setRunningWithBullCheckPending] = useState(null);

  useEffect(() => {
    if (!runningWithBullCheckPending || !animals) return;
    const { pastureName } = runningWithBullCheckPending;
    setRunningWithBullCheckPending(null);
    const male = getBreedingMaleInPasture(animals, pastureName);
    if (!male) return;
    const eligible = getEligibleFemalesForRunningWithBull(animals, gestations, pastureName, male);
    if (eligible.length > 0) {
      setRunningWithBullPrompt({ pastureName, maleAnimal: male, eligibleFemales: eligible });
      setRunningWithBullStep("ask");
      setRunningWithBullForm({ startDate: "", endDate: "" });
    }
  }, [runningWithBullCheckPending, animals, gestations]);

  function confirmRunningWithBull() {
    if (!runningWithBullPrompt || !runningWithBullForm.startDate) return;
    const { maleAnimal, eligibleFemales } = runningWithBullPrompt;
    const start = runningWithBullForm.startDate;
    const end = (runningWithBullForm.endDate || "").trim() ? runningWithBullForm.endDate : null;
    const newRecords = eligibleFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const minDays = SPECIES[an.species]?.minDays ?? totalDays;
      const maxDays = SPECIES[an.species]?.maxDays ?? totalDays;
      let dueStart, dueEnd;
      if (end) {
        dueStart = dueDate(start, totalDays);
        dueEnd = dueDate(end, totalDays);
      } else {
        const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
        dueStart = range.dueDateStart;
        dueEnd = range.dueDateEnd;
      }
      return {
        animalId: an.id,
        breedingDate: start,
        breedingDateEnd: end || undefined,
        runningWithBull: true,
        dueDate: dueStart,
        dueDateStart: dueStart,
        dueDateEnd: dueEnd,
        sire: getAnimalName(maleAnimal),
        notes: "Running with bull",
        id: Date.now().toString() + "-" + an.id,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
    });
    setGestations(p => [...p, ...newRecords]);
    setRunningWithBullPrompt(null);
    setRunningWithBullStep("ask");
    setRunningWithBullForm({ startDate: "", endDate: "" });
  }

  function parseImportFile(file, onDone) {
    const isCsv = /\.(csv|txt)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let wb;
        if (isCsv) {
          wb = XLSX.read(e.target.result, { type: "string", raw: true });
        } else {
          const data = new Uint8Array(e.target.result);
          wb = XLSX.read(data, { type: "array", raw: true });
        }
        const firstSheet = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : null;
        if (!firstSheet) {
          onDone(null, "No sheet found");
          return;
        }
        const arr = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
        if (!arr.length) {
          onDone(null, "Sheet is empty");
          return;
        }
        const headers = arr[0].map(h => String(h ?? "").trim());
        const rows = arr.slice(1).map(row => (Array.isArray(row) ? row : []).map(c => (c == null ? "" : String(c)).trim()));
        const autoMapping = fuzzyMapHeaders(headers);
        onDone({ headers, rows }, null, autoMapping);
      } catch (err) {
        onDone(null, err.message || "Parse error");
      }
    };
    reader.onerror = () => onDone(null, "Failed to read file");
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function isBlankRow(row) {
    return !row || row.every(c => !String(c ?? "").trim());
  }

  function normalizeSpecies(val) {
    if (!val || !String(val).trim()) return null;
    const v = String(val).trim();
    const key = Object.keys(SPECIES).find(k => k.toLowerCase() === v.toLowerCase());
    return key || null;
  }

  /** Normalize CSV sex values to Herd Ledger canonical terms per species. */
  function normalizeSexForSpecies(species, val) {
    if (!species) return null;
    const opts = getSexOptions(species);
    if (!val || !String(val).trim()) return opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0];
    const v = String(val).trim().toLowerCase();
    const exact = opts.find(o => o.toLowerCase() === v);
    if (exact) return exact;

    const ALIASES = {
      Cattle: [
        ["cow", "female", "bred cow", "open cow", "cows"], "Cow",
        ["heifer", "open heifer", "bred heifer", "heifers"], "Heifer",
        ["bull", "bulls"], "Bull",
        ["steer", "steers"], "Steer",
        ["bull calf", "male calf", "bull calves"], "Bull Calf",
        ["heifer calf", "female calf", "heifer calves"], "Heifer Calf",
      ],
      Bison: [
        ["cow", "female", "bred cow", "open cow"], "Cow",
        ["heifer", "open heifer", "bred heifer"], "Heifer",
        ["bull", "bulls"], "Bull",
        ["steer", "steers"], "Steer",
        ["bull calf", "male calf"], "Bull Calf",
        ["heifer calf", "female calf"], "Heifer Calf",
      ],
      Sheep: [
        ["ewe", "ewes"], "Ewe",
        ["ram", "rams"], "Ram",
        ["wether", "wethers"], "Wether",
        ["ewe lamb", "female lamb"], "Ewe Lamb",
        ["ram lamb", "male lamb"], "Ram Lamb",
      ],
      Goat: [
        ["doe", "does"], "Doe",
        ["buck", "bucks"], "Buck",
        ["wether", "wethers"], "Wether",
        ["doeling", "doelings"], "Doeling",
        ["buckling", "bucklings"], "Buckling",
      ],
      Pig: [
        ["sow", "sows"], "Sow",
        ["gilt", "gilts"], "Gilt",
        ["boar", "boars"], "Boar",
        ["barrow", "barrows"], "Barrow",
        ["piglet", "piglets"], "Piglet",
      ],
      Horse: [
        ["mare", "mares"], "Mare",
        ["stallion", "stallions"], "Stallion",
        ["gelding", "geldings"], "Gelding",
        ["filly", "fillies"], "Filly",
        ["colt", "colts"], "Colt",
        ["filly foal", "female foal"], "Filly Foal",
        ["colt foal", "male foal"], "Colt Foal",
      ],
      Donkey: [
        ["jenny", "jennies"], "Jenny",
        ["jack", "jacks"], "Jack",
        ["gelding", "geldings"], "Gelding",
        ["filly foal", "female foal"], "Filly Foal",
        ["colt foal", "male foal"], "Colt Foal",
      ],
      Mule: [
        ["jenny", "jennies"], "Jenny",
        ["jack", "jacks"], "Jack",
        ["gelding", "geldings"], "Gelding",
      ],
    };

    const list = ALIASES[species];
    if (list) {
      for (let i = 0; i < list.length; i += 2) {
        const aliases = list[i];
        const canonical = list[i + 1];
        if (aliases.some(a => a === v || (a.endsWith("s") && a.slice(0, -1) === v))) return canonical;
      }
    }

    const gender = v === "female" ? "Female" : v === "male" ? "Male" : null;
    if (gender) return opts.find(o => SEX_TERM_GENDER[o] === gender) || opts[0];
    return opts[0];
  }

  function normalizeDob(val) {
    if (!val || !String(val).trim()) return "";
    const s = String(val).trim();
    const iso = s.match(/^\d{4}-\d{2}-\d{2}$/) ? s : null;
    if (iso) return iso;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return "";
  }

  function getImportColIndex() {
    if (!importData || !importMapping) return () => -1;
    const { headers } = importData;
    return (hl) => {
      const mapped = importMapping[hl];
      if (!mapped) return -1;
      const i = headers.indexOf(mapped);
      return i >= 0 ? i : -1;
    };
  }

  function getImportPreview() {
    if (!importData || !importMapping) return { byRow: [], validCount: 0, errorCount: 0, duplicateRows: [], blankCount: 0 };
    const { headers, rows } = importData;
    const colIndex = getImportColIndex();
    const speciesCol = colIndex("Species");
    const byRow = [];
    let validCount = 0;
    let errorCount = 0;
    let blankCount = 0;
    const duplicateRows = [];
    const existingByTag = new Map((animals || []).filter(a => a.tag).map(a => [String(a.tag).trim().toLowerCase(), a]));
    const existingByNameSpecies = new Map((animals || []).map(a => [`${(a.name || "").trim().toLowerCase()}|${(a.species || "").toLowerCase()}`, a]));

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      if (isBlankRow(row)) {
        blankCount++;
        byRow.push({ rowIndex: rowNum, data: null, error: null, duplicate: null, blank: true });
        return;
      }
      const rawSpecies = speciesCol >= 0 ? (row[speciesCol] || "").trim() : "";
      const species = normalizeSpecies(rawSpecies);
      if (!species) {
        errorCount++;
        byRow.push({ rowIndex: rowNum, data: null, error: "Missing or invalid Species", duplicate: null, blank: false });
        return;
      }
      const name = colIndex("Name") >= 0 ? (row[colIndex("Name")] || "").trim() : "";
      const tag = colIndex("Tag") >= 0 ? (row[colIndex("Tag")] || "").trim() : "";
      const breed = colIndex("Breed") >= 0 ? (row[colIndex("Breed")] || "").trim() : "";
      const sexVal = colIndex("Sex") >= 0 ? row[colIndex("Sex")] : "";
      const sex = normalizeSexForSpecies(species, sexVal);
      const dobVal = colIndex("Date of Birth") >= 0 ? row[colIndex("Date of Birth")] : "";
      const dob = normalizeDob(dobVal);
      const colorVal = colIndex("Color") >= 0 ? (row[colIndex("Color")] || "").trim() : "";
      const purchaseDateVal = colIndex("Purchase Date") >= 0 ? row[colIndex("Purchase Date")] : "";
      const purchaseDate = normalizeDob(purchaseDateVal);
      const notes = colIndex("Notes") >= 0 ? (row[colIndex("Notes")] || "").trim() : "";
      const data = {
        name: name || undefined,
        tag: tag || undefined,
        species,
        breed: breed || undefined,
        sex,
        dob: dob || undefined,
        color: colorVal || undefined,
        notes: notes || undefined,
        acquisitionType: purchaseDate || undefined ? "Purchased" : "Home Raised",
        purchaseDate: purchaseDate || undefined,
      };
      const dupByTag = tag ? existingByTag.get(tag.trim().toLowerCase()) : null;
      const dupByNameSpecies = name ? existingByNameSpecies.get(`${name.trim().toLowerCase()}|${species.toLowerCase()}`) : null;
      const duplicate = dupByTag || dupByNameSpecies || null;
      if (duplicate) duplicateRows.push({ rowIndex: rowNum, data, duplicate });
      else validCount++;
      byRow.push({ rowIndex: rowNum, data, error: null, duplicate, blank: false });
    });
    return { byRow, validCount, errorCount, duplicateRows, blankCount };
  }

  function runImport() {
    const { byRow, duplicateRows, blankCount } = getImportPreview();
    let imported = 0;
    let skippedDuplicates = 0;
    const errors = [];
    const newAnimals = [];
    const updates = []; // { existingId, data }

    byRow.forEach(({ rowIndex, data, error, duplicate, blank }) => {
      if (blank) return;
      if (error) {
        errors.push({ row: rowIndex, message: error });
        return;
      }
      if (duplicate) {
        const choice = importDuplicateChoices[rowIndex] || "skip";
        if (choice === "skip") {
          skippedDuplicates++;
          return;
        }
        updates.push({ existingId: duplicate.id, data });
        imported++;
        return;
      }
      newAnimals.push({
        ...data,
        id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 9),
      });
      imported++;
    });

    setAnimals(prev => {
      let next = [...prev];
      newAnimals.forEach(a => next.push(a));
      updates.forEach(({ existingId, data }) => {
        next = next.map(an => an.id === existingId ? { ...an, ...data } : an);
      });
      return next;
    });
    setImportSuccess({
      imported,
      skippedDuplicates,
      errorCount: errors.length,
      blankCount,
      errors,
    });
    setImportStep(5);
  }

  function downloadImportTemplate() {
    const headers = ["Name", "Tag", "Species", "Breed", "Sex", "Date of Birth", "Color", "Purchase Date", "Notes"];
    const examples = [
      ["Bessie", "1001", "Cattle", "Angus", "Cow", "2020-03-15", "Black", "", "Home raised"],
      ["Blue", "1002", "Cattle", "Hereford", "Steer", "2021-05-20", "Red", "", ""],
      ["Daisy", "1003", "Horse", "Quarter Horse", "Mare", "2019-01-10", "Bay", "2022-04-15", "Purchased 2022"],
    ];
    const rows = [headers, ...examples];
    const csv = rows.map(r => r.map(c => (typeof c === "string" && (c.includes(",") || c.includes('"') || c.includes("\n")) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "herd-ledger-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep(1);
    setImportFile(null);
    setImportData(null);
    setImportMapping({});
    setImportSuccess(null);
    setImportDuplicateChoices({});
    setImportPreviewRowIndex(0);
  }

  function remove(id) {
    if (!confirm("Remove this animal from the register?")) return;
    setAnimals(p => p.filter(a => a.id !== id));
    setViewing(null);
    setGestations(p =>
      p
        .filter(g => g.animalId !== id)
        .map(g => (g.calf?.animalId === id ? { ...g, calf: undefined } : g))
    );
    setOffspring(prev => {
      const next = { ...prev };
      delete next[id];
      return Object.fromEntries(
        Object.entries(next)
          .map(([motherId, list]) => [motherId, (list || []).filter(c => c.id !== id)])
          .filter(([, list]) => list.length > 0)
      );
    });
  }

  const speciesInHerd = [...new Set((animals || []).map(a => a.species).filter(Boolean))].sort();
  const pastureNamesForFilter = getCanonicalPastureNames(animals, pastures);
  const animalIdToIndex = new Map((animals || []).map((a, i) => [a.id, i]));

  function hasActiveGestation(animalId) {
    return (gestations || []).some(g => g.animalId === animalId && g.status !== "Delivered");
  }

  const todayStrForHeat = new Date().toISOString().split("T")[0];
  const todayPlus7ForHeat = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
  const heatDueNext7Ids = new Set(
    (filterHeatDue ? (animals || []) : []).filter(a => {
      if (!isFemale(a)) return false;
      if (hasActiveGestation(a.id)) return false;
      const next = getNextExpectedHeatDate(a);
      return next && next >= todayStrForHeat && next <= todayPlus7ForHeat;
    }).map(a => a.id)
  );

  const filtered = (animals || []).filter(a => {
    const showByArchived = showArchivedAnimals ? true : !a.sale && !a.butchered && !a.deceased;
    if (!showByArchived) return false;

    const q = (search || "").trim().toLowerCase();
    const matchesSearch = !q ||
      getAnimalName(a).toLowerCase().includes(q) ||
      (a.species || "").toLowerCase().includes(q) ||
      (a.tag != null && String(a.tag).toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterSpecies !== "All Species" && (a.species || "") !== filterSpecies) return false;

    const currentPasture = (a.movements && a.movements[0] && a.movements[0].pastureName) ? a.movements[0].pastureName.trim() : "";
    if (filterPasture === "No Pasture Assigned") {
      if (currentPasture) return false;
    } else if (filterPasture !== "All Pastures") {
      if (!pastureNameEq(currentPasture, filterPasture)) return false;
    }

    if (filterSexStatus !== "All") {
      const isFemaleAnimal = isFemale(a);
      const isMaleAnimal = isMale(a);
      const castrated = !!a.castration;
      const bredPregnant = isFemaleAnimal && hasActiveGestation(a.id);
      const open = isFemaleAnimal && !hasActiveGestation(a.id);
      if (filterSexStatus === "Intact Males" && (!isMaleAnimal || castrated)) return false;
      if (filterSexStatus === "Females" && !isFemaleAnimal) return false;
      if (filterSexStatus === "Castrated" && !castrated) return false;
      if (filterSexStatus === "Bred/Pregnant" && !bredPregnant) return false;
      if (filterSexStatus === "Open" && !open) return false;
    }

    if (filterCull === "Marked for Cull" && !a.cull) return false;

    if (filterHeatDue && !heatDueNext7Ids.has(a.id)) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "dateAddedNewest": {
        const ia = animalIdToIndex.get(a.id) ?? 0;
        const ib = animalIdToIndex.get(b.id) ?? 0;
        return ib - ia;
      }
      case "nameAZ":
        return getAnimalName(a).localeCompare(getAnimalName(b), undefined, { sensitivity: "base" });
      case "ageYoungest": {
        const da = a.dob ? new Date(a.dob).getTime() : 0;
        const db = b.dob ? new Date(b.dob).getTime() : 0;
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return db - da;
      }
      case "ageOldest": {
        const da = a.dob ? new Date(a.dob).getTime() : 0;
        const db = b.dob ? new Date(b.dob).getTime() : 0;
        if (da === 0 && db === 0) return 0;
        if (da === 0) return 1;
        if (db === 0) return -1;
        return da - db;
      }
      case "tagNumber": {
        const ta = (a.tag != null && String(a.tag).trim() !== "") ? String(a.tag).trim() : "\uFFFF";
        const tb = (b.tag != null && String(b.tag).trim() !== "") ? String(b.tag).trim() : "\uFFFF";
        const na = parseInt(ta, 10);
        const nb = parseInt(tb, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return ta.localeCompare(tb, undefined, { numeric: true });
      }
      default:
        return 0;
    }
  });

  if (viewing) {
    const a = ((animals || []).find(x => x.id === viewing?.id)) ?? viewing;
    const offspringForMother = (offspring && offspring[a.id]) || [];

    const linkableAnimals = (animals || []).filter(an => {
      if ((an.damId || an.motherId) || an.species !== a.species || an.id === a.id || an.deceased || an.sale) return false;
      if ((offspringForMother || []).some(c => c.id === an.id)) return false;
      const months = getAgeInMonths(an.dob);
      const term = getAgeBasedSexTerm({ ...an, species: an.species || a.species }, []);
      const termLower = term ? String(term).toLowerCase() : "";
      const isYoungTerm = a.species === "Horse" ? (termLower.includes("colt") || termLower.includes("filly")) : termLower.includes("calf");
      if (months != null && months >= 12) return false;
      if (months != null && months < 12) return true;
      return !!isYoungTerm;
    });
    const linkExistingSearchLower = (linkExistingSearch || "").trim().toLowerCase();
    const linkableFiltered = linkExistingSearchLower
      ? linkableAnimals.filter(an => {
          const name = getAnimalName(an);
          const tag = (an.tag || "").toString();
          const species = (an.species || "").toString();
          return name.toLowerCase().includes(linkExistingSearchLower)
            || tag.toLowerCase().includes(linkExistingSearchLower)
            || species.toLowerCase().includes(linkExistingSearchLower);
        })
      : linkableAnimals;

    function linkExistingAsOffspring(existingId) {
      const existing = animals.find(an => an.id === existingId);
      if (!existing) return;
      setAnimals(prev => prev.map(an => (an.id === existingId ? { ...an, motherId: a.id, motherName: getAnimalName(a), damId: a.id, damName: getAnimalName(a) } : an)));
      setOffspring(prev => ({
        ...prev,
        [a.id]: [...(prev[a.id] || []), {
          id: existing.id,
          name: existing.name,
          tag: existing.tag,
          sex: existing.sex,
          species: existing.species,
          dob: existing.dob,
          weaningDate: existing.weaningDate,
          birthWeight: existing.birthWeight,
          stillborn: false,
        }],
      }));
      setShowOffspringForm(false);
      setLinkExistingAnimalId(null);
      setAddCalfMode("register");
      setLinkExistingSearch("");
    }

    function deleteOffspring(offspringId) {
      const rec = offspringForMother.find(c => c.id === offspringId);
      const hadAnimal = rec && !rec.stillborn;
      const term = getOffspringTerm(a.species);
      if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this ${term.toLowerCase()} record?`)) return;
      setOffspring(prev => {
        const base = prev || {};
        const list = (base[a.id] || []).filter(c => c.id !== offspringId);
        return { ...base, [a.id]: list };
      });
      if (hadAnimal) setAnimals(prev => prev.filter(an => an.id !== offspringId));
    }

    function saveOffspring() {
      const isEdit = !!editingOffspringId;
      const stillborn = !!offspringForm.stillborn;
      const motherSpecies = a.species;
      const effectiveSex = (offspringForm.sex && String(offspringForm.sex).trim()) ? offspringForm.sex : getOffspringDefaultSex(motherSpecies);
      const dobOff = sanitizeBirthDate(offspringForm.dob) || undefined;
      const weanSan = sanitizeDate(offspringForm.weaningDate) || undefined;
      const weaningDateVal = motherSpecies === "Horse" ? undefined : (() => { const m = getAgeInMonths(dobOff); if (m != null && m >= 12) return undefined; return weanSan || undefined; })();
      const foalSireId = motherSpecies === "Horse" && offspringForm.sireId && offspringForm.sireId !== "outside" ? offspringForm.sireId : undefined;
      const foalSireName = motherSpecies === "Horse" ? (offspringForm.sireId === "outside" ? (offspringForm.sireName || "").trim() || undefined : (foalSireId ? getAnimalName((animals || []).find(an => an.id === foalSireId)) : undefined)) : undefined;
      const rec = {
        id: isEdit ? editingOffspringId : Date.now().toString(),
        motherId: a.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: effectiveSex,
        species: motherSpecies,
        birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
        dob: dobOff,
        weaningDate: weaningDateVal,
        stillborn,
        createdAt: isEdit ? (offspringForMother.find(c => c.id === editingOffspringId)?.createdAt) : new Date().toISOString(),
        ...(motherSpecies === "Horse" && { sireId: foalSireId, sireName: foalSireName, color: (offspringForm.color || "").trim() || undefined, markings: (offspringForm.markings || "").trim() || undefined }),
      };
      const prevRec = isEdit ? offspringForMother.find(c => c.id === editingOffspringId) : null;
      const activeForMother = gestations.filter(g => g.animalId === a.id && g.status !== "Delivered");
      const matchingGestation = rec.dob ? activeForMother.find(g => birthDateWithinGestationWindow(rec.dob, g)) : null;
      const existingAnimal = isEdit ? animals.find(an => an.id === editingOffspringId) : null;
      const sireIdFromGestation = matchingGestation?.sireAnimalId ?? (existingAnimal?.sireId ?? (motherSpecies === "Horse" ? foalSireId : undefined));
      if (isEdit && prevRec && !prevRec.stillborn && stillborn) {
        setAnimals(prev => prev.filter(an => an.id !== editingOffspringId));
      }
      setOffspring(prev => {
        const base = prev || {};
        const list = base[a.id] || [];
        if (isEdit) {
          return { ...base, [a.id]: list.map(c => c.id === editingOffspringId ? rec : c) };
        }
        return { ...base, [a.id]: [...list, rec] };
      });
      if (!stillborn) {
        const updatedAnimal = {
          id: rec.id,
          name: offspringForm.name || undefined,
          tag: offspringForm.tag || undefined,
          sex: effectiveSex,
          species: motherSpecies,
          dob: dobOff,
          breed: a.breed || undefined,
          notes: undefined,
          motherId: a.id,
          motherName: getAnimalName(a),
          damId: a.id,
          damName: getAnimalName(a),
          sireId: sireIdFromGestation,
          sireName: sireIdFromGestation ? getAnimalName((animals || []).find(x => x.id === sireIdFromGestation)) : foalSireName,
          ...(motherSpecies === "Horse" && { color: rec.color, markings: rec.markings }),
        };
        if (isEdit) {
          setAnimals(prev => prev.map(an => an.id === editingOffspringId ? { ...an, ...updatedAnimal } : an));
        } else {
          setAnimals(prev => [...prev, updatedAnimal]);
        }
      }
      if (rec.dob) {
        const calfWeaningDate = motherSpecies === "Horse" ? undefined : (() => { const m = getAgeInMonths(dobOff); if (m != null && m >= 12) return undefined; return weanSan || undefined; })();
        const calfData = {
          name: offspringForm.name || undefined,
          tag: offspringForm.tag || undefined,
          sex: effectiveSex,
          birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
          weaningDate: calfWeaningDate,
          stillborn,
          recordedAt: new Date().toISOString(),
          ...(!stillborn && { animalId: rec.id }),
        };
        const activeForMother = gestations.filter(g => g.animalId === a.id && g.status !== "Delivered");
        const matching = activeForMother.find(g => birthDateWithinGestationWindow(rec.dob, g));
        if (matching) {
          setGestations(prev => prev.map(gr =>
            gr.id === matching.id
              ? { ...gr, status: "Delivered", deliveredAt: rec.dob, calf: calfData }
              : gr
          ));
        } else if (activeForMother.length === 0) {
          const gestationDays = SPECIES[a.species]?.days ?? 283;
          const breedingDate = breedingDateFromDelivery(rec.dob, gestationDays);
          const newGestation = {
            id: Date.now().toString(),
            animalId: a.id,
            breedingDate,
            dueDate: rec.dob,
            gestationDays,
            status: "Delivered",
            deliveredAt: rec.dob,
            calf: calfData,
            createdAt: new Date().toISOString(),
          };
          setGestations(prev => [...prev, newGestation]);
        }
      }
      setShowOffspringForm(false);
      setEditingOffspringId(null);
      setOffspringForm({
        name: "",
        tag: "",
        sex: "",
        species: "",
        birthWeight: "",
        dob: "",
        weaningDate: "",
        stillborn: false,
        sireId: "",
        sireName: "",
        color: "",
        markings: "",
      });
    }

    function saveCastration() {
      const rec = {
        date: castrationForm.date || undefined,
        method: castrationForm.method || undefined,
        performer: castrationForm.performer || undefined,
        notes: castrationForm.notes || undefined,
        recordedAt: new Date().toISOString(),
      };
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, castration: rec } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, castration: rec } : prev
      );
      setShowCastrationForm(false);
      setCastrationForm({
        date: "",
        method: "Banding",
        performer: "Owner",
        notes: "",
      });
    }

    function deleteCastration() {
      if (!confirm("Remove this castration record? The animal's sex will revert to the intact male term for their species.")) return;
      const intactSex = INTACT_MALE_TERM_BY_SPECIES[a.species] ?? a.sex;
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, castration: undefined, sex: intactSex } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, castration: undefined, sex: intactSex } : prev
      );
      setShowCastrationForm(false);
      setCastrationForm({ date: "", method: "Banding", performer: "Owner", notes: "" });
    }

    function saveSale() {
      const saleRec = {
        dateSold: saleForm.dateSold || undefined,
        pricePerHead: saleForm.pricePerHead?.trim() ? parseFloat(saleForm.pricePerHead) : undefined,
        buyerName: saleForm.buyerName?.trim() || undefined,
        buyerContact: saleForm.buyerContact?.trim() || undefined,
        saleLocation: saleForm.saleLocation?.trim() || undefined,
        notes: saleForm.notes?.trim() || undefined,
      };
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, sale: saleRec } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, sale: saleRec } : prev
      );
      setShowSaleForm(false);
      setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" });
    }

    function saveButchered() {
      const rec = { date: butcheredForm.date || undefined, notes: butcheredForm.notes?.trim() || undefined };
      setAnimals(prev => prev.map(an => an.id === a.id ? { ...an, butchered: rec } : an));
      setViewing(prev => prev && prev.id === a.id ? { ...prev, butchered: rec } : prev);
      setShowButcheredForm(false);
      setButcheredForm({ date: "", notes: "" });
    }

    function saveDeceased() {
      const rec = { date: deceasedForm.date || undefined, notes: deceasedForm.notes?.trim() || undefined };
      setAnimals(prev => prev.map(an => an.id === a.id ? { ...an, deceased: rec } : an));
      setViewing(prev => prev && prev.id === a.id ? { ...prev, deceased: rec } : prev);
      setShowDeceasedForm(false);
      setDeceasedForm({ date: "", notes: "" });
    }

    function markDeliveredToBuyer(animalId) {
      const an = (animals || []).find(x => x.id === animalId);
      if (!an?.sale) return;
      const updatedSale = { ...an.sale, delivered: true, deliveredAt: new Date().toISOString() };
      setAnimals(prev => prev.map(x => (x.id === animalId ? { ...x, sale: updatedSale } : x)));
      setViewing(prev => (prev && prev.id === animalId ? { ...prev, sale: updatedSale } : prev));
    }

    function addDays(dateStr, days) {
      if (!dateStr || !Number.isInteger(days)) return undefined;
      const d = new Date(dateStr + "T12:00:00");
      d.setDate(d.getDate() + days);
      return d.toISOString().split("T")[0];
    }

    function saveVaccination() {
      const dateGiven = vaccinationForm.dateGiven?.trim();
      const protocol = vaccinationProtocolId ? (settings?.vaccinationProtocols ?? []).find(p => p.id === vaccinationProtocolId) : null;
      const editingRec = a.vaccinations?.find(v => v.id === editingVaccinationId);
      const isEditingProtocolEntry = !!editingRec?.protocolName;

      if (isEditingProtocolEntry && editingVaccinationId) {
        const rec = { ...editingRec, dateGiven: dateGiven || undefined, notes: vaccinationForm.notes?.trim() || undefined, administeredBy: vaccinationForm.administeredBy || undefined };
        const nextList = (a.vaccinations || []).map(v => (v.id === editingVaccinationId ? rec : v));
        setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an)));
        setViewing(prev => (prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev));
        setShowVaccinationForm(false);
        setEditingVaccinationId(null);
        setVaccinationForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" });
        setVaccinationProtocolId("");
        return;
      }

      if (!editingVaccinationId && protocol?.vaccines?.length && dateGiven) {
        const withBooster = protocol.vaccines.filter(v => v.trackBooster);
        const noBooster = protocol.vaccines.filter(v => !v.trackBooster);
        const newEntries = [];
        if (withBooster.length === 0) {
          newEntries.push({
            id: Date.now().toString(),
            protocolName: protocol.name,
            vaccineNames: protocol.vaccines.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", "),
            dateGiven,
            notes: vaccinationForm.notes?.trim() || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
          });
        } else {
          if (noBooster.length > 0) {
            newEntries.push({
              id: Date.now().toString(),
              protocolName: protocol.name,
              vaccineNames: noBooster.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", "),
              dateGiven,
              notes: vaccinationForm.notes?.trim() || undefined,
              administeredBy: vaccinationForm.administeredBy || undefined,
            });
          }
          withBooster.forEach((v, idx) => {
            const boosterDays = v.boosterIntervalDays != null ? Number(v.boosterIntervalDays) : undefined;
            const nextDue = Number.isInteger(boosterDays) ? addDays(dateGiven, boosterDays) : undefined;
            newEntries.push({
              id: Date.now().toString() + "-" + idx,
              vaccineName: (v.vaccineName || "").trim() || undefined,
              dateGiven,
              nextDueDate: nextDue,
              dosage: (v.dosage || "").trim() || undefined,
              route: v.route || undefined,
              boosterIntervalDays: boosterDays,
              notes: vaccinationForm.notes?.trim() || undefined,
              administeredBy: vaccinationForm.administeredBy || undefined,
            });
          });
        }
        const nextList = [...(a.vaccinations || []), ...newEntries];
        setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an)));
        setViewing(prev => (prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev));
        setShowVaccinationForm(false);
        setEditingVaccinationId(null);
        setVaccinationProtocolId("");
        setVaccinationForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" });
        return;
      }

      const boosterDays = vaccinationForm.boosterIntervalDays !== "" ? parseInt(vaccinationForm.boosterIntervalDays, 10) : undefined;
      const nextDue = vaccinationForm.nextDueDate?.trim() || (vaccinationForm.dateGiven?.trim() && Number.isInteger(boosterDays) ? addDays(vaccinationForm.dateGiven, boosterDays) : undefined);
      const rec = editingVaccinationId
        ? {
            id: editingVaccinationId,
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: nextDue || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
            dosage: vaccinationForm.dosage?.trim() || undefined,
            route: vaccinationForm.route || undefined,
            boosterIntervalDays: boosterDays,
          }
        : {
            id: Date.now().toString(),
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: nextDue || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
            dosage: vaccinationForm.dosage?.trim() || undefined,
            route: vaccinationForm.route || undefined,
            boosterIntervalDays: boosterDays,
          };
      const nextList = editingVaccinationId
        ? (a.vaccinations || []).map(v => (v.id === editingVaccinationId ? rec : v))
        : [...(a.vaccinations || []), rec];
      setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an)));
      setViewing(prev => (prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev));
      setShowVaccinationForm(false);
      setEditingVaccinationId(null);
      setVaccinationForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" });
      setVaccinationProtocolId("");
    }

    function deleteVaccination(vaccinationId) {
      if (!confirm("Remove this vaccination record?")) return;
      const nextList = (a.vaccinations || []).filter(v => v.id !== vaccinationId);
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev
      );
    }

    function saveMove() {
      const canonical = getCanonicalPastureNames(animals, pastures);
      const resolvedName = resolvePastureName(moveForm.pastureName?.trim(), canonical) || undefined;
      const movementId = Date.now().toString() + "-" + a.id;
      const move = {
        pastureName: resolvedName,
        dateMovedIn: moveForm.dateMovedIn || undefined,
        notes: moveForm.notes?.trim() || undefined,
        movementId,
      };
      const prevPasture = (a.movements || [])[0]?.pastureName;
      const nextMovements = [move, ...(a.movements || [])];
      const updated = { ...a, movements: nextMovements };
      const journalEntry = setNotes ? createMovementJournalEntry(a, prevPasture, resolvedName, moveForm.dateMovedIn || undefined, move.notes, movementId) : null;
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowMoveForm(false);
      setMoveForm({ pastureName: "", dateMovedIn: "", notes: "" });
      if (setNotes && journalEntry) setNotes(prev => [journalEntry, ...prev]);
      if (move.pastureName) {
        const nextAnimals = animals.map(an => (an.id === a.id ? updated : an));
        const male = getBreedingMaleInPasture(nextAnimals, move.pastureName);
        if (male) {
          const eligible = getEligibleFemalesForRunningWithBull(nextAnimals, gestations, move.pastureName, male);
          if (eligible.length > 0) {
            setRunningWithBullPrompt({
              pastureName: move.pastureName,
              maleAnimal: male,
              eligibleFemales: eligible,
              revertMove: { animalId: a.id, previousAnimal: a, journalEntryId: journalEntry?.id },
            });
            setRunningWithBullStep("ask");
            setRunningWithBullForm({ startDate: "", endDate: "" });
          }
        }
      }
    }

    function saveWeight() {
      const w = parseFloat(weightForm.weight);
      if (!weightForm.date || isNaN(w) || w <= 0) return;
      const entry = { id: Date.now().toString(), weight: w, date: weightForm.date, notes: weightForm.notes?.trim() || undefined };
      const nextWeights = [...(a.weights || []), entry].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
      const updated = { ...a, weights: nextWeights };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowWeightForm(false);
      setWeightForm({ weight: "", date: "", notes: "" });
    }

    function deleteWeightEntry(entryId) {
      const nextWeights = (a.weights || []).filter(e => e.id !== entryId);
      const updated = { ...a, weights: nextWeights };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
    }

    const weightsSorted = [...(a.weights || [])].sort((x, y) => (x.date || "").localeCompare(y.date || ""));
    const firstWeight = weightsSorted[0];
    const lastWeight = weightsSorted[weightsSorted.length - 1];
    const daysBetween = firstWeight && lastWeight && firstWeight !== lastWeight && firstWeight.date && lastWeight.date
      ? Math.max(1, (new Date(lastWeight.date) - new Date(firstWeight.date)) / 86400000)
      : 0;
    const adg = daysBetween > 0 && firstWeight && lastWeight ? (lastWeight.weight - firstWeight.weight) / daysBetween : null;
    const trend = adg === null ? "flat" : adg > 0 ? "up" : adg < 0 ? "down" : "flat";

    function saveTreatment() {
      if (!treatmentForm.date || !treatmentForm.type) return;
      const isEdit = !!editingTreatmentId;
      const entry = {
        id: isEdit ? editingTreatmentId : Date.now().toString(),
        date: treatmentForm.date,
        type: treatmentForm.type,
        description: treatmentForm.description?.trim() || undefined,
        treatmentGiven: treatmentForm.treatmentGiven?.trim() || undefined,
        dosage: treatmentForm.dosage?.trim() || undefined,
        administeredBy: treatmentForm.administeredBy || "Owner",
        cost: treatmentForm.cost?.trim() ? parseFloat(treatmentForm.cost) : undefined,
        notes: treatmentForm.notes?.trim() || undefined,
      };
      const nextTreatments = isEdit
        ? (a.treatments || []).map(e => (e.id === editingTreatmentId ? entry : e)).sort((x, y) => (y.date || "").localeCompare(x.date || ""))
        : [...(a.treatments || []), entry].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      const updated = { ...a, treatments: nextTreatments };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      if (!isEdit && setExpenses && entry.cost != null && entry.cost > 0) {
        const category = TREATMENT_TYPE_TO_EXPENSE_CATEGORY[entry.type] || "Medicine";
        const description = `${entry.type} — ${getAnimalName(a)}`;
        setExpenses(prev => [...(prev || []), {
          id: entry.id + "-exp",
          date: entry.date,
          category,
          amount: entry.cost,
          description,
          animalId: a.id,
          notes: entry.notes || undefined,
        }]);
      }
      setShowTreatmentForm(false);
      setEditingTreatmentId(null);
      setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" });
    }

    function deleteTreatmentEntry(entryId) {
      const nextTreatments = (a.treatments || []).filter(e => e.id !== entryId);
      const updated = { ...a, treatments: nextTreatments };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
    }

    const treatmentsSorted = [...(a.treatments || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));

    function addBreedingFromProfile() {
      const start = breedingForm.breedingDate;
      if (!start) return;
      const totalDays = SPECIES[a.species]?.days || 150;
      const minDays = SPECIES[a.species]?.minDays ?? totalDays;
      const maxDays = SPECIES[a.species]?.maxDays ?? totalDays;
      const end = (breedingForm.runningWithBull && (breedingForm.breedingDateEnd || "").trim()) ? breedingForm.breedingDateEnd : null;
      let dueStart, dueEnd;
      if (end) {
        dueStart = dueDate(start, totalDays);
        dueEnd = dueDate(end, totalDays);
      } else {
        const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
        dueStart = range.dueDateStart;
        dueEnd = range.dueDateEnd;
      }
      const sireDisplay = breedingForm.sireNotInHerd ? ((breedingForm.sire || "").trim() || "Unknown") : (breedingForm.sireAnimalId === "unknown" ? "Unknown" : (breedingForm.sire || undefined));
      const sireId = breedingForm.sireNotInHerd ? undefined : (breedingForm.sireAnimalId && breedingForm.sireAnimalId !== "unknown" ? breedingForm.sireAnimalId : undefined);
      const recordId = Date.now().toString();
      const breedingDateMs = new Date(start + "T12:00:00").getTime();
      const recentHeats = (a.heatCycles || [])
        .filter(h => {
          const heatMs = new Date((h.observedDate || "") + "T12:00:00").getTime();
          const diffDays = (breedingDateMs - heatMs) / 86400000;
          return diffDays >= 0 && diffDays <= 5;
        })
        .sort((x, y) => (y.observedDate || "").localeCompare(x.observedDate || ""));
      const linkedHeat = recentHeats[0] || null;
      const record = {
        animalId: a.id,
        breedingDate: start,
        ...(breedingForm.runningWithBull && { breedingDateEnd: end || undefined, runningWithBull: true }),
        dueDate: dueStart,
        dueDateStart: dueStart,
        dueDateEnd: dueEnd,
        sire: sireDisplay,
        ...(sireId && { sireAnimalId: sireId }),
        notes: breedingForm.notes,
        id: recordId,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
        ...(linkedHeat && { linkedHeatCycleId: linkedHeat.id, linkedHeatObservedDate: linkedHeat.observedDate }),
      };
      if (sireId) {
        const maleAnimal = (animals || []).find(m => m.id === sireId);
        if (maleAnimal) {
          const femaleSireId = (a.sireId || "").toString().trim() || null;
          const maleSireId = (maleAnimal.sireId || "").toString().trim() || null;
          const femaleDamId = (a.damId || a.motherId || "").toString().trim() || null;
          const maleDamId = (maleAnimal.damId || maleAnimal.motherId || "").toString().trim() || null;
          const femaleSireName = (a.sireName || "").toString().trim().toLowerCase() || null;
          const maleSireName = (maleAnimal.sireName || "").toString().trim().toLowerCase() || null;
          const femaleDamName = (a.damName || a.motherName || "").toString().trim().toLowerCase() || null;
          const maleDamName = (maleAnimal.damName || maleAnimal.motherName || "").toString().trim().toLowerCase() || null;
          console.log("[Inbreeding simple check] sireIds compared:", { femaleSireId, maleSireId });
          console.log("[Inbreeding simple check] damIds compared:", { femaleDamId, maleDamId });
          console.log("[Inbreeding simple check] sireNames compared:", { femaleSireName, maleSireName });
          console.log("[Inbreeding simple check] damNames compared:", { femaleDamName, maleDamName });
          const sameSireById = femaleSireId && maleSireId && femaleSireId === maleSireId;
          const sameSireByName = !sameSireById && femaleSireName && maleSireName && femaleSireName === maleSireName;
          const sameDamById = femaleDamId && maleDamId && femaleDamId === maleDamId;
          const sameDamByName = !sameDamById && femaleDamName && maleDamName && femaleDamName === maleDamName;
          if (sameSireById || sameSireByName) {
            setInbreedingWarningPending({
              cowName: getAnimalName(a),
              bullName: getAnimalName(maleAnimal),
              commonAncestorName: null,
              level: "half_sibling",
              sameParentType: "sire",
              record,
              linkedHeat,
              animalId: a.id,
              recordId,
            });
            return;
          }
          if (sameDamById || sameDamByName) {
            setInbreedingWarningPending({
              cowName: getAnimalName(a),
              bullName: getAnimalName(maleAnimal),
              commonAncestorName: null,
              level: "half_sibling",
              sameParentType: "dam",
              record,
              linkedHeat,
              animalId: a.id,
              recordId,
            });
            return;
          }
          const inbreeding = checkInbreedingByParentIds(a, maleAnimal, animals);
          if (inbreeding) {
            setInbreedingWarningPending({
              cowName: getAnimalName(a),
              bullName: getAnimalName(maleAnimal),
              commonAncestorName: inbreeding.commonAncestorName,
              level: inbreeding.level,
              record,
              linkedHeat,
              animalId: a.id,
              recordId,
            });
            return;
          }
        }
      }
      setGestations(p => [...p, record]);
      if (linkedHeat) {
        setAnimals(prev => prev.map(x => x.id === a.id ? { ...x, heatCycles: (x.heatCycles || []).map(h => h.id === linkedHeat.id ? { ...h, linkedGestationId: recordId } : h) } : x));
      }
      setShowBreedingForm(false);
      setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", sireNotInHerd: false, notes: "" });
      setBreedingInbreedingCheck(null);
    }

    function saveHeat() {
      if (!heatForm.observedDate) return;
      const record = {
        id: Date.now().toString(),
        observedDate: heatForm.observedDate,
        intensity: heatForm.intensity || "Moderate",
        notes: (heatForm.notes || "").trim(),
      };
      setAnimals(prev => prev.map(x => x.id === a.id ? { ...x, heatCycles: [...(x.heatCycles || []), record] } : x));
      setShowHeatForm(false);
      setHeatForm({ observedDate: "", intensity: "Moderate", notes: "" });
    }

    const breedingSireOptions = getSireDropdownMalesForSpecies(animals, a.species);
    const heatCyclesSorted = [...(a.heatCycles || [])].sort((x, y) => (y.observedDate || "").localeCompare(x.observedDate || ""));
    const nextExpectedHeat = getNextExpectedHeatDate(a);
    const gestationsForLinking = (gestations || []).filter(g => g.animalId === a.id);
    const heatDaysSince = (idx) => {
      if (idx >= heatCyclesSorted.length - 1) return null;
      const curr = heatCyclesSorted[idx]?.observedDate;
      const prev = heatCyclesSorted[idx + 1]?.observedDate;
      if (!curr || !prev) return null;
      const d1 = new Date(curr + "T12:00:00");
      const d2 = new Date(prev + "T12:00:00");
      return Math.round((d1 - d2) / 86400000);
    };
    const HEAT_LINK_DAYS = 5;
    const gestationForHeat = (heatObservedDate, heatRecord) => {
      if (heatRecord?.linkedGestationId) {
        const g = gestationsForLinking.find(gr => gr.id === heatRecord.linkedGestationId);
        if (g) return g;
      }
      const h = new Date(heatObservedDate + "T12:00:00");
      return gestationsForLinking.find(g => {
        const b = g.breedingDate ? new Date(g.breedingDate + "T12:00:00") : null;
        if (!b) return false;
        const diff = (b - h) / 86400000;
        return diff >= 0 && diff <= HEAT_LINK_DAYS;
      });
    };
    const heatForGestation = (g) => {
      if (g.linkedHeatObservedDate) return { observedDate: g.linkedHeatObservedDate };
      const b = g.breedingDate ? new Date(g.breedingDate + "T12:00:00") : null;
      if (!b) return null;
      const heatsBefore = (a.heatCycles || []).filter(h => new Date((h.observedDate || "") + "T12:00:00") <= b).sort((x, y) => (y.observedDate || "").localeCompare(x.observedDate || ""));
      const match = heatsBefore.find(h => (b - new Date((h.observedDate || "") + "T12:00:00")) / 86400000 <= HEAT_LINK_DAYS);
      return match || null;
    };

    const vaccinationsSorted = [...(a.vaccinations || [])].sort((x, y) => {
      const d1 = x.dateGiven || "";
      const d2 = y.dateGiven || "";
      return d2.localeCompare(d1);
    });

    const horseUpcomingItems = a.species === "Horse" ? [
      ...(a.horseFarrier || []).map((r, i) => r.nextAppointment ? { date: r.nextAppointment, label: "Farrier", type: "farrier", key: "farrier-" + i, source: { type: "farrier", index: i } } : null).filter(Boolean),
      ...(a.horseWorming || []).map((r, i) => r.nextWormingDate ? { date: r.nextWormingDate, label: "Worming", type: "worming", key: "worming-" + i, source: { type: "worming", index: i } } : null).filter(Boolean),
      ...(a.horseDental || []).map((r, i) => r.nextFloatDate ? { date: r.nextFloatDate, label: "Dental float", type: "dental", key: "dental-" + i, source: { type: "dental", index: i } } : null).filter(Boolean),
      ...(a.horseVetWork || []).map((r, i) => r.nextAppointment ? { date: r.nextAppointment, label: "Vet", type: "vet", key: "vet-" + i, source: { type: "vet", index: i } } : null).filter(Boolean),
      ...(a.vaccinations || []).map(v => v.nextDueDate ? { date: v.nextDueDate, label: "Vaccination" + (v.vaccineName ? ": " + v.vaccineName : ""), type: "vaccination", key: "vaccination-" + v.id, source: { type: "vaccination", vaccinationId: v.id } } : null).filter(Boolean),
    ].sort((x, y) => (x.date || "").localeCompare(y.date || "")) : [];

    const horseHealthTimelineItems = a.species === "Horse" ? (() => {
      const fromTreatments = (a.treatments || []).map(t => ({ ...t, sortDate: t.date, source: "treatment", horseType: t.horseHealthType }));
      const fromVaccinations = (a.vaccinations || []).map(v => ({ ...v, sortDate: v.dateGiven, source: "vaccination", id: v.id }));
      const combined = [...fromTreatments, ...fromVaccinations].filter(x => x.sortDate);
      return combined.sort((x, y) => (y.sortDate || "").localeCompare(x.sortDate || ""));
    })() : [];

    const HORSE_HEALTH_COLORS = { vet: "#16a34a", farrier: "#2563eb", worming: "#ea580c", dental: "#7c3aed", supplement: "#ca8a04", vaccination: "#0d9488", default: "#64748b" };

    return (
      <>
      <div className="no-print hl-page hl-page-narrow hl-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => { setViewing(null); setEditingId(null); }} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            ← Back to Animals
          </button>
          {editingId !== a.id && (
            <Btn onClick={() => { setEditingId(a.id); }}>Edit</Btn>
          )}
        </div>

        {editingId === a.id && (
          <EditAnimalForm
            key={a.id}
            editingAnimal={a}
            initialValues={animalToEditInitialValues(a)}
            editingAnimalId={a.id}
            animals={animals}
            pastures={pastures}
            contacts={contacts}
            setContacts={setContacts}
            gestations={gestations}
            onSave={(updated) => {
              setAnimals(prev => prev.map(x => (x.id === a.id ? updated : x)));
              setViewing(updated);
              setEditingId(null);
            }}
            onCancel={() => { setEditingId(null); }}
          />
        )}

        <Card className="hl-card-no-padding" style={{ padding: "0", overflow: "hidden" }}>
          <div className="hl-detail-header" style={{ background: "var(--green)", padding: "28px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div className="hl-animal-profile-photo-wrap" style={{ position: "relative", flexShrink: 0 }}>
              <div className="hl-animal-profile-photo" style={{ width: "96px", height: "96px", borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid rgba(255,255,255,0.4)" }}>
              {(a.photoUrl || a.photo) ? (
                  <img src={a.photoUrl || a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "48px" }}>{SPECIES[a.species]?.emoji}</span>
                )}
              </div>
              <input
                ref={animalPhotoInputRef}
                type="file"
                accept="image/*"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                aria-hidden="true"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoUploading(true);
                  try {
                    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
                    const path = `${a.id}/photo.${ext}`;
                    const { error } = await supabase.storage
                      .from(ANIMAL_PHOTOS_BUCKET)
                      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
                    if (error) throw new Error(error.message);
                    const { data: urlData } = supabase.storage
                      .from(ANIMAL_PHOTOS_BUCKET)
                      .getPublicUrl(path);
                    setAnimals(prev => prev.map(an => {
                      if (an.id !== a.id) return an;
                      return { ...an, photoUrl: urlData.publicUrl, photo: undefined };
                    }));
                    setViewing(prev => {
                      if (!prev || prev.id !== a.id) return prev;
                      return { ...prev, photoUrl: urlData.publicUrl, photo: undefined };
                    });
                  } catch (err) {
                    alert(err?.message || "Failed to process image");
                  } finally {
                    setPhotoUploading(false);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                onClick={() => animalPhotoInputRef.current?.click()}
                disabled={photoUploading}
                className="hl-animal-photo-btn"
                style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "none", background: "transparent", cursor: photoUploading ? "wait" : "pointer", padding: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}
                title="Add or change photo"
                aria-label="Add or change photo"
              >
                <span style={{ width: "30px", height: "30px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", background: "var(--green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", margin: "1px", flexShrink: 0 }}>
                  {photoUploading ? (
                    <span style={{ fontSize: "13px" }}>…</span>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  )}
                </span>
              </button>
            </div>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div className="hl-detail-name" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#fff" }}>{getAnimalName(a)}</div>
              <div className="hl-detail-meta" style={{ color: "var(--brass3)", fontSize: "14px", marginTop: "2px" }}>{a.breed || a.species} · {displaySex(a, gestations)}{(() => { const runningWith = getRunningWithMaleForFemale(a, animals); return runningWith ? ` · Running with ${getAnimalName(runningWith)}` : ""; })()}</div>
            </div>
            <div className="hl-detail-badges" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {a.species === "Horse" && (() => {
                const docs = a.documents || [];
                const coggins = docs.find(d => d.documentType === "Coggins Test");
                const today = new Date().toISOString().split("T")[0];
                const expired = coggins?.expirationDate && coggins.expirationDate < today;
                const missing = !coggins;
                if (missing || expired) {
                  return (
                    <Badge key="coggins-warn" color="#c0392b" style={{ background: "#c0392b", color: "#fff" }} title="Required for travel and shows">
                      Coggins {missing ? "Missing" : "Expired"}
                    </Badge>
                  );
                }
                return null;
              })()}
              {a.cull && <Badge color="#c0392b" style={{ background: "#c0392b", color: "#fff" }}>CULL</Badge>}
              {getRunningWithMaleForFemale(a, animals) && <Badge color="var(--brass2)" style={{ background: "rgba(201,149,42,0.2)", color: "var(--brass)" }}>Running with {getAnimalName(getRunningWithMaleForFemale(a, animals))}</Badge>}
              {a.deceased && <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased{a.deceased.date ? ` ${fmt(a.deceased.date)}` : ""}</Badge>}
              {a.butchered && <Badge color="#5a3e2b" style={{ background: "#5a3e2b", color: "#fff" }}>Butchered{a.butchered.date ? ` ${fmt(a.butchered.date)}` : ""}</Badge>}
              {a.sale && <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>}
              {a.tag && a.name && !a.deceased && <Badge color="var(--brass2)">#{a.tag}</Badge>}
              {a.excludeFromReports && <Badge color="#C0392B" style={{ background: "rgba(192,57,43,0.12)", color: "#C0392B", border: "1px solid rgba(192,57,43,0.3)" }}>Excluded from reports</Badge>}
            </div>
          </div>
          <div className="hl-profile-content" style={{ padding: "28px 32px" }}>
            <div className="hl-detail-grid" style={{ marginBottom: "24px" }}>
              {[
                ["Species", a.species],
                ["Breed", a.breed || "—"],
                ["Color", a.color || "—"],
                ["Sex", displaySex(a, gestations)],
                ["Date of Birth", fmt(a.dob)],
                ["Tag / ID", a.tag || "—"],
                ...(a.species !== "Mule" && isFemale(a) ? [["Gestation", `${SPECIES[a.species]?.days ?? "—"} days`]] : []),
                ...(a.species === "Horse" ? [["Height (hands)", a.heightHands || "—"], ["Discipline", a.discipline || "—"], ["Registration number", a.registrationNumber || "—"], ["Markings", a.markings || "—"]] : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>{k}</div>
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>{v}</div>
                </div>
              ))}
            </div>

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Acquisition</div>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", fontSize: "14px", color: "var(--ink2)" }}>
                <div style={{ fontWeight: 600, marginBottom: "4px" }}>{a.acquisitionType === "Purchased" ? "Purchased" : "Home Raised"}</div>
                {a.acquisitionType === "Purchased" && (
                  <>
                    {a.purchasePrice != null && <div>Purchase price: ${Number(a.purchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                    {a.purchaseDate && <div>Purchase date: {fmt(a.purchaseDate)}</div>}
                    {a.purchasedFrom && <div>Purchased from: {a.purchasedFrom}</div>}
                  </>
                )}
              </div>
            </div>

            {a.species === "Horse" && (
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Horse Health</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
                {["Vet Work", "Farrier", "Worming", "Supplements", "Dental"].map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => { setHorseHealthTab(tab); setShowHorseHealthForm(false); }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border)",
                      background: horseHealthTab === tab ? "var(--green)" : "var(--cream)",
                      color: horseHealthTab === tab ? "#fff" : "var(--ink2)",
                      fontWeight: 600,
                      fontSize: "13px",
                      cursor: "pointer",
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {horseHealthTab === "Vet Work" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--ink2)" }}>Vet visits and procedures</span>
                    {!showHorseHealthForm && <Btn size="sm" variant="secondary" onClick={() => { setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, vetDate: "", vetName: "", vetProcedure: "", vetNextAppointment: "", vetCost: "" })); setShowHorseHealthForm(true); }}>Add</Btn>}
                  </div>
                  {(a.horseVetWork || []).length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      {(a.horseVetWork || []).map((r, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", marginBottom: "8px", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div>
                            <div><strong>{fmt(r.date)}</strong> — {r.vetName || "—"}</div>
                            {r.procedure && <div style={{ marginTop: "4px" }}>{r.procedure}</div>}
                            {r.nextAppointment && <div style={{ marginTop: "4px", color: "var(--muted)" }}>Next: {fmt(r.nextAppointment)}</div>}
                            {r.cost != null && r.cost !== "" && <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--muted)" }}>Cost: ${Number(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingHorseHealth({ section: "Vet Work", index: i }); setHorseHealthForm(p => ({ ...p, vetDate: r.date || "", vetName: r.vetName || "", vetProcedure: r.procedure || "", vetNextAppointment: r.nextAppointment || "", vetCost: r.cost != null && r.cost !== "" ? String(r.cost) : "" })); setShowHorseHealthForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Remove this vet record?")) return; const next = (a.horseVetWork || []).filter((_, j) => j !== i); const nextTreatments = (a.treatments || []).filter(t => t.id !== r.treatmentId); const updated = { ...a, horseVetWork: next, treatments: nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || "")) }; setAnimals(prev => prev.map(an => an.id === a.id ? updated : an)); setViewing(updated); if (setExpenses && r.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== r.expenseId)); }}>Delete</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHorseHealthForm && horseHealthTab === "Vet Work" && (
                    <Card style={{ padding: "16px 18px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingHorseHealth?.section === "Vet Work" ? "Edit Vet Visit" : "Add Vet Visit"}</div>
                      <div className="hl-form-grid-3" style={{ marginBottom: "10px" }}>
                        <DateInputWithValidation label="Date" value={horseHealthForm.vetDate} onValueChange={v => setHorseHealthForm(p => ({ ...p, vetDate: v }))} />
                        <Input label="Vet name" value={horseHealthForm.vetName} onChange={e => setHorseHealthForm(p => ({ ...p, vetName: e.target.value }))} placeholder="e.g. Dr. Smith" />
                        <DateInputWithValidation label="Next appointment" value={horseHealthForm.vetNextAppointment} onValueChange={v => setHorseHealthForm(p => ({ ...p, vetNextAppointment: v }))} breedingDueTwoDigitYear />
                        <Input label="Cost of visit ($)" type="number" min="0" step="0.01" value={horseHealthForm.vetCost} onChange={e => setHorseHealthForm(p => ({ ...p, vetCost: e.target.value }))} placeholder="Optional" />
                      </div>
                      <Textarea label="Procedure" value={horseHealthForm.vetProcedure} onChange={e => setHorseHealthForm(p => ({ ...p, vetProcedure: e.target.value }))} rows={2} placeholder="Procedure or notes" />
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <Btn size="sm" onClick={() => {
                          const vetCostNum = horseHealthForm.vetCost?.trim() ? parseFloat(horseHealthForm.vetCost) : undefined;
                          const isEdit = editingHorseHealth?.section === "Vet Work";
                          const existingRec = isEdit ? (a.horseVetWork || [])[editingHorseHealth.index] : null;
                          const expenseId = (vetCostNum != null && vetCostNum > 0) ? (existingRec?.expenseId || "horse-vet-" + Date.now() + "-exp") : undefined;
                          const rec = { date: horseHealthForm.vetDate?.trim() || undefined, vetName: horseHealthForm.vetName?.trim() || undefined, procedure: horseHealthForm.vetProcedure?.trim() || undefined, nextAppointment: horseHealthForm.vetNextAppointment?.trim() || undefined, cost: vetCostNum, expenseId };
                          const treatmentId = isEdit ? existingRec?.treatmentId : "horse-vet-" + Date.now();
                          const treatmentEntry = { id: treatmentId, date: rec.date, type: "Vet Visit", description: rec.procedure, treatmentGiven: rec.vetName, notes: rec.nextAppointment ? "Next appointment: " + rec.nextAppointment : undefined, horseHealthType: "vet", cost: vetCostNum };
                          const next = isEdit ? (a.horseVetWork || []).map((r, j) => j === editingHorseHealth.index ? { ...rec, treatmentId: r.treatmentId } : r) : [...(a.horseVetWork || []), { ...rec, treatmentId }];
                          const nextTreatments = isEdit ? (a.treatments || []).map(t => t.id === treatmentId ? treatmentEntry : t) : [...(a.treatments || []), treatmentEntry];
                          const sortedTreatments = nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                          const updated = { ...a, horseVetWork: next, treatments: sortedTreatments };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                          if (setExpenses) {
                            if (vetCostNum != null && vetCostNum > 0) {
                              const description = `Vet — ${getAnimalName(a)} — ${rec.procedure || "Vet visit"}`;
                              const newExp = { id: expenseId, date: rec.date, category: HORSE_HEALTH_EXPENSE_CATEGORY.vet, amount: vetCostNum, description, animalId: a.id };
                              setExpenses(prev => { const list = prev || []; const idx = list.findIndex(e => e.id === expenseId); if (idx >= 0) return list.map((e, i) => i === idx ? newExp : e); return [...list, newExp]; });
                            } else if (existingRec?.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== existingRec.expenseId));
                          }
                          setShowHorseHealthForm(false);
                          setEditingHorseHealth(null);
                          setHorseHealthForm(p => ({ ...p, vetDate: "", vetName: "", vetProcedure: "", vetNextAppointment: "", vetCost: "" }));
                        }}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => { setShowHorseHealthForm(false); setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, vetDate: "", vetName: "", vetProcedure: "", vetNextAppointment: "", vetCost: "" })); }}>Cancel</Btn>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {horseHealthTab === "Farrier" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--ink2)" }}>Farrier visits</span>
                    {!showHorseHealthForm && <Btn size="sm" variant="secondary" onClick={() => { setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, farrierDate: "", farrierName: "", farrierServiceType: "", farrierNextAppointment: "", farrierCost: "" })); setShowHorseHealthForm(true); }}>Add</Btn>}
                  </div>
                  {(a.horseFarrier || []).length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      {(a.horseFarrier || []).map((r, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", marginBottom: "8px", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div>
<div><strong>{fmt(r.date)}</strong> — {r.farrierName || "—"} · {r.serviceType || "—"}</div>
                          {r.nextAppointment && <div style={{ marginTop: "4px", color: "var(--muted)" }}>Next: {fmt(r.nextAppointment)}</div>}
                          {r.cost != null && r.cost !== "" && <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--muted)" }}>Cost: ${Number(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingHorseHealth({ section: "Farrier", index: i }); setHorseHealthForm(p => ({ ...p, farrierDate: r.date || "", farrierName: r.farrierName || "", farrierServiceType: r.serviceType || "", farrierNextAppointment: r.nextAppointment || "", farrierCost: r.cost != null && r.cost !== "" ? String(r.cost) : "" })); setShowHorseHealthForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Remove this farrier record?")) return; const next = (a.horseFarrier || []).filter((_, j) => j !== i); const nextTreatments = (a.treatments || []).filter(t => t.id !== r.treatmentId); const updated = { ...a, horseFarrier: next, treatments: nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || "")) }; setAnimals(prev => prev.map(an => an.id === a.id ? updated : an)); setViewing(updated); if (setExpenses && r.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== r.expenseId)); }}>Delete</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHorseHealthForm && horseHealthTab === "Farrier" && (
                    <Card style={{ padding: "16px 18px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingHorseHealth?.section === "Farrier" ? "Edit Farrier Visit" : "Add Farrier Visit"}</div>
                      <div className="hl-form-grid-3" style={{ marginBottom: "10px" }}>
                        <DateInputWithValidation label="Date" value={horseHealthForm.farrierDate} onValueChange={d => setHorseHealthForm(p => ({ ...p, farrierDate: d, farrierNextAppointment: addDays(d, 49) || p.farrierNextAppointment }))} />
                        <Input label="Farrier name" value={horseHealthForm.farrierName} onChange={e => setHorseHealthForm(p => ({ ...p, farrierName: e.target.value }))} placeholder="e.g. John Smith" />
                        <Input label="Service type" value={horseHealthForm.farrierServiceType} onChange={e => setHorseHealthForm(p => ({ ...p, farrierServiceType: e.target.value }))} placeholder="e.g. Trim, Shoes" />
                        <DateInputWithValidation label="Next appointment" value={horseHealthForm.farrierNextAppointment} onValueChange={v => setHorseHealthForm(p => ({ ...p, farrierNextAppointment: v }))} style={{ gridColumn: "1 / -1" }} breedingDueTwoDigitYear />
                        <Input label="Cost per visit ($)" type="number" min="0" step="0.01" value={horseHealthForm.farrierCost} onChange={e => setHorseHealthForm(p => ({ ...p, farrierCost: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <Btn size="sm" onClick={() => {
                          const farrierCostNum = horseHealthForm.farrierCost?.trim() ? parseFloat(horseHealthForm.farrierCost) : undefined;
                          const isEdit = editingHorseHealth?.section === "Farrier";
                          const existingRec = isEdit ? (a.horseFarrier || [])[editingHorseHealth.index] : null;
                          const expenseId = (farrierCostNum != null && farrierCostNum > 0) ? (existingRec?.expenseId || "horse-farrier-" + Date.now() + "-exp") : undefined;
                          const rec = { date: horseHealthForm.farrierDate?.trim() || undefined, farrierName: horseHealthForm.farrierName?.trim() || undefined, serviceType: horseHealthForm.farrierServiceType?.trim() || undefined, nextAppointment: horseHealthForm.farrierNextAppointment?.trim() || undefined, cost: farrierCostNum, expenseId };
                          const treatmentId = isEdit ? existingRec?.treatmentId : "horse-farrier-" + Date.now();
                          const desc = ["Farrier", rec.serviceType, rec.farrierName].filter(Boolean).join(" — ");
                          const treatmentEntry = { id: treatmentId, date: rec.date, type: "Other", description: desc || "Farrier visit", notes: rec.nextAppointment ? "Next appointment: " + rec.nextAppointment : undefined, horseHealthType: "farrier", cost: farrierCostNum };
                          const next = isEdit ? (a.horseFarrier || []).map((r, j) => j === editingHorseHealth.index ? { ...rec, treatmentId: r.treatmentId } : r) : [...(a.horseFarrier || []), { ...rec, treatmentId }];
                          const nextTreatments = isEdit ? (a.treatments || []).map(t => t.id === treatmentId ? treatmentEntry : t) : [...(a.treatments || []), treatmentEntry];
                          const sortedTreatments = nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                          const updated = { ...a, horseFarrier: next, treatments: sortedTreatments };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                          if (setExpenses) {
                            if (farrierCostNum != null && farrierCostNum > 0) {
                              const description = `Farrier — ${getAnimalName(a)} — ${rec.serviceType || "Visit"}`;
                              const newExp = { id: expenseId, date: rec.date, category: HORSE_HEALTH_EXPENSE_CATEGORY.farrier, amount: farrierCostNum, description, animalId: a.id };
                              setExpenses(prev => { const list = prev || []; const idx = list.findIndex(e => e.id === expenseId); if (idx >= 0) return list.map((e, i) => i === idx ? newExp : e); return [...list, newExp]; });
                            } else if (existingRec?.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== existingRec.expenseId));
                          }
                          setShowHorseHealthForm(false);
                          setEditingHorseHealth(null);
                          setHorseHealthForm(p => ({ ...p, farrierDate: "", farrierName: "", farrierServiceType: "", farrierNextAppointment: "", farrierCost: "" }));
                        }}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => { setShowHorseHealthForm(false); setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, farrierDate: "", farrierName: "", farrierServiceType: "", farrierNextAppointment: "", farrierCost: "" })); }}>Cancel</Btn>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {horseHealthTab === "Worming" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--ink2)" }}>Worming records</span>
                    {!showHorseHealthForm && <Btn size="sm" variant="secondary" onClick={() => { setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, wormingDate: "", wormingProduct: "", wormingDosage: "", wormingNextDate: "", wormingCost: "" })); setShowHorseHealthForm(true); }}>Add</Btn>}
                  </div>
                  {(a.horseWorming || []).length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      {(a.horseWorming || []).map((r, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", marginBottom: "8px", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div>
<div><strong>{fmt(r.date)}</strong> — {r.product || "—"} {r.dosage && `· ${r.dosage}`}</div>
                          {r.nextWormingDate && <div style={{ marginTop: "4px", color: "var(--muted)" }}>Next: {fmt(r.nextWormingDate)}</div>}
                          {r.cost != null && r.cost !== "" && <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--muted)" }}>Cost: ${Number(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingHorseHealth({ section: "Worming", index: i }); setHorseHealthForm(p => ({ ...p, wormingDate: r.date || "", wormingProduct: r.product || "", wormingDosage: r.dosage || "", wormingNextDate: r.nextWormingDate || "", wormingCost: r.cost != null && r.cost !== "" ? String(r.cost) : "" })); setShowHorseHealthForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Remove this worming record?")) return; const next = (a.horseWorming || []).filter((_, j) => j !== i); const nextTreatments = (a.treatments || []).filter(t => t.id !== r.treatmentId); const updated = { ...a, horseWorming: next, treatments: nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || "")) }; setAnimals(prev => prev.map(an => an.id === a.id ? updated : an)); setViewing(updated); if (setExpenses && r.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== r.expenseId)); }}>Delete</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHorseHealthForm && horseHealthTab === "Worming" && (
                    <Card style={{ padding: "16px 18px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingHorseHealth?.section === "Worming" ? "Edit Worming" : "Add Worming"}</div>
                      <div className="hl-form-grid-3" style={{ marginBottom: "10px" }}>
                        <DateInputWithValidation label="Date" value={horseHealthForm.wormingDate} onValueChange={v => setHorseHealthForm(p => ({ ...p, wormingDate: v }))} />
                        <Input label="Product" value={horseHealthForm.wormingProduct} onChange={e => setHorseHealthForm(p => ({ ...p, wormingProduct: e.target.value }))} placeholder="e.g. Ivermectin" />
                        <Input label="Dosage" value={horseHealthForm.wormingDosage} onChange={e => setHorseHealthForm(p => ({ ...p, wormingDosage: e.target.value }))} placeholder="e.g. 1 tube" />
                        <DateInputWithValidation label="Next worming date" value={horseHealthForm.wormingNextDate} onValueChange={v => setHorseHealthForm(p => ({ ...p, wormingNextDate: v }))} style={{ gridColumn: "1 / -1" }} breedingDueTwoDigitYear />
                        <Input label="Cost per treatment ($)" type="number" min="0" step="0.01" value={horseHealthForm.wormingCost} onChange={e => setHorseHealthForm(p => ({ ...p, wormingCost: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <Btn size="sm" onClick={() => {
                          const wormingCostNum = horseHealthForm.wormingCost?.trim() ? parseFloat(horseHealthForm.wormingCost) : undefined;
                          const isEdit = editingHorseHealth?.section === "Worming";
                          const existingRec = isEdit ? (a.horseWorming || [])[editingHorseHealth.index] : null;
                          const expenseId = (wormingCostNum != null && wormingCostNum > 0) ? (existingRec?.expenseId || "horse-worming-" + Date.now() + "-exp") : undefined;
                          const rec = { date: horseHealthForm.wormingDate?.trim() || undefined, product: horseHealthForm.wormingProduct?.trim() || undefined, dosage: horseHealthForm.wormingDosage?.trim() || undefined, nextWormingDate: horseHealthForm.wormingNextDate?.trim() || undefined, cost: wormingCostNum, expenseId };
                          const treatmentId = isEdit ? existingRec?.treatmentId : "horse-worming-" + Date.now();
                          const desc = ["Worming", rec.product, rec.dosage].filter(Boolean).join(" — ");
                          const treatmentEntry = { id: treatmentId, date: rec.date, type: "Deworming", description: desc || "Worming", notes: rec.nextWormingDate ? "Next worming: " + rec.nextWormingDate : undefined, horseHealthType: "worming", cost: wormingCostNum };
                          const next = isEdit ? (a.horseWorming || []).map((r, j) => j === editingHorseHealth.index ? { ...rec, treatmentId: r.treatmentId } : r) : [...(a.horseWorming || []), { ...rec, treatmentId }];
                          const nextTreatments = isEdit ? (a.treatments || []).map(t => t.id === treatmentId ? treatmentEntry : t) : [...(a.treatments || []), treatmentEntry];
                          const sortedTreatments = nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                          const updated = { ...a, horseWorming: next, treatments: sortedTreatments };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                          if (setExpenses) {
                            if (wormingCostNum != null && wormingCostNum > 0) {
                              const description = `Worming — ${getAnimalName(a)} — ${rec.product || "Treatment"}`;
                              const newExp = { id: expenseId, date: rec.date, category: HORSE_HEALTH_EXPENSE_CATEGORY.worming, amount: wormingCostNum, description, animalId: a.id };
                              setExpenses(prev => { const list = prev || []; const idx = list.findIndex(e => e.id === expenseId); if (idx >= 0) return list.map((e, i) => i === idx ? newExp : e); return [...list, newExp]; });
                            } else if (existingRec?.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== existingRec.expenseId));
                          }
                          setShowHorseHealthForm(false);
                          setEditingHorseHealth(null);
                          setHorseHealthForm(p => ({ ...p, wormingDate: "", wormingProduct: "", wormingDosage: "", wormingNextDate: "", wormingCost: "" }));
                        }}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => { setShowHorseHealthForm(false); setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, wormingDate: "", wormingProduct: "", wormingDosage: "", wormingNextDate: "", wormingCost: "" })); }}>Cancel</Btn>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {horseHealthTab === "Supplements" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--ink2)" }}>Ongoing daily supplements</span>
                    {!showHorseHealthForm && <Btn size="sm" variant="secondary" onClick={() => { setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, suppName: "", suppDosage: "", suppCost: "", suppDate: "", suppFrequency: "Daily" })); setShowHorseHealthForm(true); }}>Add</Btn>}
                  </div>
                  {(a.horseSupplements || []).length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      {(a.horseSupplements || []).map((r, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", marginBottom: "8px", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div>
                            <div><strong>{r.name || "—"}</strong> {r.dosage && `· ${r.dosage}`} {r.cost != null && r.cost !== "" && <span style={{ color: "var(--muted)" }}> · ${Number(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "2px 6px", borderRadius: "var(--radius)", background: "var(--cream2)" }}>{r.frequency || "Daily"}</span>
                              {r.date && <span style={{ fontSize: "12px", color: "var(--muted)" }}>Started {fmt(r.date)}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingHorseHealth({ section: "Supplements", index: i }); setHorseHealthForm(p => ({ ...p, suppName: r.name || "", suppDosage: r.dosage || "", suppCost: r.cost != null && r.cost !== "" ? String(r.cost) : "", suppDate: r.date || "", suppFrequency: r.frequency || "Daily" })); setShowHorseHealthForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Remove this supplement?")) return; const next = (a.horseSupplements || []).filter((_, j) => j !== i); const updated = { ...a, horseSupplements: next }; setAnimals(prev => prev.map(an => an.id === a.id ? updated : an)); setViewing(updated); if (setExpenses && r.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== r.expenseId)); }}>Delete</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHorseHealthForm && horseHealthTab === "Supplements" && (
                    <Card style={{ padding: "16px 18px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingHorseHealth?.section === "Supplements" ? "Edit Supplement" : "Add Supplement"}</div>
                      <div className="hl-form-grid-3" style={{ marginBottom: "10px" }}>
                        <DateInputWithValidation label="Date" value={horseHealthForm.suppDate} onValueChange={v => setHorseHealthForm(p => ({ ...p, suppDate: v }))} />
                        <Input label="Name" value={horseHealthForm.suppName} onChange={e => setHorseHealthForm(p => ({ ...p, suppName: e.target.value }))} placeholder="e.g. Joint supplement" />
                        <Input label="Dosage" value={horseHealthForm.suppDosage} onChange={e => setHorseHealthForm(p => ({ ...p, suppDosage: e.target.value }))} placeholder="e.g. 1 scoop daily" />
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Frequency</label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                            {["Daily", "Monthly", "Yearly"].map(opt => (
                              <Btn key={opt} size="sm" variant={horseHealthForm.suppFrequency === opt ? "secondary" : "ghost"} onClick={() => setHorseHealthForm(p => ({ ...p, suppFrequency: opt }))} style={{ minWidth: "72px" }}>{opt}</Btn>
                            ))}
                          </div>
                        </div>
                        <Input label={horseHealthForm.suppFrequency === "Daily" ? "COST PER DAY ($)" : horseHealthForm.suppFrequency === "Monthly" ? "COST PER MONTH ($)" : "COST PER YEAR ($)"} type="number" min="0" step="0.01" value={horseHealthForm.suppCost} onChange={e => setHorseHealthForm(p => ({ ...p, suppCost: e.target.value }))} placeholder="e.g. 25.00" />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <Btn size="sm" onClick={() => {
                          const costNum = horseHealthForm.suppCost?.trim() ? parseFloat(horseHealthForm.suppCost) : undefined;
                          const isEdit = editingHorseHealth?.section === "Supplements";
                          const existingRec = isEdit ? (a.horseSupplements || [])[editingHorseHealth.index] : null;
                          const expenseId = (costNum != null && costNum > 0) ? (existingRec?.expenseId || "horse-supplement-" + Date.now() + "-exp") : undefined;
                          const suppDateVal = horseHealthForm.suppDate?.trim() || undefined;
                          const rec = { name: horseHealthForm.suppName?.trim() || undefined, dosage: horseHealthForm.suppDosage?.trim() || undefined, cost: costNum, expenseId, date: suppDateVal, frequency: horseHealthForm.suppFrequency || "Daily" };
                          const next = isEdit ? (a.horseSupplements || []).map((r, j) => j === editingHorseHealth.index ? rec : r) : [...(a.horseSupplements || []), rec];
                          const updated = { ...a, horseSupplements: next };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                          if (setExpenses) {
                            if (costNum != null && costNum > 0) {
                              const suppDate = suppDateVal || new Date().toISOString().split("T")[0];
                              const description = `Supplement — ${getAnimalName(a)} — ${rec.name || "Supplements"}`;
                              const newExp = { id: expenseId, date: suppDate, category: HORSE_HEALTH_EXPENSE_CATEGORY.supplement, amount: costNum, description, animalId: a.id };
                              setExpenses(prev => { const list = prev || []; const idx = list.findIndex(e => e.id === expenseId); if (idx >= 0) return list.map((e, i) => i === idx ? newExp : e); return [...list, newExp]; });
                            } else if (existingRec?.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== existingRec.expenseId));
                          }
                          setShowHorseHealthForm(false);
                          setEditingHorseHealth(null);
                          setHorseHealthForm(p => ({ ...p, suppName: "", suppDosage: "", suppCost: "", suppDate: "", suppFrequency: "Daily" }));
                        }}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => { setShowHorseHealthForm(false); setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, suppName: "", suppDosage: "", suppCost: "", suppDate: "", suppFrequency: "Daily" })); }}>Cancel</Btn>
                      </div>
                    </Card>
                  )}
                </>
              )}
              {horseHealthTab === "Dental" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "13px", color: "var(--ink2)" }}>Dental / float records</span>
                    {!showHorseHealthForm && <Btn size="sm" variant="secondary" onClick={() => { setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, dentalDate: "", dentalProvider: "", dentalNextFloatDate: "", dentalCost: "" })); setShowHorseHealthForm(true); }}>Add</Btn>}
                  </div>
                  {(a.horseDental || []).length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                      {(a.horseDental || []).map((r, i) => (
                        <div key={i} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", marginBottom: "8px", fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div>
<div><strong>{fmt(r.date)}</strong> — {r.provider || "—"}</div>
                          {r.nextFloatDate && <div style={{ marginTop: "4px", color: "var(--muted)" }}>Next float: {fmt(r.nextFloatDate)}</div>}
                          {r.cost != null && r.cost !== "" && <div style={{ marginTop: "4px", fontSize: "13px", color: "var(--muted)" }}>Cost: ${Number(r.cost).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                          </div>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingHorseHealth({ section: "Dental", index: i }); setHorseHealthForm(p => ({ ...p, dentalDate: r.date || "", dentalProvider: r.provider || "", dentalNextFloatDate: r.nextFloatDate || "", dentalCost: r.cost != null && r.cost !== "" ? String(r.cost) : "" })); setShowHorseHealthForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Remove this dental record?")) return; const next = (a.horseDental || []).filter((_, j) => j !== i); const nextTreatments = (a.treatments || []).filter(t => t.id !== r.treatmentId); const updated = { ...a, horseDental: next, treatments: nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || "")) }; setAnimals(prev => prev.map(an => an.id === a.id ? updated : an)); setViewing(updated); if (setExpenses && r.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== r.expenseId)); }}>Delete</Btn>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHorseHealthForm && horseHealthTab === "Dental" && (
                    <Card style={{ padding: "16px 18px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingHorseHealth?.section === "Dental" ? "Edit Dental Visit" : "Add Dental Visit"}</div>
                      <div className="hl-form-grid-3" style={{ marginBottom: "10px" }}>
                        <DateInputWithValidation label="Date" value={horseHealthForm.dentalDate} onValueChange={d => setHorseHealthForm(p => ({ ...p, dentalDate: d, dentalNextFloatDate: addDays(d, 365) || p.dentalNextFloatDate }))} />
                        <Input label="Provider" value={horseHealthForm.dentalProvider} onChange={e => setHorseHealthForm(p => ({ ...p, dentalProvider: e.target.value }))} placeholder="e.g. Equine dentist" />
                        <DateInputWithValidation label="Next float date" value={horseHealthForm.dentalNextFloatDate} onValueChange={v => setHorseHealthForm(p => ({ ...p, dentalNextFloatDate: v }))} style={{ gridColumn: "1 / -1" }} breedingDueTwoDigitYear />
                        <Input label="Cost per visit ($)" type="number" min="0" step="0.01" value={horseHealthForm.dentalCost} onChange={e => setHorseHealthForm(p => ({ ...p, dentalCost: e.target.value }))} placeholder="Optional" />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <Btn size="sm" onClick={() => {
                          const dentalCostNum = horseHealthForm.dentalCost?.trim() ? parseFloat(horseHealthForm.dentalCost) : undefined;
                          const isEdit = editingHorseHealth?.section === "Dental";
                          const existingRec = isEdit ? (a.horseDental || [])[editingHorseHealth.index] : null;
                          const expenseId = (dentalCostNum != null && dentalCostNum > 0) ? (existingRec?.expenseId || "horse-dental-" + Date.now() + "-exp") : undefined;
                          const rec = { date: horseHealthForm.dentalDate?.trim() || undefined, provider: horseHealthForm.dentalProvider?.trim() || undefined, nextFloatDate: horseHealthForm.dentalNextFloatDate?.trim() || undefined, cost: dentalCostNum, expenseId };
                          const treatmentId = isEdit ? existingRec?.treatmentId : "horse-dental-" + Date.now();
                          const desc = "Dental Float" + (rec.provider ? " — " + rec.provider : "");
                          const treatmentEntry = { id: treatmentId, date: rec.date, type: "Other", description: desc, notes: rec.nextFloatDate ? "Next float: " + rec.nextFloatDate : undefined, horseHealthType: "dental", cost: dentalCostNum };
                          const next = isEdit ? (a.horseDental || []).map((r, j) => j === editingHorseHealth.index ? { ...rec, treatmentId: r.treatmentId } : r) : [...(a.horseDental || []), { ...rec, treatmentId }];
                          const nextTreatments = isEdit ? (a.treatments || []).map(t => t.id === treatmentId ? treatmentEntry : t) : [...(a.treatments || []), treatmentEntry];
                          const sortedTreatments = nextTreatments.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                          const updated = { ...a, horseDental: next, treatments: sortedTreatments };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                          if (setExpenses) {
                            if (dentalCostNum != null && dentalCostNum > 0) {
                              const description = `Dental — ${getAnimalName(a)} — ${rec.provider || "Float"}`;
                              const newExp = { id: expenseId, date: rec.date, category: HORSE_HEALTH_EXPENSE_CATEGORY.dental, amount: dentalCostNum, description, animalId: a.id };
                              setExpenses(prev => { const list = prev || []; const idx = list.findIndex(e => e.id === expenseId); if (idx >= 0) return list.map((e, i) => i === idx ? newExp : e); return [...list, newExp]; });
                            } else if (existingRec?.expenseId) setExpenses(prev => (prev || []).filter(e => e.id !== existingRec.expenseId));
                          }
                          setShowHorseHealthForm(false);
                          setEditingHorseHealth(null);
                          setHorseHealthForm(p => ({ ...p, dentalDate: "", dentalProvider: "", dentalNextFloatDate: "", dentalCost: "" }));
                        }}>Save</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => { setShowHorseHealthForm(false); setEditingHorseHealth(null); setHorseHealthForm(p => ({ ...p, dentalDate: "", dentalProvider: "", dentalNextFloatDate: "", dentalCost: "" })); }}>Cancel</Btn>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
            )}

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Cull</div>
              {showCullForm ? (
                <Card style={{ padding: "18px 20px", marginBottom: "0", borderLeft: "3px solid var(--danger2)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{a.cull ? "Edit Cull Flag" : "Mark for Cull"}</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reason</label>
                      <Select value={cullForm.reason} onChange={e => setCullForm(p => ({ ...p, reason: e.target.value }))} style={{ width: "100%" }}>
                        <option value="">— Select reason —</option>
                        {CULL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </Select>
                    </div>
                    <DateInputWithValidation label="Target cull date (optional)" value={cullForm.targetCullDate} onValueChange={v => setCullForm(p => ({ ...p, targetCullDate: v }))} />
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Notes</label>
                    <Textarea value={cullForm.notes} onChange={e => setCullForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." />
                  </div>
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={() => {
                      if (!cullForm.reason) return;
                      const cullRec = { reason: cullForm.reason, notes: (cullForm.notes || "").trim() || undefined, targetCullDate: (cullForm.targetCullDate || "").trim() || undefined };
                      const updated = { ...a, cull: cullRec };
                      setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                      setViewing(updated);
                      setShowCullForm(false);
                      setCullForm({ reason: "", notes: "", targetCullDate: "" });
                    }}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowCullForm(false); setCullForm({ reason: "", notes: "", targetCullDate: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              ) : a.cull ? (
                <div style={{ padding: "16px 18px", borderRadius: "var(--radius)", background: "rgba(180, 60, 60, 0.08)", borderLeft: "4px solid var(--danger2)", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--danger2)", marginBottom: "8px" }}>Marked for cull</div>
                  <div style={{ fontSize: "14px", color: "var(--ink2)", marginBottom: "4px" }}><strong>Reason:</strong> {a.cull.reason || "—"}</div>
                  {a.cull.notes && <div style={{ fontSize: "14px", color: "var(--ink2)", marginBottom: "4px" }}><strong>Notes:</strong> {a.cull.notes}</div>}
                  {a.cull.targetCullDate && <div style={{ fontSize: "14px", color: "var(--ink2)" }}><strong>Target date:</strong> {fmt(a.cull.targetCullDate)}</div>}
                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <Btn size="sm" variant="secondary" onClick={() => { setCullForm({ reason: a.cull.reason || "", notes: a.cull.notes || "", targetCullDate: a.cull.targetCullDate || "" }); setShowCullForm(true); }}>Edit Cull Flag</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => {
                      const updated = { ...a, cull: undefined };
                      setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                      setViewing(updated);
                    }}>Remove Cull Flag</Btn>
                  </div>
                </div>
              ) : (
                <Btn variant="secondary" onClick={() => { setCullForm({ reason: CULL_REASONS[0] || "", notes: "", targetCullDate: "" }); setShowCullForm(true); }}>Mark for Cull</Btn>
              )}
            </div>

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Weight Tracking</div>
                <Btn size="sm" variant="secondary" onClick={() => { setShowWeightForm(true); setWeightForm({ weight: "", date: "", notes: "" }); }}>Add Weight</Btn>
              </div>
              {weightsSorted.length > 0 && (adg !== null || trend !== "flat") && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                  {adg !== null && (
                    <span style={{ fontSize: "14px", color: "var(--ink2)" }}>
                      ADG: <strong>{adg >= 0 ? "+" : ""}{adg.toFixed(3)}</strong> lb/day
                      {firstWeight && lastWeight && <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "6px" }}>({firstWeight.weight} → {lastWeight.weight} lb over {Math.round(daysBetween)} days)</span>}
                    </span>
                  )}
                  <span style={{ fontSize: "18px", color: trend === "up" ? "var(--green)" : trend === "down" ? "var(--danger2)" : "var(--muted)" }} title={trend === "up" ? "Gaining" : trend === "down" ? "Losing" : "Stable"}>
                    {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                  </span>
                </div>
              )}
              {showWeightForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Add Weight</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Weight (lbs)" type="number" min="0" step="0.1" value={weightForm.weight} onChange={e => setWeightForm(p => ({ ...p, weight: e.target.value }))} placeholder="e.g. 850" />
                    <DateInputWithValidation label="Date" value={weightForm.date} onValueChange={v => setWeightForm(p => ({ ...p, date: v }))} />
                    <Input label="Notes" value={weightForm.notes} onChange={e => setWeightForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveWeight}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowWeightForm(false); setWeightForm({ weight: "", date: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {weightsSorted.length === 0 && !showWeightForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No weight records yet.</p>
              )}
              {weightsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                  {weightsSorted.map(entry => (
                    <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--cream2)", background: "var(--cream)" }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "15px" }}>{entry.weight} lb</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "10px" }}>{fmt(entry.date)}</span>
                        {entry.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "2px" }}>{entry.notes}</div>}
                      </div>
                      <Btn size="sm" variant="ghost" onClick={() => deleteWeightEntry(entry.id)}>×</Btn>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(getAgeInMonths(a.dob) == null || getAgeInMonths(a.dob) < 12) && (
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Weaning</div>
              {a.weaningDate ? (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--green3)", fontSize: "14px" }}>
                  Weaned on {fmt(a.weaningDate)}
                </div>
              ) : (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>Suggested weaning date (from DOB + species default). Adjust if needed.</div>
                  <DateInputWithValidation
                    label="Target weaning date"
                    value={a.targetWeaningDate || getCalculatedWeaningDate(a) || ""}
                    onValueChange={v => {
                      const updated = { ...a, targetWeaningDate: v.trim() || undefined };
                      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
                      setViewing(updated);
                    }}
                  />
                </div>
              )}
            </div>
            )}

            {a.species === "Cattle" && !a.deceased && !a.sale && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Feeder Program</div>
                {(() => {
                  const fp = (feederPrograms || []).find(f => f.animalId === a.id);
                  if (!fp) {
                    return setTab && setFeederPreselectAnimalId ? (
                      <Btn variant="secondary" onClick={() => { setTab("feeder"); setFeederPreselectAnimalId(a.id); }}>Add to Feeder Program</Btn>
                    ) : (
                      <p style={{ fontSize: "13px", color: "var(--muted)" }}>Add this animal from the Feeder Program tab.</p>
                    );
                  }
                  const daysOnFeed = feederDaysOnFeed(fp.startDate);
                  const totalFeedConsumed = daysOnFeed * (fp.dailyFeedLbs ?? 0);
                  const costToDate = totalFeedConsumed * (fp.costPerLb ?? 0);
                  const estWeight = estimatedWeightFromADG(a, fp.startDate);
                  const currentWeight = estWeight ?? (() => { const w = getLatestWeightForAnimal(animals, a.id); return w ? parseFloat(w) : null; })() ?? fp.startingWeight;
                  const targetWeight = fp.targetWeight ?? (currentWeight != null ? currentWeight + 200 : null);
                  const adg = (fp.adg != null && fp.adg > 0) ? fp.adg : getADGDefault(a.species);
                  const lbsToGo = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : 0;
                  const estimatedDaysToFinish = (lbsToGo > 0 && adg > 0) ? Math.max(0, Math.ceil(lbsToGo / adg)) : null;
                  const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
                  const daysRemaining = estimatedDaysToFinish != null ? Math.max(0, estimatedDaysToFinish - daysOnFeed) : null;
                  const progressPct = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? Math.min(100, (daysOnFeed / estimatedDaysToFinish) * 100) : 0;
                  return (
                    <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", marginBottom: "12px" }}>
                        <span style={{ color: "var(--muted)" }}>Days on feed</span>
                        <span style={{ fontWeight: 600 }}>{daysOnFeed}</span>
                        {estimatedDaysToFinish != null && (
                          <>
                            <span style={{ color: "var(--muted)" }}>Est. days to finish</span>
                            <span style={{ fontWeight: 600 }}>{estimatedDaysToFinish} · {estimatedFinishDate ? fmt(estimatedFinishDate) : ""}</span>
                          </>
                        )}
                        <span style={{ color: "var(--muted)" }}>Est. weight</span>
                        <span style={{ fontWeight: 600 }}>{estWeight != null ? `${Math.round(estWeight)} lb` : (fp.startingWeight != null ? `${fp.startingWeight} lb (start)` : "—")}</span>
                        <span style={{ color: "var(--muted)" }}>Feed consumed</span>
                        <span style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 1 })} lb</span>
                        <span style={{ color: "var(--muted)" }}>Feed cost to date</span>
                        <span style={{ fontWeight: 600 }}>${costToDate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        <span style={{ color: "var(--muted)" }}>Feed type</span>
                        <span style={{ fontWeight: 600 }}>{fp.feedType || "—"}</span>
                      </div>
                      {estimatedDaysToFinish != null && estimatedDaysToFinish > 0 && (
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Progress · {daysOnFeed} of ~{estimatedDaysToFinish} days</div>
                          <div style={{ height: "6px", background: "var(--cream2)", borderRadius: "3px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--brass)", borderRadius: "3px", transition: "width 0.2s" }} />
                          </div>
                        </div>
                      )}
                      {setTab && <Btn size="sm" variant="secondary" onClick={() => setTab("feeder")} style={{ width: "100%" }}>Open Feeder Program</Btn>}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{a.species === "Horse" ? "Health Timeline" : "Health & Treatment Log"}</div>
                <Btn size="sm" variant="secondary" onClick={() => { setEditingTreatmentId(null); setShowTreatmentForm(true); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Add Treatment</Btn>
              </div>
              {a.species === "Horse" && horseUpcomingItems.length > 0 && (
                <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "var(--radius)", background: "linear-gradient(135deg, var(--cream) 0%, rgba(201,149,42,0.08) 100%)", borderLeft: "4px solid var(--brass)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Upcoming</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {horseUpcomingItems.map((item, i) => {
                      const isEditingDate = editingUpcomingKey === item.key;
                      const updateUpcomingDate = (newDate) => {
                        const src = item.source;
                        if (src.type === "vaccination" && src.vaccinationId) {
                          const nextVacc = (a.vaccinations || []).map(v => v.id === src.vaccinationId ? { ...v, nextDueDate: newDate } : v);
                          const updated = { ...a, vaccinations: nextVacc };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                        } else if (src.index != null && ["farrier", "worming", "dental", "vet"].includes(src.type)) {
                          const arr = a["horse" + (src.type === "farrier" ? "Farrier" : src.type === "worming" ? "Worming" : src.type === "dental" ? "Dental" : "VetWork")] || [];
                          const field = src.type === "farrier" || src.type === "vet" ? "nextAppointment" : src.type === "worming" ? "nextWormingDate" : "nextFloatDate";
                          const next = arr.map((r, j) => j === src.index ? { ...r, [field]: newDate } : r);
                          const updated = { ...a, ["horse" + (src.type === "farrier" ? "Farrier" : src.type === "worming" ? "Worming" : src.type === "dental" ? "Dental" : "VetWork")]: next };
                          setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                          setViewing(updated);
                        }
                        setEditingUpcomingKey(null);
                      };
                      return (
                        <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px" }}>
                          <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: HORSE_HEALTH_COLORS[item.type] || HORSE_HEALTH_COLORS.default, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{item.type === "vet" ? "V" : item.type === "farrier" ? "F" : item.type === "worming" ? "W" : item.type === "dental" ? "D" : item.type === "vaccination" ? "●" : "•"}</span>
                          <span style={{ fontWeight: 600, color: "var(--ink2)" }}>{item.label}</span>
                          {isEditingDate ? (
                            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                                <input type="date" value={item.date || ""} onChange={e => updateUpcomingDate(fixBreedingDueTwoDigitYear(e.target.value))} onBlur={() => setEditingUpcomingKey(null)} autoFocus style={{ fontSize: "13px", padding: "4px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius)" }} />
                                {String(item.date || "").trim() && !isValidDate(item.date) && (
                                  <span style={{ fontSize: "11px", color: "#c0392b", maxWidth: "200px", textAlign: "right" }}>{DATE_WARN_INVALID}</span>
                                )}
                              </span>
                              <Btn size="sm" variant="ghost" onClick={() => setEditingUpcomingKey(null)}>Done</Btn>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setEditingUpcomingKey(item.key)} style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "14px", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: "var(--radius)" }} title="Change date">{fmt(item.date)}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {a.species === "Horse" && (a.horseSupplements || []).length > 0 && (
                <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "var(--radius)", background: "rgba(202,138,4,0.12)", borderLeft: "4px solid #ca8a04" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Ongoing supplements</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {(a.horseSupplements || []).map((s, i) => (
                      <span key={i} style={{ fontSize: "13px", color: "var(--ink2)", display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <strong>{s.name || "—"}</strong>{s.dosage ? ` · ${s.dosage}` : ""}{s.cost != null && s.cost !== "" ? ` · $${Number(s.cost).toFixed(2)}` : ""}
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", padding: "2px 6px", borderRadius: "var(--radius)", background: "rgba(0,0,0,0.06)" }}>{s.frequency || "Daily"}</span>
                        {s.date && <span style={{ fontSize: "12px", color: "var(--muted)" }}>Started {fmt(s.date)}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {showTreatmentForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingTreatmentId ? "Edit Treatment" : "Add Treatment"}</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <DateInputWithValidation label="Date *" value={treatmentForm.date} onValueChange={v => setTreatmentForm(p => ({ ...p, date: v }))} />
                    <Select label="Type *" value={treatmentForm.type} onChange={e => setTreatmentForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="">— Select —</option>
                      {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                    <Input label="Description" value={treatmentForm.description} onChange={e => setTreatmentForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Lameness, respiratory" />
                    <Input label="Treatment given" value={treatmentForm.treatmentGiven} onChange={e => setTreatmentForm(p => ({ ...p, treatmentGiven: e.target.value }))} placeholder="e.g. Penicillin, bandage" />
                    <Input label="Dosage" value={treatmentForm.dosage} onChange={e => setTreatmentForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 5 ml" />
                    <Select label="Administered by" value={treatmentForm.administeredBy} onChange={e => setTreatmentForm(p => ({ ...p, administeredBy: e.target.value }))}>
                      <option>Owner</option>
                      <option>Vet</option>
                    </Select>
                    <Input label="Cost" type="number" min="0" step="0.01" value={treatmentForm.cost} onChange={e => setTreatmentForm(p => ({ ...p, cost: e.target.value }))} placeholder="Optional" />
                  </div>
                  <Textarea label="Notes" value={treatmentForm.notes} onChange={e => setTreatmentForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes" style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveTreatment}>{editingTreatmentId ? "Save Changes" : "Save"}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowTreatmentForm(false); setEditingTreatmentId(null); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {a.species === "Horse" ? (
                <>
                  {horseHealthTimelineItems.length === 0 && !showTreatmentForm && (a.horseSupplements || []).length === 0 && (
                    <p style={{ fontSize: "13px", color: "var(--muted)" }}>No health records yet. Add vet, farrier, worming, or dental entries in Horse Health, or add a treatment or vaccination below.</p>
                  )}
                  {horseHealthTimelineItems.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                      {horseHealthTimelineItems.map(item => {
                        const isVacc = item.source === "vaccination";
                        const horseType = item.horseType || (isVacc ? "vaccination" : "default");
                        const color = HORSE_HEALTH_COLORS[horseType] || HORSE_HEALTH_COLORS.default;
                        const icon = horseType === "vet" ? "V" : horseType === "farrier" ? "F" : horseType === "worming" ? "W" : horseType === "dental" ? "D" : horseType === "vaccination" ? "●" : "•";
                        return (
                          <div key={item.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--cream2)", background: "var(--cream)", marginBottom: "1px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                            <span style={{ width: "28px", height: "28px", borderRadius: "50%", background: color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isVacc ? (
                                <>
                                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.vaccineName || "Vaccination"}</span>
                                  <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{fmt(item.dateGiven)}</span>
                                  {item.nextDueDate && <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}> · Booster: {fmt(item.nextDueDate)}</span>}
                                </>
                              ) : (
                                <>
                                  <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.horseType && item.description ? item.description : item.type}</span>
                                  <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{fmt(item.date)}</span>
                                  {!item.horseType && item.administeredBy && <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}> · {item.administeredBy}</span>}
                                  {item.horseType && item.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "4px" }}>{item.notes}</div>}
                                  {item.horseType === "vet" && item.treatmentGiven && <div style={{ fontSize: "13px", marginTop: "2px" }}>Vet: {item.treatmentGiven}</div>}
                                  {!item.horseType && item.description && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "4px" }}>{item.description}</div>}
                                  {!item.horseType && item.treatmentGiven && <div style={{ fontSize: "13px", marginTop: "2px" }}><strong>Treatment:</strong> {item.treatmentGiven}{item.dosage ? ` — ${item.dosage}` : ""}</div>}
                                  {(item.cost != null && item.cost !== "") && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>Cost: {`$${Number(item.cost).toFixed(2)}`}</div>}
                                  {!item.horseType && item.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "4px" }}>{item.notes}</div>}
                                </>
                              )}
                            </div>
                            </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {treatmentsSorted.length === 0 && !showTreatmentForm && (
                    <p style={{ fontSize: "13px", color: "var(--muted)" }}>No treatment records yet.</p>
                  )}
                  {treatmentsSorted.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                      {treatmentsSorted.map(entry => (
                        <div key={entry.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--cream2)", background: "var(--cream)", marginBottom: "1px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                            <div>
                              <span style={{ fontWeight: 600, fontSize: "14px" }}>{entry.type}</span>
                              <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{fmt(entry.date)}</span>
                              {entry.administeredBy && <span style={{ fontSize: "12px", color: "var(--muted)", marginLeft: "6px" }}> · {entry.administeredBy}</span>}
                              {entry.description && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "4px" }}>{entry.description}</div>}
                              {entry.treatmentGiven && <div style={{ fontSize: "13px", marginTop: "2px" }}><strong>Treatment:</strong> {entry.treatmentGiven}{entry.dosage ? ` — ${entry.dosage}` : ""}</div>}
                              {(entry.cost != null && entry.cost !== "") && <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>Cost: {`$${Number(entry.cost).toFixed(2)}`}</div>}
                              {entry.notes && <div style={{ fontSize: "12px", color: "var(--ink2)", marginTop: "4px" }}>{entry.notes}</div>}
                            </div>
                            <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                              <Btn size="sm" variant="ghost" onClick={() => { setEditingTreatmentId(entry.id); setTreatmentForm({ date: entry.date || "", type: entry.type || "", description: entry.description || "", treatmentGiven: entry.treatmentGiven || "", dosage: entry.dosage || "", administeredBy: entry.administeredBy || "Owner", cost: entry.cost != null && entry.cost !== "" ? String(entry.cost) : "", notes: entry.notes || "" }); setShowTreatmentForm(true); }}>Edit</Btn>
                              <Btn size="sm" variant="ghost" onClick={() => deleteTreatmentEntry(entry.id)}>×</Btn>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Documents</div>
                <Btn size="sm" variant="secondary" onClick={() => { setEditingDocumentId(null); setDocumentForm({ documentType: a.species === "Horse" ? "Coggins Test" : "Health Certificate", documentName: "", dateIssued: "", expirationDate: "", issuingAuthority: "", notes: "" }); setDocumentFormFile(null); setShowDocumentForm(true); documentFileInputRef.current?.value && (documentFileInputRef.current.value = ""); }}>Upload Document</Btn>
              </div>
              {showDocumentForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>{editingDocumentId ? "Edit Document" : "Upload Document"}</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Select label="Document type *" value={documentForm.documentType} onChange={e => setDocumentForm(p => ({ ...p, documentType: e.target.value }))}>
                      {(a.species === "Horse" ? HORSE_DOCUMENT_TYPES : GENERAL_DOCUMENT_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                    <Input label="Document name" value={documentForm.documentName} onChange={e => setDocumentForm(p => ({ ...p, documentName: e.target.value }))} placeholder="e.g. Coggins 2024 (optional)" />
                    <DateInputWithValidation label="Date issued" value={documentForm.dateIssued} onValueChange={v => setDocumentForm(p => ({ ...p, dateIssued: v }))} placeholder="Optional" />
                    <DateInputWithValidation label="Expiration date" value={documentForm.expirationDate} onValueChange={v => setDocumentForm(p => ({ ...p, expirationDate: v }))} placeholder="Optional" />
                    <Input label="Issuing authority / Vet name" value={documentForm.issuingAuthority} onChange={e => setDocumentForm(p => ({ ...p, issuingAuthority: e.target.value }))} placeholder="Optional" />
                  </div>
                  <Textarea label="Notes" value={documentForm.notes} onChange={e => setDocumentForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes" style={{ marginBottom: "12px" }} />
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>File (image or PDF) *</label>
                    <input
                      ref={documentFileInputRef}
                      type="file"
                      accept="image/*,.pdf,application/pdf"
                      style={{ fontSize: "13px" }}
                      onChange={e => { const f = e.target.files?.[0]; setDocumentFormFile(f || null); }}
                    />
                    {editingDocumentId && !documentFormFile && (
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Leave empty to keep current file.</div>
                    )}
                  </div>
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" disabled={documentUploading || (!documentFormFile && !editingDocumentId)} onClick={async () => {
                      if (documentUploading) return;
                      const docId = editingDocumentId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
                      const docs = (a.documents || []).filter(d => d.id !== docId);
                      let storagePath = null;
                      let fileName = null;
                      let mimeType = null;
                      let fileData = null;
                      const existing = (a.documents || []).find(d => d.id === docId);
                      if (documentFormFile) {
                        setDocumentUploading(true);
                        try {
                          if (user) {
                            const ext = documentFormFile.name.split(".").pop()?.toLowerCase() || "bin";
                            const path = `${a.id}/${docId}.${ext}`;
                            const { error } = await supabase.storage.from(ANIMAL_DOCUMENTS_BUCKET).upload(path, documentFormFile, { contentType: documentFormFile.type || "application/octet-stream", upsert: true });
                            if (error) throw new Error(error.message);
                            storagePath = path;
                            fileName = documentFormFile.name;
                            mimeType = documentFormFile.type || "";
                          } else {
                            const reader = new FileReader();
                            await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(documentFormFile); });
                            fileData = reader.result;
                            fileName = documentFormFile.name;
                            mimeType = documentFormFile.type || "";
                          }
                        } catch (err) {
                          alert(err?.message || "Upload failed");
                          setDocumentUploading(false);
                          return;
                        }
                        setDocumentUploading(false);
                      } else if (existing?.storagePath) {
                        storagePath = existing.storagePath;
                        fileName = existing.fileName || "";
                        mimeType = existing.mimeType || "";
                      } else if (existing?.fileData) {
                        fileData = existing.fileData;
                        fileName = existing.fileName || "";
                        mimeType = existing.mimeType || "";
                      } else if (!editingDocumentId) {
                        alert("Please select a file to upload.");
                        return;
                      }
                      const newDoc = {
                        id: docId,
                        documentType: documentForm.documentType,
                        documentName: (documentForm.documentName || "").trim() || undefined,
                        dateIssued: documentForm.dateIssued?.trim() || undefined,
                        expirationDate: documentForm.expirationDate?.trim() || undefined,
                        issuingAuthority: documentForm.issuingAuthority?.trim() || undefined,
                        notes: documentForm.notes?.trim() || undefined,
                        storagePath: storagePath || undefined,
                        fileName: fileName || undefined,
                        mimeType: mimeType || undefined,
                        fileData: fileData || undefined,
                      };
                      const updated = { ...a, documents: [...docs, newDoc] };
                      setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                      setViewing(updated);
                      setShowDocumentForm(false);
                      setEditingDocumentId(null);
                      setDocumentForm({ documentType: a.species === "Horse" ? "Coggins Test" : "Health Certificate", documentName: "", dateIssued: "", expirationDate: "", issuingAuthority: "", notes: "" });
                      setDocumentFormFile(null);
                      documentFileInputRef.current && (documentFileInputRef.current.value = "");
                    }}>{documentUploading ? "Uploading…" : (editingDocumentId ? "Save Changes" : "Save")}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowDocumentForm(false); setEditingDocumentId(null); setDocumentForm({ documentType: a.species === "Horse" ? "Coggins Test" : "Health Certificate", documentName: "", dateIssued: "", expirationDate: "", issuingAuthority: "", notes: "" }); setDocumentFormFile(null); documentFileInputRef.current?.value && (documentFileInputRef.current.value = ""); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {(a.documents || []).length === 0 && !showDocumentForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No documents yet. Upload registration papers, Coggins, health certificates, and more.</p>
              )}
              {(a.documents || []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                  {(a.documents || []).map(doc => {
                    const today = new Date().toISOString().split("T")[0];
                    const isExpired = doc.expirationDate && doc.expirationDate < today;
                    const expiringSoon = doc.expirationDate && !isExpired && (() => { const d = new Date(doc.expirationDate); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0] <= today; })();
                    return (
                      <div key={doc.id} style={{ padding: "14px", borderRadius: "var(--radius)", background: "var(--cream)", border: "1px solid var(--cream3)", cursor: "pointer" }} onClick={() => setDocumentPreview(doc)}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
                          <Badge color="var(--green)" style={{ fontSize: "11px" }}>{doc.documentType}</Badge>
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingDocumentId(doc.id); setDocumentForm({ documentType: doc.documentType, documentName: doc.documentName || "", dateIssued: doc.dateIssued || "", expirationDate: doc.expirationDate || "", issuingAuthority: doc.issuingAuthority || "", notes: doc.notes || "" }); setDocumentFormFile(null); setShowDocumentForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setDocumentDeleteConfirmId(doc.id); }}>Delete</Btn>
                          </div>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink2)", marginBottom: "4px" }}>{doc.documentName || "Untitled"}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>Issued: {doc.dateIssued ? fmt(doc.dateIssued) : "—"}</div>
                        {doc.expirationDate && (
                          <div style={{ marginTop: "4px" }}>
                            {isExpired && <Badge color="#c0392b" style={{ background: "#c0392b", color: "#fff", fontSize: "11px" }}>Expired {fmt(doc.expirationDate)}</Badge>}
                            {expiringSoon && !isExpired && <Badge color="#ca8a04" style={{ background: "#ca8a04", color: "#fff", fontSize: "11px" }}>Expires {fmt(doc.expirationDate)}</Badge>}
                            {!isExpired && !expiringSoon && <span style={{ fontSize: "12px", color: "var(--muted)" }}>Expires {fmt(doc.expirationDate)}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {documentDeleteConfirmId && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setDocumentDeleteConfirmId(null)}>
                  <div style={{ background: "#fff", padding: "24px", borderRadius: "var(--radius)", maxWidth: "360px", boxShadow: "var(--shadow)" }} onClick={e => e.stopPropagation()}>
                    <p style={{ marginBottom: "16px", fontSize: "15px" }}>Delete this document? This cannot be undone.</p>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <Btn size="sm" variant="danger" onClick={async () => {
                        const doc = (a.documents || []).find(d => d.id === documentDeleteConfirmId);
                        if (doc?.storagePath && user) {
                          try { await supabase.storage.from(ANIMAL_DOCUMENTS_BUCKET).remove([doc.storagePath]); } catch (_) {}
                        }
                        const updated = { ...a, documents: (a.documents || []).filter(d => d.id !== documentDeleteConfirmId) };
                        setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                        setViewing(updated);
                        setDocumentDeleteConfirmId(null);
                      }}>Delete</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setDocumentDeleteConfirmId(null)}>Cancel</Btn>
                    </div>
                  </div>
                </div>
              )}
              {documentPreview && (() => {
                const previewUrl = documentPreview.storagePath
                  ? supabase.storage.from(ANIMAL_DOCUMENTS_BUCKET).getPublicUrl(documentPreview.storagePath).data.publicUrl
                  : (documentPreview.fileData || null);
                const previewMime = documentPreview.mimeType || "image/jpeg";
                const previewName = documentPreview.documentName || "Document";
                return (
                  <div key="doc-preview-modal" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1001 }} onClick={() => setDocumentPreview(null)}>
                    <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", maxWidth: "95vw", marginBottom: "8px" }} onClick={e => e.stopPropagation()}>
                      <Btn size="sm" variant="ghost" onClick={() => setDocumentPreview(null)} style={{ color: "#fff" }}>Close</Btn>
                    </div>
                    <div style={{ maxWidth: "95vw", maxHeight: "85vh", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                      {previewUrl ? (
                        previewMime === "application/pdf" ? (
                          <iframe src={previewUrl} title={previewName} style={{ width: "90vw", height: "80vh", border: "none", background: "#fff" }} />
                        ) : (
                          <img src={previewUrl} alt={previewName} style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain" }} />
                        )
                      ) : (
                        <p style={{ color: "#fff", fontSize: "16px" }}>Unable to load preview.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Lineage</div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {!showLineageForm && (
                  <Btn size="sm" variant="ghost" onClick={() => {
                    setLineageForm({
                      damInHerd: !!(a.damId || a.motherId),
                      motherId: (a.damId || a.motherId) || "",
                      motherName: ((a.damName || a.motherName) || "").trim(),
                      sireInHerd: !!a.sireId,
                      sireId: a.sireId || "",
                      sireName: (a.sireName || "").trim(),
                    });
                    setShowLineageForm(true);
                  }}>Edit Lineage</Btn>
                )}
                </div>
              </div>
              {showLineageForm ? (
                <Card style={{ padding: "24px", borderLeft: "4px solid var(--brass)", marginBottom: "16px" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Edit Lineage</div>
                  {(() => {
                    const femalesForDam = (animals || []).filter(an => isFemale(an) && an.id !== a.id);
                    const malesForSire = (animals || []).filter(an => isMale(an) && an.id !== a.id);
                    const saveLineage = () => {
                      const damId = lineageForm.damInHerd ? (lineageForm.motherId || undefined) : undefined;
                      const damName = lineageForm.damInHerd && damId
                        ? getAnimalName((animals || []).find(x => x.id === damId))
                        : (!lineageForm.damInHerd ? (lineageForm.motherName?.trim() || "Unknown") : undefined);
                      const sireIdVal = lineageForm.sireInHerd ? (lineageForm.sireId || undefined) : undefined;
                      const sireNameVal = lineageForm.sireInHerd && sireIdVal
                        ? getAnimalName((animals || []).find(x => x.id === sireIdVal))
                        : (!lineageForm.sireInHerd ? (lineageForm.sireName?.trim() || "Unknown") : undefined);
                      const updated = {
                        ...a,
                        motherId: damId,
                        motherName: damName,
                        damId,
                        damName,
                        sireId: sireIdVal,
                        sireName: sireNameVal,
                      };
                      setAnimals(prev => prev.map(x => x.id === a.id ? updated : x));
                      setViewing(updated);
                      setShowLineageForm(false);
                    };
                    return (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer", fontSize: "14px" }}>
                          <input type="checkbox" checked={!lineageForm.damInHerd} onChange={e => setLineageForm(p => ({ ...p, damInHerd: !e.target.checked, motherId: e.target.checked ? "" : p.motherId, motherName: e.target.checked ? (p.motherName || "Unknown") : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Dam not in my herd</span>
                        </label>
                        {lineageForm.damInHerd ? (
                          <div style={{ marginBottom: "14px" }}>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Dam</label>
                            <Select value={lineageForm.motherId} onChange={e => setLineageForm(p => ({ ...p, motherId: e.target.value }))} style={{ width: "100%", maxWidth: "320px" }}>
                              <option value="">— Unknown —</option>
                              {femalesForDam.map(m => (
                                <option key={m.id} value={m.id}>{getAnimalName(m)}{m.tag ? ` #${m.tag}` : ""} ({m.species})</option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <div style={{ marginBottom: "14px" }}>
                            <Input label="Dam name" value={lineageForm.motherName} onChange={e => setLineageForm(p => ({ ...p, motherName: e.target.value }))} placeholder="Unknown or type name" />
                          </div>
                        )}
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", cursor: "pointer", fontSize: "14px" }}>
                          <input type="checkbox" checked={!lineageForm.sireInHerd} onChange={e => setLineageForm(p => ({ ...p, sireInHerd: !e.target.checked, sireId: e.target.checked ? "" : p.sireId, sireName: e.target.checked ? (p.sireName || "Unknown") : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Sire not in my herd</span>
                        </label>
                        {lineageForm.sireInHerd ? (
                          <div style={{ marginBottom: "14px" }}>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Sire</label>
                            <Select value={lineageForm.sireId} onChange={e => setLineageForm(p => ({ ...p, sireId: e.target.value }))} style={{ width: "100%", maxWidth: "320px" }}>
                              <option value="">— Unknown —</option>
                              {malesForSire.map(s => (
                                <option key={s.id} value={s.id}>{getAnimalName(s)}{s.tag ? ` #${s.tag}` : ""} ({s.species})</option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <div style={{ marginBottom: "14px" }}>
                            <Input label="Sire name" value={lineageForm.sireName} onChange={e => setLineageForm(p => ({ ...p, sireName: e.target.value }))} placeholder="Unknown or type name" />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={saveLineage}>Save</Btn>
                          <Btn variant="secondary" onClick={() => setShowLineageForm(false)}>Cancel</Btn>
                        </div>
                      </>
                    );
                  })()}
                </Card>
              ) : (
                <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--ink2)" }}>
                    <div>
                      <span style={{ color: "var(--muted)", marginRight: "6px" }}>Dam:</span>
                      {(a.damId || a.motherId) ? (() => {
                        const damId = a.damId || a.motherId;
                        const mother = animals.find(m => m.id === damId);
                        return mother ? (
                          <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}{mother.tag ? ` (#${mother.tag})` : ""}</button>
                        ) : (
                          <span>{(a.damName || a.motherName) || "Unknown"}</span>
                        );
                      })() : (
                        <span>{(a.damName || a.motherName) || "Unknown"}</span>
                      )}
                    </div>
                    <div style={{ marginTop: "6px" }}>
                      <span style={{ color: "var(--muted)", marginRight: "6px" }}>Sire:</span>
                      {a.sireId ? (() => {
                        const sire = animals.find(s => s.id === a.sireId);
                        return sire ? (
                          <button type="button" onClick={() => setViewing(sire)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(sire)}{sire.tag ? ` (#${sire.tag})` : ""}</button>
                        ) : (
                          <span>{a.sireName || "Unknown"}</span>
                        );
                      })() : (
                        <span>{a.sireName || "Unknown"}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {(() => {
              const asDam = (animals || []).filter(an => (an.damId || an.motherId) === a.id);
              const asSire = (animals || []).filter(an => an.sireId === a.id);
              const offspringList = [...asDam.map(an => ({ ...an, _role: "dam" })), ...asSire.map(an => ({ ...an, _role: "sire" }))];
              if (offspringList.length === 0) return null;
              return (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Offspring</div>
                  <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px" }}>
                      {offspringList.map(an => (
                        <div key={an.id} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <button type="button" onClick={() => setViewing(an)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(an)}{an.tag ? ` (#${an.tag})` : ""}</button>
                          <span style={{ color: "var(--muted)" }}>·</span>
                          <span>{an.species || "—"}</span>
                          {an.dob && <><span style={{ color: "var(--muted)" }}>·</span><span>Born {fmt(an.dob)}</span></>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
            {a.notes && (
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Notes</div>
                <p style={{ fontSize: "14px", lineHeight: 1.7, color: "var(--ink2)" }}>{a.notes}</p>
              </div>
            )}

            {PASTURE_SPECIES.includes(a.species) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                  Current Pasture
                </div>
                {!showMoveForm ? (
                  (a.movements?.[0]?.pastureName ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "15px", color: "var(--ink2)" }}>{a.movements[0].pastureName}</span>
                      <Btn size="sm" variant="secondary" onClick={() => setShowMoveForm(true)}>Move Animal</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => { const removed = (a.movements || [])[0]; const next = (a.movements || []).slice(1); const updated = { ...a, movements: next }; if (removed?.movementId && setNotes) setNotes(prev => prev.filter(n => n.movementId !== removed.movementId)); setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an))); setViewing(updated); }} style={{ color: "var(--muted)" }}>Remove from Pasture</Btn>
                    </div>
                  ) : (
                    <Btn size="sm" onClick={() => setShowMoveForm(true)} style={{ background: "var(--green3)", color: "var(--green)" }}>Assign to Pasture</Btn>
                  ))
                ) : (
                  <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--green3)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Move Animal</div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <PastureCombo label="Pasture name" value={moveForm.pastureName} onChange={v => setMoveForm(p => ({ ...p, pastureName: v }))} options={getCanonicalPastureNames(animals, pastures)} placeholder="Select or type new pasture" id="pasture-list-profile" />
                      <DateInputWithValidation label="Move date" value={moveForm.dateMovedIn} onValueChange={v => setMoveForm(p => ({ ...p, dateMovedIn: v }))} />
                    </div>
                    <Textarea label="Notes (e.g. reason for move)" value={moveForm.notes} onChange={e => setMoveForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="e.g. Rotating to fresh grass, weaning" />
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                      <Btn size="sm" onClick={saveMove}>Save Move</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => { setShowMoveForm(false); setMoveForm({ pastureName: "", dateMovedIn: "", notes: "" }); }}>Cancel</Btn>
                    </div>
                  </Card>
                )}
                {(a.movements?.length ?? 0) > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "8px" }}>Movement history</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                      {a.movements.map((m, i) => (
                        <div key={m.movementId || i} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 0", borderBottom: i < a.movements.length - 1 ? "1px solid var(--cream2)" : "none" }}>
                          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--green3)", flexShrink: 0, marginTop: "6px" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>{m.pastureName || "—"}</div>
                            <div style={{ fontSize: "12px", color: "var(--muted)" }}>Moved in {m.dateMovedIn ? fmt(m.dateMovedIn) : "—"}</div>
                            {m.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "4px" }}>{m.notes}</div>}
                          </div>
                          <Btn size="sm" variant="ghost" onClick={() => { if (!confirm("Delete this movement record? The related journal entry will also be removed.")) return; const next = a.movements.filter((_, j) => j !== i); const updated = { ...a, movements: next }; if (m.movementId && setNotes) setNotes(prev => prev.filter(n => n.movementId !== m.movementId)); setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an))); setViewing(updated); }} style={{ color: "var(--muted)", flexShrink: 0 }} title="Delete movement and journal entry">×</Btn>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isMale(a) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                    Castration Record
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const existing = a.castration || {};
                      setShowCastrationForm(true);
                      setCastrationForm({
                        date: existing.date || "",
                        method: existing.method || "Banding",
                        performer: existing.performer || "Owner",
                        notes: existing.notes || "",
                      });
                    }}
                  >
                    Log Castration
                  </Btn>
                </div>

                {!a.castration && !showCastrationForm && (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No castration recorded for this animal.</p>
                )}

                {a.castration && (
                  <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)", marginBottom: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {a.castration.date ? <>Performed {fmt(a.castration.date)}</> : "Date not recorded"}
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setCastrationForm({ date: a.castration.date || "", method: a.castration.method || "Banding", performer: a.castration.performer || "Owner", notes: a.castration.notes || "" }); setShowCastrationForm(true); }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={deleteCastration}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                      {a.castration.method && <div><strong>Method:</strong> {a.castration.method}</div>}
                      {a.castration.performer && <div><strong>Performed by:</strong> {a.castration.performer}</div>}
                      {a.castration.notes && (
                        <div style={{ marginTop: "4px" }}>
                          <strong>Notes:</strong> {a.castration.notes}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {showCastrationForm && (
                  <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      {a.castration ? "Edit Castration" : "Log Castration"}
                    </div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                      <DateInputWithValidation
                        label="Date performed"
                        value={castrationForm.date}
                        onValueChange={v => setCastrationForm(p => ({ ...p, date: v }))}
                      />
                      <Select
                        label="Method"
                        value={castrationForm.method}
                        onChange={e => setCastrationForm(p => ({ ...p, method: e.target.value }))}
                      >
                        <option>Banding</option>
                        <option>Surgical</option>
                        <option>Burdizzo</option>
                      </Select>
                      <Select
                        label="Performed by"
                        value={castrationForm.performer}
                        onChange={e => setCastrationForm(p => ({ ...p, performer: e.target.value }))}
                      >
                        <option>Owner</option>
                        <option>Vet</option>
                      </Select>
                    </div>
                    <Textarea
                      label="Notes"
                      value={castrationForm.notes}
                      onChange={e => setCastrationForm(p => ({ ...p, notes: e.target.value }))}
                      rows={3}
                    />
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <Btn size="sm" onClick={saveCastration}>Save Record</Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowCastrationForm(false);
                          setCastrationForm({
                            date: "",
                            method: "Banding",
                            performer: "Owner",
                            notes: "",
                          });
                        }}
                      >
                        Cancel
                      </Btn>
                    </div>
                  </Card>
                )}
              </div>
            )}
            {isFemale(a) && (
              <div className="hl-profile-section" style={{ marginTop: "24px" }}>
                {a.species !== "Mule" && (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>
                      Breeding
                    </div>
                    {(() => {
                      const activeBreedings = (gestations || []).filter(g => g.animalId === a.id && g.status !== "Delivered");
                      return activeBreedings.length > 0 ? (
                        <div style={{ marginBottom: "16px" }}>
                          {activeBreedings.map(g => {
                            const sireAnimal = g.sireAnimalId ? animals.find(m => m.id === g.sireAnimalId) : null;
                            const sireLabel = g.sire || (sireAnimal ? getAnimalName(sireAnimal) : null) || "Unknown";
                            const totalDays = g.gestationDays ?? SPECIES[a.species]?.days ?? 283;
                            const prog = progress(breedingDateForProgress(g), totalDays);
                            const dueStr = g.dueDateStart && g.dueDateEnd ? `${fmt(g.dueDateStart)} – ${fmt(g.dueDateEnd)}` : fmt(g.dueDate);
                            return (
                              <div key={g.id} style={{ padding: "14px 16px", background: "rgba(201,149,42,0.12)", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)", marginBottom: "8px" }}>
                                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  Active pregnancy
                                  {g.inbreedingWarning && (
                                    <span style={{ fontSize: "10px", fontWeight: 600, color: "#c45c26", background: "rgba(196,92,38,0.2)", padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.5px" }}>INBRED WARNING</span>
                                  )}
                                </div>
                                <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "4px" }}>{fmtExposure(g)}</div>
                                <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "4px" }}>Sire: {sireLabel}</div>
                                <div style={{ fontSize: "13px", color: "var(--ink2)", marginBottom: "8px" }}>Due {fmtDueRange(g)}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <div style={{ flex: "1 1 120px", height: "8px", background: "var(--cream2)", borderRadius: "4px", overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, prog))}%`, background: "var(--brass)", borderRadius: "4px", transition: "width 0.2s ease" }} />
                                  </div>
                                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--brass)" }}>{Math.round(prog)}%</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null;
                    })()}
                    {!showBreedingForm ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <Btn size="sm" variant="secondary" onClick={() => {
                      const damGestations = (gestations || []).filter(g => g.animalId === a.id).sort((x, y) => (y.breedingDate || "").localeCompare(x.breedingDate || ""));
                      const latest = damGestations[0];
                      if (latest?.sireAnimalId) {
                        const male = animals.find(m => m.id === latest.sireAnimalId);
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: latest.sireAnimalId, sire: male ? getAnimalName(male) : (latest.sire || ""), sireNotInHerd: false }));
                      } else if (latest?.sire === "Unknown" || (latest?.sire && String(latest.sire).trim().toLowerCase() === "unknown")) {
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: "unknown", sire: "Unknown", sireNotInHerd: false }));
                      } else if (latest?.sire) {
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: "", sire: latest.sire, sireNotInHerd: true }));
                      } else {
                        setBreedingForm(prev => ({ ...prev, sireNotInHerd: false }));
                      }
                      setShowBreedingForm(true);
                    }}>Log Breeding</Btn>
                        {(() => {
                          const activeGest = (gestations || []).find(g => g.animalId === a.id && g.status !== "Delivered");
                          if (!activeGest || !setTab || !setDeliveryGestureId) return null;
                          return (
                            <Btn size="sm" variant="primary" onClick={() => { setTab("gestation"); setDeliveryGestureId(activeGest.id); }}>
                              ✓ Mark as Delivered
                            </Btn>
                          );
                        })()}
                      </div>
                    ) : (
                      <Card style={{ padding: "24px", borderLeft: "4px solid var(--brass)" }}>
                        <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
                        <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "14px" }}>Dam: <strong>{getAnimalName(a)}</strong> ({a.species})</div>
                        <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
                          {!breedingForm.runningWithBull ? (
                            <DateInputWithValidation label="Breeding Date *" breedingDueTwoDigitYear value={breedingForm.breedingDate} onValueChange={v => setBreedingForm(p => ({ ...p, breedingDate: v }))} />
                          ) : (
                            <>
                              <DateInputWithValidation label="Turn Out Date *" breedingDueTwoDigitYear value={breedingForm.breedingDate} onValueChange={v => setBreedingForm(p => ({ ...p, breedingDate: v }))} />
                              <DateInputWithValidation label="Pull Date (optional)" breedingDueTwoDigitYear value={breedingForm.breedingDateEnd} onValueChange={v => setBreedingForm(p => ({ ...p, breedingDateEnd: v }))} />
                            </>
                          )}
                          {!breedingForm.sireNotInHerd ? (
                            <>
                            <Select label="Sire (optional)" value={breedingForm.sireAnimalId || ""} onChange={e => {
                              const v = e.target.value;
                              if (v === "unknown") {
                                setBreedingForm(p => ({ ...p, sireAnimalId: "unknown", sire: "Unknown" }));
                                setBreedingInbreedingCheck(null);
                              } else if (!v) {
                                setBreedingForm(p => ({ ...p, sireAnimalId: "", sire: "" }));
                                setBreedingInbreedingCheck(null);
                              } else {
                                const m = animals.find(x => x.id === v);
                                setBreedingForm(p => ({ ...p, sireAnimalId: v, sire: m ? getAnimalName(m) : "" }));
                                if (m) {
                                  const fsId = (a.sireId || "").toString().trim() || null;
                                  const msId = (m.sireId || "").toString().trim() || null;
                                  const fdId = (a.damId || a.motherId || "").toString().trim() || null;
                                  const mdId = (m.damId || m.motherId || "").toString().trim() || null;
                                  const fsName = (a.sireName || "").toString().trim().toLowerCase() || null;
                                  const msName = (m.sireName || "").toString().trim().toLowerCase() || null;
                                  const fdName = (a.damName || a.motherName || "").toString().trim().toLowerCase() || null;
                                  const mdName = (m.damName || m.motherName || "").toString().trim().toLowerCase() || null;
                                  const sameSire = (fsId && msId && fsId === msId) || (fsName && msName && fsName === msName);
                                  const sameDam = (fdId && mdId && fdId === mdId) || (fdName && mdName && fdName === mdName);
                                  if (sameSire || sameDam) {
                                    setBreedingInbreedingCheck({ level: "half_sibling", commonAncestorName: null });
                                  } else {
                                    const inbreeding = checkInbreedingByParentIds(a, m, animals);
                                    setBreedingInbreedingCheck(inbreeding);
                                  }
                                } else {
                                  setBreedingInbreedingCheck(null);
                                }
                              }
                            }}>
                              <option value="">— None —</option>
                              <option value="unknown">Unknown</option>
                              {breedingSireOptions.map(m => (
                                <option key={m.id} value={m.id}>{getAnimalName(m)}{m.name && m.tag ? ` #${m.tag}` : ""}</option>
                              ))}
                            </Select>
                            {breedingInbreedingCheck && (
                              <div style={{ fontSize: "13px", color: breedingInbreedingCheck.level === "half_sibling" ? "var(--danger2)" : "var(--brass2)", marginTop: "6px", marginBottom: "4px" }}>
                                ⚠ {breedingInbreedingCheck.level === "half_sibling" ? "Strong warning — half-siblings:" : "Moderate — shared grandparent:"} shared ancestor <strong>{breedingInbreedingCheck.commonAncestorName}</strong>
                              </div>
                            )}
                            </>
                          ) : (
                            <Input label="Sire (outside bull)" value={breedingForm.sire} onChange={e => setBreedingForm(p => ({ ...p, sire: e.target.value }))} placeholder="Unknown or type bull name" />
                          )}
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                          <input type="checkbox" checked={breedingForm.sireNotInHerd} onChange={e => setBreedingForm(p => ({ ...p, sireNotInHerd: e.target.checked, ...(e.target.checked ? { sireAnimalId: "", sire: p.sire || "Unknown" } : { sireAnimalId: "", sire: "" }) }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Bull not in my herd</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                          <input type="checkbox" checked={breedingForm.runningWithBull} onChange={e => setBreedingForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Running with Bull (date range for bull exposure)</span>
                        </label>
                        <Textarea label="Notes" value={breedingForm.notes} onChange={e => setBreedingForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                        {breedingForm.breedingDate && (() => {
                          const days = SPECIES[a.species]?.days;
                          const minDays = SPECIES[a.species]?.minDays ?? days;
                          const maxDays = SPECIES[a.species]?.maxDays ?? days;
                          if (!days) return null;
                          const hasEnd = breedingForm.runningWithBull && (breedingForm.breedingDateEnd || "").trim();
                          const dueStr = hasEnd
                            ? `${fmt(dueDate(breedingForm.breedingDate, days))} – ${fmt(dueDate(breedingForm.breedingDateEnd, days))}`
                            : (() => { const r = dueDateRangeFromSingleDate(breedingForm.breedingDate, minDays, maxDays); return `${fmt(r.dueDateStart)} – ${fmt(r.dueDateEnd)}`; })();
                          return (
                            <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                              📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
                            </div>
                          );
                        })()}
                        <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={addBreedingFromProfile}>Record</Btn>
                          <Btn variant="secondary" onClick={() => { setShowBreedingForm(false); setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", sireNotInHerd: false, notes: "" }); setBreedingInbreedingCheck(null); }}>Cancel</Btn>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {isFemale(a) && a.species !== "Mule" && (() => {
                  const hasConfirmedPregnancy = (animalId) => {
                    const g = (gestations || []).find(gr => gr.animalId === animalId && gr.status !== "Delivered");
                    if (!g?.breedingDate) return false;
                    const breedingMs = new Date(g.breedingDate + "T12:00:00").getTime();
                    const thirtyDaysAgo = Date.now() - 30 * 86400000;
                    return breedingMs <= thirtyDaysAgo;
                  };
                  return !hasConfirmedPregnancy(a.id);
                })() && (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Heat Cycles</div>
                    {nextExpectedHeat && (
                      <div style={{ marginBottom: "12px", padding: "10px 14px", background: "rgba(201,149,42,0.12)", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)", fontSize: "14px" }}>
                        <strong>Next expected heat:</strong> {fmt(nextExpectedHeat)}
                      </div>
                    )}
                    {!showHeatForm ? (
                      <div style={{ marginBottom: "12px" }}>
                        <Btn size="sm" variant="secondary" onClick={() => {
                          setHeatForm({ observedDate: new Date().toISOString().split("T")[0], intensity: "Moderate", notes: "" });
                          setShowHeatForm(true);
                        }}>Log Heat</Btn>
                      </div>
                    ) : (
                      <Card style={{ padding: "24px", borderLeft: "4px solid var(--brass)", marginBottom: "16px" }}>
                        <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Heat</div>
                        <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
                          <DateInputWithValidation label="Observed date *" value={heatForm.observedDate} onValueChange={v => setHeatForm(p => ({ ...p, observedDate: v }))} />
                          <Select label="Intensity" value={heatForm.intensity} onChange={e => setHeatForm(p => ({ ...p, intensity: e.target.value }))}>
                            <option value="Strong">Strong</option>
                            <option value="Moderate">Moderate</option>
                            <option value="Weak">Weak</option>
                          </Select>
                        </div>
                        <Textarea label="Notes" value={heatForm.notes} onChange={e => setHeatForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                        <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={saveHeat} disabled={!heatForm.observedDate}>Save</Btn>
                          <Btn variant="secondary" onClick={() => { setShowHeatForm(false); setHeatForm({ observedDate: "", intensity: "Moderate", notes: "" }); }}>Cancel</Btn>
                        </div>
                      </Card>
                    )}
                    {heatCyclesSorted.length > 0 && (
                      <div style={{ marginTop: "12px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "8px" }}>Heat cycle history</div>
                        <div style={{ fontSize: "14px" }}>
                          {heatCyclesSorted.map((h, idx) => {
                            const linkedGestation = gestationForHeat(h.observedDate, h);
                            return (
                              <div key={h.id} style={{ padding: "8px 0", borderBottom: "1px solid #EDE6D6" }}>
                                {fmt(h.observedDate)} · {h.intensity || "—"}
                                {heatDaysSince(idx) != null && <span style={{ color: "var(--muted)", marginLeft: "6px" }}>({heatDaysSince(idx)} days since last heat)</span>}
                                {h.notes && <div style={{ fontSize: "13px", color: "#2C3A2C", marginTop: "2px" }}>{h.notes}</div>}
                                {linkedGestation && (
                                  <div style={{ fontSize: "12px", color: "var(--green)", marginTop: "2px" }}>Breeding logged on {fmt(linkedGestation.breedingDate)}{linkedGestation.status !== "Delivered" ? " (active pregnancy)" : ""}</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {promptAddOffspring?.animalId === a.id && setPromptAddOffspring && (
                  <div style={{ marginBottom: "16px", padding: "14px 16px", background: "rgba(34, 139, 34, 0.12)", borderRadius: "var(--radius)", borderLeft: "4px solid var(--green)" }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink2)", marginBottom: "8px" }}>You recorded a live birth. Add the calf to your herd?</div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <Btn size="sm" onClick={() => {
                        setPromptAddOffspring(null);
                        setEditingOffspringId(null);
                        setShowOffspringForm(true);
                        setOffspringForm(prev => ({ ...prev, dob: promptAddOffspring.deliveryDate || "", name: "", tag: "", sex: getOffspringDefaultSex(a.species), species: a.species, birthWeight: "", weaningDate: "", stillborn: false }));
                      }}>Add Calf</Btn>
                      <Btn size="sm" variant="secondary" onClick={() => setPromptAddOffspring(null)}>Dismiss</Btn>
                    </div>
                  </div>
                )}

                {(() => {
                  const totalPregnancies = offspringForMother.length;
                  const liveBirths = offspringForMother.filter(c => !c.stillborn).length;
                  const stillbornCount = offspringForMother.filter(c => c.stillborn).length;
                  return (
                    <div style={{ marginBottom: "16px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>Fertility Summary</div>
                      <div><strong>{totalPregnancies}</strong> total pregnancies · <strong>{liveBirths}</strong> live births · <strong>{stillbornCount}</strong> stillborn</div>
                    </div>
                  );
                })()}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Total Offspring</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)" }}>{offspringForMother.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>Success Rate (%)</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--ink2)" }}>
                      {offspringForMother.length === 0
                        ? "N/A"
                        : `${((offspringForMother.filter(c => !c.stillborn).length / offspringForMother.length) * 100).toFixed(1)}%`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                    {getOffspringTerm(a.species)} Records
                  </div>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingOffspringId(null);
                      setLinkExistingAnimalId(null);
                      setShowOffspringForm(true);
                      setOffspringForm({
                        name: "",
                        tag: "",
                        sex: getOffspringDefaultSex(a.species),
                        species: a.species,
                        birthWeight: "",
                        dob: "",
                        weaningDate: "",
                        stillborn: false,
                        sireId: "",
                        sireName: "",
                        color: "",
                        markings: "",
                      });
                    setAddCalfMode("register");
                    setLinkExistingSearch("");
                    setLinkExistingAnimalId(null);
                    }}
                  >
                    + Add {getOffspringTerm(a.species)}
                  </Btn>
                </div>

                {offspringForMother.length === 0 && !showOffspringForm && (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No {getOffspringTerm(a.species).toLowerCase()} records yet for this dam.</p>
                )}

                {offspringForMother.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px", marginTop: "8px" }}>
                    {offspringForMother.map(c => (
                      <div key={c.id} style={{ padding: "10px 12px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>{SPECIES[c.species || a.species]?.emoji}</span>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>
                              {c.stillborn ? "Stillborn" : (c.name || "Unnamed")}{!c.stillborn && c.tag ? ` (#${c.tag})` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <Btn size="sm" variant="ghost" onClick={() => { const sp = c.species || a.species || ""; setEditingOffspringId(c.id); (() => { const an = (animals || []).find(x => x.id === c.id); const sireId = c.sireId || (c.sireName && !c.sireId ? "outside" : ""); const sireName = c.sireName || ""; setOffspringForm({ name: c.name || "", tag: c.tag || "", sex: (c.sex && String(c.sex).trim()) ? c.sex : getOffspringDefaultSex(sp), species: sp, birthWeight: c.birthWeight != null ? String(c.birthWeight) : "", dob: c.dob || "", weaningDate: c.weaningDate || "", stillborn: !!c.stillborn, sireId, sireName, color: c.color || an?.color || "", markings: c.markings || an?.markings || "" }); })(); setShowOffspringForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => deleteOffspring(c.id)}>Delete</Btn>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {(c.sex || c.dob) && (() => { const term = getAgeBasedSexTerm({ ...c, species: c.species || a.species }, []); return term !== "—" ? <span>{term}</span> : null; })()}
                          {c.birthWeight && <span>{(c.sex || c.dob) ? " · " : ""}{c.birthWeight} lbs at birth</span>}
                        </div>
                        {(c.dob || (c.weaningDate && (getAgeInMonths(c.dob) == null || getAgeInMonths(c.dob) < 12))) && (
                          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                            {c.dob && <span>Born {fmt(c.dob)}</span>}
                            {c.weaningDate && (getAgeInMonths(c.dob) == null || getAgeInMonths(c.dob) < 12) && <span>{c.dob ? " · " : ""}Wean {fmt(c.weaningDate)}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {showOffspringForm && (
                  <Card className="hl-offspring-form-card" style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--brass)", overflow: "hidden", boxSizing: "border-box", maxWidth: "100%" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      {editingOffspringId ? `Edit ${getOffspringTerm(a.species)}` : `Add ${getOffspringTerm(a.species)}`}
                    </div>
                    {!editingOffspringId && (
                      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setAddCalfMode("link")}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "var(--radius)",
                            border: addCalfMode === "link" ? "2px solid var(--brass)" : "1px solid var(--cream2)",
                            background: addCalfMode === "link" ? "rgba(180, 140, 80, 0.12)" : "var(--cream)",
                            fontWeight: 600,
                            fontSize: "14px",
                            color: addCalfMode === "link" ? "var(--ink2)" : "var(--muted)",
                            cursor: "pointer",
                          }}
                        >
                          {a.species === "Horse" ? "Link Existing Horse" : "Link Existing Animal"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddCalfMode("register")}
                          style={{
                            padding: "10px 16px",
                            borderRadius: "var(--radius)",
                            border: addCalfMode === "register" ? "2px solid var(--brass)" : "1px solid var(--cream2)",
                            background: addCalfMode === "register" ? "rgba(180, 140, 80, 0.12)" : "var(--cream)",
                            fontWeight: 600,
                            fontSize: "14px",
                            color: addCalfMode === "register" ? "var(--ink2)" : "var(--muted)",
                            cursor: "pointer",
                          }}
                        >
                          {a.species === "Horse" ? "Register New Foal" : "Register New Calf"}
                        </button>
                      </div>
                    )}
                    {!editingOffspringId && addCalfMode === "link" && (
                      <div style={{ marginBottom: "14px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>{a.species === "Horse" ? "Choose a foal with no dam (under 12 months or sex term Colt/Filly)" : "Choose a calf with no dam (under 12 months or sex term contains \"Calf\")"}</label>
                        <Input
                          placeholder="Search by name, tag, or species..."
                          value={linkExistingSearch}
                          onChange={e => setLinkExistingSearch(e.target.value)}
                          style={{ marginBottom: "8px" }}
                        />
                        <select
                          value={linkExistingAnimalId || ""}
                          onChange={e => setLinkExistingAnimalId(e.target.value || null)}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px" }}
                        >
                          <option value="">— Select animal —</option>
                          {linkableFiltered.map(an => (
                            <option key={an.id} value={an.id}>{getAnimalName(an)}{an.tag ? ` #${an.tag}` : ""} · {an.species}</option>
                          ))}
                        </select>
                        {linkableFiltered.length === 0 && linkableAnimals.length > 0 && (
                          <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>No matches. Try a different search.</p>
                        )}
                        {linkableAnimals.length === 0 && (
                          <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>No eligible {a.species === "Horse" ? "foals" : "calves"} (same species, no dam, under 12 months or sex term contains {a.species === "Horse" ? "\"Colt\"/\"Filly\"" : "\"Calf\""}).</p>
                        )}
                        {linkExistingAnimalId && (
                          <Btn size="sm" onClick={() => linkExistingAsOffspring(linkExistingAnimalId)} style={{ marginTop: "10px" }}>
                            Link as offspring
                          </Btn>
                        )}
                      </div>
                    )}
                    {((!editingOffspringId && addCalfMode === "register") || editingOffspringId) && (
                    <>
                    <div className="hl-form-grid-3 hl-offspring-form-grid" style={{ marginBottom: "12px", minWidth: 0, width: "100%" }}>
                      <Input
                        label={`${getOffspringTerm(a.species)} Name`}
                        value={offspringForm.name}
                        onChange={e => setOffspringForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="e.g. Bessie Jr"
                      />
                      <Input
                        label="Tag / ID"
                        value={offspringForm.tag}
                        onChange={e => setOffspringForm(p => ({ ...p, tag: e.target.value }))}
                        placeholder="e.g. 2043"
                      />
                      <div style={{ borderLeft: (offspringForm.sex || getOffspringDefaultSex(a.species)) === getOffspringDefaultSex(a.species) ? "4px solid var(--brass)" : "4px solid transparent", borderRadius: "var(--radius)", paddingLeft: "4px", marginLeft: "-4px" }}>
                        <Select
                          label="Sex (default is pre-selected)"
                          value={offspringForm.sex || getOffspringDefaultSex(a.species)}
                          onChange={e => setOffspringForm(p => ({ ...p, sex: e.target.value }))}
                        >
                          {(getOffspringSexOptions(a.species) || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>Species</span>
                        <span style={{ display: "block", fontSize: "14px", color: "var(--ink2)", padding: "9px 0" }}>{a.species || "—"}</span>
                      </div>
                      <Input
                        label="Birth Weight (lbs)"
                        type="number"
                        value={offspringForm.birthWeight}
                        onChange={e => setOffspringForm(p => ({ ...p, birthWeight: e.target.value }))}
                        placeholder="e.g. 85"
                      />
                      <DateInputWithValidation
                        label="Birthday"
                        birthDate
                        value={offspringForm.dob}
                        onValueChange={v => setOffspringForm(p => ({ ...p, dob: v }))}
                      />
                      {a.species !== "Horse" && (!editingOffspringId || getAgeInMonths(offspringForm.dob) == null || getAgeInMonths(offspringForm.dob) < 12) && (
                      <DateInputWithValidation
                        label="Target Weaning Date"
                        value={offspringForm.weaningDate}
                        onValueChange={v => setOffspringForm(p => ({ ...p, weaningDate: v }))}
                      />
                      )}
                      {a.species === "Horse" && (
                        <>
                          <div>
                            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>Sire</label>
                            <Select
                              value={offspringForm.sireId ?? ""}
                              onChange={e => setOffspringForm(p => ({ ...p, sireId: e.target.value || "", sireName: e.target.value === "outside" ? p.sireName : "" }))}
                              style={{ width: "100%" }}
                            >
                              <option value="">— Select sire —</option>
                              {(getSireDropdownMalesForSpecies(animals, "Horse") || []).map(st => (
                                <option key={st.id} value={st.id}>{getAnimalName(st)}{st.tag ? ` #${st.tag}` : ""}</option>
                              ))}
                              <option value="outside">Outside stallion (not in herd)</option>
                            </Select>
                            {offspringForm.sireId === "outside" && (
                              <Input
                                placeholder="Stallion name"
                                value={offspringForm.sireName || ""}
                                onChange={e => setOffspringForm(p => ({ ...p, sireName: e.target.value }))}
                                style={{ marginTop: "8px" }}
                              />
                            )}
                          </div>
                          <Input
                            label="Color"
                            value={offspringForm.color || ""}
                            onChange={e => setOffspringForm(p => ({ ...p, color: e.target.value }))}
                            placeholder="e.g. Bay, Chestnut, Gray"
                          />
                          <Input
                            label="Markings"
                            value={offspringForm.markings || ""}
                            onChange={e => setOffspringForm(p => ({ ...p, markings: e.target.value }))}
                            placeholder="e.g. Star, sock LF"
                          />
                        </>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        <input
                          type="checkbox"
                          id="offspring-stillborn"
                          checked={!!offspringForm.stillborn}
                          onChange={e => setOffspringForm(p => ({ ...p, stillborn: e.target.checked }))}
                          style={{ width: "18px", height: "18px", accentColor: "var(--green)" }}
                        />
                        <label htmlFor="offspring-stillborn" style={{ fontSize: "14px", color: "var(--ink2)", cursor: "pointer" }}>Stillborn</label>
                      </div>
                    </div>
                    <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                      <Btn size="sm" onClick={saveOffspring}>{editingOffspringId ? "Save Changes" : "Save Offspring"}</Btn>
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowOffspringForm(false);
                          setEditingOffspringId(null);
                          setOffspringForm({
                            name: "",
                            tag: "",
                            sex: getOffspringDefaultSex(a.species),
                            species: a.species,
                            birthWeight: "",
                            dob: "",
                            weaningDate: "",
                            stillborn: false,
                          });
                        }}
                      >
                        Cancel
                      </Btn>
                    </div>
                    </>
                    )}
                  </Card>
                )}
              </div>
            )}

            {/* Vaccination Records — all animals */}
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Health Records
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingVaccinationId(null);
                    setVaccinationProtocolId("");
                    setShowVaccinationForm(true);
                    setVaccinationForm({
                      vaccineName: "",
                      dateGiven: "",
                      nextDueDate: "",
                      administeredBy: "Owner",
                      notes: "",
                      dosage: "",
                      route: "IM (Intramuscular)",
                      boosterIntervalDays: "",
                    });
                  }}
                >
                  Add Treatment
                </Btn>
              </div>

              {vaccinationsSorted.length === 0 && !showVaccinationForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No health records for this animal.</p>
              )}

              {vaccinationsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {vaccinationsSorted.map(v => (
                    <div key={v.id} style={{ padding: v.protocolName ? "10px 14px" : "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--green3)" }}>
                      {v.protocolName ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "14px", color: "var(--ink2)" }}>
                            <span style={{ fontWeight: 600 }}>{v.protocolName}</span>
                            {v.vaccineNames && <span> — {v.vaccineNames}</span>}
                            {v.dateGiven && <span> — {fmt(v.dateGiven)}</span>}
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                            <Btn size="sm" variant="ghost" onClick={() => { setEditingVaccinationId(v.id); setVaccinationProtocolId(""); setVaccinationForm({ vaccineName: "", dateGiven: v.dateGiven || "", nextDueDate: "", administeredBy: v.administeredBy || "Owner", notes: v.notes || "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" }); setShowVaccinationForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => deleteVaccination(v.id)}>Delete</Btn>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                            <div style={{ fontWeight: 600, fontSize: "14px" }}>{v.vaccineName || "Unnamed treatment"}</div>
                            <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                              <Btn size="sm" variant="ghost" onClick={() => { setEditingVaccinationId(v.id); setVaccinationProtocolId(""); setVaccinationForm({ vaccineName: v.vaccineName || "", dateGiven: v.dateGiven || "", nextDueDate: v.nextDueDate || "", administeredBy: v.administeredBy || "Owner", notes: v.notes || "", dosage: v.dosage || "", route: v.route || "IM (Intramuscular)", boosterIntervalDays: v.boosterIntervalDays != null ? String(v.boosterIntervalDays) : "" }); setShowVaccinationForm(true); }}>Edit</Btn>
                              <Btn size="sm" variant="ghost" onClick={() => deleteVaccination(v.id)}>Delete</Btn>
                            </div>
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                            {v.dateGiven && <span>Given {fmt(v.dateGiven)}</span>}
                            {v.nextDueDate && <span style={{ color: "#c45c26" }}>{v.dateGiven ? " · " : ""}Booster due: {fmt(v.nextDueDate)}</span>}
                            {(v.dosage || v.route) && <span>{v.dateGiven || v.nextDueDate ? " · " : ""}{[v.dosage, v.route].filter(Boolean).join(" ")}</span>}
                            {v.administeredBy && <span>{v.dateGiven || v.nextDueDate || v.dosage || v.route ? " · " : ""}{v.administeredBy}</span>}
                          </div>
                        </>
                      )}
                      {v.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "6px" }}>{v.notes}</div>}
                    </div>
                  ))}
                </div>
              )}

              {showVaccinationForm && (() => {
                const editingRec = a.vaccinations?.find(v => v.id === editingVaccinationId);
                const isProtocolMode = !!vaccinationProtocolId || !!editingRec?.protocolName;
                const protocol = vaccinationProtocolId ? (settings?.vaccinationProtocols ?? []).find(p => p.id === vaccinationProtocolId) : null;
                const protocolName = editingRec?.protocolName || protocol?.name || "";
                const vaccineNames = editingRec?.vaccineNames || (protocol?.vaccines?.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", ") || "");
                return (
                <Card style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                    {editingVaccinationId ? "Edit Treatment" : "Log Treatment"}
                  </div>
                  {(settings?.vaccinationProtocols ?? []).length > 0 && !editingVaccinationId && (
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Use Protocol</label>
                      <Select value={vaccinationProtocolId} onChange={e => {
                        const id = e.target.value || "";
                        setVaccinationProtocolId(id);
                        if (id) setVaccinationForm(p => ({ ...p, vaccineName: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "", nextDueDate: "" }));
                      }} style={{ width: "100%" }}>
                        <option value="">— None —</option>
                        {(settings?.vaccinationProtocols ?? []).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {isProtocolMode ? (
                    <>
                      {protocolName && (
                        <div style={{ marginBottom: "12px", padding: "10px 12px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "14px" }}>
                          <div style={{ fontWeight: 600, color: "var(--ink2)" }}>{protocolName}</div>
                          {vaccineNames && <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>{vaccineNames}</div>}
                        </div>
                      )}
                      <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                        <DateInputWithValidation label="Date given" value={vaccinationForm.dateGiven} onValueChange={v => setVaccinationForm(p => ({ ...p, dateGiven: v }))} />
                        <Select label="Administered by" value={vaccinationForm.administeredBy} onChange={e => setVaccinationForm(p => ({ ...p, administeredBy: e.target.value }))}>
                          <option>Owner</option>
                          <option>Vet</option>
                        </Select>
                      </div>
                      <Textarea label="Notes" value={vaccinationForm.notes} onChange={e => setVaccinationForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                    </>
                  ) : (
                    <>
                      {a.species === "Horse" && (
                        <div style={{ marginBottom: "12px" }}>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>Equine vaccines</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {EQUINE_VACCINE_SUGGESTIONS.map(name => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setVaccinationForm(p => ({ ...p, vaccineName: name }))}
                                style={{ padding: "6px 10px", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: vaccinationForm.vaccineName === name ? "var(--green)" : "var(--cream)", color: vaccinationForm.vaccineName === name ? "#fff" : "var(--ink2)", fontSize: "12px", fontWeight: 500, cursor: "pointer" }}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                        <Input label="Product name" value={vaccinationForm.vaccineName} onChange={e => setVaccinationForm(p => ({ ...p, vaccineName: e.target.value }))} placeholder={a.species === "Horse" ? "e.g. West Nile, Rabies" : "e.g. Ivomec, Cylence, Vision 7, Bovi-Shield"} list={a.species === "Horse" ? "equine-vaccine-list" : undefined} />
                        <DateInputWithValidation label="Date given" value={vaccinationForm.dateGiven} onValueChange={v => setVaccinationForm(p => ({ ...p, dateGiven: v }))} />
                        <DateInputWithValidation label="Next due / Booster date" breedingDueTwoDigitYear value={vaccinationForm.nextDueDate} onValueChange={v => setVaccinationForm(p => ({ ...p, nextDueDate: v }))} />
                        <Input label="Dosage" value={vaccinationForm.dosage} onChange={e => setVaccinationForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 2 mL" />
                        <Select label="Route" value={vaccinationForm.route} onChange={e => setVaccinationForm(p => ({ ...p, route: e.target.value }))}>
                          {VACCINE_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                        <Input label="Booster interval (days)" type="number" min={0} value={vaccinationForm.boosterIntervalDays} onChange={e => setVaccinationForm(p => ({ ...p, boosterIntervalDays: e.target.value }))} placeholder="e.g. 365" />
                        <Select label="Administered by" value={vaccinationForm.administeredBy} onChange={e => setVaccinationForm(p => ({ ...p, administeredBy: e.target.value }))}>
                          <option>Owner</option>
                          <option>Vet</option>
                        </Select>
                      </div>
                      {a.species === "Horse" && <datalist id="equine-vaccine-list">{EQUINE_VACCINE_SUGGESTIONS.map(name => <option key={name} value={name} />)}</datalist>}
                      <Textarea label="Notes" value={vaccinationForm.notes} onChange={e => setVaccinationForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                    </>
                  )}
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Btn size="sm" onClick={saveVaccination}>{editingVaccinationId ? "Save Changes" : "Save Vaccination"}</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowVaccinationForm(false); setEditingVaccinationId(null); setVaccinationProtocolId(""); setVaccinationForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
                );
              })()}
            </div>

            {/* Sale */}
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Sale</div>
              {a.sale && !showSaleForm && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)", marginBottom: "10px" }}>
                  <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                    {a.sale.dateSold && <div><strong>Date sold:</strong> {fmt(a.sale.dateSold)}</div>}
                    {a.sale.pricePerHead != null && <div><strong>Price per head:</strong> ${Number(a.sale.pricePerHead).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>}
                    {a.sale.buyerName && <div><strong>Buyer:</strong> {a.sale.buyerName}</div>}
                    {a.sale.buyerContact && <div><strong>Buyer contact:</strong> {a.sale.buyerContact}</div>}
                    {a.sale.saleType && <div><strong>Sale type:</strong> {a.sale.saleType}</div>}
                    {a.sale.weightAtSale != null && <div><strong>Weight at sale:</strong> {Number(a.sale.weightAtSale).toLocaleString("en-US")} lbs</div>}
                    {a.sale.saleLocation && <div><strong>Sale location:</strong> {a.sale.saleLocation}</div>}
                    {a.sale.notes && <div style={{ marginTop: "4px" }}><strong>Notes:</strong> {a.sale.notes}</div>}
                  </div>
                </div>
              )}
              {!a.sale && !a.butchered && !a.deceased && !showSaleForm && !showButcheredForm && !showDeceasedForm && (
                <div className="hl-status-actions">
                  <Btn variant="secondary" onClick={() => { setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); setShowSaleForm(true); }}>Mark as Sold</Btn>
                  <Btn variant="secondary" onClick={() => { setButcheredForm({ date: "", notes: "" }); setShowButcheredForm(true); }}>Mark as Butchered</Btn>
                  <Btn variant="secondary" onClick={() => { setDeceasedForm({ date: "", notes: "" }); setShowDeceasedForm(true); }}>Mark as Deceased</Btn>
                </div>
              )}
              {showSaleForm && (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Sold</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <DateInputWithValidation label="Date sold" value={saleForm.dateSold} onValueChange={v => setSaleForm(p => ({ ...p, dateSold: v }))} />
                    <Input label="Price per head ($)" type="number" min="0" step="0.01" value={saleForm.pricePerHead} onChange={e => setSaleForm(p => ({ ...p, pricePerHead: e.target.value }))} placeholder="e.g. 1250.00" />
                    {setContacts ? (
                      <ContactPicker label="Buyer" value={saleForm.buyerName} onChange={v => setSaleForm(p => ({ ...p, buyerName: v, buyerContact: p.buyerContact }))} contacts={contacts} setContacts={setContacts} placeholder="Search contacts or type name" onSelectContact={c => setSaleForm(p => ({ ...p, buyerName: c.name || "", buyerContact: [c.phone, c.email].filter(Boolean).join(" · ") || "" }))} />
                    ) : (
                      <>
                        <Input label="Buyer name" value={saleForm.buyerName} onChange={e => setSaleForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Livestock" />
                        <Input label="Buyer contact (optional)" value={saleForm.buyerContact} onChange={e => setSaleForm(p => ({ ...p, buyerContact: e.target.value }))} placeholder="Phone or email" />
                      </>
                    )}
                    <Input label="Sale location (optional)" value={saleForm.saleLocation} onChange={e => setSaleForm(p => ({ ...p, saleLocation: e.target.value }))} placeholder="e.g. Sale barn name" />
                  </div>
                  <Textarea label="Notes" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveSale}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowSaleForm(false); setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {/* Butchered info + form */}
              {a.butchered && !showButcheredForm && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid #5a3e2b", marginBottom: "10px", marginTop: "10px" }}>
                  <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                    {a.butchered.date && <div><strong>Date butchered:</strong> {fmt(a.butchered.date)}</div>}
                    {a.butchered.notes && <div style={{ marginTop: "4px" }}><strong>Notes:</strong> {a.butchered.notes}</div>}
                  </div>
                </div>
              )}
              {showButcheredForm && (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid #5a3e2b", marginTop: "10px" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Butchered</div>
                  <div style={{ marginBottom: "12px" }}>
                    <DateInputWithValidation label="Date butchered" value={butcheredForm.date} onValueChange={v => setButcheredForm(p => ({ ...p, date: v }))} />
                  </div>
                  <Textarea label="Notes (optional)" value={butcheredForm.notes} onChange={e => setButcheredForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveButchered}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowButcheredForm(false); setButcheredForm({ date: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {/* Deceased info + form */}
              {a.deceased && !showDeceasedForm && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid #666", marginBottom: "10px", marginTop: "10px" }}>
                  <div style={{ fontSize: "13px", color: "var(--ink2)" }}>
                    {a.deceased.date && <div><strong>Date deceased:</strong> {fmt(a.deceased.date)}</div>}
                    {a.deceased.notes && <div style={{ marginTop: "4px" }}><strong>Notes:</strong> {a.deceased.notes}</div>}
                  </div>
                </div>
              )}
              {showDeceasedForm && (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid #666", marginTop: "10px" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Deceased</div>
                  <div style={{ marginBottom: "12px" }}>
                    <DateInputWithValidation label="Date deceased" value={deceasedForm.date} onValueChange={v => setDeceasedForm(p => ({ ...p, date: v }))} />
                  </div>
                  <Textarea label="Notes (optional)" value={deceasedForm.notes} onChange={e => setDeceasedForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveDeceased}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowDeceasedForm(false); setDeceasedForm({ date: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
            </div>

            <div className="hl-profile-actions-sep">
              <div className="hl-profile-actions">
                <Btn variant="secondary" size="sm" onClick={() => window.print()}>Print / Export PDF</Btn>
                <Btn variant="secondary" size="sm" onClick={() => {
                  const species = a.species || "Cattle";
                  const opts = getSexOptions(species);
                  const sex = opts.includes(a.sex) ? a.sex : (opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0]);
                  setRegisterInitialSingle({ name: "", species, sex, breed: a.breed || "", tag: a.tag || "", dob: "", notes: a.notes || "" });
                  setRegisterFormKey(k => k + 1);
                  setShowAdd(true);
                  setViewing(null);
                }}>Duplicate Animal</Btn>
                <Btn variant="danger" size="sm" onClick={() => remove(a.id)}>Remove Animal</Btn>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Print-only view: visible only when printing */}
      <div className="print-only hl-print-root" style={{ display: "none", padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ background: "#1B3A2B", color: "#fff", padding: "20px 24px", marginBottom: "24px", borderBottom: "3px solid #C9952A" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, letterSpacing: "0.5px" }}>Herd Ledger</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.7)", letterSpacing: "2px", textTransform: "uppercase", marginTop: "4px" }}>Livestock Management</div>
        </div>
        <h1 style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#141A14", marginBottom: "8px" }}>{getAnimalName(a)}</h1>
        <p style={{ color: "#7A8C7A", fontSize: "14px", marginBottom: "24px" }}>{a.breed || a.species} · {displaySex(a, gestations)}{(() => { const rw = getRunningWithMaleForFemale(a, animals); return rw ? ` · Running with ${getAnimalName(rw)}` : ""; })()}{a.name && a.tag ? ` · #${a.tag}` : ""}</p>

        <section style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Basic Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 24px", fontSize: "14px" }}>
            <div><strong>Species</strong> {a.species}</div>
            <div><strong>Breed</strong> {a.breed || "—"}</div>
            <div><strong>Color</strong> {a.color || "—"}</div>
            <div><strong>Sex</strong> {displaySex(a, gestations)}</div>
            {getRunningWithMaleForFemale(a, animals) && <div><strong>Running with</strong> {getAnimalName(getRunningWithMaleForFemale(a, animals))}</div>}
            <div><strong>Tag / ID</strong> {a.tag || "—"}</div>
            <div><strong>Date of Birth</strong> {fmt(a.dob)}</div>
            <div><strong>Age</strong> {ageFromDob(a.dob)}</div>
          </div>
        </section>

        {(a.weights?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Weight Tracking</h2>
            <div style={{ fontSize: "14px" }}>
              {weightsSorted.map(entry => (
                <div key={entry.id} style={{ padding: "4px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{entry.weight} lb</strong> — {fmt(entry.date)}{entry.notes ? ` · ${entry.notes}` : ""}
                </div>
              ))}
              {adg !== null && (
                <div style={{ marginTop: "8px", fontWeight: 600 }}>
                  ADG: {adg >= 0 ? "+" : ""}{adg.toFixed(3)} lb/day {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                </div>
              )}
            </div>
          </section>
        )}

        {(a.treatments?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Health & Treatment Log</h2>
            <div style={{ fontSize: "14px" }}>
              {treatmentsSorted.map(entry => (
                <div key={entry.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{entry.type}</strong> — {fmt(entry.date)}{entry.administeredBy ? ` · ${entry.administeredBy}` : ""}
                  {entry.description && ` · ${entry.description}`}
                  {entry.treatmentGiven && ` · Treatment: ${entry.treatmentGiven}${entry.dosage ? ` (${entry.dosage})` : ""}`}
                  {entry.cost != null && entry.cost !== "" && ` · $${Number(entry.cost).toFixed(2)}`}
                  {entry.notes && ` · ${entry.notes}`}
                </div>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Lineage</h2>
          <div style={{ fontSize: "14px" }}>
<div><strong>Dam:</strong> {(a.damId || a.motherId) ? (() => {
              const damId = a.damId || a.motherId;
              const mother = animals.find(m => m.id === damId);
                return mother ? (
                  <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}{mother.tag ? ` (#${mother.tag})` : ""}</button>
                ) : (
                  <span>{(a.damName || a.motherName) || "Unknown"}</span>
                );
              })() : (
                <span>{(a.damName || a.motherName) || "Unknown"}</span>
              )}</div>
            <div style={{ marginTop: "4px" }}><strong>Sire:</strong> {a.sireId ? (() => {
              const sire = animals.find(s => s.id === a.sireId);
              return sire ? (
                <button type="button" onClick={() => setViewing(sire)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(sire)}{sire.tag ? ` (#${sire.tag})` : ""}</button>
              ) : (
                <span>{a.sireName || "Unknown"}</span>
              );
            })() : (
              <span>{a.sireName || "Unknown"}</span>
            )}</div>
          </div>
        </section>

        {(() => {
          const asDam = (animals || []).filter(an => (an.damId || an.motherId) === a.id);
          const asSire = (animals || []).filter(an => an.sireId === a.id);
          const offspringList = [...asDam, ...asSire];
          if (offspringList.length === 0) return null;
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Offspring</h2>
              <div style={{ fontSize: "14px" }}>
                {offspringList.map(an => (
                  <div key={an.id} style={{ padding: "4px 0", borderBottom: "1px solid #EDE6D6" }}>
                    <button type="button" onClick={() => setViewing(an)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(an)}{an.tag ? ` (#${an.tag})` : ""}</button>
                    {" · "}{an.species || "—"}
                    {an.dob && ` · Born ${fmt(an.dob)}`}
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {(a.vaccinations?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Health Records</h2>
            <div style={{ fontSize: "14px" }}>
              {[...(a.vaccinations || [])].sort((x, y) => (y.dateGiven || "").localeCompare(x.dateGiven || "")).map((v, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < a.vaccinations.length - 1 ? "1px solid #EDE6D6" : "none" }}>
                  {v.protocolName ? (
                    <><strong>{v.protocolName}</strong>{v.vaccineNames ? ` — ${v.vaccineNames}` : ""}{v.dateGiven ? ` — ${fmt(v.dateGiven)}` : ""}{v.administeredBy ? ` · ${v.administeredBy}` : ""}</>
                  ) : (
                    <><strong>{v.vaccineName || "Vaccine"}</strong> — Given {fmt(v.dateGiven)}{v.nextDueDate ? <span style={{ color: "#c45c26" }}> · Booster due: {fmt(v.nextDueDate)}</span> : ""}{(v.dosage || v.route) ? ` · ${[v.dosage, v.route].filter(Boolean).join(" ")}` : ""}{v.administeredBy ? ` · ${v.administeredBy}` : ""}</>
                  )}
                  {v.notes && <div style={{ fontSize: "13px", color: "#2C3A2C", marginTop: "4px" }}>{v.notes}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {a.castration && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Castration Record</h2>
            <div style={{ fontSize: "14px" }}>
              {a.castration.date ? `Performed ${fmt(a.castration.date)}` : "Date not recorded"}
              {a.castration.method && ` · Method: ${a.castration.method}`}
              {a.castration.performer && ` · Performed by: ${a.castration.performer}`}
              {a.castration.notes && <div style={{ marginTop: "6px" }}>{a.castration.notes}</div>}
            </div>
          </section>
        )}

        {isFemale(a) && (offspringForMother?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>{getOffspringTerm(a.species)} Records</h2>
            <div style={{ fontSize: "14px" }}>
              {offspringForMother.map(c => (
                <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  {c.stillborn ? "Stillborn" : (c.name || "Unnamed")}{!c.stillborn && c.tag ? ` #${c.tag}` : ""}
                  {(() => { const term = getAgeBasedSexTerm({ ...c, species: c.species || a.species }, []); return term !== "—" ? ` · ${term}` : null; })()}
                  {c.dob && ` · Born ${fmt(c.dob)}`}
                  {c.weaningDate && (getAgeInMonths(c.dob) == null || getAgeInMonths(c.dob) < 12) && ` · Wean ${fmt(c.weaningDate)}`}
                </div>
              ))}
            </div>
          </section>
        )}

        {(() => {
          const gestationsForAnimal = gestations.filter(g => g.animalId === a.id);
          if (gestationsForAnimal.length === 0) return null;
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Gestation History</h2>
              <div style={{ fontSize: "14px" }}>
                {gestationsForAnimal.map(g => {
                  const sireAnimal = g.sireAnimalId ? animals.find(m => m.id === g.sireAnimalId) : null;
                  const sireLabel = g.sire || (sireAnimal ? getAnimalName(sireAnimal) : null) || "Unknown";
                  const linkedHeat = heatForGestation(g);
                  const totalDays = g.gestationDays ?? SPECIES[a.species]?.days ?? 283;
                  const prog = g.status !== "Delivered" ? progress(breedingDateForProgress(g), totalDays) : 100;
                  return (
                    <div key={g.id} style={{ padding: "10px 0", borderBottom: "1px solid #EDE6D6" }}>
                      <div>
                        {g.status === "Delivered" ? `Delivered ${fmt(g.deliveredAt)}` : `Active · Due ${fmtDueRange(g)}`}
                        {g.status !== "Delivered" && <span style={{ marginLeft: "8px", fontWeight: 600, color: "var(--brass)" }}>{Math.round(prog)}%</span>}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "2px" }}>{fmtExposure(g)} · Sire: {sireAnimal ? (
                        <button type="button" onClick={() => setViewing(sireAnimal)} style={{ background: "none", border: "none", padding: 0, color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}>{sireLabel}</button>
                      ) : (
                        <span>{sireLabel}</span>
                      )}</div>
                      {g.status !== "Delivered" && (
                        <div style={{ marginTop: "6px", height: "4px", background: "var(--cream2)", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, prog))}%`, background: "var(--brass)", borderRadius: "2px" }} />
                        </div>
                      )}
                      {g.calf && (g.calf.stillborn ? <div style={{ marginTop: "2px" }}>Stillborn</div> : (g.calf.name ? <div style={{ marginTop: "2px" }}>{getOffspringTerm(a.species)}: {g.calf.name}</div> : null))}
                      {linkedHeat && <div style={{ fontSize: "12px", color: "var(--green)", marginTop: "2px" }}>Following heat observed on {fmt(linkedHeat.observedDate)}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {(() => {
          if (!isBreedingMale(a)) return null;
          const siredGestations = (gestations || []).filter(g => g.sireAnimalId === a.id || (g.sire && getAnimalName(a) && g.sire.trim() === getAnimalName(a).trim()));
          if (siredGestations.length === 0) return null;
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Breeding Records</h2>
              <div style={{ fontSize: "14px" }}>
                {siredGestations.map(g => {
                  const dam = animals.find(d => d.id === g.animalId);
                  return (
                    <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                      {dam ? (
                        <button type="button" onClick={() => setViewing(dam)} style={{ background: "none", border: "none", padding: 0, color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}>{getAnimalName(dam)}{dam.name && dam.tag ? ` #${dam.tag}` : ""}</button>
                      ) : (
                        <span>Unknown dam</span>
                      )}
                      {` · ${fmtExposure(g)}`}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {(a.movements?.length ?? 0) > 0 && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Pasture Movement History</h2>
            <div style={{ fontSize: "14px" }}>
              {a.movements.map((m, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                  <strong>{m.pastureName || "—"}</strong> — Moved in {m.dateMovedIn ? fmt(m.dateMovedIn) : "—"}
                  {m.notes && <div style={{ fontSize: "13px", color: "#2C3A2C", marginTop: "2px" }}>{m.notes}</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {a.notes && (
          <section style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Notes</h2>
            <p style={{ fontSize: "14px", lineHeight: 1.7, color: "#2C3A2C", whiteSpace: "pre-wrap" }}>{a.notes}</p>
          </section>
        )}
      </div>
    </>
    );
  }

  const deceasedCount = animals.filter(a => a.deceased).length;
  const butcheredCount = animals.filter(a => a.butchered).length;
  const archivedCount = animals.filter(a => a.sale || a.butchered || a.deceased).length;

  function toggleBulkSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds([]);
    setShowBulkGrid(false);
    setBulkFormType(null);
    setBulkForm({});
  }

  function bulkDeleteSelected() {
    const count = selectedIds.length;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to delete ${count} animal${count !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const idSet = new Set(selectedIds);
    setAnimals(prev => prev.filter(a => !idSet.has(a.id)));
    if (viewingAnimal && idSet.has(viewingAnimal.id)) setViewing(null);
    setGestations(prev =>
      prev
        .filter(g => !idSet.has(g.animalId))
        .map(g => (g.calf?.animalId && idSet.has(g.calf.animalId) ? { ...g, calf: undefined } : g))
    );
    setOffspring(prev => {
      const next = { ...prev };
      selectedIds.forEach(id => delete next[id]);
      return Object.fromEntries(
        Object.entries(next)
          .filter(([motherId]) => !idSet.has(motherId))
          .map(([motherId, list]) => [motherId, (list || []).filter(c => !idSet.has(c.id))])
          .filter(([, list]) => list.length > 0)
      );
    });
    if (setFeederPrograms) setFeederPrograms(prev => prev.filter(f => !idSet.has(f.animalId)));
    if (setNotes) setNotes(prev => (prev || []).filter(note => !selectedIds.some(id => note.id === id || note.id.endsWith("-" + id))));
    exitBulkMode();
  }

  const selectedAnimals = animals.filter(an => selectedIds.includes(an.id));
  const selectedFemales = selectedAnimals.filter(an => isFemale(an) && an.species !== "Mule");
  const selectedPastureEligible = selectedAnimals.filter(an => PASTURE_SPECIES.includes(an.species));
  const selectedMales = selectedAnimals.filter(an => isMale(an));
  const inFeedlotIds = new Set((feederPrograms || []).map(f => f.animalId));
  const selectedCattleForFeedlot = selectedAnimals.filter(an => an.species === "Cattle" && !inFeedlotIds.has(an.id));

  function addDaysBulk(dateStr, days) {
    if (!dateStr || !Number.isInteger(days)) return undefined;
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  function saveBulkVaccination() {
    const dateGiven = bulkForm.dateGiven?.trim();
    const protocol = bulkForm.protocolId ? (settings?.vaccinationProtocols ?? []).find(p => p.id === bulkForm.protocolId) : null;

    if (protocol?.vaccines?.length && dateGiven) {
      const withBooster = protocol.vaccines.filter(v => v.trackBooster);
      const noBooster = protocol.vaccines.filter(v => !v.trackBooster);
      const notes = bulkForm.notes?.trim() || undefined;
      const administeredBy = bulkForm.administeredBy || undefined;
      setAnimals(prev =>
        prev.map(an => {
          if (!selectedIds.includes(an.id)) return an;
          const newEntries = [];
          if (withBooster.length === 0) {
            newEntries.push({
              id: Date.now().toString() + "-" + an.id,
              protocolName: protocol.name,
              vaccineNames: protocol.vaccines.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", "),
              dateGiven,
              notes,
              administeredBy,
            });
          } else {
            if (noBooster.length > 0) {
              newEntries.push({
                id: Date.now().toString() + "-" + an.id + "-c",
                protocolName: protocol.name,
                vaccineNames: noBooster.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", "),
                dateGiven,
                notes,
                administeredBy,
              });
            }
            withBooster.forEach((v, idx) => {
              const boosterDays = v.boosterIntervalDays != null ? Number(v.boosterIntervalDays) : undefined;
              const nextDue = Number.isInteger(boosterDays) ? addDaysBulk(dateGiven, boosterDays) : undefined;
              newEntries.push({
                id: Date.now().toString() + "-" + an.id + "-" + idx,
                vaccineName: (v.vaccineName || "").trim() || undefined,
                dateGiven,
                nextDueDate: nextDue,
                dosage: (v.dosage || "").trim() || undefined,
                route: v.route || undefined,
                boosterIntervalDays: boosterDays,
                notes,
                administeredBy,
              });
            });
          }
          return { ...an, vaccinations: [...(an.vaccinations || []), ...newEntries] };
        })
      );
      exitBulkMode();
      return;
    }

    const boosterDays = bulkForm.boosterIntervalDays !== "" ? parseInt(bulkForm.boosterIntervalDays, 10) : undefined;
    const nextDue = bulkForm.nextDueDate?.trim() || (bulkForm.dateGiven?.trim() && Number.isInteger(boosterDays) ? addDaysBulk(bulkForm.dateGiven, boosterDays) : undefined);
    const rec = {
      vaccineName: bulkForm.vaccineName || undefined,
      dateGiven: bulkForm.dateGiven || undefined,
      nextDueDate: nextDue || undefined,
      administeredBy: bulkForm.administeredBy || undefined,
      notes: bulkForm.notes || undefined,
      dosage: bulkForm.dosage?.trim() || undefined,
      route: bulkForm.route || undefined,
      boosterIntervalDays: boosterDays,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const entry = { ...rec, id: Date.now().toString() + "-" + an.id };
        return { ...an, vaccinations: [...(an.vaccinations || []), entry] };
      })
    );
    exitBulkMode();
  }

  function saveBulkBreeding() {
    const start = bulkForm.breedingDate;
    if (!start) return;
    const end = (bulkForm.runningWithBull && (bulkForm.breedingDateEnd || "").trim()) ? bulkForm.breedingDateEnd : null;
    const breedingDateMs = new Date(start + "T12:00:00").getTime();
    const HEAT_LINK_DAYS_BULK = 5;
    const newRecords = selectedFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const minDays = SPECIES[an.species]?.minDays ?? totalDays;
      const maxDays = SPECIES[an.species]?.maxDays ?? totalDays;
      let dueStart, dueEnd;
      if (end) {
        dueStart = dueDate(start, totalDays);
        dueEnd = dueDate(end, totalDays);
      } else {
        const range = dueDateRangeFromSingleDate(start, minDays, maxDays);
        dueStart = range.dueDateStart;
        dueEnd = range.dueDateEnd;
      }
      const recentHeats = (an.heatCycles || [])
        .filter(h => {
          const heatMs = new Date((h.observedDate || "") + "T12:00:00").getTime();
          const diffDays = (breedingDateMs - heatMs) / 86400000;
          return diffDays >= 0 && diffDays <= HEAT_LINK_DAYS_BULK;
        })
        .sort((x, y) => (y.observedDate || "").localeCompare(x.observedDate || ""));
      const linkedHeat = recentHeats[0] || null;
      const recordId = Date.now().toString() + "-" + an.id;
      return {
        animalId: an.id,
        breedingDate: start,
        ...(bulkForm.runningWithBull && { breedingDateEnd: end || undefined, runningWithBull: true }),
        dueDate: dueStart,
        dueDateStart: dueStart,
        dueDateEnd: dueEnd,
        sire: bulkForm.sire,
        notes: bulkForm.notes,
        id: recordId,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
        ...(linkedHeat && { linkedHeatCycleId: linkedHeat.id, linkedHeatObservedDate: linkedHeat.observedDate }),
      };
    });
    setGestations(p => [...p, ...newRecords]);
    const heatUpdates = newRecords.filter(r => r.linkedHeatCycleId).map(r => ({ animalId: r.animalId, heatId: r.linkedHeatCycleId, gestationId: r.id }));
    if (heatUpdates.length > 0) {
      setAnimals(prev => prev.map(x => {
        const upd = heatUpdates.find(u => u.animalId === x.id);
        if (!upd) return x;
        return { ...x, heatCycles: (x.heatCycles || []).map(h => h.id === upd.heatId ? { ...h, linkedGestationId: upd.gestationId } : h) };
      }));
    }
    exitBulkMode();
  }

  function saveBulkMove() {
    const canonical = getCanonicalPastureNames(animals, pastures);
    const pastureName = resolvePastureName(bulkForm.pastureName?.trim(), canonical) || undefined;
    const dateMovedIn = bulkForm.dateMovedIn || undefined;
    const notes = bulkForm.notes?.trim() || undefined;
    const journalEntries = [];
    const nextAnimals = (animals || []).map(an => {
      if (!selectedIds.includes(an.id) || !PASTURE_SPECIES.includes(an.species)) return an;
      const movementId = Date.now().toString() + "-" + an.id;
      const movePayload = { pastureName, dateMovedIn, notes, movementId };
      const prevPasture = (an.movements || [])[0]?.pastureName;
      if (setNotes) journalEntries.push(createMovementJournalEntry(an, prevPasture, pastureName, dateMovedIn, notes, movementId));
      return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
    });
    setAnimals(nextAnimals);
    if (setNotes && journalEntries.length > 0) setNotes(prev => [...journalEntries, ...prev]);
    if (pastureName) setRunningWithBullCheckPending({ pastureName });
    exitBulkMode();
  }

  function saveBulkTreatment() {
    if (!bulkForm.date || !bulkForm.type) return;
    const entry = {
      date: bulkForm.date,
      type: bulkForm.type,
      description: bulkForm.description?.trim() || undefined,
      treatmentGiven: bulkForm.treatmentGiven?.trim() || undefined,
      dosage: bulkForm.dosage?.trim() || undefined,
      administeredBy: bulkForm.administeredBy || "Owner",
      cost: bulkForm.cost?.trim() ? parseFloat(bulkForm.cost) : undefined,
      notes: bulkForm.notes?.trim() || undefined,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const fullEntry = { ...entry, id: Date.now().toString() + "-" + an.id };
        const nextTreatments = [...(an.treatments || []), fullEntry].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
        return { ...an, treatments: nextTreatments };
      })
    );
    exitBulkMode();
  }

  function saveBulkCastration() {
    const rec = {
      date: bulkForm.date || undefined,
      method: bulkForm.method || undefined,
      performer: bulkForm.performer || undefined,
      notes: bulkForm.notes?.trim() || undefined,
      recordedAt: new Date().toISOString(),
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id) || !isMale(an)) return an;
        const castratedTerm = CASTRATED_TERM_BY_SPECIES[an.species];
        return {
          ...an,
          castration: rec,
          ...(castratedTerm != null && { sex: castratedTerm }),
        };
      })
    );
    exitBulkMode();
  }

  function saveBulkBreed() {
    const v = (bulkForm.breed || "").trim() || undefined;
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, breed: v } : an));
    exitBulkMode();
  }
  function saveBulkSex() {
    const v = (bulkForm.sex || "").trim() || undefined;
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, sex: v } : an));
    exitBulkMode();
  }
  function saveBulkColor() {
    const v = (bulkForm.color || "").trim() || undefined;
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, color: v } : an));
    exitBulkMode();
  }
  function saveBulkPurchaseDate() {
    const v = (bulkForm.purchaseDate || "").trim() || undefined;
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, purchaseDate: v } : an));
    exitBulkMode();
  }
  function saveBulkPurchasedFrom() {
    const v = (bulkForm.purchasedFrom || "").trim() || undefined;
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, purchasedFrom: v } : an));
    exitBulkMode();
  }
  function saveBulkSale() {
    if (!bulkForm.dateSold) return;
    const record = {
      dateSold: bulkForm.dateSold,
      pricePerHead: bulkForm.pricePerHead?.trim() ? parseFloat(bulkForm.pricePerHead) : undefined,
      buyerName: bulkForm.buyerName?.trim() || undefined,
      saleLocation: bulkForm.saleLocation?.trim() || undefined,
      notes: bulkForm.notes?.trim() || undefined,
    };
    setAnimals(prev => prev.map(an => selectedIds.includes(an.id) ? { ...an, sale: record } : an));
    exitBulkMode();
  }

  return (
    <div className={`hl-page hl-fade-in${bulkMode && !bulkFormType ? " hl-page-with-bulk-toolbar" : ""}`}>
      <SectionTitle action={
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "2px" }} role="group" aria-label="View mode">
            <button
              type="button"
              title="Tile view"
              aria-pressed={viewMode === "tile"}
              disabled={forceList}
              onClick={() => setSettings?.((prev) => ({ ...prev, animalsViewMode: "tile" }))}
              style={{
                width: "36px",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--cream3)",
                borderRadius: "var(--radius)",
                background: viewMode === "tile" ? "var(--cream2)" : "#fff",
                color: forceList ? "var(--muted)" : "var(--ink2)",
                cursor: forceList ? "not-allowed" : "pointer",
                opacity: forceList ? 0.6 : 1,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button
              type="button"
              title="List view"
              aria-pressed={viewMode === "list"}
              onClick={() => setSettings?.((prev) => ({ ...prev, animalsViewMode: "list" }))}
              style={{
                width: "36px",
                height: "36px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--cream3)",
                borderRadius: "var(--radius)",
                background: viewMode === "list" ? "var(--cream2)" : "#fff",
                color: "var(--ink2)",
                cursor: "pointer",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
          <div className="hl-animals-header-actions">
            <button
              type="button"
              className="hl-animals-header-btn hl-animals-header-btn-secondary"
              onClick={() => { setBulkMode(true); setSelectedIds([]); setShowBulkGrid(false); setBulkFormType(null); setViewing(null); }}
              title="Bulk Actions"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><path d="M7 13h4"/></svg>
              <span className="hl-animals-header-btn-text">Bulk Actions</span>
            </button>
            <button
              type="button"
              className="hl-animals-header-btn hl-animals-header-btn-secondary"
              onClick={() => { setImportStep(1); setImportFile(null); setImportData(null); setImportMapping({}); setImportSuccess(null); setShowImportModal(true); }}
              title="Import Animals"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span className="hl-animals-header-btn-text">Import Animals</span>
            </button>
            <Btn onClick={() => { setEditingId(null); setRegisterInitialSingle(null); setRegisterFormKey(k => k + 1); setShowAdd(true); }}>+ Register Animals</Btn>
          </div>
        </div>
      }>
        Animal Register
      </SectionTitle>

      {/* Show/hide archived (sold, butchered, deceased) */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
        {archivedCount > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={showArchivedAnimals} onChange={e => setShowArchivedAnimals(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            Show archived animals ({archivedCount})
          </label>
        )}
      </div>

      {/* Filter & Sort bar (desktop: full bar; mobile: button that opens bottom sheet) */}
      {(() => {
        const activeFilterCount = (search.trim() ? 1 : 0) + (filterSpecies !== "All Species" ? 1 : 0) + (filterSexStatus !== "All" ? 1 : 0) + (filterPasture !== "All Pastures" ? 1 : 0) + (filterCull !== "All" ? 1 : 0) + (filterHeatDue ? 1 : 0);
        const clearFilters = () => {
          setSearch("");
          setFilterSpecies("All Species");
          setFilterSexStatus("All");
          setFilterPasture("All Pastures");
          setFilterCull("All");
          setFilterHeatDue?.(false);
        };

        const filterControls = (
          <>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <Input placeholder="Search by name or tag..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterSpecies} onChange={e => setFilterSpecies(e.target.value)} style={{ minWidth: "140px" }}>
              <option value="All Species">All Species</option>
              {speciesInHerd.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select value={filterSexStatus} onChange={e => setFilterSexStatus(e.target.value)} style={{ minWidth: "140px" }}>
              <option value="All">All</option>
              <option value="Intact Males">Intact Males</option>
              <option value="Females">Females</option>
              <option value="Castrated">Castrated</option>
              <option value="Bred/Pregnant">Bred/Pregnant</option>
              <option value="Open">Open</option>
            </Select>
            <Select value={filterPasture} onChange={e => setFilterPasture(e.target.value)} style={{ minWidth: "160px" }}>
              <option value="All Pastures">All Pastures</option>
              <option value="No Pasture Assigned">No Pasture Assigned</option>
              {pastureNamesForFilter.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select value={filterCull} onChange={e => setFilterCull(e.target.value)} style={{ minWidth: "140px" }}>
              <option value="All">All</option>
              <option value="Marked for Cull">Marked for Cull</option>
            </Select>
            <Select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ minWidth: "160px" }}>
              <option value="dateAddedNewest">Date Added (newest first)</option>
              <option value="nameAZ">Name A–Z</option>
              <option value="ageYoungest">Age (youngest first)</option>
              <option value="ageOldest">Age (oldest first)</option>
              <option value="tagNumber">Tag Number</option>
            </Select>
            {activeFilterCount > 0 && (
              <>
                <span className="hl-animals-filter-badge" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "22px", height: "22px", padding: "0 6px", borderRadius: "11px", background: "var(--brass2)", color: "#fff", fontSize: "12px", fontWeight: 600 }}>
                  {activeFilterCount}
                </span>
                <Btn size="sm" variant="ghost" onClick={clearFilters}>Clear Filters</Btn>
              </>
            )}
          </>
        );

        return (
          <>
            {bulkMode && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", padding: "8px 12px", background: "rgba(72,120,72,0.06)", borderRadius: "var(--radius)", border: "1px solid rgba(72,120,72,0.15)" }}>
                <span style={{ fontSize: "13px", color: "var(--green)", fontWeight: 600 }}>Select animals below, then tap Actions →</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(sorted.map(a => a.id))}
                  style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "13px", cursor: "pointer", padding: "4px 8px", borderRadius: "var(--radius)", textDecoration: "underline" }}
                >
                  Select All ({sorted.length})
                </button>
              </div>
            )}
            <div className="hl-animals-filter-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              {filterHeatDue && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "var(--radius)", background: "rgba(201,149,42,0.18)", border: "1px solid var(--brass2)", fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>
                  Heat due (7 days)
                  <button type="button" onClick={() => setFilterHeatDue?.(false)} style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", fontSize: "16px", lineHeight: 1, color: "var(--muted)" }} aria-label="Clear heat due filter">×</button>
                </span>
              )}
              {filterControls}
            </div>
            <div className="hl-animals-filter-bar-mobile" style={{ display: "none", marginBottom: "20px" }}>
              <button
                type="button"
                onClick={() => setShowFilterSheet(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", background: "#fff", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", fontSize: "14px", fontWeight: 600, color: "var(--ink)", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
              >
                Filter & Sort
                {activeFilterCount > 0 && (
                  <span style={{ minWidth: "20px", height: "20px", borderRadius: "10px", background: "var(--brass2)", color: "#fff", fontSize: "11px", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{activeFilterCount}</span>
                )}
              </button>
            </div>

            {showFilterSheet && (
              <div className="hl-filter-sheet-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowFilterSheet(false)}>
                <div className="hl-filter-sheet" style={{ background: "var(--cream)", borderTopLeftRadius: "16px", borderTopRightRadius: "16px", width: "100%", maxWidth: "480px", maxHeight: "85vh", overflowY: "auto", padding: "24px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                    <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, color: "var(--ink)" }}>Filter & Sort</span>
                    <button type="button" onClick={() => setShowFilterSheet(false)} style={{ background: "none", border: "none", fontSize: "24px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Search</label>
                      <Input placeholder="Name or tag..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Species</label>
                      <Select value={filterSpecies} onChange={e => setFilterSpecies(e.target.value)} style={{ width: "100%" }}>
                        <option value="All Species">All Species</option>
                        {speciesInHerd.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Sex / Status</label>
                      <Select value={filterSexStatus} onChange={e => setFilterSexStatus(e.target.value)} style={{ width: "100%" }}>
                        <option value="All">All</option>
                        <option value="Intact Males">Intact Males</option>
                        <option value="Females">Females</option>
                        <option value="Castrated">Castrated</option>
                        <option value="Bred/Pregnant">Bred/Pregnant</option>
                        <option value="Open">Open</option>
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Pasture</label>
                      <Select value={filterPasture} onChange={e => setFilterPasture(e.target.value)} style={{ width: "100%" }}>
                        <option value="All Pastures">All Pastures</option>
                        <option value="No Pasture Assigned">No Pasture Assigned</option>
                        {pastureNamesForFilter.map(p => <option key={p} value={p}>{p}</option>)}
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Cull</label>
                      <Select value={filterCull} onChange={e => setFilterCull(e.target.value)} style={{ width: "100%" }}>
                        <option value="All">All</option>
                        <option value="Marked for Cull">Marked for Cull</option>
                      </Select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Sort by</label>
                      <Select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: "100%" }}>
                        <option value="dateAddedNewest">Date Added (newest first)</option>
                        <option value="nameAZ">Name A–Z</option>
                        <option value="ageYoungest">Age (youngest first)</option>
                        <option value="ageOldest">Age (oldest first)</option>
                        <option value="tagNumber">Tag Number</option>
                      </Select>
                    </div>
                    {activeFilterCount > 0 && (
                      <Btn variant="secondary" onClick={clearFilters} style={{ marginTop: "8px" }}>Clear Filters</Btn>
                    )}
                    <Btn onClick={() => setShowFilterSheet(false)} style={{ marginTop: "8px" }}>Done</Btn>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {bulkMode && !bulkFormType && (
        <div className="hl-bulk-bar">
          <button type="button" className="hl-bulk-bar-cancel" onClick={exitBulkMode} aria-label="Exit bulk mode">✕</button>
          <span className="hl-bulk-bar-count">{selectedIds.length} selected</span>
          <button
            type="button"
            className="hl-bulk-bar-actions"
            onClick={() => setShowBulkGrid(true)}
            disabled={selectedIds.length === 0}
          >
            Actions{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""} →
          </button>
        </div>
      )}

      {bulkMode && !bulkFormType && showBulkGrid && (
        <>
          <div className="hl-bulk-sheet-backdrop" onClick={() => setShowBulkGrid(false)} />
          <div className="hl-bulk-sheet">
            <div className="hl-bulk-sheet-header">
              <span className="hl-bulk-sheet-count">{selectedIds.length} animal{selectedIds.length !== 1 ? "s" : ""} selected</span>
              <button type="button" className="hl-bulk-sheet-cancel" onClick={() => setShowBulkGrid(false)}>Cancel</button>
            </div>
            <div className="hl-bulk-sheet-list" onClick={() => setShowBulkGrid(false)}>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("vaccination"); setBulkForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "" }); }}>
                <span className="hl-bulk-sheet-icon">💉</span>
                <span className="hl-bulk-sheet-label">Vaccination</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("breeding"); setBulkForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>
                <span className="hl-bulk-sheet-icon">📅</span>
                <span className="hl-bulk-sheet-label">Log Breeding</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("move"); setBulkForm({ pastureName: "", dateMovedIn: "", notes: "" }); }}>
                <span className="hl-bulk-sheet-icon">🌿</span>
                <span className="hl-bulk-sheet-label">Move to Pasture</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("treatment"); setBulkForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>
                <span className="hl-bulk-sheet-icon">🩺</span>
                <span className="hl-bulk-sheet-label">Treatment</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              {selectedMales.length > 0 && (
                <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("castration"); setBulkForm({ date: "", method: "Banding", performer: "Owner", notes: "" }); }}>
                  <span className="hl-bulk-sheet-icon">✂️</span>
                  <span className="hl-bulk-sheet-label">Castrate</span>
                  <span className="hl-bulk-sheet-chevron">›</span>
                </button>
              )}
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("breed"); setBulkForm({ breed: "" }); }}>
                <span className="hl-bulk-sheet-icon">🏷️</span>
                <span className="hl-bulk-sheet-label">Set Breed</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { const first = selectedAnimals[0]; const sp = first?.species || "Cattle"; setBulkFormType("sex"); setBulkForm({ sex: first?.sex || getSexOptions(sp)[0], species: sp }); }}>
                <span className="hl-bulk-sheet-icon">⚥</span>
                <span className="hl-bulk-sheet-label">Set Sex</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("color"); setBulkForm({ color: "" }); }}>
                <span className="hl-bulk-sheet-icon">🎨</span>
                <span className="hl-bulk-sheet-label">Set Color</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("purchaseDate"); setBulkForm({ purchaseDate: "" }); }}>
                <span className="hl-bulk-sheet-icon">🗓️</span>
                <span className="hl-bulk-sheet-label">Set Purchase Date</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("purchasedFrom"); setBulkForm({ purchasedFrom: "" }); }}>
                <span className="hl-bulk-sheet-icon">🤝</span>
                <span className="hl-bulk-sheet-label">Set Purchased From</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              {selectedCattleForFeedlot.length > 0 && setTab && setFeederBulkAnimalIds && (
                <button type="button" className="hl-bulk-sheet-row" onClick={() => { setTab("feeder"); setFeederBulkAnimalIds(selectedCattleForFeedlot.map(a => a.id)); }}>
                  <span className="hl-bulk-sheet-icon">🏠</span>
                  <span className="hl-bulk-sheet-label">Add to Feeder Program</span>
                  <span className="hl-bulk-sheet-chevron">›</span>
                </button>
              )}
              <button type="button" className="hl-bulk-sheet-row" onClick={() => { setBulkFormType("sale"); setBulkForm({ dateSold: "", pricePerHead: "", buyerName: "", saleLocation: "", notes: "" }); }}>
                <span className="hl-bulk-sheet-icon">💰</span>
                <span className="hl-bulk-sheet-label">Mark as Sold</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
              <button type="button" className="hl-bulk-sheet-row hl-bulk-sheet-row-danger" onClick={bulkDeleteSelected}>
                <span className="hl-bulk-sheet-icon">🗑️</span>
                <span className="hl-bulk-sheet-label">Delete Selected</span>
                <span className="hl-bulk-sheet-chevron">›</span>
              </button>
            </div>
          </div>
        </>
      )}

      {runningWithBullPrompt && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => {
          const rev = runningWithBullPrompt.revertMove;
          if (rev) {
            setAnimals(prev => prev.map(an => (an.id === rev.animalId ? rev.previousAnimal : an)));
            if (rev.journalEntryId && setNotes) setNotes(prev => prev.filter(n => n.id !== rev.journalEntryId));
            setViewingAnimal(prev => (prev?.id === rev.animalId ? rev.previousAnimal : prev));
          }
          setRunningWithBullPrompt(null);
          setRunningWithBullStep("ask");
          setRunningWithBullForm({ startDate: "", endDate: "" });
        }}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Running with Bull</span>
              <button type="button" onClick={() => {
                const rev = runningWithBullPrompt.revertMove;
                if (rev) {
                  setAnimals(prev => prev.map(an => (an.id === rev.animalId ? rev.previousAnimal : an)));
                  if (rev.journalEntryId && setNotes) setNotes(prev => prev.filter(n => n.id !== rev.journalEntryId));
                  setViewingAnimal(prev => (prev?.id === rev.animalId ? rev.previousAnimal : prev));
                }
                setRunningWithBullPrompt(null);
                setRunningWithBullStep("ask");
                setRunningWithBullForm({ startDate: "", endDate: "" });
              }} style={{ background: "none", border: "none", fontSize: "22px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
            </div>
            {runningWithBullStep === "ask" ? (
              <>
                <p style={{ color: "var(--ink2)", marginBottom: "16px", fontSize: "14px" }}>
                  <strong>{getAnimalName(runningWithBullPrompt.maleAnimal)}</strong> was assigned to <strong>{runningWithBullPrompt.pastureName}</strong>. Log a &quot;Running with Bull&quot; breeding record for all {runningWithBullPrompt.eligibleFemales.length} eligible female{runningWithBullPrompt.eligibleFemales.length !== 1 ? "s" : ""} in this pasture?
                </p>
                <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "20px" }}>
                  This will create a gestation record (exposure window) for each eligible female. Males, castrated animals, and already bred females are excluded.
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Btn onClick={() => { setRunningWithBullStep("form"); const today = new Date().toISOString().split("T")[0]; setRunningWithBullForm({ startDate: today, endDate: "" }); }}>Yes</Btn>
                  <Btn variant="secondary" onClick={() => {
                    const rev = runningWithBullPrompt.revertMove;
                    if (rev) {
                      setAnimals(prev => prev.map(an => (an.id === rev.animalId ? rev.previousAnimal : an)));
                      if (rev.journalEntryId && setNotes) setNotes(prev => prev.filter(n => n.id !== rev.journalEntryId));
                      setViewingAnimal(prev => (prev?.id === rev.animalId ? rev.previousAnimal : prev));
                    }
                    setRunningWithBullPrompt(null);
                    setRunningWithBullStep("ask");
                    setRunningWithBullForm({ startDate: "", endDate: "" });
                  }}>No</Btn>
                </div>
              </>
            ) : (
              <>
                <div className="hl-form-grid-3" style={{ marginBottom: "16px" }}>
                  <DateInputWithValidation label="Turn Out Date *" breedingDueTwoDigitYear value={runningWithBullForm.startDate} onValueChange={v => setRunningWithBullForm(p => ({ ...p, startDate: v }))} />
                  <DateInputWithValidation label="Pull Date (optional)" breedingDueTwoDigitYear value={runningWithBullForm.endDate} onValueChange={v => setRunningWithBullForm(p => ({ ...p, endDate: v }))} />
                </div>
                <p style={{ fontSize: "14px", color: "var(--ink2)", marginBottom: "20px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)" }}>
                  <strong>{runningWithBullPrompt.eligibleFemales.length}</strong> female{runningWithBullPrompt.eligibleFemales.length !== 1 ? "s" : ""} will receive breeding records{runningWithBullPrompt.eligibleFemales.length > 0 ? ": " : ""}
                  {runningWithBullPrompt.eligibleFemales.length <= 5
                    ? runningWithBullPrompt.eligibleFemales.map(f => getAnimalName(f)).join(", ")
                    : runningWithBullPrompt.eligibleFemales.slice(0, 5).map(f => getAnimalName(f)).join(", ") + ` and ${runningWithBullPrompt.eligibleFemales.length - 5} more`}
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Btn onClick={confirmRunningWithBull} disabled={!runningWithBullForm.startDate}>Confirm — Log {runningWithBullPrompt.eligibleFemales.length} record{runningWithBullPrompt.eligibleFemales.length !== 1 ? "s" : ""}</Btn>
                  <Btn variant="secondary" onClick={() => setRunningWithBullStep("ask")}>Back</Btn>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {bulkFormType === "vaccination" && (() => {
        const bulkProtocol = bulkForm.protocolId ? (settings?.vaccinationProtocols ?? []).find(p => p.id === bulkForm.protocolId) : null;
        const bulkProtocolMode = !!bulkProtocol?.vaccines?.length;
        return (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Vaccination ({selectedIds.length} animals)</div>
          {(settings?.vaccinationProtocols ?? []).length > 0 && (
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Use Protocol</label>
              <Select value={bulkForm.protocolId || ""} onChange={e => {
                const id = e.target.value || "";
                setBulkForm(p => ({ ...p, protocolId: id, vaccineName: "", dosage: "", route: "IM (Intramuscular)", boosterIntervalDays: "", nextDueDate: "" }));
              }} style={{ width: "100%" }}>
                <option value="">— None —</option>
                {(settings?.vaccinationProtocols ?? []).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
          {bulkProtocolMode && bulkProtocol && (
            <div style={{ marginBottom: "14px", padding: "10px 12px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "14px" }}>
              <div style={{ fontWeight: 600, color: "var(--ink2)" }}>{bulkProtocol.name}</div>
              <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "2px" }}>{bulkProtocol.vaccines.map(v => (v.vaccineName || "").trim()).filter(Boolean).join(", ")}</div>
            </div>
          )}
          {bulkProtocolMode ? (
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <DateInputWithValidation label="Date given" value={bulkForm.dateGiven} onValueChange={v => setBulkForm(p => ({ ...p, dateGiven: v }))} />
              <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
                <option>Owner</option>
                <option>Vet</option>
              </Select>
            </div>
          ) : (
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label="Product name" value={bulkForm.vaccineName} onChange={e => setBulkForm(p => ({ ...p, vaccineName: e.target.value }))} placeholder="e.g. Ivomec, Cylence, Vision 7, Bovi-Shield" />
              <DateInputWithValidation label="Date given" value={bulkForm.dateGiven} onValueChange={v => setBulkForm(p => ({ ...p, dateGiven: v }))} />
              <DateInputWithValidation label="Next due / Booster date" breedingDueTwoDigitYear value={bulkForm.nextDueDate} onValueChange={v => setBulkForm(p => ({ ...p, nextDueDate: v }))} />
              <Input label="Dosage" value={bulkForm.dosage} onChange={e => setBulkForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 2 mL" />
              <Select label="Route" value={bulkForm.route} onChange={e => setBulkForm(p => ({ ...p, route: e.target.value }))}>
                {VACCINE_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
              <Input label="Booster interval (days)" type="number" min={0} value={bulkForm.boosterIntervalDays} onChange={e => setBulkForm(p => ({ ...p, boosterIntervalDays: e.target.value }))} placeholder="e.g. 365" />
              <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
                <option>Owner</option>
                <option>Vet</option>
              </Select>
            </div>
          )}
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkVaccination}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
        );
      })()}

      {bulkFormType === "breeding" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Log Breeding ({selectedFemales.length} females)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            {!bulkForm.runningWithBull ? (
              <DateInputWithValidation label="Breeding Date *" breedingDueTwoDigitYear value={bulkForm.breedingDate} onValueChange={v => setBulkForm(p => ({ ...p, breedingDate: v }))} />
            ) : (
              <>
                <DateInputWithValidation label="Turn Out Date *" breedingDueTwoDigitYear value={bulkForm.breedingDate} onValueChange={v => setBulkForm(p => ({ ...p, breedingDate: v }))} />
                <DateInputWithValidation label="Pull Date (optional)" breedingDueTwoDigitYear value={bulkForm.breedingDateEnd} onValueChange={v => setBulkForm(p => ({ ...p, breedingDateEnd: v }))} />
              </>
            )}
            <Input label="Sire (optional)" value={bulkForm.sire} onChange={e => setBulkForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", cursor: "pointer" }}>
            <input type="checkbox" checked={bulkForm.runningWithBull} onChange={e => setBulkForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            <span>Bull turned out with group (exposure window)</span>
          </label>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkBreeding} disabled={selectedFemales.length === 0}>Apply to {selectedFemales.length} females</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "move" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Move to Pasture ({selectedPastureEligible.length} Cattle/Horses)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <PastureCombo label="Pasture name" value={bulkForm.pastureName} onChange={v => setBulkForm(p => ({ ...p, pastureName: v }))} options={getCanonicalPastureNames(animals, pastures)} placeholder="Select or type new pasture" id="pasture-list-bulk" />
            <DateInputWithValidation label="Move date" value={bulkForm.dateMovedIn} onValueChange={v => setBulkForm(p => ({ ...p, dateMovedIn: v }))} />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkMove} disabled={selectedPastureEligible.length === 0}>Move {selectedPastureEligible.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "treatment" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Treatment ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <DateInputWithValidation label="Date *" value={bulkForm.date} onValueChange={v => setBulkForm(p => ({ ...p, date: v }))} />
            <Select label="Type *" value={bulkForm.type} onChange={e => setBulkForm(p => ({ ...p, type: e.target.value }))}>
              <option value="">— Select —</option>
              {TREATMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Description" value={bulkForm.description} onChange={e => setBulkForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Lameness, respiratory" />
            <Input label="Treatment given" value={bulkForm.treatmentGiven} onChange={e => setBulkForm(p => ({ ...p, treatmentGiven: e.target.value }))} placeholder="e.g. Penicillin, bandage" />
            <Input label="Dosage" value={bulkForm.dosage} onChange={e => setBulkForm(p => ({ ...p, dosage: e.target.value }))} placeholder="e.g. 5 ml" />
            <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
            <Input label="Cost" type="number" min="0" step="0.01" value={bulkForm.cost} onChange={e => setBulkForm(p => ({ ...p, cost: e.target.value }))} placeholder="Optional" />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkTreatment}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "castration" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Castrate ({selectedMales.length} males)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <DateInputWithValidation label="Date performed" value={bulkForm.date} onValueChange={v => setBulkForm(p => ({ ...p, date: v }))} />
            <Select label="Method" value={bulkForm.method} onChange={e => setBulkForm(p => ({ ...p, method: e.target.value }))}>
              <option>Banding</option>
              <option>Surgical</option>
              <option>Burdizzo</option>
            </Select>
            <Select label="Performed by" value={bulkForm.performer} onChange={e => setBulkForm(p => ({ ...p, performer: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkCastration}>Apply to {selectedMales.length} males</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "breed" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Edit Breed ({selectedIds.length} animals)</div>
          <Input label="Breed" value={bulkForm.breed} onChange={e => setBulkForm(p => ({ ...p, breed: e.target.value }))} placeholder="e.g. Angus" style={{ marginBottom: "14px", maxWidth: "320px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkBreed}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "sex" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Edit Sex ({selectedIds.length} animals)</div>
          <Select label="Sex" value={bulkForm.sex} onChange={e => setBulkForm(p => ({ ...p, sex: e.target.value }))} style={{ marginBottom: "14px", maxWidth: "240px" }}>
            {(getSexOptions(bulkForm.species || "Cattle") || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </Select>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkSex}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "color" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Edit Color ({selectedIds.length} animals)</div>
          <Input label="Color" value={bulkForm.color} onChange={e => setBulkForm(p => ({ ...p, color: e.target.value }))} placeholder="e.g. Black, Red Baldy" style={{ marginBottom: "14px", maxWidth: "320px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkColor}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "purchaseDate" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Edit Purchase Date ({selectedIds.length} animals)</div>
          <DateInputWithValidation label="Purchase date" value={bulkForm.purchaseDate} onValueChange={v => setBulkForm(p => ({ ...p, purchaseDate: v }))} style={{ marginBottom: "14px", maxWidth: "220px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkPurchaseDate}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "purchasedFrom" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Edit Purchased From ({selectedIds.length} animals)</div>
          {setContacts ? (
            <div style={{ marginBottom: "14px" }}><ContactPicker label="Seller / Purchased from" value={bulkForm.purchasedFrom} onChange={v => setBulkForm(p => ({ ...p, purchasedFrom: v }))} contacts={contacts} setContacts={setContacts} placeholder="Search contacts or type name" /></div>
          ) : (
            <Input label="Purchased from" value={bulkForm.purchasedFrom} onChange={e => setBulkForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" style={{ marginBottom: "14px", maxWidth: "320px" }} />
          )}
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkPurchasedFrom}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "sale" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Mark as Sold ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <DateInputWithValidation label="Date Sold *" value={bulkForm.dateSold} onValueChange={v => setBulkForm(p => ({ ...p, dateSold: v }))} />
            <Input label="Price Per Head ($)" type="number" min="0" step="0.01" value={bulkForm.pricePerHead} onChange={e => setBulkForm(p => ({ ...p, pricePerHead: e.target.value }))} placeholder="e.g. 1250.00" />
            <Input label="Buyer Name" value={bulkForm.buyerName} onChange={e => setBulkForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Cattle Co." />
            <Input label="Sale Location" value={bulkForm.saleLocation} onChange={e => setBulkForm(p => ({ ...p, saleLocation: e.target.value }))} placeholder="e.g. Dodge City Sale Barn" />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkSale} disabled={!bulkForm.dateSold}>Mark {selectedIds.length} animals as sold</Btn>
            <Btn variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showAdd && (
        <RegisterAnimalForm
          key={registerFormKey}
          defaultSpecies={defaultSpecies}
          initialSingleValues={registerInitialSingle}
          animals={animals}
          pastures={pastures}
          contacts={contacts}
          setContacts={setContacts}
          setNotes={setNotes}
          onRegister={(payload) => {
            if (payload.kind === "single") setAnimals(p => [...p, payload.animal]);
            else setAnimals(p => [...p, ...payload.animals]);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {!sorted.length && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🐄</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>{search ? "No animals match your search." : "No animals registered yet."}</div>
        </Card>
      )}

      {viewMode === "list" && sorted.length > 0 && (
        <Card className="hl-card-no-padding hl-animals-list-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sorted.map((a, idx) => {
              const activeGest = isFemale(a) && a.species !== "Mule" ? gestations.find(g => g.animalId === a.id && g.status !== "Delivered") : null;
              const pastureName = a.movements?.[0]?.pastureName?.trim() || "";
              const health = getHealthStatus(a);
              const rowBg = idx % 2 === 0 ? "#fff" : "var(--cream)";
              return (
                <div
                  key={a.id}
                  className={`hl-animals-list-row${bulkMode ? " hl-animals-list-row-bulk" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (bulkMode) { toggleBulkSelect(a.id); } else { setViewing(a); setShowSaleForm(false); } }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (bulkMode) toggleBulkSelect(a.id); else { setViewing(a); setShowSaleForm(false); } } }}
                  style={{
                    background: bulkMode && selectedIds.includes(a.id) ? "rgba(201,149,42,0.15)" : rowBg,
                    borderBottom: idx < sorted.length - 1 ? "1px solid var(--cream2)" : "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={e => { if (!bulkMode) e.currentTarget.style.background = "var(--cream2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = bulkMode && selectedIds.includes(a.id) ? "rgba(201,149,42,0.15)" : rowBg; }}
                >
                  {bulkMode && (
                    <div className="hl-animals-list-cell hl-animals-list-checkbox" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleBulkSelect(a.id)} style={{ width: "18px", height: "18px", accentColor: "var(--green)", cursor: "pointer" }} />
                    </div>
                  )}
                  <div className="hl-animals-list-cell hl-animals-list-emoji">
                  {(a.photoUrl || a.photo) ? (
                      <img src={a.photoUrl || a.photo} alt="" style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "cover", display: "block" }} />
                    ) : (
                      <span>{SPECIES[a.species]?.emoji}</span>
                    )}
                  </div>
                  <div className="hl-animals-list-cell hl-animals-list-name-dot">
                    <span className="hl-animals-list-name" style={{ fontWeight: 600, fontSize: "14px" }} title={getAnimalName(a)}>{getAnimalName(a)}</span>
                    {!a.deceased ? (
                      <span className="hl-animals-list-health-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: health === "red" ? "var(--danger2)" : health === "yellow" ? "var(--brass2)" : "var(--green3)" }} title={health === "red" ? "Recent illness" : health === "yellow" ? "Treatment in last 30 days" : "No recent issues"} />
                    ) : (
                      <span style={{ width: "8px", display: "inline-block" }} />
                    )}
                  </div>
                  <div className="hl-animals-list-cell hl-animals-list-species" style={{ fontSize: "13px", color: "var(--muted)" }}>{a.species}</div>
                  <div className="hl-animals-list-cell hl-animals-list-breed" style={{ fontSize: "13px", color: "var(--muted)" }} title={a.breed || undefined}>{a.breed || "—"}</div>
                  <div className="hl-animals-list-cell hl-animals-list-age" style={{ fontSize: "13px", color: "var(--muted)" }}>{ageFromDob(a.dob)}</div>
                  <div className="hl-animals-list-cell hl-animals-list-status" style={{ fontSize: "13px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {a.cull && <Badge color="#c0392b" style={{ background: "#c0392b", color: "#fff", fontSize: "11px" }}>CULL</Badge>}
                    {activeGest ? (
                      <span style={{ fontWeight: 600, color: "var(--brass)" }} title={`Due ${fmtDueRange(activeGest)}`}>Pregnant</span>
                    ) : (() => {
                      const runningWith = getRunningWithMaleForFemale(a, animals);
                      return runningWith ? <span style={{ color: "var(--brass2)" }}>Running with {getAnimalName(runningWith)}</span> : displaySex(a, gestations);
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {viewMode === "tile" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "14px" }}>
        {sorted.map(a => (
          <Card key={a.id} style={{
            padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s", position: "relative", overflow: "hidden",
            ...(bulkMode && selectedIds.includes(a.id) ? { boxShadow: "0 0 0 2px var(--brass)", borderColor: "var(--brass)" } : {})
          }}
            onClick={() => { if (bulkMode) { toggleBulkSelect(a.id); } else { setViewing(a); setShowSaleForm(false); } }}
            onMouseEnter={e => { if (!bulkMode) { e.currentTarget.style.boxShadow = "var(--shadow2)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (!bulkMode) { e.currentTarget.style.boxShadow = "var(--shadow)"; e.currentTarget.style.transform = ""; } }}
          >
            {bulkMode && (
              <div style={{ position: "absolute", top: "12px", left: "12px", zIndex: 1 }} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleBulkSelect(a.id)} style={{ width: "18px", height: "18px", accentColor: "var(--green)", cursor: "pointer" }} />
              </div>
            )}
            {(a.deceased || a.butchered) && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none" }}>
                  {a.deceased && <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>}
                  {a.butchered && <Badge color="#5a3e2b" style={{ background: "#5a3e2b", color: "#fff" }}>Butchered</Badge>}
                </div>
              </>
            )}
            {(a.cull || (a.sale && !a.deceased && !a.butchered)) && (
              <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                {a.cull && !a.deceased && !a.butchered && <Badge color="#c0392b" style={{ background: "#c0392b", color: "#fff" }}>CULL</Badge>}
                {a.sale && !a.deceased && !a.butchered && <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {!a.deceased && (
                  <span style={{ width: "10px", height: "10px", flexShrink: 0, borderRadius: "50%", background: getHealthStatus(a) === "red" ? "var(--danger2)" : getHealthStatus(a) === "yellow" ? "var(--brass2)" : "var(--green3)", boxShadow: "0 0 0 2px #fff" }} title={getHealthStatus(a) === "red" ? "Recent illness" : getHealthStatus(a) === "yellow" ? "Treatment in last 30 days" : "No recent issues"} />
                )}
                {(a.photoUrl || a.photo) ? (
                  <img src={a.photoUrl || a.photo} alt="" style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: "28px" }}>{SPECIES[a.species]?.emoji}</span>
                )}
              </div>
              {a.name && a.tag && !a.deceased && <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>#{a.tag}</span>}
            </div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "2px" }}>{getAnimalName(a)}</div>
            <div style={{ fontSize: "13px", color: "var(--muted)" }}>{a.breed || a.species} · {displaySex(a, gestations)}</div>
            {(() => { const runningWith = getRunningWithMaleForFemale(a, animals); return runningWith ? <div style={{ fontSize: "12px", color: "var(--brass2)", marginTop: "4px" }}>Running with {getAnimalName(runningWith)}</div> : null; })()}
            {isFemale(a) && a.species !== "Mule" && (() => {
              const activeGest = gestations.find(g => g.animalId === a.id && g.status !== "Delivered");
              if (!activeGest) return null;
              const totalDays = activeGest.gestationDays ?? SPECIES[a.species]?.days ?? 283;
              const prog = progress(breedingDateForProgress(activeGest), totalDays);
              const dueInfo = daysUntilDue(activeGest);
              const daysRemaining = dueInfo.isRange ? dueInfo.end : dueInfo.start;
              const overdue = daysRemaining < 0;
              const accent = overdue ? "var(--danger2)" : "var(--brass)";
              const dueLabel = overdue ? `Overdue ${Math.abs(daysRemaining)}d` : daysRemaining === 0 ? "Due today" : `${daysRemaining} days left`;
              return (
                <div style={{ marginTop: "8px", marginBottom: "4px", padding: "8px 10px", background: overdue ? "rgba(192,57,43,0.08)" : "rgba(201,149,42,0.12)", borderRadius: "6px", borderLeft: `3px solid ${accent}` }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: accent, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Pregnant</div>
                  <div style={{ fontSize: "12px", color: overdue ? "var(--danger2)" : "var(--ink2)", marginBottom: "6px" }}>
                    Due {fmtDueRange(activeGest)} · {dueLabel}
                  </div>
                  <div style={{ height: "4px", background: "var(--cream2)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, prog))}%`, background: accent, borderRadius: "2px", transition: "width 0.2s ease" }} />
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "6px" }}>{ageFromDob(a.dob)}</div>
          </Card>
        ))}
      </div>
      )}

      {inbreedingWarningPending && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setInbreedingWarningPending(null)}>
          <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "24px", maxWidth: "440px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--cream2)", borderLeft: inbreedingWarningPending.level === "half_sibling" ? "4px solid var(--danger2)" : inbreedingWarningPending.level === "shared_grandparent" ? "4px solid var(--brass2)" : undefined }} onClick={e => e.stopPropagation()}>
            {inbreedingWarningPending.level === "half_sibling" && inbreedingWarningPending.sameParentType === "sire" ? (
              <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                These animals share the same sire and may be half-siblings. Are you sure you want to continue?
              </p>
            ) : inbreedingWarningPending.level === "half_sibling" && inbreedingWarningPending.sameParentType === "dam" ? (
              <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                These animals share the same dam and may be half-siblings. Are you sure you want to continue?
              </p>
            ) : inbreedingWarningPending.level === "half_sibling" ? (
              <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--danger2)" }}>Strong warning — half-siblings:</strong> <strong>{inbreedingWarningPending.bullName}</strong> and <strong>{inbreedingWarningPending.cowName}</strong> share the same dam or sire (<strong>{inbreedingWarningPending.commonAncestorName}</strong>). Breeding these animals may result in severe inbreeding. Do you want to continue?
              </p>
            ) : inbreedingWarningPending.level === "shared_grandparent" ? (
              <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--brass2)" }}>Moderate warning — shared grandparent:</strong> The selected sire and <strong>{inbreedingWarningPending.cowName}</strong> share a common ancestor (<strong>{inbreedingWarningPending.commonAncestorName}</strong>). Breeding may increase inbreeding risk. Do you want to continue?
              </p>
            ) : (
              <p style={{ fontSize: "15px", color: "var(--ink2)", marginBottom: "20px", lineHeight: 1.5 }}>
                Warning: <strong>{inbreedingWarningPending.bullName}</strong> and <strong>{inbreedingWarningPending.cowName}</strong> share a common ancestor (<strong>{inbreedingWarningPending.commonAncestorName}</strong>). Breeding these animals may result in inbreeding. Do you want to continue?
              </p>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setInbreedingWarningPending(null)}>Cancel</Btn>
              <Btn onClick={() => {
                const { record, linkedHeat, recordId, animalId } = inbreedingWarningPending;
                setGestations(p => [...p, { ...record, inbreedingWarning: true }]);
                if (linkedHeat) {
                  setAnimals(prev => prev.map(x => x.id === animalId ? { ...x, heatCycles: (x.heatCycles || []).map(h => h.id === linkedHeat.id ? { ...h, linkedGestationId: recordId } : h) } : x));
                }
                setShowBreedingForm(false);
                setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", sireNotInHerd: false, notes: "" });
                setInbreedingWarningPending(null);
              }}>Continue</Btn>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !importSuccess && importStep !== 5 && closeImportModal()}>
          <Card style={{ maxWidth: "720px", width: "100%", maxHeight: "90vh", overflow: "auto", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600 }}>Import Animals</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Btn size="sm" variant="ghost" onClick={downloadImportTemplate}>Download Template</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setShowImportInstructions(true)}>How to Import</Btn>
                {importStep !== 5 && (
                  <button type="button" onClick={closeImportModal} style={{ background: "none", border: "none", fontSize: "24px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
                )}
              </div>
            </div>

            {showImportInstructions && (
              <div style={{ marginBottom: "20px", padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ fontWeight: 600, fontSize: "15px" }}>How to Import</span>
                  <button type="button" onClick={() => setShowImportInstructions(false)} style={{ background: "none", border: "none", fontSize: "20px", color: "var(--muted)", cursor: "pointer" }}>×</button>
                </div>
                <ol style={{ margin: 0, paddingLeft: "20px", color: "var(--ink2)", fontSize: "14px", lineHeight: 1.7 }}>
                  <li><strong>Upload your file.</strong> Use any CSV from your computer or spreadsheet. Column names don't have to match exactly — we'll figure them out.</li>
                  <li><strong>Check the mapping.</strong> We'll suggest which columns match Name, Tag, Species, and so on. You can change any mapping with the dropdowns. Species is required.</li>
                  <li><strong>Preview the data.</strong> Flip through the first few rows to see how they'll look in your herd. Fix the mapping if something looks wrong.</li>
                  <li><strong>Handle duplicates.</strong> If we find animals that already exist (same tag or same name + species), you can choose to skip or overwrite each one.</li>
                  <li><strong>Import.</strong> We'll add new animals and update any you chose to overwrite. Blank rows are skipped. You'll get a summary when it's done.</li>
                </ol>
                <p style={{ marginTop: "12px", marginBottom: 0, fontSize: "13px", color: "var(--muted)" }}>Tip: Use "Download Template" to get a sample CSV with the right format and example rows.</p>
              </div>
            )}

            {importStep === 5 && importSuccess ? (
              <div style={{ padding: "20px 0" }}>
                <div style={{ fontSize: "16px", color: "var(--green)", fontWeight: 600, marginBottom: "12px" }}>Import complete</div>
                <ul style={{ margin: "0 0 20px 20px", padding: 0, color: "var(--ink2)", fontSize: "14px", lineHeight: 1.8 }}>
                  <li><strong>{importSuccess.imported}</strong> animal{importSuccess.imported !== 1 ? "s" : ""} imported successfully.</li>
                  {importSuccess.skippedDuplicates > 0 && <li><strong>{importSuccess.skippedDuplicates}</strong> skipped as duplicates (you chose to skip).</li>}
                  {importSuccess.blankCount > 0 && <li><strong>{importSuccess.blankCount}</strong> blank row{importSuccess.blankCount !== 1 ? "s" : ""} skipped.</li>}
                  {importSuccess.errorCount > 0 && (
                    <li><strong>{importSuccess.errorCount}</strong> row{importSuccess.errorCount !== 1 ? "s" : ""} had errors:
                    <ul style={{ marginTop: "6px", marginBottom: 0 }}>
                      {importSuccess.errors.slice(0, 15).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
                      {importSuccess.errors.length > 15 && <li>… and {importSuccess.errors.length - 15} more</li>}
                    </ul>
                    </li>
                  )}
                </ul>
                <Btn onClick={closeImportModal}>Close</Btn>
              </div>
            ) : importStep === 1 ? (
              <>
                <div style={{ marginBottom: "20px" }}>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImportFile(file);
                      parseImportFile(file, (data, err, autoMapping) => {
                        if (err) { alert(err); return; }
                        setImportData(data);
                        setImportMapping(autoMapping || {});
                      });
                    }}
                    style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                    aria-hidden="true"
                  />
                  <div
                    className={`hl-import-dropzone ${importDragActive ? "hl-import-dropzone-active" : ""}`}
                    onClick={() => importFileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setImportDragActive(true); }}
                    onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setImportDragActive(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setImportDragActive(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setImportDragActive(false);
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      const ext = (file.name || "").toLowerCase().split(".").pop();
                      if (!["csv", "xlsx", "xls", "txt"].includes(ext)) {
                        alert("Please drop a .csv or Excel file.");
                        return;
                      }
                      setImportFile(file);
                      parseImportFile(file, (data, err, autoMapping) => {
                        if (err) { alert(err); return; }
                        setImportData(data);
                        setImportMapping(autoMapping || {});
                      });
                    }}
                  >
                    <div style={{ fontSize: "32px", marginBottom: "10px", color: "var(--green)" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ margin: "0 auto", display: "block" }}>
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink2)", marginBottom: "4px" }}>Upload your CSV file</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>Drag and drop or click to browse. Any column names are fine — we'll match them automatically.</div>
                  </div>
                  {importFile && (
                    <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(72, 120, 72, 0.1)", border: "1px solid var(--green3)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--green)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{importFile.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportData(null); setImportMapping({}); setImportStep(1); }} style={{ background: "none", border: "none", color: "var(--brass)", fontWeight: 600, cursor: "pointer", fontSize: "12px" }}>Remove</button>
                    </div>
                  )}
                </div>
                {importData && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                    <Btn onClick={() => setImportStep(2)}>Next: Map columns</Btn>
                    <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                  </div>
                )}
              </>
            ) : importStep === 2 ? (
              <>
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>Map your columns to Herd Ledger fields</div>
                <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "16px" }}>We've auto-detected the mappings below. Change any dropdown if we got it wrong. Species is required.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                  {IMPORT_HL_FIELDS.map(hl => (
                    <div key={hl}>
                      <label style={{ display: "block", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>{hl}{hl === "Species" ? " *" : ""}</label>
                      <Select value={importMapping[hl] ?? ""} onChange={e => setImportMapping(prev => ({ ...prev, [hl]: e.target.value || undefined }))} style={{ width: "100%" }}>
                        <option value="">— Don't import —</option>
                        {importData.headers.filter(Boolean).map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Btn onClick={() => setImportStep(3)} disabled={!importMapping.Species}>Next: Preview</Btn>
                  <Btn variant="secondary" onClick={() => setImportStep(1)}>Back</Btn>
                  <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                </div>
              </>
            ) : importStep === 3 ? (
              (() => {
                const { byRow, validCount, errorCount, duplicateRows, blankCount } = getImportPreview();
                const previewRows = byRow.filter(r => !r.blank).slice(0, 5);
                const previewIndex = previewRows.length === 0 ? 0 : Math.min(importPreviewRowIndex, previewRows.length - 1);
                const current = previewRows[previewIndex];
                return (
                  <>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Preview: how the first rows will appear</div>
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>{previewRows.length === 0 ? "No data rows in the first 5 (all blank)." : `Row ${current?.rowIndex ?? 0} of ${previewRows.length} shown. Verify the data looks right.`}</p>
                    {current && (
                      <div style={{ padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid " + (current.duplicate ? "var(--brass)" : "var(--cream2)"), marginBottom: "16px", borderLeft: current.duplicate ? "4px solid var(--brass)" : undefined }}>
                        {current.duplicate && (
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--brass)", marginBottom: "10px" }}>Duplicate: matches existing {getAnimalName(current.duplicate)}{current.duplicate.tag ? ` (tag #${current.duplicate.tag})` : ""}</div>
                        )}
                        {current.error ? (
                          <div style={{ color: "var(--danger2)", fontWeight: 600 }}>Error: {current.error}</div>
                        ) : current.data ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 20px", fontSize: "14px" }}>
                            <div><span style={{ color: "var(--muted)" }}>Name</span><div style={{ fontWeight: 600 }}>{current.data.name || "—"}</div></div>
                            <div><span style={{ color: "var(--muted)" }}>Tag</span><div>{current.data.tag || "—"}</div></div>
                            <div><span style={{ color: "var(--muted)" }}>Species</span><div>{current.data.species}</div></div>
                            <div><span style={{ color: "var(--muted)" }}>Breed</span><div>{current.data.breed || "—"}</div></div>
                            <div><span style={{ color: "var(--muted)" }}>Sex</span><div>{current.data.sex || "—"}</div></div>
                            <div><span style={{ color: "var(--muted)" }}>Date of Birth</span><div>{current.data.dob ? fmt(current.data.dob) : "—"}</div></div>
                            <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--muted)" }}>Notes</span><div>{current.data.notes || "—"}</div></div>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {previewRows.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                        {previewRows.map((row, i) => (
                          <button key={i} type="button" onClick={() => setImportPreviewRowIndex(i)} title={row.duplicate ? `Row ${row.rowIndex}: duplicate of ${getAnimalName(row.duplicate)}` : undefined} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid " + (previewIndex === i ? "var(--brass)" : row.duplicate ? "var(--brass)" : "var(--cream3)"), background: previewIndex === i ? "var(--cream)" : row.duplicate ? "rgba(180, 140, 80, 0.15)" : "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px", color: previewIndex === i ? "var(--ink)" : row.duplicate ? "var(--brass)" : "var(--muted)" }}>{i + 1}</button>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>
                      {validCount + duplicateRows.length} row{(validCount + duplicateRows.length) !== 1 ? "s" : ""} with data{duplicateRows.length > 0 ? ` (${duplicateRows.length} duplicate${duplicateRows.length !== 1 ? "s" : ""} — same tag or name + species)` : ""} · {errorCount} error{errorCount !== 1 ? "s" : ""} · {blankCount} blank row{blankCount !== 1 ? "s" : ""} skipped
                    </p>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <Btn onClick={() => duplicateRows.length > 0 ? setImportStep(4) : runImport()}>{duplicateRows.length > 0 ? "Next: Duplicates" : "Import"}</Btn>
                      <Btn variant="secondary" onClick={() => setImportStep(2)}>Back</Btn>
                      <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                    </div>
                  </>
                );
              })()
            ) : importStep === 4 ? (
              (() => {
                const { duplicateRows } = getImportPreview();
                return (
                  <>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Duplicate animals found</div>
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>These rows match an animal already in your herd (same tag or same name + species). Choose Skip to leave the existing record as-is, or Overwrite to update it with the imported data.</p>
                    <div style={{ maxHeight: "280px", overflowY: "auto", marginBottom: "16px", border: "1px solid var(--cream2)", borderRadius: "var(--radius)" }}>
                      {duplicateRows.map(({ rowIndex, data, duplicate }) => (
                        <div key={rowIndex} style={{ padding: "12px 14px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, minWidth: "80px" }}>Row {rowIndex}</span>
                          <span style={{ color: "var(--ink2)", flex: "1 1 200px" }}>{data.name || "—"} / {data.tag || "—"} ({data.species})</span>
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>→ matches existing {getAnimalName(duplicate)}</span>
                          <Select value={importDuplicateChoices[rowIndex] || "skip"} onChange={e => setImportDuplicateChoices(prev => ({ ...prev, [rowIndex]: e.target.value }))} style={{ width: "120px" }}>
                            <option value="skip">Skip</option>
                            <option value="overwrite">Overwrite</option>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <Btn onClick={runImport}>Import</Btn>
                      <Btn variant="secondary" onClick={() => setImportStep(3)}>Back</Btn>
                      <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                    </div>
                  </>
                );
              })()
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
