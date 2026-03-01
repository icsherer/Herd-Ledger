import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import "./App.css";
import { supabase } from "./supabase";
import Auth, { ResetPasswordPage } from "./Auth";

// ── Species Data ──────────────────────────────────────────────────────────────
const SPECIES = {
  Cattle:  { days: 283, emoji: "🐄" },
  Bison:   { days: 283, emoji: "🦬" },
  Chicken: { days: 21,  emoji: "🐓" },
  Horse:   { days: 340, emoji: "🐎" },
  Pig:     { days: 114, emoji: "🐖" },
  Sheep:   { days: 147, emoji: "🐑" },
  Goat:    { days: 150, emoji: "🐐" },
  Llama:   { days: 350, emoji: "🦙" },
  Alpaca:  { days: 345, emoji: "🦙" },
  Donkey:  { days: 365, emoji: "🫏" },
  Mule:    { days: 360, emoji: "🐴" },
  Rabbit:  { days: 31,  emoji: "🐇" },
  Dog:     { days: 63,  emoji: "🐕" },
  Cat:     { days: 65,  emoji: "🐈" },
};

const PASTURE_SPECIES = ["Cattle", "Horse"];

const IMPORT_HL_FIELDS = ["Name", "Tag", "Species", "Breed", "Sex", "Date of Birth", "Notes"];

/** Compress image to under maxBytes; returns data URL (base64). */
function compressImageToBase64(file, maxBytes = 200 * 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.82;
      const tryEncode = () => {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const base64Length = dataUrl.split(",")[1]?.length ?? 0;
        const bytes = Math.floor((base64Length * 3) / 4);
        if (bytes <= maxBytes || quality <= 0.2) return resolve(dataUrl);
        quality = Math.max(0.2, quality - 0.15);
        tryEncode();
      };
      tryEncode();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

const TREATMENT_TYPES = ["Illness", "Injury", "Medication", "Deworming", "Vitamin/Supplement", "Vet Visit", "Other"];
/** Treatment type → expense category for auto-created expense when cost is entered */
const TREATMENT_TYPE_TO_EXPENSE_CATEGORY = {
  "Vet Visit": "Veterinary",
  "Illness": "Veterinary",
  "Injury": "Veterinary",
  "Medication": "Medicine",
  "Deworming": "Medicine",
  "Vitamin/Supplement": "Medicine",
  "Other": "Medicine",
};

function getHealthStatus(animal) {
  const treatments = animal?.treatments || [];
  if (treatments.length === 0) return "green";
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const recent = treatments.filter(t => new Date(t.date || 0).getTime() >= thirtyDaysAgo);
  if (recent.some(t => t.type === "Illness")) return "red";
  if (recent.length > 0) return "yellow";
  return "green";
}

const SPECIES_SEX_OPTIONS = {
  Cattle: ["Bull", "Cow", "Heifer", "Steer"],
  Bison: ["Bull", "Cow", "Heifer", "Steer"],
  Chicken: ["Rooster", "Hen", "Capon"],
  Horse: ["Stallion", "Mare", "Gelding"],
  Pig: ["Boar", "Sow", "Gilt", "Barrow"],
  Sheep: ["Ram", "Ewe", "Wether"],
  Goat: ["Buck", "Doe", "Wether"],
  Llama: ["Male", "Female"],
  Alpaca: ["Male", "Female"],
  Donkey: ["Jack", "Jenny", "Gelding"],
  Mule: ["Jack", "Jenny", "Gelding"],
  Rabbit: ["Buck", "Doe"],
  Dog: ["Male", "Female"],
  Cat: ["Male", "Female"],
};

const SEX_TERM_GENDER = {
  Bull: "Male", Cow: "Female", Heifer: "Female", Steer: "Male", Calf: "Female",
  "Heifer Calf": "Female", "Bull Calf": "Male",
  Rooster: "Male", Hen: "Female", Pullet: "Female", Capon: "Male", Chick: "Female", Cockerel: "Male",
  Stallion: "Male", Mare: "Female", Filly: "Female", Colt: "Male", Gelding: "Male",
  "Filly Foal": "Female", "Colt Foal": "Male",
  Boar: "Male", Sow: "Female", Gilt: "Female", Barrow: "Male", Piglet: "Female",
  Ram: "Male", Ewe: "Female", "Ewe Lamb": "Female", "Ram Lamb": "Male", Wether: "Male", Lamb: "Female",
  Buck: "Male", Doe: "Female", Doeling: "Female", Buckling: "Male", Kid: "Female",
  Male: "Male", Female: "Female", Cria: "Female", "Female Cria": "Female", "Male Cria": "Male",
  Jack: "Male", Jenny: "Female", Foal: "Female",
  "Doe Kit": "Female", "Buck Kit": "Male", Kitten: "Female", Kit: "Female",
  "Female Puppy": "Female", "Male Puppy": "Male", "Female Kitten": "Female", "Male Kitten": "Male",
};

function getSexOptions(species) {
  return SPECIES_SEX_OPTIONS[species] || SPECIES_SEX_OPTIONS.Cattle;
}

/** Young/offspring sex options only (no adult terms like Bull, Cow). Use in Add Offspring form. */
const OFFSPRING_SEX_OPTIONS = {
  Cattle: ["Heifer Calf", "Bull Calf"],
  Bison: ["Heifer Calf", "Bull Calf"],
  Chicken: ["Pullet", "Cockerel"],
  Horse: ["Filly Foal", "Colt Foal"],
  Pig: ["Gilt", "Barrow"],
  Sheep: ["Ewe Lamb", "Ram Lamb"],
  Goat: ["Doeling", "Buckling"],
  Llama: ["Female Cria", "Male Cria"],
  Alpaca: ["Female Cria", "Male Cria"],
  Donkey: ["Filly Foal", "Colt Foal"],
  Mule: ["Filly Foal", "Colt Foal"],
  Rabbit: ["Doe Kit", "Buck Kit"],
  Dog: ["Female Puppy", "Male Puppy"],
  Cat: ["Female Kitten", "Male Kitten"],
};

/** Default young female term per species for new offspring. */
const OFFSPRING_DEFAULT_SEX = {
  Cattle: "Heifer Calf",
  Bison: "Heifer Calf",
  Chicken: "Pullet",
  Horse: "Filly Foal",
  Pig: "Gilt",
  Sheep: "Ewe Lamb",
  Goat: "Doeling",
  Llama: "Female Cria",
  Alpaca: "Female Cria",
  Rabbit: "Doe Kit",
  Donkey: "Filly Foal",
  Mule: "Filly Foal",
  Dog: "Female Puppy",
  Cat: "Female Kitten",
};

function getOffspringSexOptions(species) {
  return OFFSPRING_SEX_OPTIONS[species] || OFFSPRING_SEX_OPTIONS.Cattle;
}

function getOffspringDefaultSex(species) {
  return OFFSPRING_DEFAULT_SEX[species] || getOffspringSexOptions(species)?.[0] || "Heifer Calf";
}

const OFFSPRING_TERM_BY_SPECIES = {
  Cattle: "Calf",
  Bison: "Calf",
  Horse: "Foal",
  Pig: "Piglet",
  Sheep: "Lamb",
  Goat: "Kid",
  Llama: "Cria",
  Alpaca: "Cria",
  Donkey: "Foal",
  Mule: "Foal",
  Rabbit: "Kitten",
  Dog: "Puppy",
  Cat: "Kitten",
  Chicken: "Chick",
};
function getOffspringTerm(species) {
  return OFFSPRING_TERM_BY_SPECIES[species] || "Offspring";
}

function isFemale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Female";
}

function isMale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Male";
}

const BREEDING_MALE_SEX_TERMS = ["Bull", "Stallion", "Boar", "Ram", "Buck", "Rooster"];
const BREEDING_MALE_TO_SPECIES = { Bull: "Cattle", Stallion: "Horse", Boar: "Pig", Ram: "Sheep", Buck: "Goat", Rooster: "Chicken" };
function isBreedingMale(animal) {
  return animal && !animal.deceased && BREEDING_MALE_SEX_TERMS.includes(animal.sex);
}
function getEligibleFemalesForRunningWithBull(animals, gestations, pastureName, maleAnimal) {
  if (!maleAnimal || !pastureName?.trim() || !isBreedingMale(maleAnimal)) return [];
  const species = BREEDING_MALE_TO_SPECIES[maleAnimal.sex];
  if (!species) return [];
  const activeGestationAnimalIds = new Set((gestations || []).filter(g => g.status !== "Delivered").map(g => g.animalId));
  return (animals || []).filter(a => {
    if (a.deceased || a.sale) return false;
    if (a.species !== species) return false;
    if (SEX_TERM_GENDER[a.sex] !== "Female") return false;
    if (activeGestationAnimalIds.has(a.id)) return false;
    const inPasture = pastureNameEq(a.movements?.[0]?.pastureName, pastureName);
    return inPasture;
  });
}

function getBreedingMaleInPasture(animals, pastureName) {
  if (!pastureName?.trim()) return null;
  return (animals || []).find(a => isBreedingMale(a) && pastureNameEq(a.movements?.[0]?.pastureName, pastureName)) || null;
}

function getRunningWithMaleForFemale(animal, animals) {
  if (!animal || SEX_TERM_GENDER[animal.sex] !== "Female") return null;
  const pasture = (animal.movements?.[0]?.pastureName || "").trim();
  if (!pasture) return null;
  const male = getBreedingMaleInPasture(animals, pasture);
  if (!male || BREEDING_MALE_TO_SPECIES[male.sex] !== animal.species) return null;
  return male;
}

function pastureNameEq(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}
function getCanonicalPastureNames(animals, pastures) {
  const byLower = new Map();
  [...(pastures || []), ...(animals || []).flatMap(a => (a.movements || []).map(m => m.pastureName)).filter(Boolean)].forEach(n => {
    const key = (n || "").trim().toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, (n || "").trim());
  });
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}
function resolvePastureName(typed, canonicalList) {
  const t = (typed || "").trim();
  if (!t) return t;
  const found = (canonicalList || []).find(c => pastureNameEq(c, t));
  return found != null ? found : t;
}

const MOON_ICONS  = ["🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘"];
const MOON_NAMES  = ["New Moon","Waxing Crescent","First Quarter","Waxing Gibbous","Full Moon","Waning Gibbous","Last Quarter","Waning Crescent"];

function getMoonPhase(date = new Date()) {
  let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (m < 3) { y--; m += 12; } m++;
  const jd = Math.floor(365.25 * y) + Math.floor(30.6 * m) + d - 694039.09;
  const b = Math.round((jd / 29.5305882 % 1) * 8) % 8;
  return { icon: MOON_ICONS[b], name: MOON_NAMES[b] };
}

function getSeason(d = new Date()) {
  const doy = Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000);
  if (doy < 80 || doy >= 355) return "Winter";
  if (doy < 172) return "Spring";
  if (doy < 266) return "Summer";
  return "Autumn";
}

const ALMANAC_WISDOM_QUOTES = [
  "The farmer is the only man in our economy who buys everything at retail, sells everything at wholesale, and pays the freight both ways. — John F. Kennedy",
  "A bad year for the farmer is a bad year for everybody. — Old farming proverb",
  "When the well is dry, we know the worth of water. — Benjamin Franklin",
  "He that by the plow would thrive, himself must either hold or drive. — Benjamin Franklin",
  "The cattle are lowing, the baby awakes — tend your herd and your blessings will multiply. — Old stockman proverb",
  "A calf born in the storm is tougher than one born in the sunshine. — Ranch proverb",
  "Count your calves before you count your profits. — Cattle rancher saying",
  "A fence that keeps cattle in also keeps trouble out. — Ranch proverb",
  "The best fertilizer is the farmer's shadow. — Old farming proverb",
  "Good grass makes good cattle. — Rancher proverb",
  "A wet spring and a dry summer makes a full barn. — Old weather proverb",
  "The morning hour has gold in its mouth. — German farming proverb",
  "A barn full of hay is better than a field full of promises. — Farming proverb",
  "Take care of the land and the land will take care of you. — Native American proverb",
  "Bulls may come and go but the herd goes on forever. — Old stockman saying",
  "The strength of the herd is the individual animal, and the strength of the individual animal is the herd. — Adapted ranch proverb",
  "He who sows courtesy reaps friendship, and he who plants kindness gathers love. — Saint Basil",
];

const TIPS = {
  Winter: ["A ring round the moon foretells rain within three days.", "Feed extra grain when the cold bites deep.", "Trust the woolly bear — a thick coat means hard winter ahead.", "Count your stores twice; winter is long and forgiving of nothing.", ...ALMANAC_WISDOM_QUOTES],
  Spring: ["Plant above-ground crops under a waxing moon.", "A warm March foretells a cold May — do not thin your stores early.", "Spring lambs born at full moon tend to grow the sturdiest.", "Listen to the robins; when they return, the last frost is near.", ...ALMANAC_WISDOM_QUOTES],
  Summer: ["When cows lie down before noon, rain comes soon.", "Morning dew means a dry afternoon.", "Shear before the Dog Days — shorn sheep fare better in heat.", "Watch the swallows; low flight means rain before nightfall.", ...ALMANAC_WISDOM_QUOTES],
  Autumn: ["Mark your breeding dates carefully — spring arrives quickly.", "Stock the hayloft full; winter feeds the heaviest animals hardest.", "Thicker woolly bears predict harsher winters.", "Harvest when the moon wanes for longest storage.", ...ALMANAC_WISDOM_QUOTES],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((d - t) / 86400000);
}
function dueDate(breedingStr, days) {
  const d = new Date(breedingStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
function progress(breedingStr, totalDays) {
  const elapsed = (Date.now() - new Date(breedingStr)) / 86400000;
  return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
}
function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function createMovementJournalEntry(animal, fromPasture, toPasture, dateMovedIn, notes, movementId) {
  const nameOrTag = getAnimalName(animal);
  const dateStr = dateMovedIn ? fmt(dateMovedIn) : "—";
  const body = fromPasture
    ? `${nameOrTag} moved from ${fromPasture} to ${toPasture || "—"} on ${dateStr}.${notes ? ` Notes: ${notes}` : ""}`
    : `${nameOrTag} moved to ${toPasture || "—"} on ${dateStr}.${notes ? ` Notes: ${notes}` : ""}`;
  return {
    id: Date.now().toString() + "-" + (movementId || ""),
    title: `Pasture move — ${nameOrTag}`,
    body,
    date: new Date().toISOString(),
    animalId: animal.id,
    movementId: movementId || undefined,
  };
}
function fmtDueRange(g) {
  if (g.dueDateStart && g.dueDateEnd) return `${fmt(g.dueDateStart)} – ${fmt(g.dueDateEnd)}`;
  return fmt(g.dueDate);
}
function breedingDateForProgress(g) {
  return g.breedingDateEnd || g.breedingDate;
}
function daysUntilDue(g) {
  if (g.dueDateStart && g.dueDateEnd) {
    const start = daysUntil(g.dueDateStart);
    const end = daysUntil(g.dueDateEnd);
    return { start, end, isRange: true };
  }
  return { start: daysUntil(g.dueDate), end: daysUntil(g.dueDate), isRange: false };
}
function isOverdue(g) {
  const d = daysUntilDue(g);
  return d.isRange ? d.end < 0 : d.start < 0;
}
/** Calf DOB is within expected gestation window: due date (= breeding + gestation days) ± 30 days buffer. */
function birthDateWithinGestationWindow(calfDobStr, g) {
  if (!calfDobStr || !g) return false;
  const calf = new Date(calfDobStr + "T12:00:00").getTime();
  const day = 86400000;
  const margin = 30 * day;
  if (g.dueDateStart && g.dueDateEnd) {
    const start = new Date(g.dueDateStart + "T12:00:00").getTime() - margin;
    const end = new Date(g.dueDateEnd + "T12:00:00").getTime() + margin;
    return calf >= start && calf <= end;
  }
  const due = new Date((g.dueDate || "").split("T")[0] + "T12:00:00").getTime();
  return Math.abs(calf - due) <= margin;
}
function breedingDateFromDelivery(deliveryDateStr, gestationDays) {
  const d = new Date(deliveryDateStr + "T12:00:00");
  d.setDate(d.getDate() - (gestationDays || 283));
  return d.toISOString().split("T")[0];
}
function ageFromDob(dobStr) {
  if (!dobStr) return "Unknown";
  const birth = new Date(dobStr + "T12:00:00");
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) return ageFromDobMonths(months - 1);
  return ageFromDobMonths(months);
}
function ageFromDobMonths(months) {
  if (months < 0) return "Unknown";
  if (months >= 24) return `${Math.floor(months / 12)} years`;
  if (months >= 12) return "1 year";
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  return "Under 1 month";
}
function getAgeInMonths(dobStr) {
  if (!dobStr) return null;
  const birth = new Date(dobStr + "T12:00:00");
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return months < 0 ? null : months;
}
function getAgeInWeeks(dobStr) {
  if (!dobStr) return null;
  const birth = new Date(dobStr + "T12:00:00").getTime();
  const now = Date.now();
  const weeks = Math.floor((now - birth) / (7 * 86400000));
  return weeks < 0 ? null : weeks;
}

const CASTRATED_TERM_BY_SPECIES = {
  Cattle: "Steer",
  Chicken: "Capon",
  Pig: "Barrow",
  Sheep: "Wether",
  Goat: "Wether",
  Horse: "Gelding",
  Donkey: "Gelding",
  Mule: "Gelding",
};

/** Intact male sex term per species — used when reverting after castration record is deleted */
const INTACT_MALE_TERM_BY_SPECIES = {
  Cattle: "Bull",
  Chicken: "Rooster",
  Pig: "Boar",
  Sheep: "Ram",
  Goat: "Buck",
  Horse: "Stallion",
  Donkey: "Jack",
  Mule: "Jack",
  Rabbit: "Buck",
};

const FEMALE_MAIDEN_BY_SPECIES = {
  Cattle: "Heifer",
  Chicken: "Pullet",
  Pig: "Gilt",
  Sheep: "Ewe Lamb",
  Goat: "Doeling",
};

const FEMALE_BRED_BY_SPECIES = {
  Cattle: "Cow",
  Chicken: "Hen",
  Pig: "Sow",
  Sheep: "Ewe",
  Goat: "Doe",
};

/** Age-based sex/status term for display. Castrated always shows castrated term; no DOB uses stored sex; else species rules. */
function getAgeBasedSexTerm(animal, gestations) {
  if (!animal) return "—";
  const species = animal.species || "Cattle";
  const isMaleStored = SEX_TERM_GENDER[animal.sex] === "Male";
  const isFemaleStored = SEX_TERM_GENDER[animal.sex] === "Female";
  const castrated = animal.castration && isMaleStored;
  if (castrated) return CASTRATED_TERM_BY_SPECIES[species] ?? "Castrated";
  if (!animal.dob) return animal.sex || "—";
  const months = getAgeInMonths(animal.dob);
  const weeks = getAgeInWeeks(animal.dob);
  if (months == null) return animal.sex || "—";
  const hasBredOrCalved = gestations?.some(g => g.animalId === animal.id);

  switch (species) {
    case "Cattle":
      if (months < 6) return isMaleStored ? "Bull Calf" : "Heifer Calf";
      if (months < 24) return isMaleStored ? "Yearling Bull" : "Heifer";
      return isMaleStored ? "Bull" : (hasBredOrCalved ? "Cow" : "Heifer");
    case "Horse":
      if (months < 12) return isMaleStored ? "Colt Foal" : "Filly Foal";
      if (months < 48) return isMaleStored ? "Colt" : "Filly";
      return isMaleStored ? "Stallion" : "Mare";
    case "Pig":
      if (months < 2) return "Piglet"; // 0–8 weeks
      if (isMaleStored) return "Boar";
      if (months < 6) return "Gilt";
      return hasBredOrCalved ? "Sow" : "Gilt";
    case "Sheep":
      if (months < 6) return "Lamb";
      return isFemaleStored ? "Ewe" : "Ram";
    case "Goat":
      if (months < 6) return isFemaleStored ? "Doeling" : "Buckling";
      return isFemaleStored ? "Doe" : "Buck";
    case "Chicken":
      if (weeks != null && weeks < 16) return isFemaleStored ? "Pullet" : "Cockerel";
      return isFemaleStored ? "Hen" : "Rooster";
    case "Rabbit":
      if (months < 3) return "Kit";
      return isFemaleStored ? "Doe" : "Buck";
    default:
      return animal.sex || "—";
  }
}

function displaySex(animal, gestations) {
  return getAgeBasedSexTerm(animal, gestations);
}

function getAnimalName(animal) {
  if (!animal) return "Unnamed";
  return animal.name || (animal.tag ? `#${animal.tag}` : "Unnamed");
}

// ── Global Styles ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green:    #1B3A2B;
    --green2:   #254D39;
    --green3:   #2E6347;
    --brass:    #C9952A;
    --brass2:   #A67A1E;
    --brass3:   #F0C060;
    --cream:    #F7F2E8;
    --cream2:   #EDE6D6;
    --cream3:   #E0D5C0;
    --ink:      #141A14;
    --ink2:     #2C3A2C;
    --muted:    #7A8C7A;
    --danger:   #8B2020;
    --danger2:  #C0392B;
    --white:    #FFFFFF;
    --shadow:   0 1px 3px rgba(20,26,20,0.10), 0 4px 12px rgba(20,26,20,0.06);
    --shadow2:  0 2px 8px rgba(20,26,20,0.14), 0 8px 24px rgba(20,26,20,0.08);
    --radius:   6px;
    --radius2:  10px;
  }

  body {
    background: var(--cream);
    color: var(--ink);
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  button { cursor: pointer; font-family: 'Source Sans 3', sans-serif; }
  input, select, textarea { font-family: 'Source Sans 3', sans-serif; }

  /* Date/time inputs: single-tap to open picker on mobile, no double-tap */
  input[type="date"],
  input[type="datetime-local"],
  input[type="time"] {
    touch-action: manipulation;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    min-height: 44px;
  }

  .hl-fade-in { animation: fadeIn 0.3s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: var(--cream2); }
  ::-webkit-scrollbar-thumb { background: var(--cream3); border-radius: 3px; }

  /* Print: hide nav and interactive UI, show only print-only content */
  .print-only { display: none !important; }
  @media print {
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    body { background: #fff; }
    .hl-print-root { background: #fff; color: #141A14; padding: 0; max-width: none; }
  }
`;

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Card({ children, style = {}, className = "", ...rest }) {
  return (
    <div className={`hl-card ${className}`.trim()} style={{
      background: "#fff",
      borderRadius: var2("radius2"),
      boxShadow: "var(--shadow)",
      border: "1px solid var(--cream3)",
      ...style
    }} {...rest}>{children}</div>
  );
}

function Badge({ children, color = "var(--green)" }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: 600,
      background: color,
      color: "#fff",
      letterSpacing: "0.3px",
    }}>{children}</span>
  );
}

function ProgressBar({ value, color = "var(--green3)", height = 6 }) {
  return (
    <div style={{ background: "var(--cream2)", height, borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="hl-section-title">
      <h2 style={{ fontFamily: "'Playfair Display'", fontSize: "24px", fontWeight: 700, color: "var(--ink)" }}>{children}</h2>
      {action}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, size = "md" }) {
  const sizes = { sm: "6px 14px", md: "9px 20px", lg: "12px 28px" };
  const styles = {
    primary:   { background: "var(--green)",  color: "#fff",           border: "none" },
    secondary: { background: "transparent",   color: "var(--green)",   border: "1.5px solid var(--green)" },
    brass:     { background: "var(--brass)",   color: "#fff",           border: "none" },
    danger:    { background: "var(--danger2)", color: "#fff",           border: "none" },
    ghost:     { background: "transparent",   color: "var(--muted)",   border: "none" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles[variant],
      padding: sizes[size],
      borderRadius: "var(--radius)",
      fontSize: size === "sm" ? "13px" : "14px",
      fontWeight: 600,
      letterSpacing: "0.2px",
      transition: "all 0.15s",
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}
    onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = "brightness(1.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.filter = ""; }}
    >{children}</button>
  );
}

function Input({ label, type, style = {}, ...props }) {
  const isDateOrTime = type === "date" || type === "datetime-local" || type === "time";
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        type={type ?? "text"}
        {...props}
        className="hl-input"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          transition: "border-color 0.15s",
          minHeight: "44px",
          ...(isDateOrTime && {
            touchAction: "manipulation",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
          }),
          ...style,
        }}
        onFocus={e => e.target.style.borderColor = "var(--green3)"}
        onBlur={e => e.target.style.borderColor = "var(--cream3)"}
      />
    </div>
  );
}

function PastureCombo({ label, value, onChange, options = [], placeholder, id: listId, style = {}, ...props }) {
  const lid = listId || "pasture-list-" + Math.random().toString(36).slice(2);
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <input
        type="text"
        list={lid}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="hl-input"
        style={{
          width: "100%",
          padding: "9px 12px",
          border: "1.5px solid var(--cream3)",
          borderRadius: "var(--radius)",
          fontSize: "14px",
          color: "var(--ink)",
          background: "#fff",
          outline: "none",
          transition: "border-color 0.15s",
          minHeight: "44px",
          ...style,
        }}
        onFocus={e => e.target.style.borderColor = "var(--green3)"}
        onBlur={e => e.target.style.borderColor = "var(--cream3)"}
        {...props}
      />
      <datalist id={lid}>
        {options.map(n => <option key={n} value={n} />)}
      </datalist>
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <select {...props} className="hl-select" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        minHeight: "44px",
        ...props.style,
      }}>{children}</select>
    </div>
  );
}

function Textarea({ label, ...props }) {
  return (
    <div>
      {label && <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "5px" }}>{label}</label>}
      <textarea {...props} className="hl-textarea" style={{
        width: "100%", padding: "9px 12px",
        border: "1.5px solid var(--cream3)",
        borderRadius: "var(--radius)",
        fontSize: "14px", color: "var(--ink)",
        background: "#fff", outline: "none",
        resize: "vertical",
        minHeight: "44px",
        ...props.style,
      }}
      onFocus={e => e.target.style.borderColor = "var(--green3)"}
      onBlur={e => e.target.style.borderColor = "var(--cream3)"}
      />
    </div>
  );
}

function var2(name) { return `var(--${name})`; }

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

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ animals, gestations, offspring, moon, season, user, setTab, setAnimalsSearch, expenses, tasks }) {
  const today = new Date();
  const tip = TIPS[season][today.getDate() % TIPS[season].length];
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const todayStr = today.toISOString().split("T")[0];
  const upcomingTasks = (tasks || [])
    .filter(t => !t.completed && t.dueDate && t.dueDate >= todayStr)
    .sort((a, b) => (a.dueDate !== b.dueDate ? a.dueDate.localeCompare(b.dueDate) : (a.dueTime || "").localeCompare(b.dueTime || "")))
    .slice(0, 3);

  const activeAnimals = animals.filter(a => !a.deceased && !a.sale);
  const deceasedCount = animals.filter(a => a.deceased).length;
  const soldCount = animals.filter(a => a.sale).length;
  const speciesCounts = activeAnimals.reduce((acc, a) => { acc[a.species] = (acc[a.species] || 0) + 1; return acc; }, {});
  const activeGestations = gestations.filter(g => g.status !== "Delivered");

  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T12:00:00");
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };
  const incomeThisMonth = (animals || []).filter(a => a.sale && isCurrentMonth(a.sale.dateSold)).reduce((sum, a) => sum + (Number(a.sale?.pricePerHead) || 0), 0);
  const expensesThisMonth = (expenses || []).filter(e => isCurrentMonth(e.date)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // Next weaning across all offspring
  let nextWeaning = null;
  if (offspring) {
    Object.values(offspring).forEach(list => {
      (list || []).forEach(c => {
        if (!c.weaningDate) return;
        const d = daysUntil(c.weaningDate);
        if (d < 0) return; // already past
        if (!nextWeaning || d < nextWeaning.days) {
          nextWeaning = {
            days: d,
            name: c.name || "Unnamed",
          };
        }
      });
    });
  }

  const upcoming = activeGestations
    .map(g => {
      const a = activeAnimals.find(x => x.id === g.animalId);
      const d = daysUntilDue(g);
      const due = d.isRange ? d.start : d.start;
      const dueEnd = d.isRange ? d.end : d.start;
      return { ...g, animal: a, due, dueEnd, dueD: d };
    })
    .filter(g => g.dueEnd >= 0 && g.due <= 30)
    .sort((a, b) => a.due - b.due);

  const overdue = activeGestations
    .map(g => {
      const d = daysUntilDue(g);
      const due = d.isRange ? d.end : d.start;
      return { ...g, due, dueD: d, animal: activeAnimals.find(x => x.id === g.animalId) };
    })
    .filter(g => g.due < 0);

  return (
    <div className="hl-page hl-fade-in">

      {/* Top stats row */}
      <div className="hl-dash-stats">
        {[
          { label: "Total Animals", value: activeAnimals.length, sub: `${Object.keys(speciesCounts).length} species${deceasedCount > 0 ? ` · ${deceasedCount} deceased` : ""}${soldCount > 0 ? ` · ${soldCount} sold` : ""}`, icon: "🐄", onClick: () => { setAnimalsSearch?.(""); setTab?.("animals"); } },
          { label: "Expecting",     value: activeGestations.length, sub: "active pregnancies", icon: "📅", onClick: () => setTab?.("gestation") },
          { label: "Due This Month",value: upcoming.length, sub: overdue.length > 0 ? `${overdue.length} overdue` : "none overdue", icon: "⚠️", alert: overdue.length > 0, onClick: () => setTab?.("gestation") },
          {
            label: "Next Weaning",
            value: nextWeaning ? nextWeaning.days : "—",
            sub: nextWeaning ? nextWeaning.name : "none scheduled",
            icon: "🥛",
          },
          { label: "Financials (this month)", value: (incomeThisMonth - expensesThisMonth) >= 0 ? `+$${(incomeThisMonth - expensesThisMonth).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : `-$${Math.abs(incomeThisMonth - expensesThisMonth).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, sub: `Income $${incomeThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })} · Expenses $${expensesThisMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, icon: "💰", onClick: () => setTab?.("expenses"), large: false },
        ].map((s, i) => (
          <Card
            key={i}
            onClick={s.onClick}
            role={s.onClick ? "button" : undefined}
            tabIndex={s.onClick ? 0 : undefined}
            onKeyDown={s.onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); s.onClick(); } } : undefined}
            style={{
              padding: "18px 20px",
              borderLeft: s.alert ? "4px solid var(--danger2)" : "4px solid var(--brass)",
              cursor: s.onClick ? "pointer" : undefined,
              textAlign: "left",
              width: "100%",
              transition: "box-shadow 0.2s ease, transform 0.2s ease",
            }}
            onMouseEnter={e => { if (s.onClick) { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
            onMouseLeave={e => { if (s.onClick) { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; } }}
          >
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "6px" }}>{s.label}</div>
            <div className="hl-dash-stat-value" style={{ fontFamily: s.large ? "inherit" : "'Playfair Display'", fontSize: s.large ? "32px" : "30px", fontWeight: 700, color: s.alert ? "var(--danger2)" : "var(--green)", lineHeight: 1, marginBottom: "4px" }}>{s.value != null ? s.value : "—"}</div>
            <div className="hl-dash-stat-sub" style={{ fontSize: "12px", color: s.alert ? "var(--danger2)" : "var(--muted)" }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="hl-dash-columns">
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Overdue alerts */}
          {overdue.length > 0 && (
            <Card className="hl-card-no-padding" style={{ borderLeft: "4px solid var(--danger2)", padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>⚠️</span>
                <span style={{ fontWeight: 700, color: "var(--danger2)", fontSize: "14px" }}>Overdue — Check Immediately</span>
              </div>
              {overdue.map(g => (
                <div key={g.id} style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--cream2)" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{getAnimalName(g.animal)}</span>
                    <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{g.animal?.species}</span>
                  </div>
                  <Badge color="var(--danger2)">{g.dueD?.isRange ? "Overdue" : `${Math.abs(g.due)}d overdue`}</Badge>
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming births */}
          {upcoming.length > 0 && (
            <Card className="hl-card-no-padding" style={{ padding: "0" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                <span style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600 }}>Upcoming Births</span>
                <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>next 30 days</span>
              </div>
              {upcoming.map(g => (
                <div key={g.id} style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "20px" }}>{SPECIES[g.animal?.species]?.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{getAnimalName(g.animal)}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{g.animal?.species} · Due {fmtDueRange(g)}</div>
                      </div>
                    </div>
                    <Badge color={g.due <= 7 ? "var(--brass2)" : "var(--green3)"}>
                      {g.dueD?.isRange && g.due !== g.dueEnd ? `${g.due}–${g.dueEnd}d` : g.due === 0 ? "Today" : `${g.due}d`}
                    </Badge>
                  </div>
                  <ProgressBar value={progress(breedingDateForProgress(g), g.gestationDays)} />
                </div>
              ))}
            </Card>
          )}

          {/* Upcoming Tasks */}
          {upcomingTasks.length > 0 && (
            <Card
              className="hl-card-no-padding"
              style={{ padding: "0", cursor: "pointer" }}
              role="button"
              tabIndex={0}
              onClick={() => setTab?.("tasks")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTab?.("tasks"); } }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}
            >
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600 }}>Upcoming Tasks</span>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>next 3</span>
              </div>
              {upcomingTasks.map(t => (
                <div key={t.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: t.priority === "High" ? "var(--danger2)" : t.priority === "Medium" ? "var(--brass)" : "var(--green3)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px" }}>{t.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                      {t.dueDate}{t.dueTime ? ` · ${t.dueTime}` : ""}{t.category ? ` · ${t.category}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {/* Herd breakdown */}
          {activeAnimals.length > 0 && (
            <Card style={{ padding: "20px" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Herd Breakdown</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {Object.entries(speciesCounts).map(([sp, n]) => (
                  <div
                    key={sp}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setAnimalsSearch?.(sp); setTab?.("animals"); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAnimalsSearch?.(sp); setTab?.("animals"); } }}
                    style={{
                      cursor: "pointer",
                      padding: "6px 8px",
                      margin: "-6px -8px",
                      borderRadius: "var(--radius1)",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--cream2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "14px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>{SPECIES[sp]?.emoji}</span> {sp}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--green)" }}>{n}</span>
                    </div>
                    <ProgressBar value={(n / activeAnimals.length) * 100} height={4} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pasture summary — only if at least one Cattle or Horse is registered */}
          {(() => {
            const hasCattleOrHorse = activeAnimals.some(a => PASTURE_SPECIES.includes(a.species));
            if (!hasCattleOrHorse) return null;
            const pastureAnimals = activeAnimals.filter(a => PASTURE_SPECIES.includes(a.species));
            const byLower = {};
            const canonicalName = {};
            pastureAnimals.forEach(a => {
              const p = (a.movements?.[0]?.pastureName || "").trim();
              const key = p || "—";
              const lower = key === "—" ? "—" : key.toLowerCase();
              if (!byLower[lower]) {
                byLower[lower] = 0;
                canonicalName[lower] = key === "—" ? "—" : p;
              }
              byLower[lower]++;
            });
            return (
              <Card style={{ padding: "20px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: "600", marginBottom: "14px" }}>Pasture Summary</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {Object.entries(byLower)
                    .sort(([a], [b]) => (a === "—" ? 1 : b === "—" ? -1 : (canonicalName[a] || "").localeCompare(canonicalName[b] || "")))
                    .map(([lower, n]) => (
                      <div key={lower} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontSize: "14px", color: lower === "—" ? "var(--muted)" : "var(--ink2)" }}>{lower === "—" ? "Not in pasture" : canonicalName[lower]}</span>
                        <span style={{ fontWeight: 600, color: "var(--green)" }}>{n}</span>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })()}

          {!activeAnimals.length && !activeGestations.length && (
            <Card style={{ padding: "48px", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🐄</div>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600, marginBottom: "8px" }}>Welcome to Herd Ledger</div>
              <div style={{ color: "var(--muted)", fontSize: "14px" }}>Start by registering your first animal in the Animals tab.</div>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Date & Season */}
          <Card style={{ padding: "20px", textAlign: "center", background: "var(--green)", border: "none" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--brass3)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "4px" }}>{season}</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "52px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{today.getDate()}</div>
            <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.7)", marginTop: "4px" }}>
              {today.toLocaleDateString("en-US", { weekday: "long", month: "long", year: "numeric" })}
            </div>
          </Card>

          {/* Moon */}
          <Card style={{ padding: "20px", textAlign: "center" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>Moon Phase</div>
            <div style={{ fontSize: "52px", lineHeight: 1, marginBottom: "6px" }}>{moon.icon}</div>
            <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: "14px" }}>{moon.name}</div>
          </Card>

          {/* Almanac Wisdom */}
          <Card style={{ padding: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--brass2)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>
              Almanac Wisdom
            </div>
            <p style={{ fontFamily: "'Playfair Display'", fontStyle: "italic", fontSize: "15px", color: "var(--ink2)", lineHeight: 1.7 }}>
              "{tip}"
            </p>
          </Card>

        </div>
      </div>
    </div>
  );
}

// ── Animals ───────────────────────────────────────────────────────────────────
function Animals({ animals, setAnimals, offspring, setOffspring, gestations, setGestations, user, viewingAnimal, setViewingAnimal, search: searchProp, setSearch: setSearchProp, defaultSpecies = "Cattle", feederPrograms, setTab, setFeederPreselectAnimalId, setFeederBulkAnimalIds, setExpenses, settings, setSettings, pastures, notes, setNotes }) {
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
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", currentPasture: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
  });
  const viewing = viewingAnimal;
  const setViewing = setViewingAnimal;
  const [searchLocal, setSearchLocal] = useState("");
  const search = searchProp !== undefined ? searchProp : searchLocal;
  const setSearch = setSearchProp !== undefined ? setSearchProp : setSearchLocal;
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [editingOffspringId, setEditingOffspringId] = useState(null);
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
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [breedingForm, setBreedingForm] = useState({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
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
  const [importStep, setImportStep] = useState(1);
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importMapping, setImportMapping] = useState({});
  const [importSuccess, setImportSuccess] = useState(null);
  const [importDragActive, setImportDragActive] = useState(false);
  const importFileInputRef = useRef(null);
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
    return { name: "", species: sp, sex: getSexOptions(sp).find(o => SEX_TERM_GENDER[o] === "Female") || getSexOptions(sp)[0], dob: "", breed: "", tag: "", notes: "", currentPasture: "", acquisitionType: "Home Raised", purchasePrice: "", purchaseDate: "", purchasedFrom: "" };
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
        const autoMapping = {};
        IMPORT_HL_FIELDS.forEach(hl => {
          const key = hl.toLowerCase().replace(/\s+/g, " ");
          const found = headers.findIndex(h => String(h).toLowerCase().trim() === key || String(h).toLowerCase().replace(/\s+/g, " ") === key);
          if (found >= 0) autoMapping[hl] = headers[found];
        });
        onDone({ headers, rows }, null, autoMapping);
      } catch (err) {
        onDone(null, err.message || "Parse error");
      }
    };
    reader.onerror = () => onDone(null, "Failed to read file");
    if (isCsv) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  function normalizeSpecies(val) {
    if (!val || !String(val).trim()) return null;
    const v = String(val).trim();
    const key = Object.keys(SPECIES).find(k => k.toLowerCase() === v.toLowerCase());
    return key || null;
  }

  function normalizeSexForSpecies(species, val) {
    if (!species) return null;
    const opts = getSexOptions(species);
    if (!val || !String(val).trim()) return opts.find(o => SEX_TERM_GENDER[o] === "Female") || opts[0];
    const v = String(val).trim();
    const match = opts.find(o => o.toLowerCase() === v.toLowerCase());
    if (match) return match;
    const gender = SEX_TERM_GENDER[v] || (v.toLowerCase() === "female" ? "Female" : v.toLowerCase() === "male" ? "Male" : null);
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

  function getImportPreview() {
    if (!importData || !importMapping) return { valid: [], skipped: [], byRow: [] };
    const { headers, rows } = importData;
    const colIndex = (hl) => {
      const mapped = importMapping[hl];
      if (!mapped) return -1;
      const i = headers.indexOf(mapped);
      return i >= 0 ? i : -1;
    };
    const speciesCol = colIndex("Species");
    const valid = [];
    const skipped = [];
    rows.forEach((row, idx) => {
      const rawSpecies = speciesCol >= 0 ? row[speciesCol] : "";
      const species = normalizeSpecies(rawSpecies);
      if (!species) {
        skipped.push({ rowIndex: idx + 2, reason: "Missing or invalid Species", row });
        return;
      }
      const name = colIndex("Name") >= 0 ? (row[colIndex("Name")] || "").trim() : "";
      const tag = colIndex("Tag") >= 0 ? (row[colIndex("Tag")] || "").trim() : "";
      const breed = colIndex("Breed") >= 0 ? (row[colIndex("Breed")] || "").trim() : "";
      const sexVal = colIndex("Sex") >= 0 ? row[colIndex("Sex")] : "";
      const sex = normalizeSexForSpecies(species, sexVal);
      const dobVal = colIndex("Date of Birth") >= 0 ? row[colIndex("Date of Birth")] : "";
      const dob = normalizeDob(dobVal);
      const notes = colIndex("Notes") >= 0 ? (row[colIndex("Notes")] || "").trim() : "";
      valid.push({ name: name || undefined, tag: tag || undefined, species, breed: breed || undefined, sex, dob: dob || undefined, notes: notes || undefined });
    });
    return { valid, skipped };
  }

  function runImport() {
    const { valid, skipped } = getImportPreview();
    const newAnimals = valid.map(a => ({
      ...a,
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 9),
    }));
    setAnimals(prev => [...prev, ...newAnimals]);
    setImportSuccess({ imported: newAnimals.length, skipped: skipped.length });
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep(1);
    setImportFile(null);
    setImportData(null);
    setImportMapping({});
    setImportSuccess(null);
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
      const updated = { ...viewing, name: form.name || undefined, species: form.species, sex: form.sex, dob: form.dob || undefined, breed: form.breed || undefined, tag: form.tag || undefined, notes: form.notes || undefined, acquisitionType: form.acquisitionType || "Home Raised", purchasePrice: purchasePriceNum, purchaseDate: form.purchaseDate?.trim() || undefined, purchasedFrom: form.purchasedFrom?.trim() || undefined };
    setAnimals(p => p.map(x => x.id === editingId ? updated : x));
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

  const filtered = animals.filter(a => {
    const matchesSearch = getAnimalName(a).toLowerCase().includes(search.toLowerCase()) || a.species.toLowerCase().includes(search.toLowerCase());
    const showByDeceased = showDeceasedAnimals ? true : !a.deceased;
    const showByArchived = showArchivedAnimals ? true : !a.sale;
    return matchesSearch && showByDeceased && showByArchived;
  });

  if (viewing) {
    const a = viewing;
    const offspringForMother = (offspring && offspring[a.id]) || [];

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
      const effectiveSex = (offspringForm.sex && String(offspringForm.sex).trim()) ? offspringForm.sex : getOffspringDefaultSex(offspringForm.species || a.species);
      const rec = {
        id: isEdit ? editingOffspringId : Date.now().toString(),
        motherId: a.id,
        name: offspringForm.name || undefined,
        tag: offspringForm.tag || undefined,
        sex: effectiveSex,
        species: offspringForm.species || a.species,
        birthWeight: offspringForm.birthWeight ? parseFloat(offspringForm.birthWeight) : undefined,
        dob: offspringForm.dob || undefined,
        weaningDate: offspringForm.weaningDate || undefined,
        stillborn,
        createdAt: isEdit ? (offspringForMother.find(c => c.id === editingOffspringId)?.createdAt) : new Date().toISOString(),
      };
      const prevRec = isEdit ? offspringForMother.find(c => c.id === editingOffspringId) : null;
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
          species: offspringForm.species || a.species,
          dob: offspringForm.dob || undefined,
          breed: a.breed || undefined,
          notes: undefined,
          motherId: a.id,
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
      setAnimals(prev => prev.map(an => (an.id === a.id ? updated : an)));
      setViewing(updated);
      setShowMoveForm(false);
      setMoveForm({ pastureName: "", dateMovedIn: "", notes: "" });
      if (setNotes) {
        const journalEntry = createMovementJournalEntry(a, prevPasture, resolvedName, moveForm.dateMovedIn || undefined, move.notes, movementId);
        setNotes(prev => [journalEntry, ...prev]);
      }
      if (move.pastureName) {
        const nextAnimals = animals.map(an => (an.id === a.id ? updated : an));
        const male = getBreedingMaleInPasture(nextAnimals, move.pastureName);
        if (male) {
          const eligible = getEligibleFemalesForRunningWithBull(nextAnimals, gestations, move.pastureName, male);
          if (eligible.length > 0) {
            setRunningWithBullPrompt({ pastureName: move.pastureName, maleAnimal: male, eligibleFemales: eligible });
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
      const record = {
        animalId: a.id,
        breedingDate: start,
        ...(breedingForm.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
        dueDate: dueStart,
        ...(breedingForm.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
        sire: breedingForm.sire,
        notes: breedingForm.notes,
        id: Date.now().toString(),
        gestationDays: totalDays,
        status: "Active",
        createdAt: new Date().toISOString(),
      };
      setGestations(p => [...p, record]);
      setShowBreedingForm(false);
      setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
    }

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
                setForm({ name: a.name || "", species, sex: sex || opts[0], dob: a.dob || "", breed: a.breed || "", tag: a.tag || "", notes: a.notes || "", acquisitionType: a.acquisitionType || "Home Raised", purchasePrice: a.purchasePrice != null ? String(a.purchasePrice) : "", purchaseDate: a.purchaseDate || "", purchasedFrom: a.purchasedFrom || "" });
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

            {a.motherId && (() => {
              const mother = animals.find(m => m.id === a.motherId);
              const sire = a.sireId ? animals.find(s => s.id === a.sireId) : null;
              const sireName = sire ? getAnimalName(sire) : (a.sireName || null);
              return (
                <div style={{ marginTop: "24px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>Parentage</div>
                  <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "16px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--ink2)" }}>
                      <div>
                        <span style={{ color: "var(--muted)", marginRight: "6px" }}>Dam:</span>
                        {mother ? (
                          <button type="button" onClick={() => setViewing(mother)} style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "var(--green)", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}>{getAnimalName(mother)}</button>
                        ) : (
                          <span>—</span>
                        )}
                        {mother?.breed && <span style={{ color: "var(--muted)", marginLeft: "6px" }}>({mother.breed})</span>}
                      </div>
                      {sireName && (
                        <div style={{ marginTop: "6px" }}>
                          <span style={{ color: "var(--muted)", marginRight: "6px" }}>Sire:</span>
                          <span style={{ fontWeight: 500 }}>{sireName}</span>
                        </div>
                      )}
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
                      <Btn size="sm" variant="secondary" onClick={() => setShowBreedingForm(true)}>Log Breeding</Btn>
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
                          <Input label="Sire (optional)" value={breedingForm.sire} onChange={e => setBreedingForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
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
                          <Btn variant="secondary" onClick={() => { setShowBreedingForm(false); setBreedingForm({ breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" }); }}>Cancel</Btn>
                        </div>
                      </Card>
                    )}
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
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={a.successRate != null ? a.successRate : ""}
                      onChange={e => {
                        const v = e.target.value;
                        const num = v === "" ? undefined : parseFloat(v);
                        setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, successRate: num } : an)));
                        setViewing(prev => (prev && prev.id === a.id ? { ...prev, successRate: num } : prev));
                      }}
                      placeholder="e.g. 85"
                      style={{ width: "100%", padding: "8px 12px", border: "1.5px solid var(--cream3)", borderRadius: "var(--radius)", fontSize: "14px", color: "var(--ink)", background: "#fff", outline: "none" }}
                    />
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
                  <Card style={{ padding: "18px 20px", marginTop: "14px", borderLeft: "3px solid var(--brass)" }}>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>
                      {editingOffspringId ? `Edit ${getOffspringTerm(a.species)}` : `Add ${getOffspringTerm(a.species)}`}
                    </div>
                    <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
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
                      <div style={{ borderLeft: (offspringForm.sex || getOffspringDefaultSex(offspringForm.species || a.species)) === getOffspringDefaultSex(offspringForm.species || a.species) ? "4px solid var(--brass)" : "4px solid transparent", borderRadius: "var(--radius)", paddingLeft: "4px", marginLeft: "-4px" }}>
                        <Select
                          label="Sex (default is pre-selected)"
                          value={offspringForm.sex || getOffspringDefaultSex(offspringForm.species || a.species)}
                          onChange={e => setOffspringForm(p => ({ ...p, sex: e.target.value }))}
                        >
                          {(getOffspringSexOptions(offspringForm.species || a.species) || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Select>
                      </div>
                      <Select
                        label="Species"
                        value={offspringForm.species || a.species}
                        onChange={e => {
                          const newSpecies = e.target.value;
                          setOffspringForm(p => ({ ...p, species: newSpecies, sex: getOffspringDefaultSex(newSpecies) }));
                        }}
                      >
                        {Object.keys(SPECIES).map(s => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
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
        <p style={{ color: "#7A8C7A", fontSize: "14px", marginBottom: "24px" }}>{a.breed || a.species} · {displaySex(a, gestations)}{(() => { const rw = getRunningWithMaleForFemale(a, animals); return rw ? ` · Running with ${getAnimalName(rw)}` : ""; })()}{a.tag ? ` · #${a.tag}` : ""}</p>

        <section style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Basic Information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 24px", fontSize: "14px" }}>
            <div><strong>Species</strong> {a.species}</div>
            <div><strong>Breed</strong> {a.breed || "—"}</div>
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

        {a.motherId && (() => {
          const mother = animals.find(m => m.id === a.motherId);
          const sire = a.sireId ? animals.find(s => s.id === a.sireId) : null;
          const sireName = sire ? getAnimalName(sire) : (a.sireName || null);
          return (
            <section style={{ marginBottom: "20px" }}>
              <h2 style={{ fontSize: "11px", fontWeight: 600, color: "#7A8C7A", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>Parentage</h2>
              <div style={{ fontSize: "14px" }}>
                <div><strong>Dam:</strong> {mother ? getAnimalName(mother) + (mother.breed ? ` (${mother.breed})` : "") : "—"}</div>
                {sireName && <div style={{ marginTop: "4px" }}><strong>Sire:</strong> {sireName}</div>}
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
                {gestationsForAnimal.map(g => (
                  <div key={g.id} style={{ padding: "6px 0", borderBottom: "1px solid #EDE6D6" }}>
                    {g.status === "Delivered" ? `Delivered ${fmt(g.deliveredAt)}` : `Active · Due ${fmt(g.dueDate)}`}
                    {g.sire && ` · Sire: ${g.sire}`}
                    {g.calf && (g.calf.stillborn ? " · Stillborn" : (g.calf.name ? ` · ${getOffspringTerm(a.species)}: ${g.calf.name}` : ""))}
                  </div>
                ))}
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
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id) || !PASTURE_SPECIES.includes(an.species)) return an;
        const movementId = Date.now().toString() + "-" + an.id;
        const movePayload = { pastureName, dateMovedIn, notes, movementId };
        const prevPasture = (an.movements || [])[0]?.pastureName;
        if (setNotes) journalEntries.push(createMovementJournalEntry(an, prevPasture, pastureName, dateMovedIn, notes, movementId));
        return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
      })
    );
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

      {/* Show/hide deceased + archived (sold) + Search */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
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
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <Input placeholder="Search by name, species, or tag..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

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
          </div>
        </Card>
      )}

      {runningWithBullPrompt && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setRunningWithBullPrompt(null); setRunningWithBullStep("ask"); setRunningWithBullForm({ startDate: "", endDate: "" }); }}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Running with Bull</span>
              <button type="button" onClick={() => { setRunningWithBullPrompt(null); setRunningWithBullStep("ask"); setRunningWithBullForm({ startDate: "", endDate: "" }); }} style={{ background: "none", border: "none", fontSize: "22px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
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
                  <Btn variant="secondary" onClick={() => { setRunningWithBullPrompt(null); setRunningWithBullStep("ask"); setRunningWithBullForm({ startDate: "", endDate: "" }); }}>No</Btn>
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

      {!filtered.length && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🐄</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>{search ? "No animals match your search." : "No animals registered yet."}</div>
        </Card>
      )}

      {viewMode === "list" && filtered.length > 0 && (
        <Card className="hl-card-no-padding hl-animals-list-card" style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {filtered.map((a, idx) => {
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
                    borderBottom: idx < filtered.length - 1 ? "1px solid var(--cream2)" : "none",
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
        {filtered.map(a => (
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
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !importSuccess && closeImportModal()}>
          <Card style={{ maxWidth: "720px", width: "100%", maxHeight: "90vh", overflow: "auto", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600 }}>Import Animals</span>
              {!importSuccess && (
                <button type="button" onClick={closeImportModal} style={{ background: "none", border: "none", fontSize: "24px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
              )}
            </div>

            {importSuccess ? (
              <div style={{ padding: "20px 0" }}>
                <div style={{ fontSize: "16px", color: "var(--green)", fontWeight: 600, marginBottom: "12px" }}>Import complete</div>
                <p style={{ color: "var(--ink2)", marginBottom: "20px" }}>
                  {importSuccess.imported} animal{importSuccess.imported !== 1 ? "s" : ""} imported successfully.
                  {importSuccess.skipped > 0 && ` ${importSuccess.skipped} row${importSuccess.skipped !== 1 ? "s" : ""} skipped due to missing or invalid Species.`}
                </p>
                <Btn onClick={closeImportModal}>Close</Btn>
              </div>
            ) : importStep === 1 ? (
              <>
                <div style={{ marginBottom: "20px" }}>
                  <input
                    ref={importFileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
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
                      if (!["xlsx", "xls", "csv"].includes(ext)) {
                        alert("Please drop a .xlsx, .xls, or .csv file.");
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
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink2)", marginBottom: "4px" }}>Drag and drop your CSV or Excel file here, or click to browse</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)" }}>Accepts .xlsx, .xls, .csv</div>
                  </div>
                  {importFile && (
                    <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(72, 120, 72, 0.1)", border: "1px solid var(--green3)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--green)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{importFile.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportData(null); setImportMapping({}); }} style={{ background: "none", border: "none", color: "var(--brass)", fontWeight: 600, cursor: "pointer", fontSize: "12px" }}>Remove</button>
                    </div>
                  )}
                </div>

                {importData && (
                  <>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>Preview (first 5 rows)</div>
                    <div style={{ overflowX: "auto", marginBottom: "20px", border: "1px solid var(--cream3)", borderRadius: "var(--radius)" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "var(--cream2)" }}>
                            {importData.headers.map((h, i) => (
                              <th key={i} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--cream3)" }}>{h || `Column ${i + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importData.rows.slice(0, 5).map((row, ri) => (
                            <tr key={ri} style={{ borderBottom: "1px solid var(--cream2)" }}>
                              {importData.headers.map((_, ci) => (
                                <td key={ci} style={{ padding: "8px 10px", color: "var(--ink2)" }}>{row[ci] ?? ""}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "10px" }}>Map columns to Herd Ledger fields</div>
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
                      <Btn onClick={() => { setImportStep(2); }} disabled={!importMapping.Species}>Next: Review</Btn>
                      <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {(() => {
                  const { valid, skipped } = getImportPreview();
                  return (
                    <>
                      <p style={{ marginBottom: "16px", color: "var(--ink2)" }}>
                        <strong>{valid.length}</strong> animal{valid.length !== 1 ? "s" : ""} will be imported.
                        {skipped.length > 0 && <span style={{ color: "var(--muted)" }}> <strong>{skipped.length}</strong> row{skipped.length !== 1 ? "s" : ""} will be skipped (missing or invalid Species).</span>}
                      </p>
                      {skipped.length > 0 && skipped.length <= 20 && (
                        <div style={{ marginBottom: "16px", fontSize: "13px" }}>
                          <span style={{ fontWeight: 600, color: "var(--muted)" }}>Skipped rows:</span>
                          <ul style={{ margin: "6px 0 0 20px", color: "var(--muted)" }}>
                            {skipped.map((s, i) => (
                              <li key={i}>Row {s.rowIndex}: {s.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {skipped.length > 20 && (
                        <p style={{ marginBottom: "16px", fontSize: "13px", color: "var(--muted)" }}>Skipped rows: {skipped.map(s => s.rowIndex).join(", ")}</p>
                      )}
                      <div className="hl-import-confirm-actions" style={{ display: "flex", gap: "10px" }}>
                        <Btn onClick={runImport} disabled={valid.length === 0}>Import {valid.length} animal{valid.length !== 1 ? "s" : ""}</Btn>
                        <Btn variant="secondary" onClick={() => setImportStep(1)}>Back</Btn>
                        <Btn variant="secondary" onClick={closeImportModal}>Cancel</Btn>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ── Gestation ─────────────────────────────────────────────────────────────────
function Gestation({ animals, setAnimals, gestations, setGestations, user }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
  const [showCalfForm, setShowCalfForm] = useState(false);
  const [deliveringId, setDeliveringId] = useState(null);
  const [editingCalfGestationId, setEditingCalfGestationId] = useState(null);
  const [calfForm, setCalfForm] = useState({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });

  const females = animals.filter(a => isFemale(a));

  function add() {
    const start = form.breedingDate;
    const end = form.runningWithBull ? form.breedingDateEnd : form.breedingDate;
    if (!form.animalId || !start || (form.runningWithBull && !end)) return;
    const animal = animals.find(a => a.id === form.animalId);
    const totalDays = SPECIES[animal.species]?.days || 150;
    const dueStart = dueDate(start, totalDays);
    const dueEnd = form.runningWithBull ? dueDate(end, totalDays) : dueStart;
    const record = {
      animalId: form.animalId,
      breedingDate: start,
      ...(form.runningWithBull && { breedingDateEnd: end, runningWithBull: true }),
      dueDate: dueStart,
      ...(form.runningWithBull && { dueDateStart: dueStart, dueDateEnd: dueEnd }),
      sire: form.sire,
      notes: form.notes,
      id: Date.now().toString(),
      gestationDays: totalDays,
      status: "Active",
      createdAt: new Date().toISOString(),
    };
    setGestations(p => [...p, record]);
    setForm({ animalId: "", breedingDate: "", breedingDateEnd: "", runningWithBull: false, sire: "", notes: "" });
    setShowAdd(false);
  }

  function markDelivered(id) {
    setEditingCalfGestationId(null);
    setDeliveringId(id);
    setShowCalfForm(true);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function saveCalfRecord(gestationId) {
    const isEdit = editingCalfGestationId === gestationId;
    const g = gestations.find(x => x.id === gestationId);
    const mother = g ? animals.find(m => m.id === g.animalId) : null;
    const stillborn = !!calfForm.stillborn;
    let newAnimalId;
    if (!stillborn && !isEdit && mother) {
      newAnimalId = Date.now().toString();
      const newAnimal = {
        id: newAnimalId,
        name: calfForm.name || undefined,
        tag: calfForm.tag || undefined,
        sex: calfForm.sex || undefined,
        species: mother.species,
        dob: undefined,
        breed: mother.breed || undefined,
        notes: undefined,
        motherId: mother.id,
        ...(g.sire && { sireName: g.sire }),
      };
      setAnimals(prev => [...prev, newAnimal]);
    }
    if (isEdit && g?.calf?.animalId && stillborn) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    const calfData = {
      name: calfForm.name || undefined,
      tag: calfForm.tag || undefined,
      sex: calfForm.sex || undefined,
      birthWeight: calfForm.birthWeight ? parseFloat(calfForm.birthWeight) : undefined,
      weaningDate: calfForm.weaningDate || undefined,
      stillborn,
      recordedAt: new Date().toISOString(),
      ...(newAnimalId && { animalId: newAnimalId }),
      ...(isEdit && g?.calf?.animalId && !stillborn && { animalId: g.calf.animalId }),
    };
    setGestations(p => p.map(gr =>
      gr.id === gestationId
        ? { ...gr, status: "Delivered", deliveredAt: gr.deliveredAt || new Date().toISOString(), calf: calfData }
        : gr
    ));
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function skipCalfRecord() {
    if (deliveringId && !editingCalfGestationId) {
      setGestations(p => p.map(g =>
        g.id === deliveringId
          ? { ...g, status: "Delivered", deliveredAt: g.deliveredAt || new Date().toISOString() }
          : g
      ));
    }
    setShowCalfForm(false);
    setDeliveringId(null);
    setEditingCalfGestationId(null);
    setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false });
  }

  function deleteCalfRecord(gestationId) {
    const g = gestations.find(x => x.id === gestationId);
    if (!g?.calf) return;
    const mother = animals.find(a => a.id === g.animalId);
    const term = getOffspringTerm(mother?.species);
    const hadAnimal = g.calf.animalId && !g.calf.stillborn;
    if (!confirm(hadAnimal ? `Remove this ${term.toLowerCase()} record? The linked animal card will also be removed from the Animals list.` : `Remove this ${term.toLowerCase()} record?`)) return;
    if (hadAnimal) {
      setAnimals(prev => prev.filter(an => an.id !== g.calf.animalId));
    }
    setGestations(p => p.map(gr =>
      gr.id === gestationId ? { ...gr, calf: undefined } : gr
    ));
  }

  function remove(id) {
    if (!confirm("Remove this breeding record?")) return;
    setGestations(p => p.filter(g => g.id !== id));
  }

  const active = gestations.filter(g => g.status !== "Delivered");
  const delivered = gestations.filter(g => g.status === "Delivered");

  return (
    <div className="hl-page hl-page-gestation hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Log Breeding</Btn>}>
        Gestation Ledger
      </SectionTitle>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Log Breeding Date</div>
          {!females.length && <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "12px" }}>No female animals registered. Add animals first.</p>}
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Dam) *" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— Select —</option>
              {females.filter(a => a.species !== "Mule").map(a => <option key={a.id} value={a.id}>{getAnimalName(a)} ({a.species})</option>)}
            </Select>
            {!form.runningWithBull ? (
              <Input label="Breeding Date *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
            ) : (
              <>
                <Input label="Exposure start *" type="date" value={form.breedingDate} onChange={e => setForm(p => ({ ...p, breedingDate: e.target.value }))} />
                <Input label="Exposure end *" type="date" value={form.breedingDateEnd} onChange={e => setForm(p => ({ ...p, breedingDateEnd: e.target.value }))} />
              </>
            )}
            <Input label="Sire (optional)" value={form.sire} onChange={e => setForm(p => ({ ...p, sire: e.target.value }))} placeholder="Sire name or tag" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", cursor: "pointer", fontSize: "14px", color: "var(--ink2)" }}>
            <input type="checkbox" checked={form.runningWithBull} onChange={e => setForm(p => ({ ...p, runningWithBull: e.target.checked, breedingDateEnd: e.target.checked ? p.breedingDate : "" }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
            <span>Running with Bull (date range for bull exposure)</span>
          </label>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
          {form.animalId && form.breedingDate && (form.runningWithBull ? form.breedingDateEnd : true) && (() => {
            const a = animals.find(x => x.id === form.animalId);
            const days = SPECIES[a?.species]?.days;
            if (!days) return null;
            const start = dueDate(form.breedingDate, days);
            const end = form.runningWithBull && form.breedingDateEnd ? dueDate(form.breedingDateEnd, days) : start;
            const dueStr = form.runningWithBull && form.breedingDateEnd ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
            return (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "13px", color: "var(--ink2)" }}>
                📅 Estimated due: <strong>{dueStr}</strong> · Gestation: <strong>{days} days</strong>
              </div>
            );
          })()}
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Record</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showCalfForm && deliveringId && (() => {
        const g = gestations.find(x => x.id === deliveringId);
        const animal = animals.find(a => a.id === g?.animalId);
        const isEditCalf = !!editingCalfGestationId;
        const offspringTerm = getOffspringTerm(animal?.species);
        return (
          <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>
              {isEditCalf ? `Edit ${offspringTerm} Record` : `Add ${offspringTerm} Record (Optional)`}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "18px" }}>
              Record details for the {offspringTerm.toLowerCase()} born to <strong>{getAnimalName(animal)}</strong>
            </div>
            <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
              <Input label={`${offspringTerm} Name`} value={calfForm.name} onChange={e => setCalfForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bessie Jr" />
              <Input label="Tag / ID" value={calfForm.tag} onChange={e => setCalfForm(p => ({ ...p, tag: e.target.value }))} placeholder="e.g. 1043" />
              <Select label="Sex" value={calfForm.sex} onChange={e => setCalfForm(p => ({ ...p, sex: e.target.value }))}>
                <option value="">— Select —</option>
                {(getSexOptions(animal?.species) || []).map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </Select>
              <Input label="Birth Weight (lbs)" type="number" value={calfForm.birthWeight} onChange={e => setCalfForm(p => ({ ...p, birthWeight: e.target.value }))} placeholder="e.g. 85" />
              <Input label="Target Weaning Date" type="date" value={calfForm.weaningDate} onChange={e => setCalfForm(p => ({ ...p, weaningDate: e.target.value }))} />
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" id="calf-stillborn" checked={!!calfForm.stillborn} onChange={e => setCalfForm(p => ({ ...p, stillborn: e.target.checked }))} style={{ width: "18px", height: "18px", accentColor: "var(--green)" }} />
                <label htmlFor="calf-stillborn" style={{ fontSize: "14px", color: "var(--ink2)", cursor: "pointer" }}>Stillborn</label>
              </div>
            </div>
            <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <Btn onClick={() => saveCalfRecord(deliveringId)}>{isEditCalf ? "Save Changes" : `Save ${offspringTerm} Record`}</Btn>
              <Btn variant="secondary" onClick={skipCalfRecord}>{isEditCalf ? "Cancel" : "Skip"}</Btn>
            </div>
          </Card>
        );
      })()}

      {!active.length && !showAdd && !showCalfForm && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📅</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No active breeding records.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {active.map(g => {
          const animal = animals.find(a => a.id === g.animalId);
          const dueD = daysUntilDue(g);
          const pct = progress(breedingDateForProgress(g), g.gestationDays);
          const overdue = isOverdue(g);
          const urgent = dueD.isRange ? (dueD.start <= 7 && dueD.end >= 0) : (dueD.start >= 0 && dueD.start <= 7);
          const badgeText = overdue
            ? (dueD.isRange ? "Overdue" : `${Math.abs(dueD.start)}d overdue`)
            : dueD.isRange
              ? (dueD.start === dueD.end ? (dueD.start === 0 ? "Due today" : `${dueD.start} days`) : `${dueD.start}–${dueD.end} days`)
              : (dueD.start === 0 ? "Due today" : `${dueD.start} days`);
          return (
            <Card key={g.id} className="hl-gestation-card" style={{ padding: "20px 24px", borderLeft: `4px solid ${overdue ? "var(--danger2)" : urgent ? "var(--brass)" : "var(--green3)"}` }}>
              <div className="hl-gestation-card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "28px" }}>{SPECIES[animal?.species]?.emoji}</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{getAnimalName(animal)}</div>
                    <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                      {animal?.species}{g.sire ? ` × ${g.sire}` : ""} · {g.runningWithBull ? `Exposure ${fmt(g.breedingDate)} – ${fmt(g.breedingDateEnd)}` : `Bred ${fmt(g.breedingDate)}`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Badge color={overdue ? "var(--danger2)" : urgent ? "var(--brass2)" : "var(--green3)"}>
                    {badgeText}
                  </Badge>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>Due {fmtDueRange(g)}</div>
                </div>
              </div>
              <div style={{ marginBottom: "6px" }}>
                <ProgressBar value={pct} color={overdue ? "var(--danger2)" : "var(--green3)"} height={8} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "12px" }}>
                <span>{Math.round(pct)}% complete</span>
                <span>{g.gestationDays} day gestation{g.runningWithBull ? " (range)" : ""}</span>
              </div>
              {g.notes && <p style={{ fontSize: "13px", color: "var(--ink2)", fontStyle: "italic", marginBottom: "12px" }}>{g.notes}</p>}
              <div style={{ display: "flex", gap: "8px" }}>
                <Btn size="sm" onClick={() => markDelivered(g.id)}>✓ Mark Delivered</Btn>
                <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>Remove</Btn>
              </div>
            </Card>
          );
        })}
      </div>

      {delivered.length > 0 && (
        <>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, color: "var(--muted)", marginBottom: "12px" }}>Delivered Records</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {delivered.map(g => {
              const animal = animals.find(a => a.id === g.animalId);
              const hasCalf = g.calf && (g.calf.stillborn || g.calf.name || g.calf.tag || g.calf.sex || g.calf.birthWeight || g.calf.weaningDate);
              const offspringTerm = getOffspringTerm(animal?.species);
              return (
                <Card key={g.id} className="hl-delivered-row" style={{ padding: "14px 20px", opacity: 0.65 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasCalf ? "10px" : "0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span>{SPECIES[animal?.species]?.emoji}</span>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{getAnimalName(animal)}</span>
                        <span style={{ color: "var(--muted)", fontSize: "13px", marginLeft: "8px" }}>{animal?.species}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Badge color="var(--green)">Delivered</Badge>
                      <span style={{ fontSize: "13px", color: "var(--muted)" }}>Due {fmtDueRange(g)}</span>
                      {!hasCalf && (
                        <Btn size="sm" onClick={() => { setDeliveringId(g.id); setShowCalfForm(true); setCalfForm({ name: "", tag: "", sex: "", birthWeight: "", weaningDate: "", stillborn: false }); }}>
                          Add {offspringTerm} Record
                        </Btn>
                      )}
                      <Btn size="sm" variant="ghost" onClick={() => remove(g.id)}>×</Btn>
                    </div>
                  </div>
                  {hasCalf && (
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--cream2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>{offspringTerm} Record</div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <Btn size="sm" variant="ghost" onClick={() => { setEditingCalfGestationId(g.id); setDeliveringId(g.id); setCalfForm({ name: g.calf.name || "", tag: g.calf.tag || "", sex: g.calf.sex || "", birthWeight: g.calf.birthWeight != null ? String(g.calf.birthWeight) : "", weaningDate: g.calf.weaningDate || "", stillborn: !!g.calf.stillborn }); setShowCalfForm(true); }}>Edit</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => deleteCalfRecord(g.id)}>Delete</Btn>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "13px" }}>
                      {g.calf.stillborn && <div><span style={{ color: "var(--muted)" }}>Status:</span> <strong>Stillborn</strong></div>}
                      {g.calf.name && <div><span style={{ color: "var(--muted)" }}>Name:</span> <strong>{g.calf.name}</strong></div>}
                      {g.calf.tag && <div><span style={{ color: "var(--muted)" }}>Tag:</span> <strong>#{g.calf.tag}</strong></div>}
                      {(g.calf.sex || g.calf.dob) && (() => { const term = getAgeBasedSexTerm({ ...g.calf, species: animal?.species }, []); return term !== "—" ? <div><span style={{ color: "var(--muted)" }}>Sex:</span> <strong>{term}</strong></div> : null; })()}
                      {g.calf.birthWeight && <div><span style={{ color: "var(--muted)" }}>Birth Weight:</span> <strong>{g.calf.birthWeight} lbs</strong></div>}
                      {g.calf.weaningDate && <div><span style={{ color: "var(--muted)" }}>Weaning:</span> <strong>{fmt(g.calf.weaningDate)}</strong></div>}
                    </div>
                  </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Pastures ───────────────────────────────────────────────────────────────────
function Pastures({ animals, setAnimals, pastures, setPastures, setTab, setViewingAnimal, feederPrograms, gestations, setGestations, notes, setNotes }) {
  const [showAddPasture, setShowAddPasture] = useState(false);
  const [newPastureName, setNewPastureName] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMoveTo, setBulkMoveTo] = useState("");
  const [bulkMoveNotes, setBulkMoveNotes] = useState("");
  const [runningWithBullPrompt, setRunningWithBullPrompt] = useState(null);
  const [runningWithBullStep, setRunningWithBullStep] = useState("ask");
  const [runningWithBullForm, setRunningWithBullForm] = useState({ startDate: "", endDate: "" });
  const [runningWithBullCheckPending, setRunningWithBullCheckPending] = useState(null);
  const runningWithBullDismissedPasturesRef = useRef(new Set());

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

  useEffect(() => {
    if (!animals || !gestations || runningWithBullPrompt || runningWithBullCheckPending) return;
    const pastureNames = getCanonicalPastureNames(animals, pastures);
    for (const p of pastureNames) {
      if (runningWithBullDismissedPasturesRef.current.has(p.toLowerCase())) continue;
      const male = getBreedingMaleInPasture(animals, p);
      if (!male) continue;
      const eligible = getEligibleFemalesForRunningWithBull(animals, gestations, p, male);
      if (eligible.length > 0) {
        setRunningWithBullPrompt({ pastureName: p, maleAnimal: male, eligibleFemales: eligible });
        setRunningWithBullStep("ask");
        setRunningWithBullForm({ startDate: "", endDate: "" });
        break;
      }
    }
  }, [animals, gestations, runningWithBullPrompt, runningWithBullCheckPending]);

  const pastureEligible = (animals || []).filter(a => PASTURE_SPECIES.includes(a.species) && !a.deceased && !a.sale);
  const sortedNames = getCanonicalPastureNames(animals, pastures);
  const allPastureNames = pastureEligible.some(a => !(a.movements?.[0]?.pastureName || "").trim()) ? ["— Not assigned —", ...sortedNames] : sortedNames;

  const animalsByPasture = {};
  allPastureNames.forEach(name => {
    if (name === "— Not assigned —") {
      animalsByPasture[name] = pastureEligible.filter(a => !(a.movements?.[0]?.pastureName || "").trim());
    } else {
      animalsByPasture[name] = pastureEligible.filter(a => pastureNameEq(a.movements?.[0]?.pastureName, name));
    }
  });
  const selectedAnimals = pastureEligible.filter(a => selectedIds.includes(a.id));

  function addPasture() {
    const name = newPastureName?.trim();
    if (!name) return;
    const canonical = getCanonicalPastureNames(animals, pastures);
    if (canonical.some(c => pastureNameEq(c, name))) return;
    setPastures(prev => [...(prev || []), name].sort((a, b) => a.localeCompare(b)));
    setNewPastureName("");
    setShowAddPasture(false);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function doBulkMove() {
    const raw = bulkMoveTo?.trim();
    if (!raw || selectedIds.length === 0) return;
    const toPasture = resolvePastureName(raw, sortedNames);
    const dateMovedIn = new Date().toISOString().split("T")[0];
    const notes = bulkMoveNotes?.trim() || undefined;
    const journalEntries = [];
    setAnimals(prev =>
      prev.map(an => {
        if (!selectedIds.includes(an.id)) return an;
        const movementId = Date.now().toString() + "-" + an.id;
        const movePayload = { pastureName: toPasture, dateMovedIn, notes, movementId };
        const prevPasture = (an.movements || [])[0]?.pastureName;
        if (setNotes) journalEntries.push(createMovementJournalEntry(an, prevPasture, toPasture, dateMovedIn, notes, movementId));
        return { ...an, movements: [{ ...movePayload }, ...(an.movements || [])] };
      })
    );
    if (setNotes && journalEntries.length > 0) setNotes(prev => [...journalEntries, ...prev]);
    setRunningWithBullCheckPending({ pastureName: toPasture });
    setSelectedIds([]);
    setBulkMoveTo("");
    setBulkMoveNotes("");
  }

  function confirmRunningWithBull() {
    if (!runningWithBullPrompt || !setGestations || !runningWithBullForm.startDate || !runningWithBullForm.endDate) return;
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

  const dismissRunningWithBullPrompt = () => {
    if (runningWithBullPrompt?.pastureName) runningWithBullDismissedPasturesRef.current.add((runningWithBullPrompt.pastureName || "").trim().toLowerCase());
    setRunningWithBullPrompt(null);
    setRunningWithBullStep("ask");
    setRunningWithBullForm({ startDate: "", endDate: "" });
  };

  return (
    <div className="hl-page hl-fade-in">
      {runningWithBullPrompt && (
        <div className="hl-modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={dismissRunningWithBullPrompt}>
          <Card style={{ maxWidth: "440px", width: "100%", margin: "20px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <span style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>Running with Bull</span>
              <button type="button" onClick={dismissRunningWithBullPrompt} style={{ background: "none", border: "none", fontSize: "22px", color: "var(--muted)", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
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
                  <Btn variant="secondary" onClick={dismissRunningWithBullPrompt}>No</Btn>
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

      <SectionTitle action={<Btn onClick={() => setShowAddPasture(true)}>+ New Pasture</Btn>}>
        Pastures
      </SectionTitle>

      {showAddPasture && (
        <Card style={{ padding: "20px 24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600, marginBottom: "12px" }}>Create new pasture</div>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <PastureCombo label="Pasture name" value={newPastureName} onChange={v => setNewPastureName(v)} options={sortedNames} placeholder="Select existing or type new name" id="pasture-list-new-pasture" style={{ minWidth: "200px" }} />
            <Btn onClick={addPasture}>Add Pasture</Btn>
            <Btn variant="secondary" onClick={() => { setShowAddPasture(false); setNewPastureName(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {selectedIds.length > 0 && (
        <Card style={{ padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", borderLeft: "4px solid var(--green3)" }}>
          <span style={{ fontWeight: 600 }}>{selectedIds.length} selected</span>
          <PastureCombo label="Move to" value={bulkMoveTo} onChange={v => setBulkMoveTo(v)} options={sortedNames} placeholder="Select or type new pasture" id="pasture-list-pastures-bulk" style={{ minWidth: "180px" }} />
          <Input value={bulkMoveNotes} onChange={e => setBulkMoveNotes(e.target.value)} placeholder="Notes (optional)" style={{ minWidth: "180px" }} />
          <Btn size="sm" onClick={doBulkMove} disabled={!bulkMoveTo?.trim()}>Move</Btn>
          <Btn size="sm" variant="secondary" onClick={() => { setSelectedIds([]); setBulkMoveTo(""); setBulkMoveNotes(""); }}>Clear</Btn>
        </Card>
      )}

      {allPastureNames.length === 0 && !showAddPasture && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🟩</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No pastures yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Create a pasture or assign Cattle/Horses to a pasture from their profile.</p>
        </Card>
      )}

      <div className="hl-pastures-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {allPastureNames.map(pastureName => {
          const list = animalsByPasture[pastureName] || [];
          const cattleCount = list.filter(a => a.species === "Cattle").length;
          const horseCount = list.filter(a => a.species === "Horse").length;
          return (
            <Card key={pastureName} style={{ padding: "18px 20px", borderLeft: "4px solid var(--green3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>{pastureName}</div>
                <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                  {cattleCount > 0 && <span>{cattleCount} Cattle</span>}
                  {cattleCount > 0 && horseCount > 0 && " · "}
                  {horseCount > 0 && <span>{horseCount} Horse{horseCount !== 1 ? "s" : ""}</span>}
                  {cattleCount === 0 && horseCount === 0 && "0 animals"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {list.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--muted)" }}>No animals in this pasture</p>
                ) : (
                  list.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} onClick={e => e.stopPropagation()} style={{ width: "16px", height: "16px", accentColor: "var(--green)", flexShrink: 0 }} />
                      <button type="button" onClick={() => { setTab("animals"); setViewingAnimal(a); }} style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: "6px 0", fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                        {getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}
                      </button>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>{a.species}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); const removed = (a.movements || [])[0]; const next = (a.movements || []).slice(1); if (removed?.movementId && setNotes) setNotes(prev => prev.filter(n => n.movementId !== removed.movementId)); setAnimals(prev => prev.map(an => (an.id === a.id ? { ...an, movements: next } : an))); }} style={{ fontSize: "12px", color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} title="Remove from pasture (no movement record)">Remove</button>
                    </div>
                  ))
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {(() => {
        const withPen = (feederPrograms || []).filter(f => (f.penName || "").trim());
        const feedlotPenNames = [...new Set(withPen.map(f => (f.penName || "").trim()))].filter(Boolean).sort((a, b) => a.localeCompare(b));
        if (feedlotPenNames.length === 0) return null;
        return (
          <>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600, marginTop: "28px", marginBottom: "14px" }}>Feedlot Pens</div>
            <div className="hl-pastures-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {feedlotPenNames.map(penName => {
                const entries = withPen.filter(f => (f.penName || "").trim() === penName);
                return (
                  <Card key={penName} style={{ padding: "18px 20px", borderLeft: "4px solid var(--brass)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600 }}>{penName}</div>
                      <div style={{ fontSize: "13px", color: "var(--muted)" }}>{entries.length} animal{entries.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {entries.map(fp => {
                        const animal = (animals || []).find(a => a.id === fp.animalId);
                        const daysOnFeed = feederDaysOnFeed(fp.startDate);
                        const currentWeight = getLatestWeightForAnimal(animals, fp.animalId);
                        return (
                          <div key={fp.id} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--brass2)", background: "rgba(201,149,42,0.15)", padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>Feeder</span>
                            <button type="button" onClick={() => { setTab("animals"); setViewingAnimal(animal); }} style={{ flex: "1 1 auto", minWidth: 0, textAlign: "left", background: "none", border: "none", padding: "6px 0", fontSize: "14px", color: "var(--green)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}>
                              {animal ? getAnimalName(animal) : "—"}{animal?.tag ? ` #${animal.tag}` : ""}
                            </button>
                            <span style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap" }}>{daysOnFeed}d on feed{currentWeight ? ` · ${currentWeight} lb` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function Notes({ notes, setNotes, user, animals = [] }) {
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [journalSearch, setJournalSearch] = useState("");
  const [journalFilter, setJournalFilter] = useState("all"); // "all" | "manual" | "movement"

  function add() {
    if (!newBody.trim()) return;
    setNotes(p => [{ id: Date.now().toString(), title: newTitle || `Entry — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, body: newBody, date: new Date().toISOString() }, ...p]);
    setNewTitle(""); setNewBody(""); setShowAdd(false);
  }

  const filteredNotes = (() => {
    let list = notes;
    if (journalFilter === "manual") list = list.filter(n => !n.movementId);
    else if (journalFilter === "movement") list = list.filter(n => n.movementId);
    if (!journalSearch.trim()) return list;
    const q = journalSearch.trim().toLowerCase();
    return list.filter(n => {
      if ((n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)) return true;
      if (n.animalId && animals.length) {
        const animal = animals.find(a => a.id === n.animalId);
        if (animal && (getAnimalName(animal).toLowerCase().includes(q) || (animal.tag && String(animal.tag).toLowerCase().includes(q)))) return true;
      }
      return false;
    });
  })();

  return (
    <div className="hl-page hl-page-narrow hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ New Entry</Btn>}>
        Farm Journal
      </SectionTitle>

      {(notes.length > 0 || showAdd) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <Input placeholder="Search by keyword, animal name, tag, or pasture..." value={journalSearch} onChange={e => setJournalSearch(e.target.value)} />
          </div>
          <Select value={journalFilter} onChange={e => setJournalFilter(e.target.value)} style={{ width: "auto", minWidth: "160px" }}>
            <option value="all">All Entries</option>
            <option value="manual">Manual Entries</option>
            <option value="movement">Movement Entries</option>
          </Select>
        </div>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <Input label="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Moved herd to south pasture" style={{ marginBottom: "12px", fontSize: "16px" }} />
          <Textarea label="Entry" value={newBody} onChange={e => setNewBody(e.target.value)} rows={6} placeholder="Record observations, treatments, purchases, or anything worth noting..." />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <Btn onClick={add}>Save Entry</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {!notes.length && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📖</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>The journal awaits your first entry.</div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {filteredNotes.map(n => (
          <Card key={n.id} style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{n.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {n.movementId && <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)", background: "rgba(46,99,71,0.12)", padding: "2px 8px", borderRadius: "4px" }}>Movement</span>}
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>{fmt(n.date.split("T")[0])}</span>
                <Btn size="sm" variant="ghost" onClick={() => setNotes(p => p.filter(x => x.id !== n.id))}>×</Btn>
              </div>
            </div>
            <div style={{ height: "1px", background: "var(--cream2)", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", lineHeight: 1.8, color: "var(--ink2)", whiteSpace: "pre-wrap" }}>{n.body}</p>
          </Card>
        ))}
      </div>
      {notes.length > 0 && filteredNotes.length === 0 && (
        <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: "8px" }}>No entries match your search or filter.</p>
      )}
    </div>
  );
}

// ── Feeder Program ─────────────────────────────────────────────────────────────
const FEED_TYPES = ["Corn", "Silage", "Hay", "Mixed Ration", "Custom"];
// Industry FCR defaults (lbs feed per lb gain): Cattle grain/feedlot 6.0, forage/backgrounding 7.5; Pig 2.8; Sheep 4.5; Goat 4.5; Chicken 1.9; Rabbit 3.0
function getFCRDefault(species, feedType) {
  if (species === "Cattle") return (feedType === "Hay" || feedType === "Silage") ? 7.5 : 6.0;
  if (species === "Pig") return 2.8;
  if (species === "Sheep" || species === "Goat") return 4.5;
  if (species === "Chicken") return 1.9;
  if (species === "Rabbit") return 3.0;
  return 6.0;
}
// ADG defaults (lbs/day): Cattle 3.0, Pig 1.8, Sheep 0.5, Goat 0.4, Chicken 0.1
function getADGDefault(species) {
  if (species === "Cattle") return 3.0;
  if (species === "Pig") return 1.8;
  if (species === "Sheep") return 0.5;
  if (species === "Goat") return 0.4;
  if (species === "Chicken") return 0.1;
  if (species === "Rabbit") return 0.15;
  return 1.0;
}

function feederDaysOnFeed(startDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr + "T12:00:00").getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

function estimatedWeightFromADG(animal, feederStartDateStr) {
  const weights = [...(animal?.weights || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  if (weights.length < 2) return null;
  const first = weights[0];
  const last = weights[weights.length - 1];
  if (!first?.date || !last?.date) return null;
  const daysBetween = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (daysBetween <= 0) return null;
  const adg = (last.weight - first.weight) / daysBetween;
  const lastDate = new Date(last.date + "T12:00:00").getTime();
  const daysSinceLast = (Date.now() - lastDate) / 86400000;
  return last.weight + adg * daysSinceLast;
}

function getLatestWeightForAnimal(animals, animalId) {
  const an = (animals || []).find(a => a.id === animalId);
  const weights = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const w = weights[0]?.weight;
  return w != null ? String(w) : "";
}

function profitColor(projectedNet, totalAllIn) {
  if (totalAllIn <= 0) return "var(--muted)";
  const pct = projectedNet / totalAllIn;
  if (projectedNet > 0) return "var(--green)";
  if (pct >= -0.1) return "var(--brass2)"; // within 10% of breakeven
  return "var(--danger2)";
}

function FeederCattle({ animals, feederPrograms, setFeederPrograms, setTab, setViewingAnimal, feederPreselectAnimalId, setFeederPreselectAnimalId, feederBulkAnimalIds, setFeederBulkAnimalIds }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    animalId: "",
    startDate: "",
    startingWeight: "",
    dailyFeedLbs: "",
    feedType: "Corn",
    costPerLb: "",
    penName: "",
    adg: "",
  });
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkFormShared, setBulkFormShared] = useState({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
  const [bulkAddAnimals, setBulkAddAnimals] = useState([]);
  const [showBulkCalculator, setShowBulkCalculator] = useState(false);
  const [bulkCalcForm, setBulkCalcForm] = useState({
    headCount: "",
    avgStartWeight: "",
    avgTargetWeight: "",
    avgPurchasePricePerHead: "",
    species: "Cattle",
    feedType: "Corn",
    feedConversionRatio: "6",
    adg: "3",
    costPerLbFeed: "",
    vetPerHead: "",
    medicinePerHead: "",
    beddingPerHead: "",
    laborPerHead: "",
    otherPerHead: "",
    marketPricePerLb: "",
  });

  function updateFeederCalculator(fpId, updates) {
    setFeederPrograms(prev => prev.map(f => f.id === fpId ? { ...f, ...updates } : f));
  }

  const cattle = (animals || []).filter(a => a.species === "Cattle" && !a.deceased && !a.sale);
  const inProgramIds = new Set((feederPrograms || []).map(f => f.animalId));
  const availableCattle = cattle.filter(a => !inProgramIds.has(a.id));

  useEffect(() => {
    if (!feederPreselectAnimalId || !setFeederPreselectAnimalId) return;
    const weight = getLatestWeightForAnimal(animals, feederPreselectAnimalId);
    const today = new Date().toISOString().split("T")[0];
    setShowBulkAdd(false);
    setShowAdd(true);
    setForm(p => ({ ...p, animalId: feederPreselectAnimalId, startingWeight: weight, startDate: today }));
    setFeederPreselectAnimalId(null);
  }, [feederPreselectAnimalId, setFeederPreselectAnimalId, animals]);

  useEffect(() => {
    if (!feederBulkAnimalIds?.length || !setFeederBulkAnimalIds) return;
    const inProgram = new Set((feederPrograms || []).map(f => f.animalId));
    const toAdd = feederBulkAnimalIds.filter(id => !inProgram.has(id)).map(id => ({ animalId: id, startingWeight: getLatestWeightForAnimal(animals, id) }));
    setFeederBulkAnimalIds([]);
    if (toAdd.length === 0) return;
    setShowAdd(false);
    setShowBulkAdd(true);
    setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
    setBulkAddAnimals(toAdd);
  }, [feederBulkAnimalIds, setFeederBulkAnimalIds, animals, feederPrograms]);

  const totalHead = (feederPrograms || []).length;
  const totalEstimatedCost = (feederPrograms || []).reduce((sum, fp) => {
    const days = feederDaysOnFeed(fp.startDate);
    const costPerDay = (fp.dailyFeedLbs || 0) * (fp.costPerLb ?? 0);
    return sum + days * costPerDay;
  }, 0);

  function addToProgram() {
    if (!form.animalId || !form.startDate) return;
    const an = (animals || []).find(a => a.id === form.animalId);
    const startWeight = form.startingWeight?.trim() ? parseFloat(form.startingWeight) : undefined;
    const adgVal = form.adg?.trim() ? parseFloat(form.adg) : (an ? getADGDefault(an.species) : 3);
    const dailyLbs = form.dailyFeedLbs?.trim() ? parseFloat(form.dailyFeedLbs) : undefined;
    const costPerLb = form.costPerLb?.trim() ? parseFloat(form.costPerLb) : undefined;
    const feedType = form.feedType || "Corn";
    const fcr = an ? getFCRDefault(an.species, feedType) : 6;
    setFeederPrograms(prev => [...prev, {
      id: Date.now().toString(),
      animalId: form.animalId,
      startDate: form.startDate,
      startingWeight: startWeight,
      adg: adgVal,
      dailyFeedLbs: dailyLbs,
      feedType,
      costPerLb: costPerLb,
      penName: form.penName?.trim() || undefined,
      feedConversionRatio: fcr,
    }]);
    setForm({ animalId: "", startDate: "", startingWeight: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "" });
    setShowAdd(false);
  }

  function removeFromProgram(id) {
    setFeederPrograms(prev => prev.filter(f => f.id !== id));
  }

  function submitBulkAdd() {
    if (!bulkFormShared.startDate || bulkAddAnimals.length === 0) return;
    const adgVal = bulkFormShared.adg?.trim() ? parseFloat(bulkFormShared.adg) : 3;
    const dailyLbs = bulkFormShared.dailyFeedLbs?.trim() ? parseFloat(bulkFormShared.dailyFeedLbs) : undefined;
    const costPerLb = bulkFormShared.costPerLb?.trim() ? parseFloat(bulkFormShared.costPerLb) : undefined;
    const penName = bulkFormShared.penName?.trim() || undefined;
    const feedType = bulkFormShared.feedType || "Corn";
    const fcr = getFCRDefault("Cattle", feedType);
    const newRecords = bulkAddAnimals.map((row, i) => ({
      id: Date.now().toString() + "-" + i,
      animalId: row.animalId,
      startDate: bulkFormShared.startDate,
      startingWeight: row.startingWeight?.trim() ? parseFloat(row.startingWeight) : undefined,
      adg: adgVal,
      dailyFeedLbs: dailyLbs,
      feedType,
      costPerLb: costPerLb,
      penName,
      feedConversionRatio: fcr,
    }));
    setFeederPrograms(prev => [...prev, ...newRecords]);
    setShowBulkAdd(false);
    setBulkAddAnimals([]);
    setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" });
  }

  function setBulkAnimalStartingWeight(animalId, value) {
    setBulkAddAnimals(prev => prev.map(row => row.animalId === animalId ? { ...row, startingWeight: value } : row));
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => setShowBulkCalculator(true)}>Bulk Calculator</Btn>
          <Btn onClick={() => setShowAdd(true)} disabled={availableCattle.length === 0}>+ Add to Feeder Program</Btn>
        </div>
      }>
        Feeder Program
      </SectionTitle>

      {showBulkCalculator && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)", maxWidth: "900px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "20px", fontWeight: 600 }}>Bulk Profitability Calculator</div>
            <Btn size="sm" variant="ghost" onClick={() => setShowBulkCalculator(false)}>Close</Btn>
          </div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "18px" }}>Standalone what-if calculator. No animals need to be registered.</p>
          <div className="hl-form-grid-3" style={{ marginBottom: "18px" }}>
            <Input label="Number of head" type="number" min="1" value={bulkCalcForm.headCount} onChange={e => setBulkCalcForm(p => ({ ...p, headCount: e.target.value }))} placeholder="e.g. 50" />
            <Input label="Avg starting weight (lbs)" type="number" min="0" step="0.1" value={bulkCalcForm.avgStartWeight} onChange={e => setBulkCalcForm(p => ({ ...p, avgStartWeight: e.target.value }))} placeholder="e.g. 650" />
            <Input label="Avg target weight (lbs)" type="number" min="0" step="0.1" value={bulkCalcForm.avgTargetWeight} onChange={e => setBulkCalcForm(p => ({ ...p, avgTargetWeight: e.target.value }))} placeholder="e.g. 1400" />
            <Input label="Avg purchase price per head ($)" type="number" min="0" step="0.01" value={bulkCalcForm.avgPurchasePricePerHead} onChange={e => setBulkCalcForm(p => ({ ...p, avgPurchasePricePerHead: e.target.value }))} placeholder="e.g. 950" />
            <Select label="Species" value={bulkCalcForm.species} onChange={e => {
              const sp = e.target.value;
              setBulkCalcForm(p => ({ ...p, species: sp, feedConversionRatio: String(getFCRDefault(sp, p.feedType)), adg: String(getADGDefault(sp)) }));
            }}>
              {Object.keys(SPECIES).map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select label="Feed type" value={bulkCalcForm.feedType} onChange={e => {
              const ft = e.target.value;
              setBulkCalcForm(p => ({ ...p, feedType: ft, feedConversionRatio: String(getFCRDefault(p.species, ft)) }));
            }}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Feed conversion ratio" type="number" min="0.1" step="0.1" value={bulkCalcForm.feedConversionRatio} onChange={e => setBulkCalcForm(p => ({ ...p, feedConversionRatio: e.target.value }))} placeholder="By species/feed" />
            <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={bulkCalcForm.adg} onChange={e => setBulkCalcForm(p => ({ ...p, adg: e.target.value }))} placeholder="By species" />
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={bulkCalcForm.costPerLbFeed} onChange={e => setBulkCalcForm(p => ({ ...p, costPerLbFeed: e.target.value }))} placeholder="e.g. 0.08" />
            <Input label="Additional: Vet ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.vetPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, vetPerHead: e.target.value }))} placeholder="0" />
            <Input label="Medicine ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.medicinePerHead} onChange={e => setBulkCalcForm(p => ({ ...p, medicinePerHead: e.target.value }))} placeholder="0" />
            <Input label="Bedding ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.beddingPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, beddingPerHead: e.target.value }))} placeholder="0" />
            <Input label="Labor ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.laborPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, laborPerHead: e.target.value }))} placeholder="0" />
            <Input label="Other ($/head)" type="number" min="0" step="0.01" value={bulkCalcForm.otherPerHead} onChange={e => setBulkCalcForm(p => ({ ...p, otherPerHead: e.target.value }))} placeholder="0" />
            <Input label="Current market price per lb ($)" type="number" min="0" step="0.01" value={bulkCalcForm.marketPricePerLb} onChange={e => setBulkCalcForm(p => ({ ...p, marketPricePerLb: e.target.value }))} placeholder="e.g. 1.85" />
          </div>
          {(() => {
            const head = parseInt(bulkCalcForm.headCount, 10) || 0;
            const startWt = parseFloat(bulkCalcForm.avgStartWeight) || 0;
            const targetWt = parseFloat(bulkCalcForm.avgTargetWeight) || 0;
            const purchasePerHead = parseFloat(bulkCalcForm.avgPurchasePricePerHead) || 0;
            const conversion = parseFloat(bulkCalcForm.feedConversionRatio) || getFCRDefault(bulkCalcForm.species, bulkCalcForm.feedType);
            const adg = parseFloat(bulkCalcForm.adg) || getADGDefault(bulkCalcForm.species);
            const costPerLb = parseFloat(bulkCalcForm.costPerLbFeed) || 0;
            const addV = parseFloat(bulkCalcForm.vetPerHead) || 0; const addM = parseFloat(bulkCalcForm.medicinePerHead) || 0; const addB = parseFloat(bulkCalcForm.beddingPerHead) || 0; const addL = parseFloat(bulkCalcForm.laborPerHead) || 0; const addO = parseFloat(bulkCalcForm.otherPerHead) || 0;
            const addPerHead = addV + addM + addB + addL + addO;
            const marketPrice = parseFloat(bulkCalcForm.marketPricePerLb) || 0;
            const gainPerHead = targetWt > startWt ? targetWt - startWt : 0;
            const estimatedDaysToFinish = (gainPerHead > 0 && adg > 0) ? Math.max(0, Math.ceil(gainPerHead / adg)) : null;
            const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
            const totalGainGroup = head * gainPerHead;
            const totalFeedConsumed = totalGainGroup * conversion;
            const totalFeedCost = totalFeedConsumed * costPerLb;
            const totalAddExpenses = head * addPerHead;
            const totalPurchase = head * purchasePerHead;
            const totalAllIn = totalFeedCost + totalAddExpenses + totalPurchase;
            const totalAllInPerHead = head > 0 ? totalAllIn / head : 0;
            const costOfGainPerLb = totalGainGroup > 0 ? totalAllIn / totalGainGroup : 0;
            const breakevenPricePerLb = head > 0 && targetWt > 0 ? totalAllIn / (head * targetWt) : 0;
            const projectedGrossRevenue = head * targetWt * marketPrice;
            const projectedNet = projectedGrossRevenue - totalAllIn;
            const profitPerHead = head > 0 ? projectedNet / head : 0;
            const profitPerDay = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? projectedNet / estimatedDaysToFinish : 0;
            const color = profitColor(projectedNet, totalAllIn);
            return (
              <div style={{ padding: "16px 20px", background: "var(--cream)", borderRadius: "var(--radius)", border: "1px solid var(--cream2)" }}>
                {estimatedDaysToFinish != null && (
                  <div style={{ marginBottom: "16px", padding: "12px 14px", background: "#fff", borderRadius: "var(--radius)", borderLeft: "4px solid var(--brass)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Estimated days to finish</div>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>{estimatedDaysToFinish} days</div>
                    <div style={{ fontSize: "13px", color: "var(--ink2)" }}>Estimated finish date · {estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</div>
                  </div>
                )}
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>Real-time results</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 20px", fontSize: "14px" }}>
                  <div><span style={{ color: "var(--muted)" }}>Total feed consumed</span><div style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 0 })} lb</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total feed cost</span><div style={{ fontWeight: 600 }}>${totalFeedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total all-in cost per head</span><div style={{ fontWeight: 600 }}>${totalAllInPerHead.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Total all-in cost (group)</span><div style={{ fontWeight: 600 }}>${totalAllIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Cost of gain per lb</span><div style={{ fontWeight: 600 }}>${costOfGainPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Breakeven price per lb</span><div style={{ fontWeight: 600 }}>${breakevenPricePerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected gross revenue</span><div style={{ fontWeight: 600 }}>${projectedGrossRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected net (group)</span><div style={{ fontWeight: 600, color }}>${projectedNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Profit/loss per head</span><div style={{ fontWeight: 600, color }}>${profitPerHead.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                  <div><span style={{ color: "var(--muted)" }}>Projected profit per day</span><div style={{ fontWeight: 600, color }}>${profitPerDay.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div></div>
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {totalHead > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
          <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Head on feed</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>{totalHead}</div>
          </Card>
          <Card style={{ padding: "18px 24px", minWidth: "160px", borderLeft: "4px solid var(--brass)" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Est. feed cost to date</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "28px", fontWeight: 700, color: "var(--green)" }}>${totalEstimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </Card>
        </div>
      )}

      {showBulkAdd && bulkAddAnimals.length > 0 && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add to Feeder Program ({bulkAddAnimals.length} animals)</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Start date *" type="date" value={bulkFormShared.startDate} onChange={e => setBulkFormShared(p => ({ ...p, startDate: e.target.value }))} />
            <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={bulkFormShared.adg} onChange={e => setBulkFormShared(p => ({ ...p, adg: e.target.value }))} placeholder="e.g. 3 (Cattle default)" />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={bulkFormShared.dailyFeedLbs} onChange={e => setBulkFormShared(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={bulkFormShared.feedType} onChange={e => setBulkFormShared(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={bulkFormShared.costPerLb} onChange={e => setBulkFormShared(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
            <Input label="Pen or Lot Name" value={bulkFormShared.penName} onChange={e => setBulkFormShared(p => ({ ...p, penName: e.target.value }))} placeholder="e.g. Pen 1, East Lot, Finishing Pen" />
          </div>
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Starting weight per animal (lbs)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {bulkAddAnimals.map(row => {
                const an = (animals || []).find(a => a.id === row.animalId);
                return (
                  <div key={row.animalId} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "1 1 auto", fontSize: "14px" }}>{getAnimalName(an)}{an?.tag ? ` #${an.tag}` : ""}</span>
                    <Input type="number" min="0" step="0.1" value={row.startingWeight} onChange={e => setBulkAnimalStartingWeight(row.animalId, e.target.value)} placeholder="e.g. 650" style={{ width: "120px" }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={submitBulkAdd}>Add all to Program</Btn>
            <Btn variant="secondary" onClick={() => { setShowBulkAdd(false); setBulkAddAnimals([]); setBulkFormShared({ startDate: "", dailyFeedLbs: "", feedType: "Corn", costPerLb: "", penName: "", adg: "3" }); }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add to Feeder Program</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Select label="Animal (Cattle) *" value={form.animalId} onChange={e => {
              const id = e.target.value;
              const an = (animals || []).find(a => a.id === id);
              const weightsSorted = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
              const lastWeight = weightsSorted[0]?.weight;
              const adgDefault = an ? getADGDefault(an.species) : 3;
              setForm(p => ({ ...p, animalId: id, startingWeight: lastWeight != null ? String(lastWeight) : "", adg: p.adg || String(adgDefault) }));
            }}>
              <option value="">— Select —</option>
              {availableCattle.map(a => (
                <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>
              ))}
            </Select>
            <Input label="Start date *" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            <Input label="Starting weight (lbs)" type="number" min="0" step="0.1" value={form.startingWeight} onChange={e => setForm(p => ({ ...p, startingWeight: e.target.value }))} placeholder="e.g. 650" />
            <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={form.adg} onChange={e => setForm(p => ({ ...p, adg: e.target.value }))} placeholder={form.animalId ? String(getADGDefault((animals || []).find(a => a.id === form.animalId)?.species) ?? 3) : "e.g. 3"} />
            <Input label="Daily feed amount (lbs)" type="number" min="0" step="0.1" value={form.dailyFeedLbs} onChange={e => setForm(p => ({ ...p, dailyFeedLbs: e.target.value }))} placeholder="e.g. 25" />
            <Select label="Feed type" value={form.feedType} onChange={e => setForm(p => ({ ...p, feedType: e.target.value }))}>
              {FEED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Cost per lb of feed ($)" type="number" min="0" step="0.01" value={form.costPerLb} onChange={e => setForm(p => ({ ...p, costPerLb: e.target.value }))} placeholder="e.g. 0.08" />
            <Input label="Pen or Lot Name" value={form.penName} onChange={e => setForm(p => ({ ...p, penName: e.target.value }))} placeholder="e.g. Pen 1, East Lot, Finishing Pen" />
          </div>
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={addToProgram}>Add to Program</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {feederPrograms.length === 0 && !showAdd && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🌾</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No animals in the Feeder Program yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Add livestock from your herd to track feed and growth.</p>
        </Card>
      )}

      <div className="hl-feedlot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
        {(feederPrograms || []).map(fp => {
          const animal = (animals || []).find(a => a.id === fp.animalId);
          if (!animal) return null;
          const daysOnFeed = feederDaysOnFeed(fp.startDate);
          const totalFeedConsumed = daysOnFeed * (fp.dailyFeedLbs ?? 0);
          const costToDate = totalFeedConsumed * (fp.costPerLb ?? 0);
          const estWeight = estimatedWeightFromADG(animal, fp.startDate);
          const currentWeight = estWeight ?? (() => { const w = getLatestWeightForAnimal(animals, fp.animalId); return w ? parseFloat(w) : null; })() ?? fp.startingWeight;
          const startWeight = fp.startingWeight ?? 0;
          const targetWeight = fp.targetWeight != null ? fp.targetWeight : (currentWeight != null ? currentWeight + 200 : 0);
          const adg = (fp.adg != null && fp.adg > 0) ? fp.adg : getADGDefault(animal.species);
          const conversion = fp.feedConversionRatio != null ? fp.feedConversionRatio : getFCRDefault(animal.species, fp.feedType || "Corn");
          const lbsToGo = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : 0;
          const estimatedDaysToFinish = (lbsToGo > 0 && adg > 0) ? Math.max(0, Math.ceil(lbsToGo / adg)) : null;
          const estimatedFinishDate = estimatedDaysToFinish != null ? (() => { const d = new Date(); d.setDate(d.getDate() + estimatedDaysToFinish); return d.toISOString().split("T")[0]; })() : null;
          const daysRemaining = estimatedDaysToFinish != null ? Math.max(0, estimatedDaysToFinish - daysOnFeed) : 0;
          const progressPct = (estimatedDaysToFinish != null && estimatedDaysToFinish > 0) ? Math.min(100, (daysOnFeed / estimatedDaysToFinish) * 100) : 0;
          const additionalExp = fp.additionalExpenses ?? 0;
          const purchasePrice = animal.acquisitionType === "Purchased" && animal.purchasePrice != null ? Number(animal.purchasePrice) : 0;
          const marketPricePerLb = fp.marketPricePerLb ?? 0;
          const lbsGainSoFar = currentWeight != null && startWeight > 0 ? Math.max(0, currentWeight - startWeight) : 0;
          const lbsGainRemaining = (targetWeight != null && currentWeight != null && targetWeight > currentWeight) ? targetWeight - currentWeight : null;
          const totalFeedForGain = lbsGainSoFar * conversion;
          const totalFeedCostCalc = totalFeedForGain * (fp.costPerLb ?? 0);
          const totalAllIn = totalFeedCostCalc + additionalExp + purchasePrice;
          const costOfGainPerLb = lbsGainSoFar > 0 ? totalAllIn / lbsGainSoFar : 0;
          const breakevenPerLb = currentWeight > 0 ? totalAllIn / currentWeight : 0;
          const projectedRevenue = (marketPricePerLb && currentWeight) ? marketPricePerLb * currentWeight : 0;
          const projectedNet = projectedRevenue - totalAllIn;
          const profitPerDayRemaining = daysRemaining > 0 ? projectedNet / daysRemaining : 0;
          const calcColor = profitColor(projectedNet, totalAllIn);
          return (
            <Card key={fp.id} style={{ padding: "18px 20px", borderLeft: "4px solid var(--brass)", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display'", fontSize: "17px", fontWeight: 600 }}>{getAnimalName(animal)}</div>
                  <div style={{ fontSize: "13px", color: "var(--muted)" }}>{animal.tag ? `#${animal.tag}` : animal.species}</div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => removeFromProgram(fp.id)} style={{ padding: "4px 8px", minWidth: 0 }} title="Remove from program">×</Btn>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", marginBottom: "12px" }}>
                <span style={{ color: "var(--muted)" }}>Days on feed</span>
                <span style={{ fontWeight: 600 }}>{daysOnFeed}</span>
                <span style={{ color: "var(--muted)" }}>Est. weight</span>
                <span style={{ fontWeight: 600 }}>{estWeight != null ? `${Math.round(estWeight)} lb` : (fp.startingWeight != null ? `${fp.startingWeight} lb (start)` : "—")}</span>
                <span style={{ color: "var(--muted)" }}>Feed consumed</span>
                <span style={{ fontWeight: 600 }}>{totalFeedConsumed.toLocaleString("en-US", { maximumFractionDigits: 1 })} lb</span>
                <span style={{ color: "var(--muted)" }}>Feed cost to date</span>
                <span style={{ fontWeight: 600 }}>${costToDate.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              {estimatedDaysToFinish != null && (
                <div style={{ marginBottom: "12px", padding: "12px 14px", background: "var(--cream)", borderRadius: "var(--radius)", borderLeft: "3px solid var(--brass)" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink2)", marginBottom: "4px" }}>Estimated days to finish</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>{estimatedDaysToFinish} days</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>Estimated finish date · {estimatedFinishDate ? fmt(estimatedFinishDate) : "—"}</div>
                </div>
              )}
              {estimatedDaysToFinish != null && estimatedDaysToFinish > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>Progress · {daysOnFeed} of ~{estimatedDaysToFinish} days</div>
                  <div style={{ height: "6px", background: "var(--cream2)", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--brass)", borderRadius: "3px", transition: "width 0.2s" }} />
                  </div>
                </div>
              )}

              <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: "1px solid var(--cream2)" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Profitability Calculator</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginBottom: "10px" }}>
                  <Input label="Target weight (lb)" type="number" min="0" step="0.1" value={fp.targetWeight != null ? String(fp.targetWeight) : ""} onChange={e => updateFeederCalculator(fp.id, { targetWeight: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder={targetWeight ? String(targetWeight) : "e.g. 1400"} style={{ fontSize: "12px" }} />
                  <Input label="ADG (lbs/day)" type="number" min="0.01" step="0.1" value={fp.adg != null ? String(fp.adg) : ""} onChange={e => updateFeederCalculator(fp.id, { adg: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder={String(getADGDefault(animal.species))} style={{ fontSize: "12px" }} />
                  <Input label="Feed conversion" type="number" min="0.1" step="0.1" value={fp.feedConversionRatio != null ? String(fp.feedConversionRatio) : String(getFCRDefault(animal.species, fp.feedType || "Corn"))} onChange={e => updateFeederCalculator(fp.id, { feedConversionRatio: e.target.value.trim() ? parseFloat(e.target.value) : getFCRDefault(animal.species, fp.feedType || "Corn") })} style={{ fontSize: "12px" }} />
                  <Input label="Add'l expenses ($)" type="number" min="0" step="0.01" value={fp.additionalExpenses != null ? String(fp.additionalExpenses) : ""} onChange={e => updateFeederCalculator(fp.id, { additionalExpenses: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder="0" style={{ fontSize: "12px" }} />
                  <Input label="Market $/lb" type="number" min="0" step="0.01" value={fp.marketPricePerLb != null ? String(fp.marketPricePerLb) : ""} onChange={e => updateFeederCalculator(fp.id, { marketPricePerLb: e.target.value.trim() ? parseFloat(e.target.value) : undefined })} placeholder="e.g. 1.85" style={{ fontSize: "12px", gridColumn: "1 / -1" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", fontSize: "12px", marginBottom: "8px" }}>
                  <span style={{ color: "var(--muted)" }}>Lbs gain so far</span>
                  <span style={{ fontWeight: 600 }}>{lbsGainSoFar.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
                  {lbsGainRemaining != null && (
                    <>
                      <span style={{ color: "var(--muted)" }}>Lbs gain remaining</span>
                      <span style={{ fontWeight: 600 }}>{lbsGainRemaining.toLocaleString("en-US", { maximumFractionDigits: 1 })}</span>
                    </>
                  )}
                  <span style={{ color: "var(--muted)" }}>Total feed (gain)</span>
                  <span style={{ fontWeight: 600 }}>{totalFeedForGain.toLocaleString("en-US", { maximumFractionDigits: 0 })} lb</span>
                  <span style={{ color: "var(--muted)" }}>Total feed cost</span>
                  <span style={{ fontWeight: 600 }}>${totalFeedCostCalc.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Total all-in cost</span>
                  <span style={{ fontWeight: 600 }}>${totalAllIn.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Cost of gain/lb</span>
                  <span style={{ fontWeight: 600 }}>${costOfGainPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Breakeven $/lb</span>
                  <span style={{ fontWeight: 600 }}>${breakevenPerLb.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Projected revenue</span>
                  <span style={{ fontWeight: 600 }}>${projectedRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Projected net</span>
                  <span style={{ fontWeight: 600, color: calcColor }}>${projectedNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: "var(--muted)" }}>Profit/day remain.</span>
                  <span style={{ fontWeight: 600, color: calcColor }}>${profitPerDayRemaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <Btn size="sm" variant="secondary" onClick={() => { setTab("animals"); setViewingAnimal(animal); }} style={{ width: "100%", marginTop: "12px" }}>Record Weight</Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Expenses ───────────────────────────────────────────────────────────────────
function Expenses({ expenses, setExpenses, animals, pastures, setTab, setViewingAnimal }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "Feed",
    amount: "",
    description: "",
    vendorPayee: "",
    notes: "",
    animalId: "",
    pastureName: "",
  });

  const sortedExpenses = [...(expenses || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr + "T12:00:00");
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };
  const expensesThisMonth = (expenses || []).filter(e => isCurrentMonth(e.date));
  const byCategoryThisMonth = EXPENSE_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = expensesThisMonth.filter(e => e.category === cat).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return acc;
  }, {});

  function addExpense() {
    const amount = form.amount?.trim() ? parseFloat(form.amount) : 0;
    if (!form.date || amount < 0) return;
    setExpenses(prev => [...prev, {
      id: Date.now().toString(),
      date: form.date,
      category: form.category || "Other",
      amount,
      description: (form.description || "").trim() || undefined,
      vendorPayee: (form.vendorPayee || "").trim() || undefined,
      notes: (form.notes || "").trim() || undefined,
      animalId: (form.animalId || "").trim() || undefined,
      pastureName: (form.pastureName || "").trim() || undefined,
    }]);
    setForm({ date: new Date().toISOString().split("T")[0], category: "Feed", amount: "", description: "", vendorPayee: "", notes: "", animalId: "", pastureName: "" });
    setShowAdd(false);
  }

  function deleteExpense(id) {
    if (!confirm("Delete this expense?")) return;
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  const pastureNames = getCanonicalPastureNames(animals, pastures);

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Add Expense</Btn>}>
        Expenses
      </SectionTitle>

      {/* Summary by category for current month/year */}
      <Card style={{ padding: "18px 20px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "12px" }}>
          This month ({now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}) by category
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px 20px", fontSize: "13px" }}>
          {EXPENSE_CATEGORIES.map(cat => {
            const tot = byCategoryThisMonth[cat] || 0;
            if (tot === 0) return null;
            return (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ color: "var(--ink2)" }}>{cat}</span>
                <span style={{ fontWeight: 600 }}>${tot.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--cream2)", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "15px" }}>
          <span>Total this month</span>
          <span>${expensesThisMonth.reduce((s, e) => s + (Number(e.amount) || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </div>
      </Card>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add Expense</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Date *" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            <Select label="Category *" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Amount ($) *" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
            <Input label="Description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Hay delivery" />
            <Input label="Vendor / Payee" value={form.vendorPayee} onChange={e => setForm(p => ({ ...p, vendorPayee: e.target.value }))} placeholder="e.g. Smith Feed Co." />
            <Select label="Link to animal (optional)" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— None —</option>
              {(animals || []).map(a => <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>)}
            </Select>
            <Select label="Link to pasture (optional)" value={form.pastureName} onChange={e => setForm(p => ({ ...p, pastureName: e.target.value }))}>
              <option value="">— None —</option>
              {pastureNames.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} placeholder="Optional" />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={addExpense}>Save Expense</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {sortedExpenses.length === 0 && !showAdd ? (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>💰</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No expenses logged yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Track feed, vet, supplies, and more to see spending by category.</p>
        </Card>
      ) : (
        <Card style={{ padding: "0", overflow: "hidden" }} className="hl-card-no-padding">
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>All expenses (newest first) · Running total</div>
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            {sortedExpenses.map((e, i) => {
              const runningTotal = sortedExpenses.slice(0, i + 1).reduce((s, x) => s + (Number(x.amount) || 0), 0);
              const animal = e.animalId ? (animals || []).find(a => a.id === e.animalId) : null;
              const baseDesc = e.description || e.category || "—";
              const animalName = animal ? getAnimalName(animal) : "";
              const descLine = animalName && baseDesc.toLowerCase().indexOf(animalName.toLowerCase()) === -1
                ? `${baseDesc} — ${animalName}`
                : baseDesc;
              return (
                <div key={e.id} className="hl-expense-row" style={{ padding: "14px 20px", borderBottom: "1px solid var(--cream2)", background: i % 2 === 0 ? "#fff" : "var(--cream)" }}>
                  {/* Line 1: date left, category badge right */}
                  <div className="hl-expense-line-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <div className="hl-expense-date" style={{ fontSize: "13px", color: "var(--muted)" }}>{e.date ? fmt(e.date) : "—"}</div>
                    <Badge color="var(--brass2)">{e.category || "Other"}</Badge>
                  </div>
                  {/* Line 2: description full width */}
                  <div className="hl-expense-line-2" style={{ fontWeight: 600, fontSize: "14px", wordBreak: "break-word", minWidth: 0 }}>
                    {descLine}
                  </div>
                  {/* Line 3: amount on the right, trash to the right of amount */}
                  <div className="hl-expense-line-3" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <div className="hl-expense-total hl-expense-total-desktop" style={{ marginRight: "4px", fontSize: "12px", color: "var(--muted)" }}>${runningTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                    <div style={{ fontWeight: 600 }}>${(Number(e.amount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                    <button type="button" onClick={() => deleteExpense(e.id)} title="Delete" className="hl-expense-trash-btn" style={{ background: "none", border: "none", padding: "6px", cursor: "pointer", color: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Delete expense">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
function Tasks({ tasks, setTasks, animals, gestations, offspring, pastures, setTab }) {
  const [showAdd, setShowAdd] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    name: "",
    dueDate: todayStr,
    dueTime: "",
    category: "General",
    priority: "Medium",
    animalId: "",
    pastureName: "",
    notes: "",
    recurring: "One time",
  });

  useEffect(() => {
    if (!setTasks || !animals || !gestations) return;
    const existingSourceIds = new Set((tasks || []).filter(t => t.sourceId).map(t => t.sourceId));
    const toAdd = [];
    const activeGestations = (gestations || []).filter(g => g.status !== "Delivered");
    activeGestations.forEach(g => {
      const dueStr = g.dueDateStart || g.dueDate;
      if (!dueStr) return;
      const d = daysUntil(dueStr);
      if (d < 0 || d > 7) return;
      const sourceId = `gestation-${g.id}`;
      if (existingSourceIds.has(sourceId)) return;
      const animal = (animals || []).find(a => a.id === g.animalId);
      toAdd.push({
        id: `auto-${sourceId}-${Date.now()}`,
        name: `Gestation due: ${getAnimalName(animal) || "Animal"}`,
        dueDate: dueStr,
        category: "Breeding",
        priority: "High",
        sourceId,
        autoGenerated: true,
      });
      existingSourceIds.add(sourceId);
    });
    (animals || []).forEach(a => {
      (a.vaccinations || []).forEach(v => {
        const nextDue = v.nextDueDate || v.dateGiven;
        if (!nextDue) return;
        const d = daysUntil(nextDue);
        if (d < 0 || d > 7) return;
        const sourceId = `vaccination-${a.id}-${v.id}`;
        if (existingSourceIds.has(sourceId)) return;
        toAdd.push({
          id: `auto-${sourceId}-${Date.now()}`,
          name: `Vaccination due: ${(v.vaccineName || "Vaccine")} — ${getAnimalName(a)}`,
          dueDate: nextDue,
          category: "Vaccination",
          priority: "Medium",
          animalId: a.id,
          sourceId,
          autoGenerated: true,
        });
        existingSourceIds.add(sourceId);
      });
    });
    Object.values(offspring || {}).forEach(list => {
      (list || []).forEach(c => {
        if (!c.weaningDate) return;
        const d = daysUntil(c.weaningDate);
        if (d < 0 || d > 7) return;
        const sourceId = `weaning-${c.id || c.name || Math.random()}`;
        if (existingSourceIds.has(sourceId)) return;
        toAdd.push({
          id: `auto-${sourceId}-${Date.now()}`,
          name: `Weaning due: ${c.name || "Offspring"}`,
          dueDate: c.weaningDate,
          category: "Weaning",
          priority: "Medium",
          sourceId,
          autoGenerated: true,
        });
        existingSourceIds.add(sourceId);
      });
    });
    if (toAdd.length > 0) setTasks(prev => [...(prev || []), ...toAdd]);
  }, [setTasks, animals, gestations, offspring, tasks]);

  const allTasks = (tasks || []).filter(t => !t.completed);
  const completedTasks = (tasks || []).filter(t => t.completed);
  const todayTasks = allTasks.filter(t => t.dueDate === todayStr);
  const overdueTasks = allTasks.filter(t => t.dueDate && t.dueDate < todayStr);
  const upcomingTasks = allTasks.filter(t => t.dueDate && t.dueDate > todayStr).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  function addTask() {
    if (!form.name?.trim() || !form.dueDate) return;
    setTasks(prev => [...(prev || []), {
      id: Date.now().toString(),
      name: form.name.trim(),
      dueDate: form.dueDate,
      dueTime: (form.dueTime || "").trim() || undefined,
      category: form.category || "General",
      priority: form.priority || "Medium",
      animalId: (form.animalId || "").trim() || undefined,
      pastureName: (form.pastureName || "").trim() || undefined,
      notes: (form.notes || "").trim() || undefined,
      recurring: form.recurring || "One time",
    }]);
    setForm({ name: "", dueDate: todayStr, dueTime: "", category: "General", priority: "Medium", animalId: "", pastureName: "", notes: "", recurring: "One time" });
    setShowAdd(false);
  }

  function toggleComplete(task) {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined } : t));
  }

  function deleteTask(id) {
    if (!confirm("Delete this task?")) return;
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const priorityColor = { High: "var(--danger2)", Medium: "var(--brass)", Low: "var(--green3)" };
  const pastureNames = getCanonicalPastureNames(animals, pastures);

  function renderTaskList(list, title, titleColor, rowHighlight) {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: titleColor || "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {list.map(t => {
            const animal = t.animalId ? (animals || []).find(a => a.id === t.animalId) : null;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: rowHighlight?.background || "#fff", border: "1px solid var(--cream3)", borderRadius: "var(--radius)", borderLeft: `4px solid ${priorityColor[t.priority] || "var(--green3)"}`, color: rowHighlight?.color }}>
                <input type="checkbox" checked={!!t.completed} onChange={() => toggleComplete(t)} style={{ width: "18px", height: "18px", accentColor: "var(--green)", flexShrink: 0 }} />
                <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: priorityColor[t.priority] || "var(--green3)", flexShrink: 0 }} title={t.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: rowHighlight?.color || "var(--muted)", marginTop: "2px" }}>
                    {t.dueDate ? fmt(t.dueDate) : ""}{t.dueTime ? ` ${t.dueTime}` : ""}
                    {t.category && ` · ${t.category}`}
                    {animal && ` · ${getAnimalName(animal)}`}
                    {t.pastureName && ` · ${t.pastureName}`}
                  </div>
                </div>
                <Btn size="sm" variant="ghost" onClick={() => deleteTask(t.id)} style={{ padding: "4px 8px", minWidth: 0 }}>×</Btn>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={() => setShowAdd(true)}>+ Add Task</Btn>}>
        Tasks
      </SectionTitle>

      {showAdd && (
        <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--green3)" }}>
          <div style={{ fontFamily: "'Playfair Display'", fontSize: "18px", fontWeight: 600, marginBottom: "18px" }}>Add Task</div>
          <div className="hl-form-grid-3" style={{ marginBottom: "14px" }}>
            <Input label="Task name *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Feed hay" />
            <Input label="Due date *" type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            <Input label="Due time (optional)" type="time" value={form.dueTime} onChange={e => setForm(p => ({ ...p, dueTime: e.target.value }))} />
            <Select label="Category" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              {TASK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="Priority" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
              {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            <Select label="Assign to animal (optional)" value={form.animalId} onChange={e => setForm(p => ({ ...p, animalId: e.target.value }))}>
              <option value="">— None —</option>
              {(animals || []).map(a => <option key={a.id} value={a.id}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</option>)}
            </Select>
            <Select label="Assign to pasture (optional)" value={form.pastureName} onChange={e => setForm(p => ({ ...p, pastureName: e.target.value }))}>
              <option value="">— None —</option>
              {pastureNames.map(n => <option key={n} value={n}>{n}</option>)}
            </Select>
            <Select label="Recurring" value={form.recurring} onChange={e => setForm(p => ({ ...p, recurring: e.target.value }))}>
              {RECURRING_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "14px" }} placeholder="Optional" />
          <div className="hl-card-actions" style={{ display: "flex", gap: "10px" }}>
            <Btn onClick={addTask}>Save Task</Btn>
            <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {renderTaskList(overdueTasks, "Overdue", "var(--danger2)", { color: "var(--danger2)", background: "rgba(180, 60, 50, 0.08)" })}
      {renderTaskList(todayTasks, "Today")}
      {renderTaskList(upcomingTasks, "Upcoming")}

      {completedTasks.length > 0 && (
        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--cream2)" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Done</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {completedTasks.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || "")).map(t => {
              const animal = t.animalId ? (animals || []).find(a => a.id === t.animalId) : null;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "var(--cream)", border: "1px solid var(--cream2)", borderRadius: "var(--radius)", opacity: 0.85 }}>
                  <input type="checkbox" checked onChange={() => toggleComplete(t)} style={{ width: "18px", height: "18px", accentColor: "var(--green)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: "14px", textDecoration: "line-through", color: "var(--muted)" }}>{t.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{t.dueDate ? fmt(t.dueDate) : ""}{animal && ` · ${getAnimalName(animal)}`}</div>
                  </div>
                  <Btn size="sm" variant="ghost" onClick={() => deleteTask(t.id)} style={{ padding: "4px 8px", minWidth: 0 }}>×</Btn>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!showAdd && (tasks || []).length === 0 && (
        <Card style={{ padding: "60px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>✓</div>
          <div style={{ color: "var(--muted)", fontSize: "15px" }}>No tasks yet.</div>
          <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "8px" }}>Add a task or open the Tasks tab — gestation, vaccination, and weaning due soon will appear here automatically.</p>
        </Card>
      )}
    </div>
  );
}

// ── Sales ─────────────────────────────────────────────────────────────────────
function Sales({ animals, loadSales, setLoadSales, expenses }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [showLoadForm, setShowLoadForm] = useState(false);
  const [loadForm, setLoadForm] = useState({
    date: new Date().toISOString().split("T")[0],
    headCount: "",
    species: "Cattle",
    averageWeight: "",
    priceType: "perHead",
    priceValue: "",
    totalAmount: "",
    buyerName: "",
    notes: "",
  });

  const soldAnimals = (animals || []).filter(a => a.sale).sort((x, y) => (y.sale?.dateSold || "").localeCompare(x.sale?.dateSold || ""));
  const individualSalesYTD = soldAnimals
    .filter(a => a.sale?.dateSold && a.sale.dateSold.startsWith(String(year)))
    .reduce((sum, a) => sum + (Number(a.sale?.pricePerHead) || 0), 0);
  const loadSalesYTD = (loadSales || [])
    .filter(l => l.date && l.date.startsWith(String(year)))
    .reduce((sum, l) => sum + (Number(l.totalAmount) || 0), 0);
  const totalCombinedYTD = individualSalesYTD + loadSalesYTD;

  function saveLoadSale() {
    const headCount = parseInt(loadForm.headCount, 10);
    const avgWt = loadForm.averageWeight?.trim() ? parseFloat(loadForm.averageWeight) : null;
    const priceVal = loadForm.priceValue?.trim() ? parseFloat(loadForm.priceValue) : null;
    let total = loadForm.totalAmount?.trim() ? parseFloat(loadForm.totalAmount) : null;
    if (total == null && priceVal != null && headCount >= 1) {
      if (loadForm.priceType === "perHead") total = headCount * priceVal;
      else if (loadForm.priceType === "perLb" && avgWt != null) total = headCount * avgWt * priceVal;
    }
    setLoadSales(prev => [...(prev || []), {
      id: Date.now().toString(),
      date: loadForm.date || undefined,
      headCount: headCount >= 1 ? headCount : undefined,
      species: loadForm.species || undefined,
      averageWeight: avgWt ?? undefined,
      priceType: loadForm.priceType,
      priceValue: priceVal ?? undefined,
      totalAmount: total ?? undefined,
      buyerName: loadForm.buyerName?.trim() || undefined,
      notes: loadForm.notes?.trim() || undefined,
    }]);
    setLoadForm({ date: new Date().toISOString().split("T")[0], headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" });
    setShowLoadForm(false);
  }

  function removeLoadSale(id) {
    setLoadSales(prev => (prev || []).filter(l => l.id !== id));
  }

  function exportScheduleF() {
    const rows = [];
    soldAnimals.forEach(a => {
      if (!a.sale?.dateSold) return;
      const amt = Number(a.sale?.pricePerHead) || 0;
      if (amt === 0) return;
      rows.push({
        date: a.sale.dateSold,
        description: `Livestock sale — ${getAnimalName(a)}${a.species ? ` ${a.species}` : ""}`,
        category: "Livestock Sales",
        amount: amt,
        animalTag: a.tag || "",
        notes: a.sale?.notes || "",
      });
    });
    (loadSales || []).forEach(l => {
      const amt = Number(l.totalAmount) || 0;
      if (!l.date || amt === 0) return;
      rows.push({
        date: l.date,
        description: `Load sale — ${l.headCount || 0} head ${l.species || ""}${l.buyerName ? ` to ${l.buyerName}` : ""}`,
        category: "Livestock Sales",
        amount: amt,
        animalTag: "",
        notes: l.notes || "",
      });
    });
    (animals || []).filter(a => a.acquisitionType === "Purchased" && a.purchasePrice != null && a.purchasePrice > 0).forEach(a => {
      rows.push({
        date: a.purchaseDate || "",
        description: `Purchase — ${getAnimalName(a)}${a.species ? ` ${a.species}` : ""}${a.purchasedFrom ? ` from ${a.purchasedFrom}` : ""}`,
        category: "Livestock Purchased",
        amount: -(Number(a.purchasePrice) || 0),
        animalTag: a.tag || "",
        notes: "",
      });
    });
    (expenses || []).forEach(e => {
      const amt = -(Number(e.amount) || 0);
      if (amt === 0) return;
      let category = "Other Farm Expense";
      const cat = (e.category || "").toLowerCase();
      if (cat.includes("feed")) category = "Feed Expense";
      else if (cat.includes("vet") || cat.includes("medic")) category = "Veterinary";
      rows.push({
        date: e.date || "",
        description: (e.description || e.category || "Expense").slice(0, 200),
        category,
        amount: amt,
        animalTag: e.animalId ? ((animals || []).find(a => a.id === e.animalId)?.tag || "") : "",
        notes: e.notes || "",
      });
    });
    rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const headers = ["Date", "Description", "Category", "Amount", "Animal Tag", "Notes"];
    const csv = [headers.join(","), ...rows.map(r => [
      r.date,
      `"${String(r.description).replace(/"/g, '""')}"`,
      r.category,
      r.amount,
      r.animalTag,
      `"${String(r.notes || "").replace(/"/g, '""')}"`,
    ].join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-f-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const loadsInYear = (loadSales || []).filter(l => l.date && l.date.startsWith(String(year)));

  return (
    <div className="hl-page hl-fade-in">
      <SectionTitle action={<Btn onClick={exportScheduleF}>Export Schedule F CSV</Btn>}>
        Sales
      </SectionTitle>

      {/* Annual Summary */}
      <Card style={{ padding: "24px", marginBottom: "24px", borderLeft: "4px solid var(--brass)" }}>
        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "14px" }}>Annual Summary</div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <label style={{ fontSize: "14px", color: "var(--ink2)" }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: "8px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px", background: "#fff" }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Individual sales</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${individualSalesYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Load sales</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${loadSalesYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>Total income ({year})</div>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "22px", fontWeight: 700, color: "var(--green)" }}>${totalCombinedYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </Card>

      {/* Individual Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Individual Sales</div>
        {soldAnimals.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No sold animals recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Name / Tag</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Sale date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Sale price</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Acquisition</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Purchase price</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Net gain</th>
                </tr>
              </thead>
              <tbody>
                {soldAnimals.map(a => {
                  const salePrice = Number(a.sale?.pricePerHead) || 0;
                  const purchasePrice = a.acquisitionType === "Purchased" && a.purchasePrice != null ? Number(a.purchasePrice) : 0;
                  const netGain = salePrice - purchasePrice;
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                      <td style={{ padding: "10px 12px" }}>{getAnimalName(a)}{a.tag ? ` #${a.tag}` : ""}</td>
                      <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{a.species || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sale?.dateSold ? fmt(a.sale.dateSold) : "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.sale?.buyerName || "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>${salePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: "10px 12px" }}>{a.acquisitionType === "Purchased" ? "Purchased" : "Home Raised"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>{a.acquisitionType === "Purchased" && a.purchasePrice != null ? `$${Number(a.purchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: netGain >= 0 ? "var(--green)" : "var(--danger2)" }}>{a.acquisitionType === "Purchased" || purchasePrice !== 0 ? `$${netGain.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Group / Load Sales */}
      <Card style={{ padding: "0", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cream2)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Group / Load Sales</span>
          <Btn size="sm" onClick={() => setShowLoadForm(true)}>+ Log sale barn load</Btn>
        </div>
        {showLoadForm && (
          <div style={{ padding: "20px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
            <div style={{ fontFamily: "'Playfair Display'", fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Log sale barn load</div>
            <div className="hl-form-grid-3" style={{ marginBottom: "12px" }}>
              <Input label="Date" type="date" value={loadForm.date} onChange={e => setLoadForm(p => ({ ...p, date: e.target.value }))} />
              <Input label="Number of head" type="number" min="1" value={loadForm.headCount} onChange={e => setLoadForm(p => ({ ...p, headCount: e.target.value }))} placeholder="e.g. 12" />
              <Select label="Species" value={loadForm.species} onChange={e => setLoadForm(p => ({ ...p, species: e.target.value }))}>
                {Object.keys(SPECIES).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Input label="Average weight (lbs)" type="number" min="0" step="0.1" value={loadForm.averageWeight} onChange={e => setLoadForm(p => ({ ...p, averageWeight: e.target.value }))} placeholder="Optional" />
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--muted)", marginBottom: "4px" }}>Pricing</label>
                <select value={loadForm.priceType} onChange={e => setLoadForm(p => ({ ...p, priceType: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--radius)", border: "1px solid var(--cream2)", fontSize: "14px" }}>
                  <option value="perHead">Price per head</option>
                  <option value="perLb">Price per lb</option>
                </select>
              </div>
              <Input label={loadForm.priceType === "perHead" ? "Price per head ($)" : "Price per lb ($)"} type="number" min="0" step="0.01" value={loadForm.priceValue} onChange={e => setLoadForm(p => ({ ...p, priceValue: e.target.value }))} placeholder="e.g. 1.25" />
              <Input label="Total sale amount ($) — optional" type="number" min="0" step="0.01" value={loadForm.totalAmount} onChange={e => setLoadForm(p => ({ ...p, totalAmount: e.target.value }))} placeholder="Override calculated total" />
              <Input label="Buyer / sale barn name" value={loadForm.buyerName} onChange={e => setLoadForm(p => ({ ...p, buyerName: e.target.value }))} placeholder="e.g. Smith Sale Barn" style={{ gridColumn: "1 / -1" }} />
            </div>
            <Textarea label="Notes" value={loadForm.notes} onChange={e => setLoadForm(p => ({ ...p, notes: e.target.value }))} rows={2} style={{ marginBottom: "12px" }} />
            <div style={{ display: "flex", gap: "10px" }}>
              <Btn size="sm" onClick={saveLoadSale} disabled={!loadForm.date || !loadForm.headCount || parseInt(loadForm.headCount, 10) < 1}>Save load sale</Btn>
              <Btn size="sm" variant="ghost" onClick={() => { setShowLoadForm(false); setLoadForm({ date: new Date().toISOString().split("T")[0], headCount: "", species: "Cattle", averageWeight: "", priceType: "perHead", priceValue: "", totalAmount: "", buyerName: "", notes: "" }); }}>Cancel</Btn>
            </div>
          </div>
        )}
        {loadsInYear.length === 0 ? (
          <div style={{ padding: "24px", color: "var(--muted)", fontSize: "14px" }}>No load sales recorded yet. Use the button above to log a sale barn load.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Head</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Species</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontWeight: 600 }}>Total</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontWeight: 600 }}>Buyer</th>
                  <th style={{ width: "40px" }} />
                </tr>
              </thead>
              <tbody>
                {[...(loadSales || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--cream2)" }}>
                    <td style={{ padding: "10px 12px" }}>{l.date ? fmt(l.date) : "—"}</td>
                    <td style={{ padding: "10px 12px" }}>{l.headCount ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted)" }}>{l.species || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>${(Number(l.totalAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: "10px 12px" }}>{l.buyerName || "—"}</td>
                    <td style={{ padding: "8px" }}>
                      <button type="button" onClick={() => removeLoadSale(l.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "18px", lineHeight: 1 }} aria-label="Remove">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Help ───────────────────────────────────────────────────────────────────────
const HELP_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: (
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
    content: (
      <>
        <p style={{ marginBottom: "10px", lineHeight: 1.65, color: "var(--ink2)" }}><strong>iPhone:</strong> Open app.herdledger.app in Safari → tap the Share button at the bottom of the screen → tap Add to Home Screen → tap Add. The app will appear on your home screen like a native app.</p>
        <p style={{ marginBottom: 0, lineHeight: 1.65, color: "var(--ink2)" }}><strong>Android:</strong> Open app.herdledger.app in Chrome → tap the three dot menu in the top right → tap Add to Home Screen → tap Add.</p>
      </>
    ),
  },
  {
    id: "features",
    title: "Features Guide",
    content: (
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
    content: (
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
    content: (
      <>
        <p style={{ marginBottom: "16px", lineHeight: 1.65, color: "var(--ink2)" }}>We build features based on your feedback. Every suggestion is read personally.</p>
        <a href="mailto:support@herdledger.app?subject=Herd%20Ledger%20Feedback" style={{ display: "inline-flex", alignItems: "center", padding: "10px 20px", background: "var(--green)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 600, textDecoration: "none", border: "none", cursor: "pointer" }}>Contact Support</a>
      </>
    ),
  },
];

function Help({ onBack }) {
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
                  <div style={{ padding: "20px", borderTop: "1px solid var(--cream3)", fontSize: "14px" }}>
                    {section.content}
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

// ── Settings ──────────────────────────────────────────────────────────────────
const TAB_OPTIONS = [
  { id: "dashboard", label: "Dashboard", icon: "⊞" },
  { id: "animals", label: "Animals", icon: "🐄" },
  { id: "gestation", label: "Gestation", icon: "📅" },
  { id: "feeder", label: "Feeder Program", icon: "🌾" },
  { id: "pastures", label: "Pastures", icon: "🟩" },
  { id: "notes", label: "Journal", icon: "📖" },
  { id: "expenses", label: "Expenses", icon: "💰" },
  { id: "sales", label: "Sales", icon: "📋" },
  { id: "tasks", label: "Tasks", icon: "✓" },
];

function Settings({ settings, setSettings, onLogout, setTab }) {
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

// ── App ───────────────────────────────────────────────────────────────────────
const USER_DATA_KEYS = ["animals", "gestations", "notes", "offspring", "settings", "feederPrograms", "pastures", "expenses", "loadSales", "tasks"];
const GUEST_STORAGE_KEY = "herd_ledger_guest_data";
const GUEST_USER = { id: "guest", isGuest: true };

const DEFAULT_TAB_VISIBILITY = { dashboard: true, animals: true, gestation: true, notes: true, feeder: false, pastures: true, expenses: true, sales: false, tasks: true };
const TASK_CATEGORIES = ["Feeding", "Vaccination", "Breeding", "Castration", "Pasture Move", "Weaning", "Vet Visit", "Treatment", "General", "Other"];
const TASK_PRIORITIES = ["High", "Medium", "Low"];
const RECURRING_OPTIONS = ["One time", "Daily", "Weekly", "Monthly"];
const EXPENSE_CATEGORIES = ["Feed", "Veterinary", "Medicine", "Equipment", "Supplies", "Labor", "Fuel", "Land/Lease", "Other"];
const DEFAULT_SETTINGS = {
  farmName: "",
  ownerName: "",
  defaultSpecies: "Cattle",
  tabVisibility: { ...DEFAULT_TAB_VISIBILITY },
  animalsViewMode: "tile",
};

function cleanupOrphanedRecords(animals, gestations, offspring) {
  const animalIds = new Set((animals || []).map(a => a.id));
  const cleanedGestations = (gestations || [])
    .filter(g => animalIds.has(g.animalId))
    .map(g => (g.calf?.animalId && !animalIds.has(g.calf.animalId) ? { ...g, calf: undefined } : g));
  const rawOffspring = offspring && typeof offspring === "object" ? offspring : {};
  const cleanedOffspring = Object.fromEntries(
    Object.entries(rawOffspring)
      .filter(([motherId]) => animalIds.has(motherId))
      .map(([motherId, list]) => [
        motherId,
        (list || []).filter(c => c.stillborn || animalIds.has(c.id)),
      ])
      .filter(([, list]) => list.length > 0)
  );
  return { gestations: cleanedGestations, offspring: cleanedOffspring };
}

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
    "settings",
    "help", // reachable from Settings → Help & Guide; keep in valid set so we don't redirect to dashboard
  ]);
  useEffect(() => {
    if (!visibleTabIds.has(tab)) setTab("dashboard");
  }, [tab, visibility.gestation, visibility.feeder, visibility.pastures, visibility.notes, visibility.expenses, visibility.sales, visibility.tasks]);

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
      {tab === "dashboard" && <Dashboard animals={animals} gestations={gestations} offspring={offspring} moon={moon} season={season} user={user} setTab={setTab} setAnimalsSearch={setAnimalsSearch} expenses={expenses} tasks={tasks} />}
      {tab === "animals"   && <Animals animals={animals} setAnimals={setAnimals} offspring={offspring} setOffspring={setOffspring} gestations={gestations} setGestations={setGestations} user={user} viewingAnimal={viewingAnimal} setViewingAnimal={setViewingAnimal} search={animalsSearch} setSearch={setAnimalsSearch} defaultSpecies={settings?.defaultSpecies ?? "Cattle"} feederPrograms={feederPrograms} setTab={setTab} setFeederPreselectAnimalId={setFeederPreselectAnimalId} setFeederBulkAnimalIds={setFeederBulkAnimalIds} setExpenses={setExpenses} settings={settings} setSettings={setSettings} pastures={pastures} notes={notes} setNotes={setNotes} />}
      {tab === "gestation" && <Gestation animals={animals} setAnimals={setAnimals} gestations={gestations} setGestations={setGestations} user={user} />}
      {tab === "feeder"    && <FeederCattle animals={animals} feederPrograms={feederPrograms} setFeederPrograms={setFeederPrograms} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPreselectAnimalId={feederPreselectAnimalId} setFeederPreselectAnimalId={setFeederPreselectAnimalId} feederBulkAnimalIds={feederBulkAnimalIds} setFeederBulkAnimalIds={setFeederBulkAnimalIds} />}
      {tab === "pastures"  && <Pastures animals={animals} setAnimals={setAnimals} pastures={pastures} setPastures={setPastures} setTab={setTab} setViewingAnimal={setViewingAnimal} feederPrograms={feederPrograms} gestations={gestations} setGestations={setGestations} notes={notes} setNotes={setNotes} />}
      {tab === "notes"     && <Notes notes={notes} setNotes={setNotes} user={user} animals={animals} />}
      {tab === "expenses"  && <Expenses expenses={expenses} setExpenses={setExpenses} animals={animals} pastures={pastures} setTab={setTab} setViewingAnimal={setViewingAnimal} />}
      {tab === "sales"     && <Sales animals={animals} loadSales={loadSales} setLoadSales={setLoadSales} expenses={expenses} />}
      {tab === "tasks"     && <Tasks tasks={tasks} setTasks={setTasks} animals={animals} gestations={gestations} offspring={offspring} pastures={pastures} setTab={setTab} />}
      {tab === "help"      && <Help onBack={() => setTab("settings")} />}
      {tab === "settings"  && <Settings settings={settings} setSettings={setSettings} onLogout={isGuest ? () => setUser(null) : () => supabase.auth.signOut()} setTab={setTab} />}
    </div>
  );
}
