import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { SPECIES, PASTURE_SPECIES, IMPORT_HL_FIELDS, TREATMENT_TYPES, TREATMENT_TYPE_TO_EXPENSE_CATEGORY, SEX_TERM_GENDER, DEFAULT_SETTINGS, CASTRATED_TERM_BY_SPECIES, INTACT_MALE_TERM_BY_SPECIES } from "../lib/constants.js";
import { getSexOptions, getOffspringSexOptions, getOffspringDefaultSex, getOffspringTerm, getCalculatedWeaningDate, getExpectedWeaningDate, getHealthStatus, getAnimalName, fmt, ageFromDob, getAgeBasedSexTerm, getCanonicalPastureNames, resolvePastureName, pastureNameEq, getBreedingMaleInPasture, getEligibleFemalesForRunningWithBull, getRunningWithMaleForFemale, createMovementJournalEntry, compressImageToBase64, isFemale, isMale, dueDate, displaySex, fmtDueRange, progress, breedingDateForProgress, daysUntilDue, birthDateWithinGestationWindow, breedingDateFromDelivery, getBreedingMalesForSpecies, isBreedingMale, feederDaysOnFeed, estimatedWeightFromADG, getLatestWeightForAnimal, getADGDefault } from "../lib/helpers.js";
import { Card, Badge, Btn, Input, Select, Textarea, PastureCombo, SectionTitle } from "./ui.jsx";

// ── Animals ───────────────────────────────────────────────────────────────────
export default function Animals({ animals, setAnimals, offspring, setOffspring, gestations, setGestations, user, viewingAnimal, setViewingAnimal, search: searchProp, setSearch: setSearchProp, defaultSpecies = "Cattle", feederPrograms, setFeederPrograms, setTab, setFeederPreselectAnimalId, setFeederBulkAnimalIds, setExpenses, settings, setSettings, pastures, notes, setNotes, setDeliveryGestureId, promptAddOffspring, setPromptAddOffspring }) {
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
  const [form, setForm] = useState(() => {
    const sp = defaultSpecies || "Cattle";
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", color: "", currentPasture: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
  });
  const viewing = viewingAnimal;
  const setViewing = setViewingAnimal;
  const [searchLocal, setSearchLocal] = useState("");
  const search = searchProp !== undefined ? searchProp : searchLocal;
  const setSearch = setSearchProp !== undefined ? setSearchProp : setSearchLocal;
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [editingOffspringId, setEditingOffspringId] = useState(null);
  const [linkExistingAnimalId, setLinkExistingAnimalId] = useState(null);
  const [offspringForm, setOffspringForm] = useState({
    name: "",
    tag: "",
    sex: "",
    species: "",
    birthWeight: "",
    dob: "",
    weaningDate: "",
    stillborn: false,
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
  });
  const [showDeceasedAnimals, setShowDeceasedAnimals] = useState(false);
  const [showArchivedAnimals, setShowArchivedAnimals] = useState(false);
  const [filterSpecies, setFilterSpecies] = useState("All Species");
  const [filterSexStatus, setFilterSexStatus] = useState("All");
  const [filterPasture, setFilterPasture] = useState("All Pastures");
  const [sortBy, setSortBy] = useState("dateAddedNewest");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [breedingForm, setBreedingForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" });
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [moveForm, setMoveForm] = useState({ pastureName: "", dateMovedIn: "", notes: "" });
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightForm, setWeightForm] = useState({ weight: "", date: "", notes: "" });
  const [showTreatmentForm, setShowTreatmentForm] = useState(false);
  const [treatmentForm, setTreatmentForm] = useState({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkFormType, setBulkFormType] = useState(null);
  const [bulkForm, setBulkForm] = useState({});
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [saleForm, setSaleForm] = useState({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" });
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
  const [registerMode, setRegisterMode] = useState("single"); // "single" | "bulk"
  const [bulkRegisterForm, setBulkRegisterForm] = useState(() => {
    const sp = defaultSpecies || "Cattle";
    return { species: sp, breed: "", sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", startingTag: "", count: "1", notes: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
  });
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
    if (!runningWithBullPrompt || !runningWithBullForm.startDate || !runningWithBullForm.endDate) return;
    const { maleAnimal, eligibleFemales } = runningWithBullPrompt;
    const start = runningWithBullForm.startDate;
    const end = runningWithBullForm.endDate;
    const newRecords = eligibleFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = dueDate(end, totalDays);
      return {
        animalId: an.id,
        breedingDate: start,
        breedingDateEnd: end,
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

  const emptyForm = () => {
    const sp = defaultSpecies || "Cattle";
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", color: "", currentPasture: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "", targetWeaningDate: "" };
  };

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

  function add() {
    if (!form.name) return;
    const { currentPasture, purchasePrice: _pp, ...rest } = form;
    const newAnimal = {
      ...rest,
      id: Date.now().toString(),
      acquisitionType: form.acquisitionType || "Home Raised",
      purchasePrice: form.purchasePrice?.trim() ? parseFloat(form.purchasePrice) : undefined,
      purchaseDate: form.purchaseDate?.trim() || undefined,
      purchasedFrom: form.purchasedFrom?.trim() || undefined,
      targetWeaningDate: form.targetWeaningDate?.trim() || undefined,
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
    setAnimals(p => [...p, newAnimal]);
    setForm(emptyForm());
    setShowAdd(false);
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
    const dob = bulkRegisterForm.dob?.trim() || undefined;
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
        purchaseDate: bulkRegisterForm.purchaseDate?.trim() || undefined,
        purchasedFrom: bulkRegisterForm.purchasedFrom?.trim() || undefined,
      });
    }
    setAnimals(p => [...p, ...newAnimals]);
    setShowAdd(false);
    setBulkRegisterForm(() => {
      const sp = defaultSpecies || "Cattle";
      return { species: sp, breed: "", sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", startingTag: String(base + count), count: "1", notes: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const purchasePriceNum = form.purchasePrice?.trim() ? parseFloat(form.purchasePrice) : undefined;
    const opts = getSexOptions(form.species);
    const validSex = (form.sex && opts.includes(form.sex)) ? form.sex : (viewing?.sex && opts.includes(viewing.sex) ? viewing.sex : opts[0]);
    const updated = {
      ...viewing,
      name: form.name || undefined,
      species: form.species,
      sex: validSex,
      dob: form.dob || undefined,
      breed: form.breed || undefined,
      tag: form.tag || undefined,
      notes: form.notes || undefined,
      color: form.color?.trim() || undefined,
      acquisitionType: form.acquisitionType || "Home Raised",
      purchasePrice: purchasePriceNum,
      purchaseDate: form.purchaseDate?.trim() || undefined,
      purchasedFrom: form.purchasedFrom?.trim() || undefined,
      targetWeaningDate: form.targetWeaningDate?.trim() || undefined,
    };
    setAnimals(prev => prev.map(x => (x.id === editingId ? updated : x)));
    setViewing(updated);
    setEditingId(null);
    setForm(emptyForm());
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

  const filtered = (animals || []).filter(a => {
    const showByDeceased = showDeceasedAnimals ? true : !a.deceased;
    const showByArchived = showArchivedAnimals ? true : !a.sale;
    if (!showByDeceased || !showByArchived) return false;

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
    const a = viewing;
    const offspringForMother = (offspring && offspring[a.id]) || [];

    const linkableAnimals = (animals || []).filter(
      an => an.species === a.species && an.id !== a.id && !an.deceased && !an.sale
        && !(offspringForMother || []).some(c => c.id === an.id)
    );

    function linkExistingAsOffspring(existingId) {
      const existing = animals.find(an => an.id === existingId);
      if (!existing) return;
      setAnimals(prev => prev.map(an => (an.id === existingId ? { ...an, motherId: a.id } : an)));
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
      const rec = {
        id: isEdit ? editingOffspringId : Date.now().toString(),
        motherId: a.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: effectiveSex,
        species: motherSpecies,
        birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
        dob: offspringForm.dob || undefined,
        weaningDate: offspringForm.weaningDate || undefined,
        stillborn,
        createdAt: isEdit ? (offspringForMother.find(c => c.id === editingOffspringId)?.createdAt) : new Date().toISOString(),
      };
      const prevRec = isEdit ? offspringForMother.find(c => c.id === editingOffspringId) : null;
      const activeForMother = gestations.filter(g => g.animalId === a.id && g.status !== "Delivered");
      const matchingGestation = rec.dob ? activeForMother.find(g => birthDateWithinGestationWindow(rec.dob, g)) : null;
      const existingAnimal = isEdit ? animals.find(an => an.id === editingOffspringId) : null;
      const sireIdFromGestation = matchingGestation?.sireAnimalId ?? (existingAnimal?.sireId ?? undefined);
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
          dob: offspringForm.dob || undefined,
          breed: a.breed || undefined,
          notes: undefined,
          motherId: a.id,
          sireId: sireIdFromGestation,
        };
        if (isEdit) {
          setAnimals(prev => prev.map(an => an.id === editingOffspringId ? { ...an, ...updatedAnimal } : an));
        } else {
          setAnimals(prev => [...prev, updatedAnimal]);
        }
      }
      if (rec.dob) {
        const calfData = {
          name: offspringForm.name || undefined,
          tag: offspringForm.tag || undefined,
          sex: effectiveSex,
          birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
          weaningDate: offspringForm.weaningDate || undefined,
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

    function markDeliveredToBuyer(animalId) {
      const an = (animals || []).find(x => x.id === animalId);
      if (!an?.sale) return;
      const updatedSale = { ...an.sale, delivered: true, deliveredAt: new Date().toISOString() };
      setAnimals(prev => prev.map(x => (x.id === animalId ? { ...x, sale: updatedSale } : x)));
      setViewing(prev => (prev && prev.id === animalId ? { ...prev, sale: updatedSale } : prev));
    }

    function saveVaccination() {
      const rec = editingVaccinationId
        ? {
            id: editingVaccinationId,
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: vaccinationForm.nextDueDate || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
          }
        : {
            id: Date.now().toString(),
            vaccineName: vaccinationForm.vaccineName || undefined,
            dateGiven: vaccinationForm.dateGiven || undefined,
            nextDueDate: vaccinationForm.nextDueDate || undefined,
            administeredBy: vaccinationForm.administeredBy || undefined,
            notes: vaccinationForm.notes || undefined,
          };
      const nextList = editingVaccinationId
        ? (a.vaccinations || []).map(v => (v.id === editingVaccinationId ? rec : v))
        : [...(a.vaccinations || []), rec];
      setAnimals(prev =>
        prev.map(an => (an.id === a.id ? { ...an, vaccinations: nextList } : an))
      );
      setViewing(prev =>
        prev && prev.id === a.id ? { ...prev, vaccinations: nextList } : prev
      );
      setShowVaccinationForm(false);
      setEditingVaccinationId(null);
      setVaccinationForm({
        vaccineName: "",
        dateGiven: "",
        nextDueDate: "",
        administeredBy: "Owner",
        notes: "",
      });
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
      const entry = {
        id: Date.now().toString(),
        date: treatmentForm.date,
        type: treatmentForm.type,
        description: treatmentForm.description?.trim() || undefined,
        treatmentGiven: treatmentForm.treatmentGiven?.trim() || undefined,
        dosage: treatmentForm.dosage?.trim() || undefined,
        administeredBy: treatmentForm.administeredBy || "Owner",
        cost: treatmentForm.cost?.trim() ? parseFloat(treatmentForm.cost) : undefined,
        notes: treatmentForm.notes?.trim() || undefined,
      };
      const nextTreatments = [...(a.treatments || []), entry].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
      const updated = { ...a, treatments: nextTreatments };
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      if (setExpenses && entry.cost != null && entry.cost > 0) {
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
      const end = breedingForm.runningWithBull ? breedingForm.breedingDateEnd : breedingForm.breedingDate;
      if (!start || (breedingForm.runningWithBull && !end)) return;
      const totalDays = SPECIES[a.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = breedingForm.runningWithBull ? dueDate(end, totalDays) : dueStart;
      const sireDisplay = breedingForm.sireAnimalId === "unknown" ? "Unknown" : (breedingForm.sire || undefined);
      const sireId = breedingForm.sireAnimalId && breedingForm.sireAnimalId !== "unknown" ? breedingForm.sireAnimalId : undefined;
      const record = {
        animalId: a.id,
        breedingDate: start,
        ...(breedingForm.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
        dueDate: dueStart,
        ...(breedingForm.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
        sire: sireDisplay,
        ...(sireId && { sireAnimalId: sireId }),
        notes: breedingForm.notes,
        id: Date.now().toString(),
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
      setGestations(p => [...p, record]);
      setShowBreedingForm(false);
      setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" });
    }

    const breedingSireOptions = getBreedingMalesForSpecies(animals, a.species);

    const vaccinationsSorted = [...(a.vaccinations || [])].sort((x, y) => {
      const d1 = x.dateGiven || "";
      const d2 = y.dateGiven || "";
      return d2.localeCompare(d1);
    });

    return (
      <>
      <div className="no-print hl-page hl-page-narrow hl-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => { setViewing(null); setEditingId(null); }} style={{ background: "none", border: "none", color: "var(--green)", fontWeight: 600, fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            ← Back to Animals
          </button>
          {editingId !== a.id && (
            <Btn onClick={() => {
                const species = a.species || "Cattle";
                const opts = getSexOptions(species);
                const sex = opts.includes(a.sex) ? a.sex : (SEX_TERM_GENDER[a.sex] === "Female" ? opts.find(o => SEX_TERM_GENDER[o] === "Female") : opts.find(o => SEX_TERM_GENDER[o] === "Male")) || opts[0];
                setEditingId(a.id);
                setForm({ name: a.name || "", species, sex: sex || opts[0], dob: a.dob || "", breed: a.breed || "", tag: a.tag || "", notes: a.notes || "", color: a.color || "", acquisitionType: a.acquisitionType || "Home Raised", purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : "", purchaseDate: a.purchaseDate || "", purchasedFrom: a.purchasedFrom || "", targetWeaningDate: a.targetWeaningDate || "" });
              }}>Edit</Btn>
          )}
        </div>

        {editingId === a.id && (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Edit Animal</div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
              <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
              <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
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
                  <Input label="Purchase date" type="date" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} />
                  <Input label="Purchased from (seller)" value={form.purchasedFrom} onChange={e => setForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />
                </>
              )}
            </div>
            <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={saveEdit}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>Cancel</Btn>
            </div>
          </Card>
        )}

        <Card className="hl-card-no-padding" style={{ padding: "0", overflow: "hidden" }}>
          <div className="hl-detail-header" style={{ background: "var(--green)", padding: "28px 32px", display: "flex", alignItems: "center", gap: "20px" }}>
            <div className="hl-animal-profile-photo-wrap" style={{ position: "relative", flexShrink: 0 }}>
              <div className="hl-animal-profile-photo" style={{ width: "96px", height: "96px", borderRadius: "50%", overflow: "hidden", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid rgba(255,255,255,0.4)" }}>
                {a.photo ? (
                  <img src={a.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                    const dataUrl = await compressImageToBase64(file);
                    const updated = { ...a, photo: dataUrl };
                    setAnimals(prev => prev.map(an => an.id === a.id ? updated : an));
                    setViewing(updated);
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
                style={{ position: "absolute", bottom: 0, right: 0, width: "32px", height: "32px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.9)", background: "var(--green)", color: "#fff", cursor: photoUploading ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}
                title="Add or change photo"
                aria-label="Add or change photo"
              >
                {photoUploading ? (
                  <span style={{ fontSize: "14px" }}>…</span>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                )}
              </button>
            </div>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div className="hl-detail-name" style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "#fff" }}>{getAnimalName(a)}</div>
              <div className="hl-detail-meta" style={{ color: "var(--brass3)", fontSize: "14px", marginTop: "2px" }}>{a.breed || a.species} · {displaySex(a, gestations)}{(() => { const runningWith = getRunningWithMaleForFemale(a, animals); return runningWith ? ` · Running with ${getAnimalName(runningWith)}` : ""; })()}</div>
            </div>
            <div className="hl-detail-badges" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {getRunningWithMaleForFemale(a, animals) && <Badge color="var(--brass2)" style={{ background: "rgba(201,149,42,0.2)", color: "var(--brass)" }}>Running with {getAnimalName(getRunningWithMaleForFemale(a, animals))}</Badge>}
              {a.deceased && <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>}
              {a.sale && <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>}
              {a.tag && a.name && !a.deceased && <Badge color="var(--brass2)">#{a.tag}</Badge>}
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
                    <Input label="Date" type="date" value={weightForm.date} onChange={e => setWeightForm(p => ({ ...p, date: e.target.value }))} />
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

            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Weaning</div>
              {a.weaningDate ? (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--green3)", fontSize: "14px" }}>
                  Weaned on {fmt(a.weaningDate)}
                </div>
              ) : (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>Suggested weaning date (from DOB + species default). Adjust if needed.</div>
                  <Input
                    label="Target weaning date"
                    type="date"
                    value={a.targetWeaningDate || getCalculatedWeaningDate(a) || ""}
                    onChange={e => {
                      const v = e.target.value.trim() || undefined;
                      const updated = { ...a, targetWeaningDate: v };
                      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
                      setViewing(updated);
                    }}
                  />
                </div>
              )}
            </div>

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
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Health & Treatment Log</div>
                <Btn size="sm" variant="secondary" onClick={() => { setShowTreatmentForm(true); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Add Treatment</Btn>
              </div>
              {showTreatmentForm && (
                <Card style={{ padding: "18px 20px", marginBottom: "12px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Add Treatment</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Date *" type="date" value={treatmentForm.date} onChange={e => setTreatmentForm(p => ({ ...p, date: e.target.value }))} />
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
                    <Btn size="sm" onClick={saveTreatment}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowTreatmentForm(false); setTreatmentForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>Cancel</Btn>
                  </div>
                </Card>
              )}
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
                        <Btn size="sm" variant="ghost" onClick={() => deleteTreatmentEntry(entry.id)}>×</Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: "24px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Lineage</div>
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--ink2)" }}>
                  <div>
                    <span style={{ color: "var(--muted)", marginRight: "6px" }}>Dam:</span>
                    {a.motherId ? (() => {
                      const mother = animals.find(m => m.id === a.motherId);
                      return mother ? (
                        <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}{mother.tag ? ` (#${mother.tag})` : ""}</button>
                      ) : (
                        <span>Unknown</span>
                      );
                    })() : (
                      <span>Unknown</span>
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
            </div>
            {(() => {
              const asDam = (animals || []).filter(an => an.motherId === a.id);
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
                      <Input label="Move date" type="date" value={moveForm.dateMovedIn} onChange={e => setMoveForm(p => ({ ...p, dateMovedIn: e.target.value }))} />
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
                      <Input
                        label="Date performed"
                        type="date"
                        value={castrationForm.date}
                        onChange={e => setCastrationForm(p => ({ ...p, date: e.target.value }))}
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
                    {!showBreedingForm ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <Btn size="sm" variant="secondary" onClick={() => {
                      const damGestations = (gestations || []).filter(g => g.animalId === a.id).sort((x, y) => (y.breedingDate || "").localeCompare(x.breedingDate || ""));
                      const latest = damGestations[0];
                      if (latest?.sireAnimalId) {
                        const male = animals.find(m => m.id === latest.sireAnimalId);
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: latest.sireAnimalId, sire: male ? getAnimalName(male) : (latest.sire || "") }));
                      } else if (latest?.sire === "Unknown" || (latest?.sire && String(latest.sire).trim().toLowerCase() === "unknown")) {
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: "unknown", sire: "Unknown" }));
                      } else if (latest?.sire) {
                        setBreedingForm(prev => ({ ...prev, sireAnimalId: "", sire: latest.sire }));
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
                            <Input label="Breeding Date *" type="date" value={breedingForm.breedingDate} onChange={e => setBreedingForm(p => ({ ...p, breedingDate: e.target.value }))} />
                          ) : (
                            <>
                              <Input label="Exposure start *" type="date" value={breedingForm.breedingDate} onChange={e => setBreedingForm(p => ({ ...p, breedingDate: e.target.value }))} />
                              <Input label="Exposure end *" type="date" value={breedingForm.breedingDateEnd} onChange={e => setBreedingForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
                            </>
                          )}
                          <Select label="Sire (optional)" value={breedingForm.sireAnimalId || ""} onChange={e => {
                            const v = e.target.value;
                            if (v === "unknown") setBreedingForm(p => ({ ...p, sireAnimalId: "unknown", sire: "Unknown" }));
                            else if (!v) setBreedingForm(p => ({ ...p, sireAnimalId: "", sire: "" }));
                            else { const m = animals.find(x => x.id === v); setBreedingForm(p => ({ ...p, sireAnimalId: v, sire: m ? getAnimalName(m) : "" })); }
                          }}>
                            <option value="">— None —</option>
                            <option value="unknown">Unknown</option>
                            {breedingSireOptions.map(m => (
                              <option key={m.id} value={m.id}>{getAnimalName(m)}{m.name && m.tag ? ` #${m.tag}` : ""}</option>
                            ))}
                          </Select>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
                          <input type="checkbox" checked={breedingForm.runningWithBull} onChange={e => setBreedingForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                          <span>Running with Bull (date range for bull exposure)</span>
                        </label>
                        <Textarea label="Notes" value={breedingForm.notes} onChange={e => setBreedingForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                        {breedingForm.breedingDate && (breedingForm.runningWithBull ? breedingForm.breedingDateEnd : true) && (() => {
                          const days = SPECIES[a.species]?.days;
                          if (!days) return null;
                          const start = dueDate(breedingForm.breedingDate, days);
                          const end = breedingForm.runningWithBull && breedingForm.breedingDateEnd ? dueDate(breedingForm.breedingDateEnd, days) : start;
                          const dueStr = breedingForm.runningWithBull && breedingForm.breedingDateEnd ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
                          return (
                            <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                              📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
                            </div>
                          );
                        })()}
                        <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                          <Btn onClick={addBreedingFromProfile}>Record</Btn>
                          <Btn variant="secondary" onClick={() => { setShowBreedingForm(false); setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", sireAnimalId: "", notes: "" }); }}>Cancel</Btn>
                        </div>
                      </Card>
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
                      });
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
                            <Btn size="sm" variant="ghost" onClick={() => { const sp = c.species || a.species || ""; setEditingOffspringId(c.id); setOffspringForm({ name: c.name || "", tag: c.tag || "", sex: (c.sex && String(c.sex).trim()) ? c.sex : getOffspringDefaultSex(sp), species: sp, birthWeight: c.birthWeight != null ? String(c.birthWeight) : "", dob: c.dob || "", weaningDate: c.weaningDate || "", stillborn: !!c.stillborn }); setShowOffspringForm(true); }}>Edit</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => deleteOffspring(c.id)}>Delete</Btn>
                          </div>
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {(c.sex || c.dob) && (() => { const term = getAgeBasedSexTerm({ ...c, species: c.species || a.species }, []); return term !== "—" ? <span>{term}</span> : null; })()}
                          {c.birthWeight && <span>{(c.sex || c.dob) ? " · " : ""}{c.birthWeight} lbs at birth</span>}
                        </div>
                        {(c.dob || c.weaningDate) && (
                          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                            {c.dob && <span>Born {fmt(c.dob)}</span>}
                            {c.weaningDate && <span>{c.dob ? " · " : ""}Wean {fmt(c.weaningDate)}</span>}
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
                    {!editingOffspringId && linkableAnimals.length > 0 && (
                      <div style={{ marginBottom: "14px" }}>
                        <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "6px" }}>Link existing animal (optional)</label>
                        <select
                          value={linkExistingAnimalId || ""}
                          onChange={e => setLinkExistingAnimalId(e.target.value || null)}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px" }}
                        >
                          <option value="">— Add new {getOffspringTerm(a.species).toLowerCase()} —</option>
                          {linkableAnimals.map(an => (
                            <option key={an.id} value={an.id}>{getAnimalName(an)}{an.tag ? ` #${an.tag}` : ""} · {an.species}</option>
                          ))}
                        </select>
                        {linkExistingAnimalId && (
                          <Btn size="sm" onClick={() => linkExistingAsOffspring(linkExistingAnimalId)} style={{ marginTop: "10px" }}>
                            Link as offspring
                          </Btn>
                        )}
                      </div>
                    )}
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
                      <Input
                        label="Birthday"
                        type="date"
                        value={offspringForm.dob}
                        onChange={e => setOffspringForm(p => ({ ...p, dob: e.target.value }))}
                      />
                      <Input
                        label="Target Weaning Date"
                        type="date"
                        value={offspringForm.weaningDate}
                        onChange={e => setOffspringForm(p => ({ ...p, weaningDate: e.target.value }))}
                      />
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
                  </Card>
                )}
              </div>
            )}

            {/* Vaccination Records — all animals */}
            <div className="hl-profile-section" style={{ marginTop: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Vaccination Records
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditingVaccinationId(null);
                    setShowVaccinationForm(true);
                    setVaccinationForm({
                      vaccineName: "",
                      dateGiven: "",
                      nextDueDate: "",
                      administeredBy: "Owner",
                      notes: "",
                    });
                  }}
                >
                  Add Vaccination
                </Btn>
              </div>

              {vaccinationsSorted.length === 0 && !showVaccinationForm && (
                <p style={{ fontSize: "13px", color: "var(--muted)" }}>No vaccinations recorded for this animal.</p>
              )}

              {vaccinationsSorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {vaccinationsSorted.map(v => (
                    <div key={v.id} style={{ padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--cream)", borderLeft: "3px solid var(--green3)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{v.vaccineName || "Unnamed vaccine"}</div>
                        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                          <Btn size="sm" variant="ghost" onClick={() => { setEditingVaccinationId(v.id); setVaccinationForm({ vaccineName: v.vaccineName || "", dateGiven: v.dateGiven || "", nextDueDate: v.nextDueDate || "", administeredBy: v.administeredBy || "Owner", notes: v.notes || "" }); setShowVaccinationForm(true); }}>Edit</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => deleteVaccination(v.id)}>Delete</Btn>
                        </div>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {v.dateGiven && <span>Given {fmt(v.dateGiven)}</span>}
                        {v.nextDueDate && <span>{v.dateGiven ? " · " : ""}Next due {fmt(v.nextDueDate)}</span>}
                        {v.administeredBy && <span>{v.dateGiven || v.nextDueDate ? " · " : ""}{v.administeredBy}</span>}
                      </div>
                      {v.notes && <div style={{ fontSize: "13px", color: "var(--ink2)", marginTop: "6px" }}>{v.notes}</div>}
                    </div>
                  ))}
                </div>
              )}

              {showVaccinationForm && (
                <Card style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--green3)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                    {editingVaccinationId ? "Edit Vaccination" : "Add Vaccination"}
                  </div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input
                      label="Vaccine name"
                      value={vaccinationForm.vaccineName}
                      onChange={e => setVaccinationForm(p => ({ ...p, vaccineName: e.target.value }))}
                      placeholder="e.g. Clostridial 7-way"
                    />
                    <Input
                      label="Date given"
                      type="date"
                      value={vaccinationForm.dateGiven}
                      onChange={e => setVaccinationForm(p => ({ ...p, dateGiven: e.target.value }))}
                    />
                    <Input
                      label="Next due date"
                      type="date"
                      value={vaccinationForm.nextDueDate}
                      onChange={e => setVaccinationForm(p => ({ ...p, nextDueDate: e.target.value }))}
                    />
                    <Select
                      label="Administered by"
                      value={vaccinationForm.administeredBy}
                      onChange={e => setVaccinationForm(p => ({ ...p, administeredBy: e.target.value }))}
                    >
                      <option>Owner</option>
                      <option>Vet</option>
                    </Select>
                  </div>
                  <Textarea
                    label="Notes"
                    value={vaccinationForm.notes}
                    onChange={e => setVaccinationForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Btn size="sm" onClick={saveVaccination}>{editingVaccinationId ? "Save Changes" : "Save Vaccination"}</Btn>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowVaccinationForm(false);
                        setEditingVaccinationId(null);
                        setVaccinationForm({
                          vaccineName: "",
                          dateGiven: "",
                          nextDueDate: "",
                          administeredBy: "Owner",
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
              {!a.sale && !a.deceased && !showSaleForm && (
                <Btn size="sm" variant="secondary" onClick={() => { setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); setShowSaleForm(true); }}>Mark as Sold</Btn>
              )}
              {showSaleForm && (
                <Card style={{ padding: "18px 20px", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Mark as Sold</div>
                  <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
                    <Input label="Date sold" type="date" value={saleForm.dateSold} onChange={e => setSaleForm(p => ({ ...p, dateSold: e.target.value }))} />
                    <Input label="Price per head ($)" type="number" min="0" step="0.01" value={saleForm.pricePerHead} onChange={e => setSaleForm(p => ({ ...p, pricePerHead: e.target.value }))} placeholder="e.g. 1250.00" />
                    <Input label="Buyer name" value={saleForm.buyerName} onChange={e => setSaleForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Livestock" />
                    <Input label="Buyer contact (optional)" value={saleForm.buyerContact} onChange={e => setSaleForm(p => ({ ...p, buyerContact: e.target.value }))} placeholder="Phone or email" />
                    <Input label="Sale location (optional)" value={saleForm.saleLocation} onChange={e => setSaleForm(p => ({ ...p, saleLocation: e.target.value }))} placeholder="e.g. Sale barn name" />
                  </div>
                  <Textarea label="Notes" value={saleForm.notes} onChange={e => setSaleForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
                  <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                    <Btn size="sm" onClick={saveSale}>Save</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => { setShowSaleForm(false); setSaleForm({ dateSold: "", pricePerHead: "", buyerName: "", buyerContact: "", saleLocation: "", notes: "" }); }}>Cancel</Btn>
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
                  setForm({ name: "", species, sex, breed: a.breed || "", tag: a.tag || "", dob: "", notes: a.notes || "" });
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
            <div><strong>Dam:</strong> {a.motherId ? (() => {
              const mother = animals.find(m => m.id === a.motherId);
              return mother ? (
                <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}{mother.tag ? ` (#${mother.tag})` : ""}</button>
              ) : (
                <span>Unknown</span>
              );
            })() : (
              <span>Unknown</span>
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
          const asDam = (animals || []).filter(an => an.motherId === a.id);
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
            <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Vaccinations</h2>
            <div style={{ fontSize: "14px" }}>
              {[...(a.vaccinations || [])].sort((x, y) => (y.dateGiven || "").localeCompare(x.dateGiven || "")).map((v, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: i < a.vaccinations.length - 1 ? "1px solid #EDE6D6" : "none" }}>
                  <strong>{v.vaccineName || "Vaccine"}</strong> — Given {fmt(v.dateGiven)}{v.nextDueDate ? ` · Next due ${fmt(v.nextDueDate)}` : ""}{v.administeredBy ? ` · ${v.administeredBy}` : ""}
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
                  {c.weaningDate && ` · Wean ${fmt(c.weaningDate)}`}
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
                  return (
                    <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                      {g.status === "Delivered" ? `Delivered ${fmt(g.deliveredAt)}` : `Active · Due ${fmt(g.dueDate)}`}
                      {(g.sire || g.sireAnimalId) && (
                        <> · Sire: {sireAnimal ? (
                          <button type="button" onClick={() => setViewing(sireAnimal)} style={{ background: "none", border: "none", padding: 0, color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontSize: "inherit" }}>{sireLabel}</button>
                        ) : (
                          <span>{sireLabel}</span>
                        )}</>
                      )}
                      {g.calf && (g.calf.stillborn ? " · Stillborn" : (g.calf.name ? ` · ${getOffspringTerm(a.species)}: ${g.calf.name}` : ""))}
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
                      {` · Bred ${g.breedingDate ? fmt(g.breedingDate) : "—"}${g.runningWithBull && g.breedingDateEnd ? ` – ${fmt(g.breedingDateEnd)}` : ""}`}
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

  function toggleBulkSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds([]);
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

  function saveBulkVaccination() {
    const rec = {
      vaccineName: bulkForm.vaccineName || undefined,
      dateGiven: bulkForm.dateGiven || undefined,
      nextDueDate: bulkForm.nextDueDate || undefined,
      administeredBy: bulkForm.administeredBy || undefined,
      notes: bulkForm.notes || undefined,
    };
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const entry = { ...rec, id: Date.now().toString() + "-" + an.id };
        return { ...an, vaccinations: [...(an.vaccinations || []), entry] };
      })
    );
    setBulkFormType(null);
    setBulkForm({});
  }

  function saveBulkBreeding() {
    const start = bulkForm.breedingDate;
    const end = bulkForm.runningWithBull ? bulkForm.breedingDateEnd : bulkForm.breedingDate;
    if (!start || (bulkForm.runningWithBull && !end)) return;
    const newRecords = selectedFemales.map(an => {
      const totalDays = SPECIES[an.species]?.days || 150;
      const dueStart = dueDate(start, totalDays);
      const dueEnd = bulkForm.runningWithBull ? dueDate(end, totalDays) : dueStart;
      return {
        animalId: an.id,
        breedingDate: start,
        ...(bulkForm.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
        dueDate: dueStart,
        ...(bulkForm.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
        sire: bulkForm.sire,
        notes: bulkForm.notes,
        id: Date.now().toString() + "-" + an.id,
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
    });
    setGestations(p => [...p, ...newRecords]);
    setBulkFormType(null);
    setBulkForm({});
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
    setBulkFormType(null);
    setBulkForm({});
    if (pastureName) setRunningWithBullCheckPending({ pastureName });
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
    setBulkFormType(null);
    setBulkForm({});
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
    setBulkFormType(null);
    setBulkForm({});
  }

  return (
    <div className={`hl-page hl-fade-in${bulkMode && selectedIds.length > 0 ? " hl-page-with-bulk-toolbar" : ""}`}>
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
              onClick={() => { setBulkMode(true); setSelectedIds([]); setBulkFormType(null); setViewing(null); }}
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
            <Btn onClick={() => { setEditingId(null); setForm(emptyForm()); setRegisterMode("single"); setShowAdd(true); }}>+ Register Animals</Btn>
          </div>
        </div>
      }>
        Animal Register
      </SectionTitle>

      {/* Show/hide deceased + archived */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
        {deceasedCount > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={showDeceasedAnimals} onChange={e => setShowDeceasedAnimals(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            Show deceased animals ({deceasedCount})
          </label>
        )}
        {(animals || []).filter(a => a.sale).length > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "var(--muted)", cursor: "pointer" }}>
            <input type="checkbox" checked={showArchivedAnimals} onChange={e => setShowArchivedAnimals(e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            Show archived (sold) animals ({(animals || []).filter(a => a.sale).length})
          </label>
        )}
      </div>

      {/* Filter & Sort bar (desktop: full bar; mobile: button that opens bottom sheet) */}
      {(() => {
        const activeFilterCount = (search.trim() ? 1 : 0) + (filterSpecies !== "All Species" ? 1 : 0) + (filterSexStatus !== "All" ? 1 : 0) + (filterPasture !== "All Pastures" ? 1 : 0);
        const clearFilters = () => {
          setSearch("");
          setFilterSpecies("All Species");
          setFilterSexStatus("All");
          setFilterPasture("All Pastures");
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
            <div className="hl-animals-filter-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
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

      {bulkMode && selectedIds.length > 0 && (
        <Card className="hl-bulk-toolbar">
          <div className="hl-bulk-toolbar-header">
            <span className="hl-bulk-toolbar-count">{selectedIds.length} selected</span>
            <Btn size="sm" variant="secondary" onClick={exitBulkMode}>Cancel</Btn>
          </div>
          <div className="hl-bulk-toolbar-actions">
            <button type="button" className="hl-bulk-action-btn" onClick={() => { setBulkFormType("vaccination"); setBulkForm({ vaccineName: "", dateGiven: "", nextDueDate: "", administeredBy: "Owner", notes: "" }); }}>
              <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 2v4M14 2v4"/><path d="M5 8h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"/><path d="M12 14v4"/><path d="M9 18h6"/></svg></span>
              <span className="hl-bulk-action-label">Vaccination</span>
            </button>
            <button type="button" className="hl-bulk-action-btn" onClick={() => { setBulkFormType("breeding"); setBulkForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>
              <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span>
              <span className="hl-bulk-action-label">Log Breeding</span>
            </button>
            <button type="button" className="hl-bulk-action-btn" onClick={() => { setBulkFormType("move"); setBulkForm({ pastureName: "", dateMovedIn: "", notes: "" }); }}>
              <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
              <span className="hl-bulk-action-label">Move to Pasture</span>
            </button>
            <button type="button" className="hl-bulk-action-btn" onClick={() => { setBulkFormType("treatment"); setBulkForm({ date: "", type: "", description: "", treatmentGiven: "", dosage: "", administeredBy: "Owner", cost: "", notes: "" }); }}>
              <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span>
              <span className="hl-bulk-action-label">Treatment</span>
            </button>
            {selectedMales.length > 0 && (
              <button type="button" className="hl-bulk-action-btn" onClick={() => { setBulkFormType("castration"); setBulkForm({ date: "", method: "Banding", performer: "Owner", notes: "" }); }}>
                <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg></span>
                <span className="hl-bulk-action-label">Castrate</span>
              </button>
            )}
            {selectedCattleForFeedlot.length > 0 && setTab && setFeederBulkAnimalIds && (
              <button type="button" className="hl-bulk-action-btn" onClick={() => { setTab("feeder"); setFeederBulkAnimalIds(selectedCattleForFeedlot.map(a => a.id)); }}>
                <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span>
                <span className="hl-bulk-action-label">Add to Feeder Program</span>
              </button>
            )}
            <button type="button" className="hl-bulk-action-btn hl-bulk-action-btn-danger" onClick={bulkDeleteSelected}>
              <span className="hl-bulk-action-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></span>
              <span className="hl-bulk-action-label">Delete Selected</span>
            </button>
          </div>
        </Card>
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
                  <Btn onClick={() => { setRunningWithBullStep("form"); const today = new Date().toISOString().split("T")[0]; setRunningWithBullForm({ startDate: today, endDate: today }); }}>Yes</Btn>
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
                  <Input label="Exposure start date *" type="date" value={runningWithBullForm.startDate} onChange={e => setRunningWithBullForm(p => ({ ...p, startDate: e.target.value }))} />
                  <Input label="Exposure end date *" type="date" value={runningWithBullForm.endDate} onChange={e => setRunningWithBullForm(p => ({ ...p, endDate: e.target.value }))} />
                </div>
                <p style={{ fontSize: "14px", color: "var(--ink2)", marginBottom: "20px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)" }}>
                  <strong>{runningWithBullPrompt.eligibleFemales.length}</strong> female{runningWithBullPrompt.eligibleFemales.length !== 1 ? "s" : ""} will receive breeding records{runningWithBullPrompt.eligibleFemales.length > 0 ? ": " : ""}
                  {runningWithBullPrompt.eligibleFemales.length <= 5
                    ? runningWithBullPrompt.eligibleFemales.map(f => getAnimalName(f)).join(", ")
                    : runningWithBullPrompt.eligibleFemales.slice(0, 5).map(f => getAnimalName(f)).join(", ") + ` and ${runningWithBullPrompt.eligibleFemales.length - 5} more`}
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <Btn onClick={confirmRunningWithBull} disabled={!runningWithBullForm.startDate || !runningWithBullForm.endDate}>Confirm — Log {runningWithBullPrompt.eligibleFemales.length} record{runningWithBullPrompt.eligibleFemales.length !== 1 ? "s" : ""}</Btn>
                  <Btn variant="secondary" onClick={() => setRunningWithBullStep("ask")}>Back</Btn>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {bulkFormType === "vaccination" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Vaccination ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Vaccine name" value={bulkForm.vaccineName} onChange={e => setBulkForm(p => ({ ...p, vaccineName: e.target.value }))} placeholder="e.g. Clostridial 7-way" />
            <Input label="Date given" type="date" value={bulkForm.dateGiven} onChange={e => setBulkForm(p => ({ ...p, dateGiven: e.target.value }))} />
            <Input label="Next due date" type="date" value={bulkForm.nextDueDate} onChange={e => setBulkForm(p => ({ ...p, nextDueDate: e.target.value }))} />
            <Select label="Administered by" value={bulkForm.administeredBy} onChange={e => setBulkForm(p => ({ ...p, administeredBy: e.target.value }))}>
              <option>Owner</option>
              <option>Vet</option>
            </Select>
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkVaccination}>Apply to {selectedIds.length} animals</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "breeding" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Log Breeding ({selectedFemales.length} females)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            {!bulkForm.runningWithBull ? (
              <Input label="Breeding Date *" type="date" value={bulkForm.breedingDate} onChange={e => setBulkForm(p => ({ ...p, breedingDate: e.target.value }))} />
            ) : (
              <>
                <Input label="Exposure start *" type="date" value={bulkForm.breedingDate} onChange={e => setBulkForm(p => ({ ...p, breedingDate: e.target.value }))} />
                <Input label="Exposure end *" type="date" value={bulkForm.breedingDateEnd} onChange={e => setBulkForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
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
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "move" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Move to Pasture ({selectedPastureEligible.length} Cattle/Horses)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <PastureCombo label="Pasture name" value={bulkForm.pastureName} onChange={v => setBulkForm(p => ({ ...p, pastureName: v }))} options={getCanonicalPastureNames(animals, pastures)} placeholder="Select or type new pasture" id="pasture-list-bulk" />
            <Input label="Move date" type="date" value={bulkForm.dateMovedIn} onChange={e => setBulkForm(p => ({ ...p, dateMovedIn: e.target.value }))} />
          </div>
          <Textarea label="Notes" value={bulkForm.notes} onChange={e => setBulkForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={saveBulkMove} disabled={selectedPastureEligible.length === 0}>Move {selectedPastureEligible.length} animals</Btn>
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "treatment" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Apply Treatment ({selectedIds.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Date *" type="date" value={bulkForm.date} onChange={e => setBulkForm(p => ({ ...p, date: e.target.value }))} />
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
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {bulkFormType === "castration" && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Bulk Castrate ({selectedMales.length} males)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Date performed" type="date" value={bulkForm.date} onChange={e => setBulkForm(p => ({ ...p, date: e.target.value }))} />
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
            <Btn variant="secondary" onClick={() => { setBulkFormType(null); setBulkForm({}); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "16px" }}>Register Animals</div>
          <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
            <Btn variant={registerMode === "single" ? undefined : "ghost"} size="sm" onClick={() => setRegisterMode("single")} style={registerMode === "single" ? { background: "var(--green3)", color: "var(--green)" } : {}}>Single Animal</Btn>
            <Btn variant={registerMode === "bulk" ? undefined : "ghost"} size="sm" onClick={() => setRegisterMode("bulk")} style={registerMode === "bulk" ? { background: "var(--green3)", color: "var(--green)" } : {}}>Bulk Register</Btn>
          </div>

          {registerMode === "single" ? (
            <>
              <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
                <Input label="Name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie" />
                <Input label="Tag / ID" value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1042" />
                <Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm(p => ({ ...p, dob: e.target.value }))} />
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
                    <Input label="Purchase date" type="date" value={form.purchaseDate} onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))} />
                    <Input label="Purchased from (seller)" value={form.purchasedFrom} onChange={e => setForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />
                  </>
                )}
              </div>
              <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Any relevant notes..." />
              <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <Btn onClick={add}>Register</Btn>
                <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              </div>
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
                <Input label="Date of birth (optional)" type="date" value={bulkRegisterForm.dob} onChange={e => setBulkRegisterForm(p => ({ ...p, dob: e.target.value }))} />
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
                    <Input label="Purchase date" type="date" value={bulkRegisterForm.purchaseDate} onChange={e => setBulkRegisterForm(p => ({ ...p, purchaseDate: e.target.value }))} />
                    <Input label="Purchased from (seller)" value={bulkRegisterForm.purchasedFrom} onChange={e => setBulkRegisterForm(p => ({ ...p, purchasedFrom: e.target.value }))} placeholder="e.g. Smith Livestock" />
                  </>
                )}
              </div>
              <Textarea label="Notes" value={bulkRegisterForm.notes} onChange={e => setBulkRegisterForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Applied to all animals (optional)" style={{ marginBottom: "14px" }} />
              <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
                <Btn onClick={submitBulkRegister} disabled={!bulkRegisterForm.startingTag?.trim() || parseInt(bulkRegisterForm.count, 10) < 1}>Register {Math.max(0, parseInt(bulkRegisterForm.count, 10) || 0)} animals</Btn>
                <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              </div>
            </>
          )}
        </Card>
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
                    {a.photo ? (
                      <img src={a.photo} alt="" style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "cover", display: "block" }} />
                    ) : (
                      <span>{SPECIES[a.species]?.emoji}</span>
                    )}
                  </div>
                  <div className="hl-animals-list-cell hl-animals-list-name-dot">
                    <span className="hl-animals-list-name" style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(a)}</span>
                    {!a.deceased ? (
                      <span className="hl-animals-list-health-dot" style={{ width: "8px", height: "8px", borderRadius: "50%", background: health === "red" ? "var(--danger2)" : health === "yellow" ? "var(--brass2)" : "var(--green3)" }} title={health === "red" ? "Recent illness" : health === "yellow" ? "Treatment in last 30 days" : "No recent issues"} />
                    ) : (
                      <span style={{ width: "8px", display: "inline-block" }} />
                    )}
                  </div>
                  <div className="hl-animals-list-cell hl-animals-list-species" style={{ fontSize: "13px", color: "var(--muted)" }}>{a.species}</div>
                  <div className="hl-animals-list-cell hl-animals-list-breed" style={{ fontSize: "13px", color: "var(--muted)" }} title={a.breed || undefined}>{a.breed || "—"}</div>
                  <div className="hl-animals-list-cell hl-animals-list-age" style={{ fontSize: "13px", color: "var(--muted)" }}>{ageFromDob(a.dob)}</div>
                  <div className="hl-animals-list-cell hl-animals-list-status" style={{ fontSize: "13px", color: "var(--muted)" }}>
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
            {a.deceased && (
              <>
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none" }}>
                  <Badge color="#666" style={{ background: "#666", color: "#fff" }}>Deceased</Badge>
                </div>
              </>
            )}
            {a.sale && !a.deceased && (
              <div style={{ position: "absolute", top: "12px", right: "12px", pointerEvents: "none", zIndex: 1 }}>
                <Badge color="#8B6914" style={{ background: "var(--brass)", color: "#fff" }}>Sold {a.sale.dateSold ? fmt(a.sale.dateSold) : ""}</Badge>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {!a.deceased && (
                  <span style={{ width: "10px", height: "10px", flexShrink: 0, borderRadius: "50%", background: getHealthStatus(a) === "red" ? "var(--danger2)" : getHealthStatus(a) === "yellow" ? "var(--brass2)" : "var(--green3)", boxShadow: "0 0 0 2px #fff" }} title={getHealthStatus(a) === "red" ? "Recent illness" : getHealthStatus(a) === "yellow" ? "Treatment in last 30 days" : "No recent issues"} />
                )}
                {a.photo ? (
                  <img src={a.photo} alt="" style={{ width: "40px", height: "40px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }} />
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
                      <div style={{ padding: "16px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", marginBottom: "16px" }}>
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
                        {previewRows.map((_, i) => (
                          <button key={i} type="button" onClick={() => setImportPreviewRowIndex(i)} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid " + (previewIndex === i ? "var(--brass)" : "var(--cream3)"), background: previewIndex === i ? "var(--cream)" : "#fff", cursor: "pointer", fontWeight: 600, fontSize: "13px", color: previewIndex === i ? "var(--ink)" : "var(--muted)" }}>{i + 1}</button>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>
                      {validCount + duplicateRows.length} row{(validCount + duplicateRows.length) !== 1 ? "s" : ""} with data · {errorCount} error{errorCount !== 1 ? "s" : ""} · {blankCount} blank row{blankCount !== 1 ? "s" : ""} skipped
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
