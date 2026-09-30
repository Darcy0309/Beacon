/** The Alert Engine: rules and what they have sent. */

import "server-only";
import { timeAgo } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

// Maps an alert trigger to the dot colour the demo used.
const ALERT_TONE = {
  xdate_30d: "hot",
  hot_lead: "hot",
  appt_created: "appt",
  appt_reminder: "appt",
  feedback_new: "survey",
  import_done: "new",
};

export async function getAlerts() {
  const supabase = await createClient();
  const [rules, log] = await Promise.all([
    supabase.from("alert_rules").select("*").order("id"),
    supabase
      .from("alert_log")
      .select("*, rule:alert_rules(name, trigger)")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);
  if (rules.error) throw rules.error;

  const DESC = {
    xdate_30d: "Email the client when a policy X-date falls inside 30 days.",
    appt_created: "Notify the assigned rep and manager on new appointments.",
    appt_reminder: "Daily reminder of the day’s appointments.",
    hot_lead: "Alert the rep instantly when a hot X-date lead is assigned.",
    import_done: "Summary of each finished lead import.",
    feedback_new: "Alert admins when a client submits feedback.",
  };

  return {
    alertRules: (rules.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      desc: DESC[r.trigger] ?? r.trigger,
      on: r.enabled,
    })),
    recentAlerts: (log.data ?? []).map((l) => ({
      text: l.subject,
      time: timeAgo(l.created_at),
      tone: ALERT_TONE[one(l.rule)?.trigger] ?? "new",
    })),
  };
}
