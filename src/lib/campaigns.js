/**
 * A client's projects as campaigns (Sean, Oct 2026): a DB dev project and the
 * appointment project it promotes to are one campaign, chosen together (Recent
 * Activity's project filter). Named after what their names share
 * ("CapitalIns-InsProsOfAZ_BretGodsey_2026" and
 * "CapitalIns-InsProsOfAZ_Appointments_2026" are "CapitalIns-InsProsOfAZ"),
 * or both names when they share too little. Pure, for pages and tests.
 */

const SEPARATORS = /[\s_\-–·.,:]+$/;

/** What two or more names begin with, cut back to a whole word; null when it is too short to mean anything. */
export function sharedName(names) {
  if (names.length < 2) return names[0] ?? null;
  let prefix = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i].toLowerCase() === n[i].toLowerCase()) i += 1;
    prefix = prefix.slice(0, i);
  }
  // To the last separator, so a word is not cut in half ("…OfAZ_Bre" is "…OfAZ").
  const whole = names.every((n) => n.length === prefix.length || /[\s_\-–·.,:]/.test(n[prefix.length] ?? "") || /[\s_\-–·.,:]$/.test(prefix))
    ? prefix : prefix.replace(/[^\s_\-–·.,:]*$/, "");
  const cut = whole.replace(SEPARATORS, "").trim();
  return cut.length >= 6 ? cut : null;
}

/**
 * Projects ([{ id, name, apptProjectId }]) as campaigns: [{ id, name, projectIds }], `id` the
 * appointment project's when there is one (the filter's value; the database takes in those tied to
 * it), by name. A project tied to one not among them stands alone.
 */
export function campaignsOf(projects) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map();
  for (const p of projects) {
    const head = p.apptProjectId && byId.has(p.apptProjectId) ? p.apptProjectId : p.id;
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(p);
  }
  return [...groups.entries()].map(([id, members]) => {
    const names = members.map((m) => m.name);
    const name = members.length === 1 ? names[0] : sharedName(names) ?? names.join(" + ");
    return { id, name, projectIds: members.map((m) => m.id) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
