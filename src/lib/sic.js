/**
 * SIC codes: reading a master list of codes and descriptions from a file,
 * and matching a description to its code. Pure functions.
 */

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CODE_HEADS = ["siccode", "sic", "code", "siccodes", "sicnumber"];
const DESC_HEADS = ["sicdesc", "sicdescription", "description", "desc", "industry", "siccodedescription", "title"];

/** A code as kept: trimmed, no inner spaces ("1521-99", "1711"). */
export const sicCode = (v) => String(v ?? "").replace(/\s+/g, "").slice(0, 20) || null;
/** A description as compared: lower case, letters and digits only. */
export const sicKey = (v) => norm(v);

/**
 * Code and description pairs from a sheet (header row first, its columns
 * found by their headings: SIC Code / SICCode / Code, and SIC Description /
 * SICDesc / Description), blanks and repeats dropped. Without recognisable
 * headings, the first two columns.
 */
export function sicPairsFromRows(rows) {
  if (!rows.length) return [];
  const head = rows[0].map(norm);
  let c = head.findIndex((h) => CODE_HEADS.includes(h));
  let d = head.findIndex((h) => DESC_HEADS.includes(h));
  const body = c >= 0 || d >= 0 ? rows.slice(1) : rows;
  if (c < 0) c = 0;
  if (d < 0) d = c === 0 ? 1 : 0;
  const seen = new Set();
  const out = [];
  for (const row of body) {
    const code = sicCode(row[c]);
    const description = String(row[d] ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null;
    if (!code || !/\d/.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, description });
  }
  return out;
}
