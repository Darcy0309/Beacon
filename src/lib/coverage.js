// A name's coverage: its policy lines and the carrier names suggested while
// typing one. Dependency-free so the page, the form and the server share it.

/**
 * The policy lines on a lead sheet, each an X-date and a carrier on the
 * name's insurance_details row. `always`: listed even when empty, as the
 * client asked; the rest show once they have something.
 */
export const POLICY_LINES = [
  // The client's "Liability" X-date: the package (general liability) policy.
  { key: "pkg", label: "Liability / Package", date: "pkg_xdate", carrier: "pkg_carrier", always: true },
  { key: "wc", label: "Workers comp", date: "wc_xdate", carrier: "wc_carrier", always: true },
  { key: "auto", label: "Auto", date: "auto_xdate", carrier: "auto_carrier", always: true },
  { key: "health", label: "Group health", date: "health_xdate", carrier: "health_carrier", always: true },
  { key: "personal", label: "Personal lines", date: "personal_lines_xdate", carrier: "personal_lines_carrier", always: true },
  { key: "dental", label: "Dental", date: "dental_xdate", carrier: "dental_provider" },
  { key: "vision", label: "Vision", date: "vision_xdate", carrier: "vision_provider" },
  { key: "prof", label: "Prof. liability", date: "prof_liab_xdate", carrier: "prof_liab_carrier" },
  { key: "do", label: "D&O", date: "do_xdate", carrier: "do_carrier" },
  { key: "eo", label: "E&O", date: "eo_xdate", carrier: "eo_carrier" },
];

/** A carrier name as two spellings of it compare: lower case, letters and digits only. */
export const carrierKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The carriers to suggest for what someone has typed, best first: names
 * that start with it, then names with a word that does, then names that
 * contain it anywhere. Case and punctuation do not matter.
 */
export function suggestCarriers(options, typed, limit = 8) {
  const t = String(typed ?? "").trim().toLowerCase();
  if (!t) return [];
  const k = carrierKey(t);
  const scored = [];
  for (const name of options) {
    const lower = name.toLowerCase();
    const rank = lower.startsWith(t) || carrierKey(name).startsWith(k) ? 0
      : lower.split(/[^a-z0-9]+/).some((w) => w.startsWith(t)) ? 1
      : k && carrierKey(name).includes(k) ? 2
      : -1;
    if (rank >= 0) scored.push([rank, name]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, limit).map(([, name]) => name);
}

/**
 * Carrier names from an imported sheet: the column headed Carrier, Name,
 * Company or Insurance Company, else the first; blanks and repeats (by
 * carrierKey) dropped.
 */
export function carrierNamesFromRows(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => carrierKey(h));
  const at = head.findIndex((h) => ["carrier", "carriername", "name", "company", "insurancecompany", "companyname"].includes(h));
  const body = at >= 0 ? rows.slice(1) : rows;
  const col = Math.max(at, 0);
  const seen = new Set();
  const names = [];
  for (const row of body) {
    const name = String(row[col] ?? "").replace(/\s+/g, " ").trim();
    const key = carrierKey(name);
    if (!key || seen.has(key) || name.length > 120) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
