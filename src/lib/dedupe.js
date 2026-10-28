/**
 * Duplicates in a list, and names a client has taken off before (Oct 2026).
 * Pure: the import's preview runs it in the browser, and the import itself
 * checks the client's list again on the server.
 *
 * A bought list (SalesGenie) carries one business several times: a record
 * for each location, or the same place under two names. The client's rule:
 * records of one business are one group, and the one kept is the one with
 * the FEIN, then the one naming the most people, then the one with the most
 * filled in. The rest are left off the list, and remembered as Deletions so
 * a later list of the same client's does not bring them back.
 */

/** Ten digits of a phone, as the database's phone_key: "(920) 766-4344" and "920.766.4344" are one. */
export function phoneKey(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

/** An EIN's nine digits (a spreadsheet's dropped leading zero put back). */
export function einKey(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 8) d = `0${d}`;
  return d.length === 9 ? d : null;
}

// Words that don't tell one business from another: "Acme Inc" is "Acme LLC".
const SUFFIXES = new Set(["inc", "incorporated", "llc", "ltd", "limited", "co", "corp", "corporation", "company", "pllc", "llp", "lp", "pc", "the"]);

/**
 * A business name as compared: lower case, without Inc/LLC/Co and the like,
 * letters and digits only, so "AHT Wisconsin Windows" is "Aht Wisconsin
 * Windows" and "Abts Bou-Matic" is "Abtsbou-Matic".
 */
export function nameKey(v) {
  const words = String(v ?? "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  return words.join("") || null;
}

/** A person's name as compared: "Mark Broehm" is "mark broehm", a middle initial kept. */
export const personKey = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || null;

const zip5 = (v) => (/^\d{5}/.exec(String(v ?? "").trim())?.[0] ?? null);
const cityKey = (v) => personKey(v);
const siteKey = (v) => String(v ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || null;
/** A street address with its ZIP: one location. */
export function placeKey(lead) {
  const street = String(lead?.address ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const zip = zip5(lead?.zip);
  return street && zip ? `${street}|${zip}` : null;
}

/** The people a lead names. */
const people = (lead) => [lead.contact_name, lead.contact2_name, lead.decision_maker].map(personKey).filter(Boolean);

/** How filled in a lead is: its fields with something in them. */
const filled = (lead) => Object.values(lead).filter((v) => v !== null && v !== undefined && String(v).trim() !== "").length;

/**
 * Which record of a group to keep: the FEIN, then the most people named,
 * then the most filled in; the first in the file when they tie.
 */
export function keepScore(row) {
  return (einKey(row.lead.ein) ? 1_000_000 : 0) + (row.contacts ?? people(row.lead).length) * 1_000 + filled(row.lead);
}

/**
 * The groups of records of one business in a list.
 *
 *   rows: [{ lead, contacts }]  as rowsToImport makes them
 *   → [{ rows: [index…], keep: index, why: ["ein", "phone", "name", "contact"] }]
 *
 * Records are one business when they share an EIN, a phone, or a person in
 * the same city; or carry the same name and either share a person, a city or
 * a website, or one of them names nobody. The same name with other people in
 * another city (two owners of one franchise) is two businesses. Groups are
 * in the file's order; only groups of two or more.
 */
export function findDuplicates(rows) {
  const parent = rows.map((_, i) => i);
  const why = new Map();
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b, reason) => {
    const ra = find(a);
    const rb = find(b);
    const reasons = new Set([...(why.get(ra) ?? []), ...(why.get(rb) ?? []), reason]);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    why.set(find(a), reasons);
  };

  // Shared keys: the first record to have one is the one the rest join.
  const first = new Map();
  const byKey = (i, key, reason) => {
    if (!key) return;
    const k = `${reason}|${key}`;
    if (first.has(k)) join(first.get(k), i, reason);
    else first.set(k, i);
  };
  const names = new Map();
  rows.forEach(({ lead }, i) => {
    byKey(i, einKey(lead.ein), "ein");
    byKey(i, phoneKey(lead.phone), "phone");
    const city = cityKey(lead.city);
    for (const p of people(lead)) byKey(i, city ? `${p}|${city}` : null, "contact");
    const n = nameKey(lead.company_name);
    if (n) names.set(n, [...(names.get(n) ?? []), i]);
  });

  // The same name: one business unless it is plainly two (other people, another city, another site).
  for (const list of names.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const x = rows[list[a]].lead;
        const y = rows[list[b]].lead;
        const px = people(x);
        const py = people(y);
        const same = !px.length || !py.length || px.some((p) => py.includes(p))
          || (cityKey(x.city) && cityKey(x.city) === cityKey(y.city))
          || (siteKey(x.website) && siteKey(x.website) === siteKey(y.website));
        if (same) join(list[a], list[b], "name");
      }
    }
  }

  const groups = new Map();
  rows.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .sort((a, b) => a[1][0] - b[1][0])
    .map(([root, members]) => ({
      rows: members,
      keep: members.reduce((best, i) => (keepScore(rows[i]) > keepScore(rows[best]) ? i : best), members[0]),
      why: ["ein", "phone", "name", "contact"].filter((r) => why.get(root)?.has(r)),
    }));
}

/**
 * A matcher for the names a client has taken off before:
 *
 *   const removed = removalMatcher(entries);  removed(lead) → entry | null
 *
 * A name the client (or a call) took off is the same business on a new list
 * by its phone, its EIN, or its name in the same ZIP or city. A record left
 * off an earlier import as a duplicate (source "import") is only that one
 * location again: its name at the same street address (or, without one, the
 * same phone), so the record kept from its group is not taken off with it.
 */
export function removalMatcher(entries) {
  const byPhone = new Map();
  const byEin = new Map();
  const byNamePlace = new Map();
  const byExact = new Map();
  const put = (map, key, entry) => { if (key && !map.has(key)) map.set(key, entry); };
  for (const e of entries ?? []) {
    const n = nameKey(e.company_name);
    if (e.source === "import") {
      put(byExact, n && placeKey(e) ? `${n}|${placeKey(e)}` : null, e);
      put(byExact, n && !placeKey(e) && phoneKey(e.phone) ? `${n}|${phoneKey(e.phone)}` : null, e);
      continue;
    }
    put(byPhone, phoneKey(e.phone), e);
    put(byEin, einKey(e.ein), e);
    if (n) {
      put(byNamePlace, zip5(e.zip) ? `${n}|z${zip5(e.zip)}` : null, e);
      put(byNamePlace, cityKey(e.city) ? `${n}|c${cityKey(e.city)}` : null, e);
    }
  }
  return (lead) => {
    const n = nameKey(lead.company_name);
    return byPhone.get(phoneKey(lead.phone))
      ?? byEin.get(einKey(lead.ein))
      ?? (n ? byNamePlace.get(`${n}|z${zip5(lead.zip)}`) ?? byNamePlace.get(`${n}|c${cityKey(lead.city)}`) : null)
      ?? (n ? byExact.get(`${n}|${placeKey(lead)}`) ?? byExact.get(`${n}|${phoneKey(lead.phone)}`) : null)
      ?? null;
  };
}

/** The reasons a name is on a client's list, as said. */
export const REMOVAL_REASONS = [
  { value: "deletion", label: "Deletion" },
  { value: "dont_call", label: "Don't call" },
  { value: "current_customer", label: "Current customer" },
];
export const reasonLabel = (v) => REMOVAL_REASONS.find((r) => r.value === v)?.label ?? v;
