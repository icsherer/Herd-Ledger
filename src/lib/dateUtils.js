/** Parse YYYY-MM-DD; returns normalized string or null if invalid calendar / year outside 1900–2100. */
export function parseISODateYMD(dateStr) {
  const t = String(dateStr || "").trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (y < 1900 || y > 2100) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return t;
}

export function isValidDate(dateStr) {
  const t = String(dateStr || "").trim();
  if (!t) return true;
  return parseISODateYMD(t) != null;
}

/** Returns trimmed valid YYYY-MM-DD, or "" if invalid. Empty input → "". */
export function sanitizeDate(dateStr) {
  const t = String(dateStr || "").trim();
  if (!t) return "";
  return parseISODateYMD(t) || "";
}

export function todayLocalISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function sanitizeBirthDate(dateStr) {
  const s = sanitizeDate(dateStr);
  if (!s) return "";
  if (s > todayLocalISODate()) return "";
  return s;
}

/** Breeding / booster / task due: if year segment is two digits, expand to 20YY (e.g. 26 → 2026). */
export function fixBreedingDueTwoDigitYear(dateStr) {
  const t = String(dateStr || "").trim();
  const parts = t.split("-");
  if (parts.length !== 3) return t;
  const y = parts[0];
  if (y.length === 2 && /^\d{2}$/.test(y)) parts[0] = `20${y}`;
  return parts.join("-");
}

export const DATE_WARN_INVALID = "Invalid date — use a real calendar date (year 1900–2100).";
export const DATE_WARN_FUTURE_BIRTH = "Birth date cannot be in the future.";
