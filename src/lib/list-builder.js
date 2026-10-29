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

/**
 * The 6-digit codes from the SIC list (Sean's 6-digit sheet, [[code, name]])
 * added to the tree's rows (Oct 2026), each under its industry (or, without
 * one, its 2-digit group) and of its industry's class, its name in ordinary
 * case; those the tree has already, and those with nowhere to go, left out.
 */
export function withDetails(rows, details = []) {
  if (!details?.length) return rows;
  const by = new Map(rows.map((r) => [r.code, r]));
  const out = [...rows];
  for (const [code, name] of details) {
    if (!/^\d{6}$/.test(code ?? "") || by.has(code) || !name) continue;
    const up = by.get(code.slice(0, 4)) ?? by.get(code.slice(0, 2));
    if (!up) continue;
    const row = { code, name: sheetName(String(name).trim()), kind: "detail", parent: up.code, sort: 1e9, class: up.kind === "industry" ? up.class ?? null : null };
    by.set(code, row);
    out.push(row);
  }
  return out;
}

/** The tree from its rows: { byCode, roots }, each node { code, name, kind, parent, up, children }. */
export function buildTree(rows) {
  const byCode = new Map(rows.map((r) => [r.code, { ...r, children: [] }]));
  const roots = [];
  for (const node of byCode.values()) {
    const up = node.parent ? byCode.get(node.parent) : null;
    node.up = up ?? null;
    if (up) up.children.push(node);
    else roots.push(node);
  }
  const order = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code);
  for (const node of byCode.values()) node.children.sort(order);
  roots.sort(order);
  return { byCode, roots };
}

/*
 * What a list is pulled by: an industry (4 digits) whole, or some of its
 * 6-digit codes (Oct 2026). Ticking an industry keeps its code, which takes
 * in every business under it (the 6-digit list may not name them all);
 * ticking some of its 6-digit codes keeps those; all of them is the industry.
 */
const isDetail = (n) => n.kind === "detail";
const isIndustry = (n) => n.kind === "industry" && n.children.every(isDetail);

/** The nodes at the foot of a branch, as a list is pulled: industries, and a 6-digit code with no industry over it. */
function unitsOf(node) {
  if (!node.children.length || isDetail(node) || isIndustry(node)) return [node];
  return node.children.flatMap(unitsOf);
}

/** The codes at the foot of a branch (the ones a list is pulled by); a code with nothing under it is its own. */
export const leavesOf = (node) => unitsOf(node).map((n) => n.code);

/** How much of one at the foot (or a 6-digit code) is ticked: its own code or its industry's, or some of its 6-digit codes. */
function unitState(node, picked) {
  if (picked.has(node.code) || (isDetail(node) && node.up && isIndustry(node.up) && picked.has(node.up.code))) return "all";
  return node.children.some((c) => picked.has(c.code)) ? "some" : "none";
}

/** How much of a branch is ticked: "all", "some" or "none". */
export function branchState(node, picked) {
  const states = unitsOf(node).map((u) => unitState(u, picked));
  if (states.every((x) => x === "all")) return "all";
  return states.every((x) => x === "none") ? "none" : "some";
}

/** How many of what is under a branch are ticked, of how many: its 6-digit codes for an industry, else its industries. */
export function pickedOf(node, picked) {
  if (isIndustry(node) && node.children.length) {
    const all = node.children.length;
    return [picked.has(node.code) ? all : node.children.filter((c) => picked.has(c.code)).length, all];
  }
  const units = unitsOf(node);
  return [units.filter((u) => unitState(u, picked) !== "none").length, units.length];
}

/**
 * A branch ticked or unticked. An industry or anything over it: every
 * industry under it, whole (its 6-digit codes giving way to it), or none. A
 * 6-digit code: on or off, the industry ticked whole once all of them are,
 * and an industry ticked whole keeping the rest when one is taken off.
 */
export function toggleBranch(node, picked) {
  const next = new Set(picked);
  const up = node.up;
  if (isDetail(node) && up && isIndustry(up)) {
    const siblings = up.children.map((c) => c.code);
    if (next.has(up.code)) {
      next.delete(up.code);
      for (const c of siblings) if (c !== node.code) next.add(c);
    } else if (next.has(node.code)) next.delete(node.code);
    else {
      next.add(node.code);
      if (siblings.every((c) => next.has(c))) {
        for (const c of siblings) next.delete(c);
        next.add(up.code);
      }
    }
    return next;
  }
  const on = branchState(node, picked) !== "all";
  for (const u of unitsOf(node)) {
    next.delete(u.code);
    for (const c of u.children) next.delete(c.code);
    if (on) next.add(u.code);
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
 * listed, `addZips` (the radius's and the counties' ZIPs), less those left
 * out and `dropZips` (the ZIPs of the counties left out).
 */
export function cleanCriteria(raw, addZips = [], dropZips = []) {
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
  const out = new Set([...include.zips, ...addZips]);
  for (const z of [...exclude.zips, ...dropZips]) out.delete(z);
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
