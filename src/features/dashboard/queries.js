/** Dashboard tiles and the Reports page. */

import "server-only";
import { shapeReps } from "@/features/users/queries";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardStats() {
  const supabase = await createClient();
  const { data: s, error } = await supabase.rpc("dashboard_stats");
  if (error) throw error;

  // Null when there is nothing to compare with: "+100%" from zero says nothing.
  const pct = (c, p) => (p === 0 ? null : Math.round(((c - p) / p) * 1000) / 10);

  // Eight-week buckets, oldest first, drive both the big chart and the tile sparklines.
  const weeks = (s?.weeks ?? []).map((w, i) => ({
    label: i === 7 ? "Now" : `W${i + 1}`,
    leads: w.leads,
    appts: w.appts,
    conversion: w.leads ? Math.round((w.appts / w.leads) * 100) : 0,
  }));

  return {
    totalLeads: s?.leads_total ?? 0,
    apptsThisWeek: s?.appts_7d ?? 0,
    apptToday: s?.appts_today ?? 0,
    activeClients: s?.active_clients ?? 0,
    conversion: s?.leads_total ? Math.round((s.appts_total / s.leads_total) * 1000) / 10 : 0,
    leadDelta: pct(s?.leads_30d ?? 0, s?.leads_30_60d ?? 0),
    leadsNew: s?.leads_30d ?? 0,
    apptDelta: (s?.appts_7d ?? 0) - (s?.appts_7_14d ?? 0),
    weeks,
    series: {
      leads: weeks.map((w) => w.leads),
      appts: weeks.map((w) => w.appts),
      conversion: weeks.map((w) => w.conversion),
      // Lead volume per campaign, rendered as bars.
      clients: s?.project_leads ?? [],
    },
    // Appointments per rep, so the dashboard needs no separate query.
    reps: shapeReps(s?.reps),
  };
}

/**
 * New leads per day over the last year, [{ day: "2026-09-29", leads }],
 * for the Lead Volume chart to group by the period picked. Null when the
 * database does not have lead_volume_daily() yet, so the chart falls back
 * to the eight weeks in getDashboardStats() instead of failing the page.
 */
export async function getLeadVolume() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_volume_daily", { p_days: 366 });
  if (error) {
    console.warn("lead_volume_daily unavailable:", error.message);
    return null;
  }
  return Array.isArray(data) ? data : [];
}

export async function getReports() {
  const supabase = await createClient();
  const { data: r, error } = await supabase.rpc("report_stats");
  if (error) throw error;

  const leads = r?.leads ?? 0;
  const appts = r?.appts ?? 0;
  const ratings = r?.ratings ?? { count: 0, avg: 0 };

  return {
    leads,
    appts,
    projects: r?.projects ?? 0,
    showRate: appts ? Math.round(((r?.held ?? 0) / appts) * 100) : 0,
    conversion: leads ? Math.round((appts / leads) * 100) : 0,
    avgRating: ratings.count ? Math.round(Number(ratings.avg) * 10) / 10 : 0,
    byStatus: r?.by_status ?? {},
    // [[state, count], ...] — the top eight, busiest first.
    byState: r?.by_state ?? [],
    apptByStatus: r?.appt_by_status ?? {},
    // Six months, oldest first: { key: "2026-09", label: "Sep", leads, appts }.
    months: r?.months ?? [],
  };
}

/** The days from `from` to `to` (ISO), at most `max` of them. */
function daysOf(from, to, max = 62) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); out.length < max; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) break;
    out.push(iso);
  }
  return out;
}

/** One person's day from daily_production(), as the dashboard shows it. */
const toProduction = (r) => ({
  userId: r.user_id,
  name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
  role: r.role,
  startedAt: r.started_at,
  calls: Number(r.calls ?? 0),
  leads: Number(r.leads ?? 0),
  appts: Number(r.appointments ?? 0),
  workedMinutes: Number(r.worked_minutes ?? 0),
  paidMinutes: Number(r.paid_minutes ?? 0),
  leadsGoal: r.leads_goal ?? null,
  apptsGoal: r.appts_goal ?? null,
});

/**
 * The account manager's own dashboard (the signed-in one; the database
 * counts nobody else's for them): the leads and appointments they developed
 * over each tile's period (as the production report counts them, with a
 * day-by-day series), the active projects they are on by kind and how that
 * changed in 30 days, and today's production with their goals.
 * `ranges`: { leads, appts }, each { from, to } (lib/pay tileRange()).
 */
export async function getManagerDashboard({ userId, today, ranges }) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const report = (r) => supabase.rpc("production_report", { p_from: r.from, p_to: r.to, p_project_id: null, p_user_id: userId });
  const [leads, appts, assigned, log, day] = await Promise.all([
    report(ranges.leads),
    report(ranges.appts),
    supabase.from("project_assignments").select("project:projects!inner(id, status:project_statuses(name), type:project_types(code))").eq("ae_user_id", userId),
    supabase.from("project_assignment_log").select("change").eq("user_id", userId).gte("at", since),
    supabase.rpc("daily_production", { p_day: today }),
  ]);
  for (const r of [leads, appts, assigned, day]) if (r.error) throw r.error;

  const tally = (rows, key, range) => {
    const byDay = new Map();
    for (const r of rows ?? []) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r[key] ?? 0));
    const days = daysOf(range.from, range.to < today ? range.to : today);
    return { total: [...byDay.values()].reduce((a, b) => a + b, 0), series: days.map((d) => byDay.get(d) ?? 0) };
  };

  // Active projects, once each, by kind: Lead (database development) or Appointment.
  const active = new Map();
  for (const a of assigned.data ?? []) {
    const p = a.project;
    if (p?.status?.name === "Active") active.set(p.id, p.type?.code);
  }
  const lead = [...active.values()].filter((c) => c === "DBDV").length;
  const appt = [...active.values()].filter((c) => c === "APPT").length;
  const net = (log.data ?? []).reduce((n, r) => n + r.change, 0);
  const before = active.size - net;

  const mine = (day.data ?? []).find((r) => r.user_id === userId);
  return {
    leads: tally(leads.data, "leads", ranges.leads),
    appts: tally(appts.data, "appointments", ranges.appts),
    projects: { total: active.size, lead, appt, net, pct: before > 0 ? Math.round((net / before) * 100) : null },
    today: mine ? toProduction(mine) : null,
  };
}

/** Everyone's production today (an administrator's dashboard): managers, and agents who worked. */
export async function getDailyProduction(today) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_production", { p_day: today });
  if (error) throw error;
  return (data ?? []).map(toProduction);
}
