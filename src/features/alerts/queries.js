/** The Alert Engine: rules and what they have sent. */

import "server-only";
import { addDays, todayIn } from "@/lib/dates";
import { timeAgo } from "@/lib/format";
import { getBusinessTimeZone } from "@/lib/server/business-day";
import { one, readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

// Maps an alert trigger to the dot colour the demo used.
const ALERT_TONE = {
  xdate_30d: "hot",
  hot_lead: "hot",
  lead_invalid: "hot",
  appt_created: "appt",
  appt_confirmed: "appt",
  appt_qa: "appt",
  appt_reminder: "appt",
  feedback_new: "survey",
  bulletin_posted: "survey",
  import_done: "new",
  lead_assigned: "new",
};

// What each rule does, as the database sends it (notify_users() and the
// triggers that call it). Every rule that runs sends in-app notifications.
const DESC = {
  appt_created: "When appointments are set: administrators, the project's account manager and the lead's rep. The client hears once QA has passed it.",
  appt_confirmed: "When an appointment is confirmed: the client's portal users.",
  appt_qa: "When an appointment fails QA: the rep who set it, with the QA note.",
  hot_lead: "When a hot lead is assigned: the rep it went to. Bulk assignments arrive as one summary.",
  lead_assigned: "When leads are assigned: the rep they went to. Bulk assignments arrive as one summary.",
  lead_invalid: "When a lead is marked invalid: the developer who sourced it, as it is charged back.",
  import_done: "When a lead import finishes: administrators, with the row counts.",
  feedback_new: "When a client submits feedback: administrators.",
  bulletin_posted: "When an announcement or alert is posted to the bulletin board: all staff.",
  xdate_30d: "Each morning at 7: every rep, of the names they hold whose renewal is 30 days out.",
  appt_reminder: "Each morning at 7: whoever set them, of the day's appointments and tomorrow's still to confirm.",
};

// Rules with no job behind them yet (none now: the two morning ones run
// from pg_cron, run_daily_alerts()).
const NOT_RUNNING = new Set();

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK = 7;

/**
 * A log subject is the recipient's own notification title; for the log,
 * "Lead assigned to you: Acme" reads as "Lead assigned: Acme".
 */
const neutral = (subject) => String(subject ?? "").replace(/ assigned to you\b/i, " assigned");

export async function getAlerts() {
  const supabase = await createClient();
  const since = new Date(Date.now() - (WEEK + 1) * DAY_MS).toISOString();
  const [rules, log, week, tz] = await Promise.all([
    supabase.from("alert_rules").select("*").order("id"),
    supabase
      .from("alert_log")
      .select("*, rule:alert_rules(name, trigger)")
      .order("created_at", { ascending: false })
      .limit(6),
    readAll((from, to) =>
      supabase.from("alert_log").select("id, created_at").eq("status", "sent").gte("created_at", since).order("id").range(from, to)
    ),
    getBusinessTimeZone(),
  ]);
  if (rules.error) throw rules.error;

  // Alerts sent on each of the last seven days, the business's days, oldest first.
  const today = todayIn(tz);
  const days = Array.from({ length: WEEK }, (_, i) => addDays(today, i - (WEEK - 1)));
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const row of week) {
    const day = todayIn(tz, new Date(row.created_at));
    if (perDay.has(day)) perDay.set(day, perDay.get(day) + 1);
  }

  return {
    alertRules: (rules.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      desc: DESC[r.trigger] ?? r.trigger,
      on: r.enabled,
      running: !NOT_RUNNING.has(r.trigger),
    })),
    recentAlerts: (log.data ?? []).map((l) => ({
      text: neutral(l.subject),
      detail: l.status === "sent" ? l.detail : `${l.status === "failed" ? "Failed" : "Queued"}${l.detail ? ` · ${l.detail}` : ""}`,
      time: timeAgo(l.created_at),
      tone: ALERT_TONE[one(l.rule)?.trigger] ?? "new",
    })),
    sentLastWeek: [...perDay.values()].reduce((a, b) => a + b, 0),
    sentPerDay: [...perDay.values()],
    notRunning: (rules.data ?? []).filter((r) => NOT_RUNNING.has(r.trigger)).length,
  };
}
