/**
 * What someone typed into a search box, as the words every search matches.
 * The same rules as search_words() in the database; pure, so the browser
 * and the unit tests can use it too.
 *
 *   - Punctuation that only separates (commas, brackets, quotes, semicolons,
 *     backslashes — also syntax in a PostgREST `or` filter) splits words:
 *     "AZ Pro Plumbing and Drain, LLC" is six words.
 *   - A US country code in front of a number ("+1", or "1" before an area
 *     code) is dropped: "+1 (602) 851-8511" is "602" and "851-8511".
 *   - At most eight words.
 */
export function searchWords(q) {
  const parts = String(q ?? "")
    .toLowerCase()
    .replace(/[,;"'()[\]{}\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return parts.filter((w, i) => w !== "+1" && !(w === "1" && /^\d{3}$/.test(parts[i + 1] ?? ""))).slice(0, 8);
}

/** A word that could be part of a phone number (or a date, or "24-7"): digits and . - + only. */
export const isNumberish = (word) => /^[0-9().+-]+$/.test(word) && /\d{2}/.test(word);

/** The digits of a number-like word, without a leading US country code: "1-602-851-8511" is "6028518511". */
export function digitsOf(word) {
  const d = String(word).replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/**
 * The forms a word may match in: as typed, and for a number-like word also
 * as bare digits, so "602.851.8511" finds a phone stored as (602) 851-8511
 * while "24-7" and "2026-09-23" still find text written that way.
 */
export function wordForms(word) {
  if (!isNumberish(word)) return [word];
  const d = digitsOf(word);
  return d && d !== word ? [word, d] : [word];
}

/**
 * Text as a search looks through it: lower-case, plus each run of digits
 * and phone punctuation as bare digits ("(602) 851-8511" also as
 * "6028518511"). The same as search_doc() in the database.
 */
export function searchDoc(text) {
  const lower = String(text ?? "").toLowerCase();
  const runs = (lower.match(/[0-9][0-9().+ -]*[0-9]/g) ?? []).map((r) => r.replace(/\D/g, ""));
  return runs.length ? `${lower} ${runs.join(" ")}` : lower;
}

/** Whether `text` holds every word typed, each in one of its forms (filtering rows already in the browser). */
export function matchesAll(text, words) {
  const doc = searchDoc(text);
  return words.every((w) => wordForms(w).some((f) => doc.includes(f)));
}
