/**
 * The order call results are listed in to pick from on the Leads page (Sean,
 * Oct 2026): appointment setting's first, then DB dev's, each as his sheet
 * has them. A result the sheet does not name comes after the ones it does,
 * in its own stage, in its usual order. Pure, so the page and the tests
 * share it.
 */

const SHEET = {
  APPT: [
    "Appointment", "Appointment-Phone", "Appointment-Confirmed", "Appointment-Invalid",
    "Lead-No Contact", "Lead-Left Message", "Lead-Email", "Lead-ClientList", "Lead-Not Shopping", "Lead-Corrected",
    "Lead-Never Shops", "Lead-Removed", "Lead-Moved", "Lead-DoNotCall", "Lead-Out of Business", "Lead-Branch", "Lead-Not Qualified",
    "Lead-CurrentClient", "Lead-Invalid", "Lead-Disco#",
  ],
  DBDV: [
    // The sheet's Viable-No Contact: the result is also known as Viable-CallBack.
    ["Viable-No Contact", "Viable-CallBack"], "Viable-Staged", "Viable-Left Message", "Viable-Email", "Lead", "Lead-Hot Lead",
    "Not Interested", "Disco#", "Out of Business", "Branch", "Removed", "Moved", "Not Qualified", "DoNotCall", "Client", "Pending",
  ],
};
const STAGES = ["APPT", "DBDV"];
const key = (name) => String(name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const PLACE = Object.fromEntries(STAGES.map((stage) => [stage, new Map(
  SHEET[stage].flatMap((names, i) => (Array.isArray(names) ? names : [names]).map((n) => [key(n), i]))
)]));

/** Call results ({ name, project_type, sort_order? }), in the sheet's order: a new list. */
export function orderResults(results) {
  const rank = (r) => {
    const stage = STAGES.indexOf(r.project_type);
    const place = PLACE[r.project_type]?.get(key(r.name));
    return [stage < 0 ? STAGES.length : stage, place ?? 1000, Number(r.sort_order ?? 0)];
  };
  return results
    .map((r, i) => ({ r, i, k: rank(r) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.r);
}
