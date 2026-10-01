/** The administrator's reports: X-dates by month, and daily production and pay. */

import "server-only";
import { fullName, shortName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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

/** One page of the names behind a number in the X-dates report. */
export async function getXdateMonthLeads({ month, bucket = null, projectId = null, companyId = null, page = 1, perPage = 20 }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("xdate_month_leads", {
    p_month: month,
    p_bucket: bucket,
    p_project_id: projectId,
    p_company_id: companyId,
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  });
  if (error) throw error;
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
  return { rows, total: Number(data?.[0]?.total ?? 0) };
}

/**
 * Calls and paid events per day, rep and project, for a date range (days in
 * the business's time zone). Anyone but an administrator gets only their
 * own rows; the database enforces that.
 */
export async function getProductionReport({ from, to, projectId = null, userId = null }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_report", {
    p_from: from,
    p_to: to,
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    day: r.day,
    userId: r.user_id,
    rep: fullName({ first_name: r.first_name, last_name: r.last_name, email: r.email }) || "—",
    projectId: r.project_id,
    project: r.project ?? "—",
    calls: Number(r.calls),
    leads: Number(r.leads),
    appointments: Number(r.appointments),
    confirmations: Number(r.confirmations),
    chargebacks: Number(r.chargebacks),
    amount: Number(r.amount),
  }));
}

/** The business's time zone, which "today" and each day of the production report follow. */
export async function getBusinessTimeZone() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("business_tz");
  return data || "America/Phoenix";
}
