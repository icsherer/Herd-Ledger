import {
  SPECIES_SEX_OPTIONS,
  SEX_TERM_GENDER,
  OFFSPRING_SEX_OPTIONS,
  OFFSPRING_DEFAULT_SEX,
  OFFSPRING_TERM_BY_SPECIES,
  WEANING_AGE_DAYS_BY_SPECIES,
  WEANING_AGE_DAYS_DEFAULT,
  HEAT_CYCLE_DAYS_BY_SPECIES,
  HEAT_CYCLE_DAYS_DEFAULT,
  BREEDING_MALE_SEX_TERMS,
  BREEDING_MALE_TO_SPECIES,
  MOON_ICONS,
  MOON_NAMES,
  CASTRATED_TERM_BY_SPECIES,
} from "./constants.js";

/** True if animal is an adult breeding female (Cow, Heifer, Mare, etc.), not a calf/lamb/pullet. */
export function isSexuallyMatureFemale(animal) {
  if (!animal || SEX_TERM_GENDER[animal.sex] !== "Female") return false;
  const offspringOptions = OFFSPRING_SEX_OPTIONS[animal.species];
  return !offspringOptions || !offspringOptions.includes(animal.sex);
}

/** Compress image to under maxBytes; returns data URL (base64). */
export function compressImageToBase64(file, maxBytes = 200 * 1024) {
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

export function getHealthStatus(animal) {
  const treatments = animal?.treatments || [];
  if (treatments.length === 0) return "green";
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const recent = treatments.filter(t => new Date(t.date || 0).getTime() >= thirtyDaysAgo);
  if (recent.some(t => t.type === "Illness")) return "red";
  if (recent.length > 0) return "yellow";
  return "green";
}

export function getSexOptions(species) {
  return SPECIES_SEX_OPTIONS[species] || SPECIES_SEX_OPTIONS.Cattle;
}

export function getOffspringSexOptions(species) {
  return OFFSPRING_SEX_OPTIONS[species] || OFFSPRING_SEX_OPTIONS.Cattle;
}

export function getOffspringDefaultSex(species) {
  return OFFSPRING_DEFAULT_SEX[species] || getOffspringSexOptions(species)?.[0] || "Heifer Calf";
}

export function getOffspringTerm(species) {
  return OFFSPRING_TERM_BY_SPECIES[species] || "Offspring";
}

/** Calculated weaning date from DOB + species default only (no targetWeaningDate). Returns null if animal is 12+ months or DOB invalid. */
export function getCalculatedWeaningDate(animal) {
  if (!animal) return null;
  const months = getAgeInMonths(animal.dob);
  if (months != null && months >= 12) return null;
  const birth = parseDateSafe(animal.dob);
  if (!birth) return null;
  const days = WEANING_AGE_DAYS_BY_SPECIES[animal.species] ?? WEANING_AGE_DAYS_DEFAULT;
  const d = new Date(birth.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Expected weaning date for listing: targetWeaningDate if set, else DOB + species default. Returns null if already weaned, no DOB, or animal is 12+ months. */
export function getExpectedWeaningDate(animal) {
  if (!animal) return null;
  if (animal.weaningDate) return null; // already weaned
  const months = getAgeInMonths(animal.dob);
  if (months != null && months >= 12) return null;
  const target = (animal.targetWeaningDate || "").trim();
  if (target && /^\d{4}-\d{2}-\d{2}$/.test(target)) return target;
  return getCalculatedWeaningDate(animal);
}

export function isFemale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Female";
}

/** Next expected heat date (YYYY-MM-DD) from last logged heat + species cycle; null if no heats. Never returns today — always the next cycle date in the future (or null). */
export function getNextExpectedHeatDate(animal) {
  const cycles = (animal?.heatCycles || []).slice().sort((a, b) => (b.observedDate || "").localeCompare(a.observedDate || ""));
  const last = cycles[0];
  if (!last?.observedDate) return null;
  const cycleDays = HEAT_CYCLE_DAYS_BY_SPECIES[animal.species] ?? HEAT_CYCLE_DAYS_DEFAULT;
  const d = parseDateSafe(last.observedDate);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(d.getTime());
  next.setDate(next.getDate() + cycleDays);
  while (next.getTime() <= today.getTime()) next.setDate(next.getDate() + cycleDays);
  return next.toISOString().split("T")[0];
}

export function isMale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Male";
}

/** Intact male used for breeding (bull, stallion, etc.). Male calves under 6 months never count — they don't trigger breeding warnings. */
export function isBreedingMale(animal) {
  if (!animal || animal.deceased || !BREEDING_MALE_SEX_TERMS.includes(animal.sex)) return false;
  const months = getAgeInMonths(animal.dob);
  if (months != null && months < 6) return false;
  return true;
}

export function getEligibleFemalesForRunningWithBull(animals, gestations, pastureName, maleAnimal) {
  if (!maleAnimal || !pastureName?.trim() || !isBreedingMale(maleAnimal)) return [];
  const species = BREEDING_MALE_TO_SPECIES[maleAnimal.sex];
  if (!species) return [];
  const activeGestationAnimalIds = new Set((gestations || []).filter(g => g.status !== "Delivered").map(g => g.animalId));
  return (animals || []).filter(a => {
    if (a.deceased || a.sale) return false;
    if (a.species !== species) return false;
    if (!isSexuallyMatureFemale(a)) return false;
    if (activeGestationAnimalIds.has(a.id)) return false;
    const inPasture = pastureNameEq(a.movements?.[0]?.pastureName, pastureName);
    return inPasture;
  });
}

/** Intact males of the given species (e.g. bulls for Cattle, rams for Sheep). For use in sire dropdowns. */
export function getBreedingMalesForSpecies(animals, species) {
  if (!species) return [];
  return (animals || []).filter(a => !a.deceased && !a.sale && a.species === species && isBreedingMale(a));
}

export function getBreedingMaleInPasture(animals, pastureName) {
  if (!pastureName?.trim()) return null;
  return (animals || []).find(a => isBreedingMale(a) && pastureNameEq(a.movements?.[0]?.pastureName, pastureName)) || null;
}

export function getRunningWithMaleForFemale(animal, animals) {
  if (!animal || SEX_TERM_GENDER[animal.sex] !== "Female") return null;
  const pasture = (animal.movements?.[0]?.pastureName || "").trim();
  if (!pasture) return null;
  const male = getBreedingMaleInPasture(animals, pasture);
  if (!male || BREEDING_MALE_TO_SPECIES[male.sex] !== animal.species) return null;
  return male;
}

export function pastureNameEq(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}

/** Compact dollar for summary tiles: ≥$1000 → $10.5K / $125K, ≥$1M → $1.5M; <$1000 → $0 / $500 (no decimals). */
export function formatCompactDollar(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return "$0";
  const abs = Math.abs(num);
  const sign = num < 0 ? "−" : "";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) {
    const k = abs / 1e3;
    const str = k % 1 === 0 ? String(Math.round(k)) : k.toFixed(1);
    return `${sign}$${str}K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

export function getCanonicalPastureNames(animals, pastures) {
  const byLower = new Map();
  [...(pastures || []), ...(animals || []).flatMap(a => (a.movements || []).map(m => m.pastureName)).filter(Boolean)].forEach(n => {
    const key = (n || "").trim().toLowerCase();
    if (key && !byLower.has(key)) byLower.set(key, (n || "").trim());
  });
  return [...byLower.values()].sort((a, b) => a.localeCompare(b));
}

export function resolvePastureName(typed, canonicalList) {
  const t = (typed || "").trim();
  if (!t) return t;
  const found = (canonicalList || []).find(c => pastureNameEq(c, t));
  return found != null ? found : t;
}

export function getMoonPhase(date = new Date()) {
  let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (m < 3) { y--; m += 12; } m++;
  const jd = Math.floor(365.25 * y) + Math.floor(30.6 * m) + d - 694039.09;
  const b = Math.round((jd / 29.5305882 % 1) * 8) % 8;
  return { icon: MOON_ICONS[b], name: MOON_NAMES[b] };
}

export function getSeason(d = new Date()) {
  const doy = Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000);
  if (doy < 80 || doy >= 355) return "Winter";
  if (doy < 172) return "Spring";
  if (doy < 266) return "Summer";
  return "Autumn";
}

/** Days an animal has been on feed from feeder start date to now. */
export function feederDaysOnFeed(startDateStr) {
  if (!startDateStr) return 0;
  const start = new Date(startDateStr + "T12:00:00").getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

/** Estimated current weight from ADG (last two weights, extrapolated to now). Returns null if not enough data. */
export function estimatedWeightFromADG(animal, feederStartDateStr) {
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

/** Latest weight for an animal by id (most recent entry); returns string or "". */
export function getLatestWeightForAnimal(animals, animalId) {
  const an = (animals || []).find(a => a.id === animalId);
  const weights = [...(an?.weights || [])].sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const w = weights[0]?.weight;
  return w != null ? String(w) : "";
}

/** ADG defaults (lbs/day) by species. */
export function getADGDefault(species) {
  if (species === "Cattle") return 3.0;
  if (species === "Pig") return 1.8;
  if (species === "Sheep") return 0.5;
  if (species === "Goat") return 0.4;
  if (species === "Chicken") return 0.1;
  if (species === "Rabbit") return 0.15;
  return 1.0;
}

/** Normalize date string to YYYY-MM-DD. Accepts YYYY-MM-DD or YY-MM-DD. If year < 100 (2-digit stored by mistake), auto-correct by adding 2000 (25→2025, 26→2026). Returns null if invalid. */
export function normalizeDateString(dateStr) {
  if (dateStr == null || typeof dateStr !== "string") return null;
  const s = String(dateStr).trim().split("T")[0].split(" ")[0];
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = parseInt(s.slice(0, 4), 10);
    if (y >= 0 && y < 100) return `${2000 + y}-${s.slice(5, 7)}-${s.slice(8, 10)}`;
    return s;
  }
  const twoDigit = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (twoDigit) {
    const yy = parseInt(twoDigit[1], 10);
    const fullYear = yy >= 0 && yy <= 99 ? 2000 + yy : yy;
    return `${fullYear}-${twoDigit[2]}-${twoDigit[3]}`;
  }
  return null;
}

export function daysUntil(dateStr) {
  const normalized = normalizeDateString(dateStr);
  if (!normalized) return NaN;
  const d = new Date(normalized + "T12:00:00");
  d.setHours(0, 0, 0, 0);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - t) / 86400000);
  return Number.isFinite(diff) ? diff : NaN;
}

export function dueDate(breedingStr, days) {
  const normalized = normalizeDateString(breedingStr);
  if (!normalized) return null;
  const d = new Date(normalized + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Given a single breeding/exposure date, return due date range using min and max gestation days. */
export function dueDateRangeFromSingleDate(breedingStr, minDays, maxDays) {
  const start = dueDate(breedingStr, minDays ?? 0);
  const end = dueDate(breedingStr, maxDays ?? minDays ?? 0);
  return { dueDateStart: start, dueDateEnd: end };
}

/** Format exposure for display: single date "Exposed: Oct 16, 2025" or range "Exposed: Oct 16, 2025 – Nov 1, 2025". */
export function fmtExposure(g) {
  if (!g?.breedingDate) return "—";
  if (g.breedingDateEnd && String(g.breedingDateEnd).trim()) return `Exposed: ${fmt(g.breedingDate)} – ${fmt(g.breedingDateEnd)}`;
  return `Exposed: ${fmt(g.breedingDate)}`;
}

export function progress(breedingStr, totalDays) {
  const norm = normalizeDateString(breedingStr);
  if (!norm) return 0;
  const breeding = new Date(norm + "T12:00:00").getTime();
  if (!Number.isFinite(breeding)) return 0;
  const elapsed = (Date.now() - breeding) / 86400000;
  return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
}

export function fmt(dateStr) {
  const d = parseDateSafe(dateStr);
  if (!d) return dateStr ? "Unknown" : "—";
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${monthDay}, ${d.getFullYear()}`;
}

export function createMovementJournalEntry(animal, fromPasture, toPasture, dateMovedIn, notes, movementId) {
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

export function fmtDueRange(g) {
  if (g.dueDateStart && g.dueDateEnd) return `${fmt(g.dueDateStart)} – ${fmt(g.dueDateEnd)}`;
  return fmt(g.dueDate);
}

export function breedingDateForProgress(g) {
  return g.breedingDateEnd || g.breedingDate;
}

export function daysUntilDue(g) {
  if (g.dueDateStart && g.dueDateEnd) {
    const start = daysUntil(g.dueDateStart);
    const end = daysUntil(g.dueDateEnd);
    return { start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : 0, isRange: true };
  }
  const single = daysUntil(g.dueDate);
  const n = Number.isFinite(single) ? single : 0;
  return { start: n, end: n, isRange: false };
}

export function isOverdue(g) {
  const d = daysUntilDue(g);
  return d.isRange ? d.end < 0 : d.start < 0;
}

/** Format days-remaining for gestation badge. When today is within due range, returns "Due Now" (never negative). Past end of range = "Overdue". */
export function formatGestationDaysRemaining(dueD) {
  if (!dueD) return "—";
  const { start, end, isRange } = dueD;
  if (isRange) {
    if (end < 0) return "Overdue";
    if (start <= 0 && end >= 0) return "Due Now";
    return `${Math.max(0, start)}–${end} days`;
  }
  if (start < 0) return `${Math.abs(start)}d overdue`;
  if (start === 0) return "Due today";
  return `${start} days`;
}

/** Calf DOB is within expected gestation window: due date (= breeding + gestation days) ± 30 days buffer. Uses 4-digit years. */
export function birthDateWithinGestationWindow(calfDobStr, g) {
  if (!calfDobStr || !g) return false;
  const calfNorm = normalizeDateString(calfDobStr);
  if (!calfNorm) return false;
  const calf = new Date(calfNorm + "T12:00:00").getTime();
  if (Number.isNaN(calf)) return false;
  const day = 86400000;
  const margin = 30 * day;
  if (g.dueDateStart && g.dueDateEnd) {
    const startNorm = normalizeDateString(g.dueDateStart);
    const endNorm = normalizeDateString(g.dueDateEnd);
    if (!startNorm || !endNorm) return false;
    const start = new Date(startNorm + "T12:00:00").getTime() - margin;
    const end = new Date(endNorm + "T12:00:00").getTime() + margin;
    return calf >= start && calf <= end;
  }
  const dueStr = normalizeDateString(g.dueDate);
  if (!dueStr) return false;
  const due = new Date(dueStr + "T12:00:00").getTime();
  return Math.abs(calf - due) <= margin;
}

export function breedingDateFromDelivery(deliveryDateStr, gestationDays) {
  const norm = normalizeDateString(deliveryDateStr);
  if (!norm) return null;
  const d = new Date(norm + "T12:00:00");
  d.setDate(d.getDate() - (gestationDays || 283));
  return d.toISOString().split("T")[0];
}

/** Parse date string (YYYY-MM-DD or YY-MM-DD); return Date or null if invalid or year > maxYear. Always uses 4-digit year. */
export function parseDateSafe(dateStr, maxYear = 2100) {
  const s = normalizeDateString(dateStr);
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  if (Number.isNaN(d.getTime()) || d.getFullYear() > maxYear) return null;
  return d;
}

export function ageFromDob(dobStr) {
  const birth = parseDateSafe(dobStr);
  if (!birth) return "Unknown";
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) return ageFromDobMonths(months - 1);
  return ageFromDobMonths(months);
}

export function ageFromDobMonths(months) {
  if (months < 0) return "Unknown";
  if (months >= 24) return `${Math.floor(months / 12)} years`;
  if (months >= 12) return "1 year";
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  return "Under 1 month";
}

export function getAgeInMonths(dobStr) {
  const birth = parseDateSafe(dobStr);
  if (!birth) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return months < 0 ? null : months;
}

export function getAgeInWeeks(dobStr) {
  const birth = parseDateSafe(dobStr);
  if (!birth) return null;
  const now = Date.now();
  const weeks = Math.floor((now - birth.getTime()) / (7 * 86400000));
  return weeks < 0 ? null : weeks;
}

/** Age-based sex/status term for display. Recalculates from DOB + stored sex; castrated uses age-based castrate term. */
export function getAgeBasedSexTerm(animal, gestations) {
  if (!animal) return "—";
  const species = animal.species || "Cattle";
  const isMaleStored = SEX_TERM_GENDER[animal.sex] === "Male";
  const isFemaleStored = SEX_TERM_GENDER[animal.sex] === "Female";
  const castrated = animal.castration && isMaleStored;
  const months = animal.dob != null ? getAgeInMonths(animal.dob) : null;
  const weeks = animal.dob != null ? getAgeInWeeks(animal.dob) : null;
  if (!animal.dob) return castrated ? (CASTRATED_TERM_BY_SPECIES[species] ?? "Castrated") : (animal.sex || "—");
  if (months == null) return animal.sex || "—";
  const hasBredOrCalved = gestations?.some(g => g.animalId === animal.id);

  switch (species) {
    case "Cattle":
    case "Bison":
      if (castrated) return months < 6 ? "Steer Calf" : "Steer";
      if (months < 6) return isMaleStored ? "Bull Calf" : "Heifer Calf";
      if (months < 24) return isMaleStored ? "Bull Calf" : "Heifer";
      return isMaleStored ? "Bull" : (hasBredOrCalved ? "Cow" : "Heifer");
    case "Horse":
      if (castrated) return "Gelding";
      if (months < 12) return isMaleStored ? "Colt Foal" : "Filly Foal";
      if (months < 48) return isMaleStored ? "Colt" : "Filly";
      return isMaleStored ? "Stallion" : "Mare";
    case "Pig":
      if (castrated) return months < 6 ? "Barrow" : "Barrow";
      if (months < 2) return "Piglet";
      if (months < 24) return isMaleStored ? "Boar" : "Gilt";
      return isMaleStored ? "Boar" : (hasBredOrCalved ? "Sow" : "Gilt");
    case "Sheep":
      if (castrated) return "Wether";
      if (months < 6) return isMaleStored ? "Ram Lamb" : "Ewe Lamb";
      if (months < 24) return isFemaleStored ? "Ewe Lamb" : "Ram Lamb";
      return isFemaleStored ? "Ewe" : "Ram";
    case "Goat":
      if (castrated) return "Wether";
      if (months < 6) return isMaleStored ? "Buckling" : "Doeling";
      if (months < 24) return isFemaleStored ? "Doeling" : "Buckling";
      return isFemaleStored ? "Doe" : "Buck";
    case "Chicken":
      if (castrated) return "Capon";
      if (weeks != null && weeks < 16) return isFemaleStored ? "Pullet" : "Cockerel";
      return isFemaleStored ? "Hen" : "Rooster";
    case "Rabbit":
      if (months < 3) return "Kit";
      return isFemaleStored ? "Doe" : "Buck";
    case "Llama":
    case "Alpaca":
      if (months < 12) return isMaleStored ? "Male Cria" : "Female Cria";
      return isFemaleStored ? "Female" : "Male";
    case "Donkey":
    case "Mule":
      if (castrated) return "Gelding";
      if (months < 12) return isMaleStored ? "Colt Foal" : "Filly Foal";
      if (months < 48) return isMaleStored ? "Colt" : "Filly";
      return isMaleStored ? "Jack" : "Jenny";
    default:
      return castrated ? (CASTRATED_TERM_BY_SPECIES[species] ?? "Castrated") : (animal.sex || "—");
  }
}

export function displaySex(animal, gestations) {
  return getAgeBasedSexTerm(animal, gestations);
}

export function getAnimalName(animal) {
  if (!animal) return "Unnamed";
  return animal.name || (animal.tag ? `#${animal.tag}` : "Unnamed");
}

const INBREEDING_GENERATIONS = 3;

/** Lineage: support both damId/damName and legacy motherId/motherName. Use IDs only for comparison. */
function getDamId(animal) {
  if (!animal) return undefined;
  return animal.damId ?? animal.motherId;
}
function getSireId(animal) {
  if (!animal) return undefined;
  return animal.sireId;
}

/**
 * Build complete ancestor tree by ID only (damId/motherId and sireId). Goes back maxGen generations using BFS.
 * Returns { ancestorIds: Set, byGeneration: [ Set(gen1), Set(gen2), Set(gen3) ] }.
 */
function buildAncestorTree(animalId, animals, maxGen) {
  const list = animals || [];
  const ancestorIds = new Set();
  const byGeneration = [];
  let currentLevel = new Set([animalId]);
  for (let gen = 0; gen < maxGen; gen++) {
    const nextLevel = new Set();
    for (const id of currentLevel) {
      const animal = list.find(a => a.id === id);
      if (!animal) continue;
      const damId = getDamId(animal);
      const sireId = getSireId(animal);
      if (damId) {
        ancestorIds.add(damId);
        nextLevel.add(damId);
      }
      if (sireId) {
        ancestorIds.add(sireId);
        nextLevel.add(sireId);
      }
    }
    byGeneration.push(nextLevel);
    currentLevel = nextLevel;
  }
  return { ancestorIds, byGeneration };
}

/** Resolve ancestor set to [{ id, name }] for console logging. */
function ancestorSetToNames(ids, animals) {
  const list = animals || [];
  return [...ids].map(id => {
    const a = list.find(x => x.id === id);
    return { id, name: getAnimalName(a) };
  });
}

/**
 * Check for inbreeding: build 3-generation ancestor trees for both animals, find intersection,
 * and detect direct relationships (sire is female's father, grandfather, or sibling).
 * Logs ancestor trees to console. Returns { commonAncestorId, commonAncestorName, directRelationship? } or null.
 */
export function findCommonAncestorWithin3Generations(animalA, animalB, animals) {
  if (!animalA?.id || !animalB?.id || animalA.id === animalB.id) return null;
  const list = animals || [];

  // 1) Build complete ancestor trees (3 generations each)
  const treeA = buildAncestorTree(animalA.id, list, INBREEDING_GENERATIONS);
  const treeB = buildAncestorTree(animalB.id, list, INBREEDING_GENERATIONS);
  const ancestorsFemale = treeA.ancestorIds;
  const ancestorsMale = treeB.ancestorIds;

  // 2) Find intersection — any ID in both sets is a shared ancestor
  const intersection = new Set([...ancestorsFemale].filter(id => ancestorsMale.has(id)));

  // 3) Log both ancestor ID trees side by side for verification
  const femaleGen1 = treeA.byGeneration[0] || new Set();
  const femaleGen2 = treeA.byGeneration[1] || new Set();
  const femaleGen3 = treeA.byGeneration[2] || new Set();
  const maleGen1 = treeB.byGeneration[0] || new Set();
  const maleGen2 = treeB.byGeneration[1] || new Set();
  const maleGen3 = treeB.byGeneration[2] || new Set();
  console.log("[Inbreeding check]", getAnimalName(animalA), "(female) vs", getAnimalName(animalB), "(sire)");
  console.log("  Ancestor ID trees (side by side):");
  console.table([
    { generation: "Gen 1 (parents)", female: [...femaleGen1].join(", ") || "—", male: [...maleGen1].join(", ") || "—" },
    { generation: "Gen 2 (grandparents)", female: [...femaleGen2].join(", ") || "—", male: [...maleGen2].join(", ") || "—" },
    { generation: "Gen 3 (great-grandparents)", female: [...femaleGen3].join(", ") || "—", male: [...maleGen3].join(", ") || "—" },
    { generation: "All ancestor IDs", female: [...ancestorsFemale].join(", ") || "—", male: [...ancestorsMale].join(", ") || "—" },
  ]);
  console.log("  Female ancestor tree (IDs → names):", ancestorSetToNames(ancestorsFemale, list));
  console.log("  Male ancestor tree (IDs → names):", ancestorSetToNames(ancestorsMale, list));
  console.log("  Intersection (shared ancestor IDs):", [...intersection], "→", ancestorSetToNames(intersection, list));

  // 4) Direct relationships: sire is female's father, grandfather, or brother
  const sireIsFather = femaleGen1.has(animalB.id);
  const sireIsGrandfather = femaleGen2.has(animalB.id);
  const femaleParents = femaleGen1;
  const maleParents = maleGen1;
  const shareParent = [...femaleParents].some(id => maleParents.has(id));
  const directRelationship = sireIsFather
    ? "sire_is_father"
    : sireIsGrandfather
      ? "sire_is_grandfather"
      : shareParent
        ? "siblings"
        : null;
  if (directRelationship) {
    console.log("  Direct relationship:", directRelationship);
  }

  // 5) If any shared ancestor, return it (prefer naming the first from intersection; prefer direct-relationship ancestor when applicable)
  if (sireIsFather || sireIsGrandfather) {
    const b = list.find(a => a.id === animalB.id);
    return {
      commonAncestorId: animalB.id,
      commonAncestorName: getAnimalName(b),
      directRelationship,
    };
  }
  if (ancestorsMale.has(animalA.id)) {
    const a = list.find(x => x.id === animalA.id);
    return {
      commonAncestorId: animalA.id,
      commonAncestorName: getAnimalName(a),
      directRelationship: null,
    };
  }
  for (const id of intersection) {
    const an = list.find(x => x.id === id);
    return {
      commonAncestorId: id,
      commonAncestorName: getAnimalName(an),
      directRelationship: directRelationship || undefined,
    };
  }
  return null;
}

/**
 * Inbreeding check using stored damId/sireId only.
 * Half-siblings: same damId OR same sireId → strong warning.
 * Shared grandparent: sire's damId or sireId matches female's damId or sireId → moderate warning.
 * Logs IDs being compared to console. Returns { level: 'half_sibling'|'shared_grandparent', commonAncestorId, commonAncestorName } or null.
 */
export function checkInbreedingByParentIds(female, male, animals) {
  if (!female?.id || !male?.id || female.id === male.id) return null;
  const list = animals || [];
  const fDamId = getDamId(female);
  const fSireId = getSireId(female);
  const mDamId = getDamId(male);
  const mSireId = getSireId(male);

  console.log("[Inbreeding check by parent IDs]", getAnimalName(female), "(female) vs", getAnimalName(male), "(sire)");
  console.log("  IDs compared:", {
    female_damId: fDamId ?? "—",
    female_sireId: fSireId ?? "—",
    male_damId: mDamId ?? "—",
    male_sireId: mSireId ?? "—",
  });

  if (!fDamId && !fSireId && !mDamId && !mSireId) return null;

  const sameDam = fDamId && mDamId && fDamId === mDamId;
  const sameSire = fSireId && mSireId && fSireId === mSireId;
  if (sameDam || sameSire) {
    const commonId = sameDam ? fDamId : fSireId;
    const an = list.find(x => x.id === commonId);
    console.log("  Result: half_sibling (same " + (sameDam ? "dam" : "sire") + ")", commonId);
    return { level: "half_sibling", commonAncestorId: commonId, commonAncestorName: getAnimalName(an) };
  }

  const sireParentMatchesFemaleParent =
    (mDamId && (mDamId === fDamId || mDamId === fSireId)) ||
    (mSireId && (mSireId === fDamId || mSireId === fSireId));
  if (sireParentMatchesFemaleParent) {
    const commonId = mDamId && (mDamId === fDamId || mDamId === fSireId) ? mDamId : mSireId;
    const an = list.find(x => x.id === commonId);
    console.log("  Result: shared_grandparent (sire's parent matches female's parent)", commonId);
    return { level: "shared_grandparent", commonAncestorId: commonId, commonAncestorName: getAnimalName(an) };
  }

  return null;
}

export function cleanupOrphanedRecords(animals, gestations, offspring) {
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
