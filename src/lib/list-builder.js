/**
 * The List Builder's rules (Sean, Oct 2026), as plain functions the pages,
 * the server and the tests share: the SIC tree and what is ticked in it, the
 * codes as the list vendor wants them, the territory, and the exports.
 */

export const STATUSES = [["new", "New"], ["in_progress", "In progress"], ["pulled", "List pulled"], ["closed", "Closed"]];
export const statusLabel = (k) => STATUSES.find(([v]) => v === k)?.[1] ?? k;
export const MAX_RADIUS_MILES = 250;
export const MAX_ZIPS = 5000;

/**
 * A code as our vendor and our system write it: a sector "15-17" as it is,
 * a 2-digit group as it is, and the rest with the leading zero the
 * agricultural codes lose in a spreadsheet ("111" is 0111, "11101" is 011101).
 * Null for what is not a code.
 */
export function sicCode(raw) {
  const t = String(raw ?? "").trim();
  if (/^\d{1,2}\s*-\s*\d{1,2}$/.test(t)) return t.split("-").map((x) => x.trim().padStart(2, "0")).join("-");
  if (!/^\d{1,8}$/.test(t)) return null;
  if (t.length <= 2) return t.padStart(2, "0");
  if (t.length <= 4) return t.padStart(4, "0");
  if (t.length <= 6) return t.padStart(6, "0");
  return t.padStart(8, "0");
}

/** What a code is in the tree, by its shape. */
export function sicKind(code) {
  if (/-/.test(code)) return "sector";
  if (code.length === 2) return "group";
  if (code.length === 4) return "industry";
  return "detail";
}

/** A name the sheet has in capitals ("AGRICULTURAL PRODUCTION-CROPS"), in ordinary case; others as they are. */
export function sheetName(raw) {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t || t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s\-/&(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bNec\b/g, "NEC");
}

/**
 * Sean's SIC sheet (Oct 2026: "SIC Code, SIC Description, Industry Class")
 * as tree rows { code, name, kind, parent, sort, class }, in the sheet's own
 * order: a sector row ("01 to 09" or "01-09", its name), then its groups (no
 * code, the description starting with it: "01 AGRICULTURAL PRODUCTION-CROPS",
 * or a 2-digit code), each followed by its codes (4 digits, a 6-digit one
 * under its 4) with their industry class. A group goes under the sector
 * before it (or the one whose range holds it), a code under its group.
 * The heading row, rows that are not codes, and repeats are left out.
 */
export function sicSheetRows(rows) {
  const out = new Map();
  const sectors = [];
  let sector = null;
  const sectorOf = (group) => sectors.find((s) => {
    const [a, b = a] = s.split("-").map(Number);
    return Number(group) >= a && Number(group) <= b;
  }) ?? sector;
  let n = 0;
  for (const r of rows) {
    const rawCode = String(r[0] ?? "").trim();
    const desc = String(r[1] ?? "").trim();
    const cls = String(r[2] ?? "").replace(/\s+/g, " ").trim() || null;
    let code = sicCode(rawCode.replace(/\s+to\s+/i, "-"));
    let name = desc;
    // A group on its own row: no code, the description opening with it.
    if (!rawCode) {
      const m = /^(\d{2})\s+(.+)$/.exec(desc);
      if (!m) continue;
      code = m[1];
      name = m[2];
    }
    name = sheetName(name);
    if (!code || !name || out.has(code)) continue;
    n += 1;
    const kind = sicKind(code);
    const row = { code, name, kind, parent: null, sort: n, class: kind === "industry" || kind === "detail" ? cls : null };
    if (kind === "sector") {
      sectors.push(code);
      sector = code;
    } else if (kind === "group") row.parent = sectorOf(code);
    else if (kind === "industry") row.parent = out.has(code.slice(0, 2)) ? code.slice(0, 2) : sectorOf(code.slice(0, 2));
    else row.parent = out.has(code.slice(0, 4)) ? code.slice(0, 4) : out.has(code.slice(0, 2)) ? code.slice(0, 2) : null;
    out.set(code, row);
  }
  return [...out.values()];
}

/** The tree from its rows: { byCode, roots }, each node { code, name, kind, parent, children }. */
export function buildTree(rows) {
  const byCode = new Map(rows.map((r) => [r.code, { ...r, children: [] }]));
  const roots = [];
  for (const node of byCode.values()) {
    const up = node.parent ? byCode.get(node.parent) : null;
    if (up) up.children.push(node);
    else roots.push(node);
  }
  const order = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code);
  for (const node of byCode.values()) node.children.sort(order);
  roots.sort(order);
  return { byCode, roots };
}

/** The codes at the foot of a branch (the ones a list is pulled by); a code with nothing under it is its own. */
export function leavesOf(node) {
  if (!node.children.length) return [node.code];
  return node.children.flatMap(leavesOf);
}

/** How much of a branch is ticked: "all", "some" or "none". */
export function branchState(node, picked) {
  const leaves = leavesOf(node);
  const n = leaves.filter((c) => picked.has(c)).length;
  return n === 0 ? "none" : n === leaves.length ? "all" : "some";
}

/** A branch ticked or unticked: every code at its foot. */
export function toggleBranch(node, picked) {
  const next = new Set(picked);
  const leaves = leavesOf(node);
  const on = branchState(node, picked) !== "all";
  for (const c of leaves) {
    if (on) next.add(c);
    else next.delete(c);
  }
  return next;
}

/** The 2-digit group a code belongs to (9999's is 99). */
export const groupOf = (code) => String(code).slice(0, 2);

/** ZIP codes typed or pasted (commas, spaces, new lines), five digits each, each once. */
export function parseZips(text) {
  const seen = new Set();
  for (const m of String(text ?? "").matchAll(/\b(\d{5})(?:-\d{4})?\b/g)) seen.add(m[1]);
  return [...seen];
}

/** Places typed one to a line or comma-separated pairs ("Mesa, AZ"): trimmed, each once, case aside. */
export function parsePlaces(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text ?? "").split(/\n|;/)) {
    const t = line.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/** Miles between two points (great circle). */
export function milesBetween([lat1, lng1], [lat2, lng2]) {
  const r = (d) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The ZIPs within `miles` of `zip` in a { zip: [lat, lng] } table, nearest first; null when the ZIP is unknown. */
export function zipsWithin(table, zip, miles) {
  const at = table[zip];
  if (!at) return null;
  const out = [];
  for (const [z, point] of Object.entries(table)) {
    const d = milesBetween(at, point);
    if (d <= miles) out.push([z, d]);
  }
  return out.sort((a, b) => a[1] - b[1]).map(([z, d]) => ({ zip: z, miles: Math.round(d * 10) / 10 }));
}

const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean);
const uniq = (a) => [...new Set(a)];

/**
 * Criteria as sent from the form, made safe to keep: codes that are codes,
 * each once; employee sizes only for the groups picked, whole numbers, from
 * no more than to; states as two letters; the territory's lists trimmed and
 * capped; the radius within reason; and the ZIPs it all comes to: those
 * listed and those in the radius, less those left out.
 */
export function cleanCriteria(raw, radiusZips = []) {
  const c = raw && typeof raw === "object" ? raw : {};
  const sic = uniq(list(c.sic).map(sicCode).filter((x) => x && !x.includes("-"))).slice(0, 5000);
  const groups = new Set(sic.map(groupOf));
  const employees = {};
  for (const [g, v] of Object.entries(c.employees ?? {})) {
    if (!groups.has(g)) continue;
    const num = (x) => (x === "" || x == null || !Number.isFinite(Number(x)) ? null : Math.max(0, Math.round(Number(x))));
    let min = num(v?.min);
    let max = num(v?.max);
    if (min != null && max != null && max < min) [min, max] = [max, min];
    if (min != null || max != null) employees[g] = { min, max };
  }
  const states = (v) => uniq(list(v).map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)));
  const places = (v) => uniq(list(v).map((s) => s.slice(0, 80))).slice(0, 500);
  const zips = (v) => uniq(list(v).filter((z) => /^\d{5}$/.test(z))).slice(0, MAX_ZIPS);
  const radius = c.include?.radius && /^\d{5}$/.test(String(c.include.radius.zip ?? "")) && Number(c.include.radius.miles) > 0
    ? { zip: String(c.include.radius.zip), miles: Math.min(MAX_RADIUS_MILES, Math.round(Number(c.include.radius.miles) * 10) / 10) }
    : null;
  const include = { states: states(c.include?.states), counties: places(c.include?.counties), cities: places(c.include?.cities), zips: zips(c.include?.zips), radius };
  const exclude = { states: states(c.exclude?.states), counties: places(c.exclude?.counties), cities: places(c.exclude?.cities), zips: zips(c.exclude?.zips) };
  const out = new Set([...include.zips, ...(radius ? radiusZips : [])]);
  for (const z of exclude.zips) out.delete(z);
  return { sic, employees, include, exclude, zips: [...out].slice(0, MAX_ZIPS) };
}

const cell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The codes as the vendor's site takes them: one to a line, with what each is. */
export function codesCsv(criteria, names = {}) {
  return ["SIC Code,SIC Description", ...(criteria.sic ?? []).map((c) => `${cell(c)},${cell(names[c] ?? "")}`)].join("\r\n");
}

/** The territory as columns: what to include, what to leave out, the ZIPs it comes to. */
export function territoryCsv(criteria) {
  const inc = criteria.include ?? {};
  const exc = criteria.exclude ?? {};
  const cols = [
    ["ZIP codes", criteria.zips ?? []],
    ["States", inc.states ?? []],
    ["Counties", inc.counties ?? []],
    ["Cities", inc.cities ?? []],
    ["Leave out: states", exc.states ?? []],
    ["Leave out: counties", exc.counties ?? []],
    ["Leave out: cities", exc.cities ?? []],
    ["Leave out: ZIP codes", exc.zips ?? []],
  ];
  const rows = Math.max(0, ...cols.map(([, v]) => v.length));
  const lines = [cols.map(([h]) => cell(h)).join(",")];
  for (let i = 0; i < rows; i += 1) lines.push(cols.map(([, v]) => cell(v[i] ?? "")).join(","));
  return lines.join("\r\n");
}

/** A few words for what a request asks for: "12 codes · 3 states · 40 ZIPs". */
export function criteriaSummary(c) {
  const parts = [];
  const n = (k, one, many) => (k ? `${k.toLocaleString()} ${k === 1 ? one : many}` : null);
  parts.push(n(c?.sic?.length ?? 0, "code", "codes"));
  parts.push(n(c?.include?.states?.length ?? 0, "state", "states"));
  parts.push(n(c?.include?.counties?.length ?? 0, "county", "counties"));
  parts.push(n(c?.include?.cities?.length ?? 0, "city", "cities"));
  parts.push(n(c?.zips?.length ?? 0, "ZIP", "ZIPs"));
  if (c?.include?.radius) parts.push(`${c.include.radius.miles} mi of ${c.include.radius.zip}`);
  return parts.filter(Boolean).join(" · ") || "Nothing picked yet";
}
