import {
  SPECIES_SEX_OPTIONS,
  SEX_TERM_GENDER,
  OFFSPRING_SEX_OPTIONS,
  OFFSPRING_DEFAULT_SEX,
  OFFSPRING_TERM_BY_SPECIES,
  WEANING_AGE_DAYS_BY_SPECIES,
  WEANING_AGE_DAYS_DEFAULT,
  BREEDING_MALE_SEX_TERMS,
  BREEDING_MALE_TO_SPECIES,
  MOON_ICONS,
  MOON_NAMES,
  CASTRATED_TERM_BY_SPECIES,
} from "./constants.js";

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

/** Calculated weaning date from DOB + species default only (no targetWeaningDate). */
export function getCalculatedWeaningDate(animal) {
  if (!animal) return null;
  const dob = (animal.dob || "").trim();
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const days = WEANING_AGE_DAYS_BY_SPECIES[animal.species] ?? WEANING_AGE_DAYS_DEFAULT;
  const d = new Date(dob + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Expected weaning date for listing: targetWeaningDate if set, else DOB + species default. Returns null if already weaned or no DOB. */
export function getExpectedWeaningDate(animal) {
  if (!animal) return null;
  if (animal.weaningDate) return null; // already weaned
  const target = (animal.targetWeaningDate || "").trim();
  if (target && /^\d{4}-\d{2}-\d{2}$/.test(target)) return target;
  return getCalculatedWeaningDate(animal);
}

export function isFemale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Female";
}

export function isMale(animal) {
  return animal && SEX_TERM_GENDER[animal.sex] === "Male";
}

export function isBreedingMale(animal) {
  return animal && !animal.deceased && BREEDING_MALE_SEX_TERMS.includes(animal.sex);
}

export function getEligibleFemalesForRunningWithBull(animals, gestations, pastureName, maleAnimal) {
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

export function daysUntil(dateStr) {
  const d = new Date(dateStr); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.ceil((d - t) / 86400000);
}

export function dueDate(breedingStr, days) {
  const d = new Date(breedingStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export function progress(breedingStr, totalDays) {
  const elapsed = (Date.now() - new Date(breedingStr)) / 86400000;
  return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
}

export function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
    return { start, end, isRange: true };
  }
  return { start: daysUntil(g.dueDate), end: daysUntil(g.dueDate), isRange: false };
}

export function isOverdue(g) {
  const d = daysUntilDue(g);
  return d.isRange ? d.end < 0 : d.start < 0;
}

/** Calf DOB is within expected gestation window: due date (= breeding + gestation days) ± 30 days buffer. */
export function birthDateWithinGestationWindow(calfDobStr, g) {
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

export function breedingDateFromDelivery(deliveryDateStr, gestationDays) {
  const d = new Date(deliveryDateStr + "T12:00:00");
  d.setDate(d.getDate() - (gestationDays || 283));
  return d.toISOString().split("T")[0];
}

export function ageFromDob(dobStr) {
  if (!dobStr) return "Unknown";
  const birth = new Date(dobStr + "T12:00:00");
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
  if (!dobStr) return null;
  const birth = new Date(dobStr + "T12:00:00");
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months--;
  return months < 0 ? null : months;
}

export function getAgeInWeeks(dobStr) {
  if (!dobStr) return null;
  const birth = new Date(dobStr + "T12:00:00").getTime();
  const now = Date.now();
  const weeks = Math.floor((now - birth) / (7 * 86400000));
  return weeks < 0 ? null : weeks;
}

/** Age-based sex/status term for display. Castrated always shows castrated term; no DOB uses stored sex; else species rules. */
export function getAgeBasedSexTerm(animal, gestations) {
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

export function displaySex(animal, gestations) {
  return getAgeBasedSexTerm(animal, gestations);
}

export function getAnimalName(animal) {
  if (!animal) return "Unnamed";
  return animal.name || (animal.tag ? `#${animal.tag}` : "Unnamed");
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
