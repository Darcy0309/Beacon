/**
 * X-Dates by Month's filters and the Pipeline Report (Sean, Oct 2026): what
 * the address holds, the months in the order they come up, a row's sort and
 * staleness, and the export in the columns of the sample Sean sent. Pure,
 * for pages, components and tests.
 */

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const PROJECT_TYPES = [["DBDV", "DB Dev"], ["APPT", "Appts"]];
/** A manager whose last call on a project is longer ago than this (or never) is behind on it. */
export const STALE_DAYS = 10;

const id = (v) => (/^[1-9]\d{0,17}$/.test(String(v ?? "")) ? Number(v) : null);
const ids = (v) => [...new Set(String(v ?? "").split(",").map(id).filter(Boolean))];

/**
 * The filters in the address: ?project=1,2 ?managers=5,9 ?months=11,12,1 ?client=3 ?rep=4 ?type=APPT.
 * Lists empty or absent mean all of them.
 */
export function readXdateFilters(sp) {
  const months = [...new Set(String(sp?.months ?? "").split(",").map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))];
  return {
    projectIds: ids(sp?.project),
    userIds: ids(sp?.managers),
    months,
    companyId: id(sp?.client),
    repId: id(sp?.rep),
    type: PROJECT_TYPES.some(([k]) => k === sp?.type) ? sp.type : null,
  };
}

/** The filters back as address parameters (only those set). */
export function filterParams(f) {
  const p = new URLSearchParams();
  if (f.companyId) p.set("client", String(f.companyId));
  if (f.projectIds?.length) p.set("project", f.projectIds.join(","));
  if (f.userIds?.length) p.set("managers", f.userIds.join(","));
  if (f.months?.length) p.set("months", f.months.join(","));
  if (f.repId) p.set("rep", String(f.repId));
  if (f.type) p.set("type", f.type);
  return p;
}

/** The months the report counts, in the order they come up from `today`'s ("2026-10-22": Nov, Dec, Jan…); the next three without a choice. */
export function pipelineMonths(months, today) {
  const now = Number(String(today).slice(5, 7));
  const chosen = months?.length ? months : [1, 2, 3].map((i) => ((now - 1 + i) % 12) + 1);
  const ahead = (m) => (m - now + 12) % 12;
  return [...chosen].sort((a, b) => ahead(a) - ahead(b));
}

/** "Jen B": a first name and the last name's initial, as the report shows people. */
export const personShort = (first, last) => [first, last ? last[0] : null].filter(Boolean).join(" ") || "—";

const dayNumber = (iso) => Math.round(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / 86400000);

/** Whether a manager is behind on a project: no call on it, or none in the last STALE_DAYS days. `lastWorkedDay`: "YYYY-MM-DD" or null. */
export const stale = (lastWorkedDay, today) => !lastWorkedDay || dayNumber(today) - dayNumber(lastWorkedDay) > STALE_DAYS;

/** By manager, then the one last worked longest ago first (never worked before all). */
export function sortPipeline(rows) {
  return [...rows].sort((a, b) => a.manager.localeCompare(b.manager)
    || (a.lastWorkedDay ?? "").localeCompare(b.lastWorkedDay ?? "")
    || a.project.localeCompare(b.project));
}

const usd = (n) => (n == null ? "" : `$${Number(n) % 1 ? Number(n).toFixed(2) : Number(n)}`);
const mdy = (iso) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}/${iso.slice(0, 4)}` : "");
const csvCell = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The report as CSV text, in the sample's columns: a month column for each month counted. */
export function pipelineCsv(rows, months) {
  const header = ["projectname", "TimeZone", "ST", "Manager", "last appt set", "LastWorked", "Calls",
    ...months.map((m) => MONTH_SHORT[m - 1].toUpperCase()), "Total", "Appts", "OffTheList", "ViableLeft", "PAY", "SpecialPay", "SalesRep", "Conv%", "SharedWith"];
  const lines = rows.map((r) => [r.project, r.timeZone ?? "", r.state ?? "", r.manager, mdy(r.lastApptSet), mdy(r.lastWorkedDay), r.calls ?? "",
    ...months.map((m) => r.months[m] ?? 0), r.total, r.appts, r.offList, r.viableLeft, usd(r.pay), usd(r.specialPay), r.salesRep ?? "",
    `${r.conversion}%`, r.sharedWith.join(", ")]);
  return [header, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n");
}
