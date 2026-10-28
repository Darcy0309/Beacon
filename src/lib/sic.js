/**
 * SIC codes: reading a master list of codes and descriptions from a file,
 * and matching a description to its code. Pure functions.
 */

const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CODE_HEADS = ["siccode", "sic", "code", "siccodes", "sicnumber"];
const DESC_HEADS = ["sicdesc", "sicdescription", "description", "desc", "industry", "siccodedescription", "title"];

/**
 * A code as kept: trimmed, no inner spaces, and one form for each code.
 * The leading zero a spreadsheet takes off the agricultural codes is put
 * back (Sean, Oct 2026): a code of an odd number of digits has lost it, so
 * "111" is 0111 and "11101" is 011101. A 6-digit code is kept without its
 * dash (Oct 2026: the client's SIC sheets write 422505, SalesGenie writes
 * 4225-05; one code), so "4225-05" is 422505 and "111-01" is 011101. The
 * database does the same (sic_pad), whatever writes the code.
 */
export const sicCode = (v) => {
  let t = String(v ?? "").replace(/\s+/g, "").slice(0, 20);
  if (/^\d{3,4}-\d{2}$/.test(t)) t = t.replace("-", "");
  if (/^(\d|\d{3}|\d{5}|\d{7})$/.test(t)) return `0${t}`;
  return t || null;
};
/**
 * The codes to find a description under, most exact first: the code itself,
 * then its industry (4 digits) and its group (2): a 6-digit code not in the
 * list still reads as its industry.
 */
export const sicLookup = (v) => {
  const c = sicCode(v);
  return c ? [...new Set([c, c.slice(0, 4), c.slice(0, 2)].filter((x) => /^\d{2}/.test(x)))] : [];
};

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
