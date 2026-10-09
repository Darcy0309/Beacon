/** Dashboard tiles and the Reports page. */

import "server-only";
import { shapeReps } from "@/features/users/queries";
import { addDays, todayIn } from "@/lib/dates";
import { cityState, splitTime, timeRank } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
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
 * changed in 30 days, their calls over the last week, and today's
 * production with their goals.
 * `ranges`: { leads, appts }, each { from, to } (lib/pay tileRange()).
 */
export async function getManagerDashboard({ userId, today, ranges }) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const report = (r) => supabase.rpc("production_report", { p_from: r.from, p_to: r.to, p_project_id: null, p_user_id: userId });
  const week = { from: addDays(today, -6), to: today };
  const [leads, appts, calls, assigned, log, day] = await Promise.all([
    report(ranges.leads),
    report(ranges.appts),
    report(week),
    supabase.from("project_assignments").select("project:projects!inner(id, status:project_statuses(name), type:project_types(code))").eq("ae_user_id", userId),
    supabase.from("project_assignment_log").select("change").eq("user_id", userId).gte("at", since),
    supabase.rpc("daily_production", { p_day: today }),
  ]);
  for (const r of [leads, appts, calls, assigned, day]) if (r.error) throw r.error;

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
    // Calls Today's sparkline: the last seven days.
    calls: tally(calls.data, "calls", week),
    projects: { total: active.size, lead, appt, net, pct: before > 0 ? Math.round((net / before) * 100) : null },
    today: mine ? toProduction(mine) : null,
  };
}

/**
 * Production over a range ({ from, to }, the business's days), per person:
 * the totals, the goals set on its days added up, the days worked and when
 * each began, and the day-by-day. Everyone's for an administrator (account
 * managers always listed, and anyone else who worked); anyone else, their own.
 */
export async function getProduction({ from, to }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("production_days", { p_from: from, p_to: to });
  if (error) throw error;
  const people = new Map();
  for (const r of data ?? []) {
    let p = people.get(r.user_id);
    if (!p) {
      const first = toProduction(r);
      p = { userId: first.userId, name: first.name, role: first.role, calls: 0, leads: 0, appts: 0, workedMinutes: 0,
        leadsGoal: null, apptsGoal: null, daysWorked: 0, starts: [], days: [] };
      people.set(r.user_id, p);
    }
    if (!r.day) continue;
    const d = { day: r.day, ...toProduction(r) };
    p.days.push(d);
    p.calls += d.calls;
    p.leads += d.leads;
    p.appts += d.appts;
    p.workedMinutes += d.workedMinutes;
    if (d.leadsGoal != null) p.leadsGoal = (p.leadsGoal ?? 0) + d.leadsGoal;
    if (d.apptsGoal != null) p.apptsGoal = (p.apptsGoal ?? 0) + d.apptsGoal;
    if (d.startedAt) p.starts.push(d.startedAt);
    if (d.startedAt || d.workedMinutes) p.daysWorked += 1;
  }
  return [...people.values()];
}

/**
 * Daily Team Production: every active account manager's leads and
 * appointments developed on `day`, most first. Counts only, for any staff.
 */
export async function getTeamProduction(day) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_production", { p_day: day });
  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      userId: r.user_id,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
      leads: Number(r.leads ?? 0),
      appts: Number(r.appointments ?? 0),
    }))
    .sort((a, b) => b.leads + b.appts - (a.leads + a.appts) || a.name.localeCompare(b.name));
}

/** The business's day an instant fell on. */
const dayOf = (ts, timeZone) => todayIn(timeZone, new Date(ts));
/** "2:00 PM" on the business's clock (Intl puts a narrow space before PM: a plain one here). */
const clock = (ts, timeZone) =>
  new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(ts)).replace(/\s/g, " ");
/** Instants a little either side of the days from..to, wherever the business is; each row's own day is checked after. */
const around = ({ from, to }) => [`${addDays(from, -1)}T00:00:00Z`, `${addDays(to, 2)}T00:00:00Z`];

/** What a call made of a name, as the manager calls it: Lead, Hot Lead, Appointment, Phone Appointment. */
function developedType(kind, result) {
  if (kind === "lead") return /hot/i.test(result ?? "") ? "Hot Lead" : "Lead";
  return /phone/i.test(result ?? "") ? "Phone Appointment" : "Appointment";
}

/**
 * The leads and appointments the signed-in manager developed over a range,
 * newest first, as the production report counts them (what they were paid
 * for): the client and project, the name, what it became, and when.
 */
export async function getDeveloped({ userId, from, to, timeZone }) {
  const supabase = await createClient();
  const [lo, hi] = around({ from, to });
  const { data, error } = await supabase
    .from("pay_events")
    .select(`id, kind, created_at,
      project:projects(id, name, company:companies(id, name)),
      lead:leads(id, company_name, contact_name, phone, city, state),
      call:call_records(call_result, result:call_results(name))`)
    .eq("user_id", userId)
    .in("kind", ["lead", "appointment"])
    .eq("is_chargeback", false)
    .gte("created_at", lo)
    .lt("created_at", hi)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? [])
    .map((e) => {
      const project = one(e.project);
      const lead = one(e.lead);
      const call = one(e.call);
      return {
        id: e.id,
        day: dayOf(e.created_at, timeZone),
        at: e.created_at,
        time: clock(e.created_at, timeZone),
        type: developedType(e.kind, one(call?.result)?.name ?? call?.call_result),
        kind: e.kind,
        client: one(project?.company)?.name ?? "—",
        project: project?.name ?? "—",
        projectId: project?.id ?? null,
        leadId: lead?.id ?? null,
        company: lead?.company_name ?? "—",
        contact: lead?.contact_name ?? null,
        phone: lead?.phone ?? null,
        location: cityState(lead),
      };
    })
    .filter((e) => e.day >= from && e.day <= to);
}

/**
 * The signed-in manager's own calendar from `from` to `to`: the
 * appointments they set (and whether each is confirmed yet), the call-back
 * reminders they set, and the notifications administrators sent them.
 * Returns { items, awaiting }: each item { key, kind, id, day, time, clock,
 * minutes, title, detail, badge, tone, href, movable; a reminder's name's
 * last call `result` }, and how many of the
 * appointments they set, still to come, wait for confirmation. `owner`:
 * false when an administrator is looking at someone else's.
 */
export async function getMySchedule({ userId, from, to, today, timeZone, owner = true }) {
  const supabase = await createClient();
  const [lo, hi] = around({ from, to });
  const [appts, reminders, messages, awaiting] = await Promise.all([
    supabase
      .from("appointments")
      .select(`id, appt_date, appt_time, duration_min, confirmed_at, qa_status,
        status:appointment_statuses(name),
        lead:leads(id, company_name, contact_name, status:lead_statuses(code, name),
          project:projects!leads_project_id_fkey(name, company:companies(name)))`)
      .eq("user_id", userId)
      .is("invalid_at", null)
      .gte("appt_date", from)
      .lte("appt_date", to)
      .limit(1000),
    supabase
      .from("reminders")
      // With the name's last call result: why the call back (a viable name, an X-date to follow up…).
      .select("id, remind_at, note, sent_at, lead:leads(id, company_name, contact_name, result:call_results(name))")
      .eq("user_id", userId)
      .gte("remind_at", lo)
      .lt("remind_at", hi)
      .limit(1000),
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at, read_at, sender_name, sender:users!notifications_sender_id_fkey(role)")
      .eq("user_id", userId)
      // What they wrote: messages and bulletin posts, not the alerts their actions set off (leads assigned…).
      .in("kind", ["message", "bulletin"])
      .not("sender_id", "is", null)
      .gte("created_at", lo)
      .lt("created_at", hi)
      .order("created_at", { ascending: false })
      .limit(500),
    // Every one still to come that has not been confirmed, whatever month is on show.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("invalid_at", null)
      .is("confirmed_at", null)
      .gte("appt_date", today),
  ]);
  for (const r of [appts, reminders, messages, awaiting]) if (r.error) throw r.error;

  const items = [];
  for (const a of appts.data ?? []) {
    const lead = one(a.lead);
    const { time, ampm } = splitTime(a.appt_time);
    const status = one(a.status)?.name ?? null;
    const waiting = !a.confirmed_at && a.appt_date >= today;
    items.push({
      key: `a${a.id}`, kind: "appointment", id: a.id, day: a.appt_date,
      time: [time, ampm].filter(Boolean).join(" "), clock: a.appt_time, minutes: timeRank(a.appt_time),
      title: lead?.company_name ?? "Appointment",
      detail: [one(lead?.status)?.name ?? "Appointment", lead?.contact_name, one(one(lead?.project)?.company)?.name].filter(Boolean).join(" · "),
      // Confirmed, or still waiting for the confirmation call; QA first if it has not passed.
      badge: a.confirmed_at ? "Confirmed" : a.qa_status === "pending" ? "Pending QA" : waiting ? "Awaiting confirmation" : status,
      tone: a.confirmed_at ? "ok" : waiting ? "warn" : "muted",
      waiting,
      href: lead?.id ? `/leads/${lead.id}` : `/calendar?a=${a.id}`,
      movable: a.appt_date >= today,
    });
  }
  for (const r of reminders.data ?? []) {
    const lead = one(r.lead);
    const day = dayOf(r.remind_at, timeZone);
    if (day < from || day > to) continue;
    const time = clock(r.remind_at, timeZone);
    items.push({
      key: `r${r.id}`, kind: "reminder", id: r.id, day, time, clock: time, minutes: timeRank(time),
      title: `Call back: ${lead?.company_name ?? "a lead"}`,
      detail: [r.note, lead?.contact_name].filter(Boolean).join(" · ") || "Call-back reminder",
      badge: r.sent_at ? "Reminded" : null, tone: "muted",
      result: one(lead?.result)?.name ?? null,
      href: lead?.id ? `/leads/${lead.id}` : null,
      leadId: lead?.id ?? null,
      // Only its owner moves a reminder (an administrator looking on does not).
      movable: !r.sent_at && owner,
    });
  }
  for (const n of messages.data ?? []) {
    if (one(n.sender)?.role !== "admin") continue;
    const day = dayOf(n.created_at, timeZone);
    if (day < from || day > to) continue;
    const time = clock(n.created_at, timeZone);
    items.push({
      key: `n${n.id}`, kind: "message", id: n.id, day, time, clock: time, minutes: timeRank(time),
      title: n.title,
      detail: [n.sender_name ? `From ${n.sender_name}` : "From an administrator", n.body].filter(Boolean).join(" · "),
      badge: n.read_at ? null : "New", tone: "info",
      href: n.link || "/notifications",
      movable: false,
    });
  }
  items.sort((a, b) => a.day.localeCompare(b.day) || a.minutes - b.minutes || a.key.localeCompare(b.key));
  return { items, awaiting: awaiting.count ?? 0 };
}

/** An active account manager, for an administrator opening their dashboard; null for anyone else. */
export async function getManagerUser(id) {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, first_name, last_name, role, status").eq("id", id).maybeSingle();
  return data?.role === "manager" && data.status === "active" ? data : null;
}
