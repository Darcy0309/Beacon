/**
 * The production report's rows added up: per account manager, project or
 * client, with a total, and the CSV columns for each. Pure, so the page,
 * the CSV route and the tests agree.
 */

/** Every figure a production row carries, all summed when rows are grouped. */
export const SUM_KEYS = [
  "calls", "leads", "appointments", "confirmations", "chargebacks", "specials",
  "leadPay", "appointmentPay", "confirmationPay", "specialPay", "chargebackAmount", "amount",
];

/** The ways the CSV can be laid out: day by day, or totals per account manager, project, client or agency group. */
export const GROUPINGS = [
  ["day", "Day by day"],
  ["rep", "Totals by account manager"],
  ["project", "Totals by project"],
  ["client", "Totals by client"],
  ["group", "Totals by agency group"],
];

/**
 * Each row with its client's agency group (the carrier group the client
 * belongs to): `groups` is { [clientId]: { id, name } }. With `only` (a
 * group's id), just that group's rows.
 */
export function withGroups(rows, groups = {}, only = null) {
  const out = rows.map((r) => ({ ...r, groupId: groups[r.clientId]?.id ?? null, group: groups[r.clientId]?.name ?? "No agency group" }));
  return only ? out.filter((r) => r.groupId === only) : out;
}

const add = (into, row) => {
  for (const k of SUM_KEYS) into[k] = Math.round(((into[k] ?? 0) + (row[k] ?? 0)) * 100) / 100;
  return into;
};

/** The total of every row. */
export function totalOf(rows) {
  const total = {};
  for (const k of SUM_KEYS) total[k] = 0;
  return rows.reduce(add, total);
}

/**
 * Rows added up per account manager ("rep"), project, client or agency
 * group, largest pay first; "day" leaves them as they are.
 */
export function groupProduction(rows, by) {
  if (by === "day") return rows;
  const key = { rep: (r) => r.userId, project: (r) => r.projectId ?? "none", client: (r) => r.clientId ?? "none", group: (r) => r.groupId ?? "none" }[by];
  const groups = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!groups.has(k)) {
      groups.set(k, { userId: r.userId, rep: r.rep, projectId: r.projectId, project: r.project, clientId: r.clientId, client: r.client, groupId: r.groupId ?? null, group: r.group });
    }
    add(groups.get(k), r);
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount || b.calls - a.calls);
}

const money = (n) => (Number(n) || 0).toFixed(2);
// [heading, value, summed]: the figures, which a Total row adds up.
const FIGURES = [
  ["Calls", (r) => r.calls, true],
  ["Leads", (r) => r.leads, true],
  ["Appointments", (r) => r.appointments, true],
  ["Confirmations", (r) => r.confirmations, true],
  ["Chargebacks", (r) => r.chargebacks, true],
  ["Lead pay (USD)", (r) => money(r.leadPay), true],
  ["Appointment pay (USD)", (r) => money(r.appointmentPay), true],
  ["Confirmation pay (USD)", (r) => money(r.confirmationPay), true],
  ["Special Pay (USD)", (r) => money(r.specialPay), true],
  ["Chargebacks (USD)", (r) => money(r.chargebackAmount), true],
  ["Total pay (USD)", (r) => money(r.amount), true],
];

/** [heading, value, summed] for each CSV layout: who and what the row is, then its figures. */
export const CSV_COLUMNS = {
  day: [["Day", (r) => r.day], ["Account manager", (r) => r.rep], ["Client", (r) => r.client], ["Project", (r) => r.project], ...FIGURES],
  rep: [["Account manager", (r) => r.rep], ...FIGURES],
  project: [["Client", (r) => r.client], ["Project", (r) => r.project], ...FIGURES],
  client: [["Client", (r) => r.client], ...FIGURES],
  group: [["Agency group", (r) => r.group], ...FIGURES],
};

/** The Total row for a layout: "Total" first, the summed figures, nothing under the names. */
export function totalRow(columns, total) {
  return columns.map(([, get, summed], i) => (i === 0 ? "Total" : summed ? get(total) : ""));
}
