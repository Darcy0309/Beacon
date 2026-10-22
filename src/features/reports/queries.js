/** The administrator's reports: X-dates by month, and daily production and pay. */

import "server-only";
import { fullName, shortName } from "@/lib/format";
import { readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { personShort, sortPipeline } from "@/lib/pipeline";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Which names a number in the X-dates report stands for. */
export const XDATE_BUCKETS = {
  appointment: "Appointments",
  off: "Off the list",
  viable: "Viable left",
};

/**
 * Renewals per month of the year for the whole book, one client, or one
 * project: January to December, then names with no renewal date (month 0).
 */
export async function getXdatesByMonth({ projectId = null, companyId = null } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("xdates_by_month", { p_project_id: projectId, p_company_id: companyId });
  if (error) throw error;
  return shapeXdates(data);
}

/** The filters as the database functions take them (empty lists: all). */
const filterArgs = (f) => ({
  p_project_ids: f.projectIds?.length ? f.projectIds : null, p_company_id: f.companyId ?? null, p_type: f.type ?? null,
  p_rep_id: f.repId ?? null, p_user_ids: f.userIds?.length ? f.userIds : null,
});

/** The same, filtered (Sean, Oct 2026): projects, client, its Sales Rep, DB dev or appointments, managers (readXdateFilters()). */
export async function getXdatesFiltered(filters) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("xdates_filtered", filterArgs(filters));
  if (error) throw error;
  return shapeXdates(data);
}

function shapeXdates(data) {
  const byMonth = new Map((data ?? []).map((r) => [Number(r.month), r]));
  const row = (m) => {
    const r = byMonth.get(m);
    return {
      month: m,
      label: m ? MONTHS[m - 1] : "No renewal date",
      short: m ? MONTHS[m - 1].slice(0, 3) : "None",
      total: Number(r?.total ?? 0),
      appointment: Number(r?.appointments ?? 0),
      off: Number(r?.off_list ?? 0),
      viable: Number(r?.viable_left ?? 0),
    };
  };
  const months = Array.from({ length: 12 }, (_, i) => row(i + 1));
  const sum = (key) => months.reduce((n, m) => n + m[key], 0);
  return {
    months,
    undated: row(0),
    totals: { total: sum("total"), appointment: sum("appointment"), off: sum("off"), viable: sum("viable") },
  };
}

/** One page of the names behind a number in the X-dates report, filtered (readXdateFilters()). */
export async function getXdateMonthLeadsFiltered({ month, bucket = null, filters, page = 1, perPage = 20 }) {
  const supabase = await createClient();
  const start = (page - 1) * perPage;
  const reads = await Promise.all(Array.from({ length: Math.ceil(perPage / 100) }, (_, i) => supabase.rpc("xdate_month_leads_filtered", {
    p_month: month, p_bucket: bucket, ...filterArgs(filters), p_limit: Math.min(100, perPage - i * 100), p_offset: start + i * 100,
  })));
  const failed = reads.find((r) => r.error);
  if (failed) throw failed.error;
  const data = reads.flatMap((r) => r.data ?? []);
  const rows = data.map((l) => ({
    id: l.id, company: l.company_name ?? "—", contact: l.contact_name ?? "—", phone: l.phone ?? "—",
    place: [l.city, l.state].filter(Boolean).join(", ") || "—", project: l.project ?? "—", result: l.result, renewal: l.renewal_date,
    rep: l.rep_first || l.rep_last ? shortName({ first_name: l.rep_first, last_name: l.rep_last, email: l.rep_email }) : "Unassigned",
  }));
  const unnamed = rows.filter((r) => r.rep === "Unassigned").map((r) => r.id);
  if (unnamed.length) {
    const { data: names } = await supabase.rpc("lead_rep_names", { p_lead_ids: unnamed });
    const byLead = new Map((names ?? []).map((n) => [n.lead_id, shortName(n)]));
    for (const r of rows) if (byLead.has(r.id)) r.rep = byLead.get(r.id);
  }
  return { rows, total: Number(data?.[0]?.total ?? 0) };
}

/**
 * The Pipeline Report (Sean, Oct 2026): a row for each project and manager with names renewing in
 * `months` (pipelineMonths()), sorted by manager and the one last worked longest ago first.
 */
export async function getPipelineReport({ filters, months, timeZone }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_report", { p_months: months, ...filterArgs(filters) });
  if (error) throw error;
  const day = (iso) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null);
  return sortPipeline((data ?? []).map((r) => {
    const total = Number(r.total) || 0;
    const appts = Number(r.appts) || 0;
    return {
      key: `${r.project_id}-${r.manager_id}`, projectId: r.project_id, project: r.project, type: r.project_type,
      timeZone: r.time_zone, state: r.state, managerId: r.manager_id, manager: personShort(r.manager_first, r.manager_last),
      lastApptSet: r.last_appt_set, lastWorked: r.last_worked, lastWorkedDay: day(r.last_worked), calls: Number(r.calls) || 0,
      months: Object.fromEntries(Object.entries(r.months ?? {}).map(([m, n]) => [Number(m), Number(n)])),
      total, appts, offList: Number(r.off_list) || 0, viableLeft: Number(r.viable_left) || 0,
      pay: r.pay == null ? null : Number(r.pay), specialPay: r.special_pay == null ? null : Number(r.special_pay),
      salesRep: r.sales_rep_first || r.sales_rep_last ? personShort(r.sales_rep_first, r.sales_rep_last) : null,
      conversion: total ? Math.round((appts / total) * 100) : 0,
      sharedWith: (r.shared_with ?? []).map((o) => personShort(o.first, o.last)),
    };
  }));
}

/** Who the Pipeline Report's Manager filter offers: those on the projects the caller may read. */
export async function getPipelineManagers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_managers");
  if (error) throw error;
  return (data ?? []).map((u) => ({ value: String(u.id), label: [u.first_name, u.last_name].filter(Boolean).join(" ") || "—" }));
}

/** One page of the names behind a number in the X-dates report. */
export async function getXdateMonthLeads({ month, bucket = null, projectId = null, companyId = null, page = 1, perPage = 20 }) {
  const supabase = await createClient();
  // The database gives at most 100 a call: a longer page is read 100 at a time, together.
  const start = (page - 1) * perPage;
  const reads = await Promise.all(Array.from({ length: Math.ceil(perPage / 100) }, (_, i) => supabase.rpc("xdate_month_leads", {
    p_month: month,
    p_bucket: bucket,
    p_project_id: projectId,
    p_company_id: companyId,
    p_limit: Math.min(100, perPage - i * 100),
    p_offset: start + i * 100,
  })));
  const failed = reads.find((r) => r.error);
  if (failed) throw failed.error;
  const data = reads.flatMap((r) => r.data ?? []);
  const rows = (data ?? []).map((l) => ({
    id: l.id,
    company: l.company_name ?? "—",
    contact: l.contact_name ?? "—",
    phone: l.phone ?? "—",
    place: [l.city, l.state].filter(Boolean).join(", ") || "—",
    project: l.project ?? "—",
    result: l.result,
    renewal: l.renewal_date,
    rep: l.rep_first || l.rep_last ? shortName({ first_name: l.rep_first, last_name: l.rep_last, email: l.rep_email }) : "Unassigned",
  }));
  // A client cannot read the staff: the manager on each of their own leads, filled in (lead_rep_names()).
  const unnamed = rows.filter((r) => r.rep === "Unassigned").map((r) => r.id);
  if (unnamed.length) {
    const { data: names } = await supabase.rpc("lead_rep_names", { p_lead_ids: unnamed });
    const byLead = new Map((names ?? []).map((n) => [n.lead_id, shortName(n)]));
    for (const r of rows) if (byLead.has(r.id)) r.rep = byLead.get(r.id);
  }
  return { rows, total: Number(data?.[0]?.total ?? 0) };
}

/**
 * Calls and paid events per day, rep and project, for a date range (days in
 * the business's time zone). Anyone but an administrator gets only their
 * own rows; the database enforces that.
 */
export async function getProductionReport({ from, to, projectId = null, userId = null }) {
  const supabase = await createClient();
  // A row per day, rep and project passes the API's 1,000-row cap within a
  // few weeks for a busy team, so every page is read: the totals and the
  // payroll CSV must never quietly lose the earliest days.
  const data = await readAll((first, last) =>
    supabase
      .rpc("production_report", { p_from: from, p_to: to, p_project_id: projectId, p_user_id: userId })
      .order("day", { ascending: false })
      .order("first_name")
      .order("last_name")
      .order("user_id")
      .order("project", { nullsFirst: false })
      .order("project_id", { nullsFirst: false })
      .range(first, last)
  );
  return data.map((r) => ({
    day: r.day,
    userId: r.user_id,
    rep: fullName({ first_name: r.first_name, last_name: r.last_name, email: r.email }) || "—",
    projectId: r.project_id,
    project: r.project ?? "—",
    clientId: r.client_id ?? null,
    client: r.client ?? "—",
    calls: Number(r.calls),
    leads: Number(r.leads),
    appointments: Number(r.appointments),
    confirmations: Number(r.confirmations),
    chargebacks: Number(r.chargebacks),
    // What the day's pay came to, by kind; chargebacks are negative.
    leadPay: Number(r.lead_pay ?? 0),
    appointmentPay: Number(r.appointment_pay ?? 0),
    specialPay: Number(r.special_pay ?? 0),
    chargebackAmount: Number(r.chargeback_amount ?? 0),
    amount: Number(r.amount),
  }));
}

/** The business's time zone, which "today" and each day of the production report follow. */
export { getBusinessTimeZone } from "@/lib/server/business-day";

/**
 * One person's day by the hour (Hourly Progress; the old AE hourly progress
 * report): { hours: [{ hour, calls, leads, appointments }], first, last,
 * month: { calls, leads, appointments } }. Agents may ask only for their own.
 */
export async function getHourlyProgress({ userId, day }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hourly_progress", { p_user_id: Number(userId), p_day: day });
  if (error) throw error;
  const n = (v) => Number(v) || 0;
  return {
    hours: (data?.hours ?? []).map((h) => ({ hour: n(h.hour), calls: n(h.calls), leads: n(h.leads), appointments: n(h.appointments) })),
    first: data?.first ?? null,
    last: data?.last ?? null,
    month: { calls: n(data?.month?.calls), leads: n(data?.month?.leads), appointments: n(data?.month?.appointments) },
  };
}
