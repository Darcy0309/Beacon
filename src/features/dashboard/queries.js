/** Dashboard tiles and the Reports page. */

import "server-only";
import { shapeReps } from "@/features/users/queries";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardStats() {
  const supabase = await createClient();
  const { data: s, error } = await supabase.rpc("dashboard_stats");
  if (error) throw error;

  const pct = (c, p) => (p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 1000) / 10);

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
