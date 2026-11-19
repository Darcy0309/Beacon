// Signature Select (Sean, Nov 2026): the fee a client pays for Lighthouse, monthly or yearly, kept term by term
// (select_terms). What a term has charged and where it stands. Pure, so the pages and the tests share it;
// the report's own figures come from the database's select_charges(), worked out the same way.

/** "YYYY-MM-DD" a number of months after `iso`, on the same day (the month's last day when it has fewer). */
export function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** An annual term's end from its start: a year on, less a day (Jan 1 → Dec 31). */
export const annualEnd = (start) => {
  const next = addMonthsIso(start, 12);
  const t = new Date(`${next}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};

/**
 * The days a term has charged by `today`: a monthly term each month from its start (to its end, if it has
 * one), an annual term once, on its start. As select_charges() counts them.
 */
export function termCharges(term, today) {
  const start = term?.starts_on;
  if (!start || !today || start > today) return [];
  if (term.plan === "annual") return [start];
  const out = [];
  for (let i = 0; i < 600; i++) {
    const day = addMonthsIso(start, i);
    if (day > today || (term.ends_on && day > term.ends_on)) break;
    out.push(day);
  }
  return out;
}

/** Where a term stands on `today`: "upcoming", "on" or "ended". */
export const termStatus = (term, today) =>
  term.starts_on > today ? "upcoming" : term.ends_on && term.ends_on < today ? "ended" : "on";

/** A term in brief: { months (a monthly term's months so far), charged (what it has charged), status }. */
export function termSummary(term, today) {
  const charges = termCharges(term, today);
  return { months: term.plan === "monthly" ? charges.length : null, charged: charges.length * Number(term.amount || 0), status: termStatus(term, today) };
}

/** The term a client is on (else its latest), from its terms. */
export function currentTerm(terms, today) {
  const list = [...(terms ?? [])].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  return list.find((t) => termStatus(t, today) === "on") ?? list[0] ?? null;
}

/** "$1,250" / "$12.50". */
export const dollars = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** A client's Signature Select in a few words, for the clients list: { label, tone }, or null when never on it. */
export function selectBrief(terms, today) {
  const t = currentTerm(terms, today);
  if (!t) return null;
  const status = termStatus(t, today);
  const per = t.plan === "annual" ? "yr" : "mo";
  if (status === "ended") return { label: "Ended", tone: "slate" };
  if (status === "upcoming") return { label: `Starts ${t.starts_on}`, tone: "sky", term: t };
  return { label: `${t.plan === "annual" ? "Annual" : "Monthly"} · ${dollars(t.amount)}/${per}`, tone: "emerald", term: t };
}
