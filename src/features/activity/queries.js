/** The activity log: who did what, and when. */

import "server-only";
import { ROLE_LABEL } from "@/features/users/queries";
import { colorFor, dateTime, fullName, initialsOf, timeAgo } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABEL = {
  sign_in: "Signed in",
  sign_out: "Signed out",
  "mfa.enable": "Turned on two-factor",
  "mfa.disable": "Turned off two-factor",
  "notification.send": "Sent a notification",
  "password.change": "Changed their password",
  "user.invite": "Invited a user",
  "user.reinvite": "Re-sent an invitation",
  "user.create": "Created a user with a temporary password",
  "user.temp_password": "Set a temporary password",
  "profile.update": "Updated their contact details",
  "user.disable": "Disabled a user",
  "user.enable": "Re-enabled a user",
  "user.delete": "Deleted a user",
  "mfa.reset": "Reset a user's two-factor",
  "lead.create": "Created a lead",
  "lead.update": "Updated a lead",
  "lead.delete": "Deleted a lead",
  "lead.call": "Recorded a call",
  "lead.email": "Emailed a lead",
  "lead.coverage": "Updated a lead's coverage",
  "lead.notes": "Updated a lead's notes",
  "pay.period.create": "Added a pay period",
  "pay.period.update": "Changed a pay period",
  "pay.period.delete": "Removed a pay period",
  "lead.reminder": "Set a call-back reminder",
  "lead.send": "Sent a lead to someone to call",
  "lead.file": "Added a policy file to a lead",
  "lead.deliver": "Sent a lead to the client again",
  "carriers.import": "Imported carriers",
  "carrier.create": "Added a carrier",
  "carrier.update": "Updated a carrier",
  "project.create": "Created a project",
  "project.update": "Updated a project",
  "company.create": "Created a client",
  "company.update": "Updated a client",
  "user.create": "Created a user",
  "user.update": "Updated a user",
  "user.email": "Changed a user's sign-in email",
  "leads.import": "Imported leads",
  "leads.export": "Exported a project's leads",
  "project.delete": "Deleted a project",
  "company.delete": "Deleted a client",
  "carrier.delete": "Deleted an insurance company",
  "document.delete": "Deleted a document",
  "bulletin.delete": "Deleted a bulletin post",
  "record.restore": "Restored a deleted record",
  "sign_out.idle": "Signed out after 30 minutes idle",
  "sic.import": "Loaded SIC codes",
  "cargo.add": "Added cargo types",
  "cargo.remove": "Took a cargo type off the list",
  "project.rates": "Set a project's pay rates",
  "project.rep_add": "Added a rep to a project",
  "project.rep_remove": "Took a rep off a project",
  "project.redistribute": "Shared a project's names evenly",
  "appointment.qa_pass": "Passed an appointment in QA",
  "appointment.qa_fail": "Failed an appointment in QA",
  "appointment.moved": "Moved an appointment",
  "calendar.block": "Blocked out time on a calendar",
  "calendar.connect": "Connected their calendar",
  "calendar.disconnect": "Disconnected their calendar",
  "calendar.unblock": "Took blocked time off a calendar",
  "production.goal": "Set production goals",
  "settings.pay": "Changed the pay rules",
};

/** An action in words: its label, or its code read as words ("project.rates" -> "Project rates") until it has one. */
const actionLabel = (a) => ACTION_LABEL[a] ?? String(a ?? "").replace(/[._]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** How active each account has been — the activity_summary() SQL function. */
export async function getActivitySummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activity_summary");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const name = fullName(r) || r.email;
    return {
      id: r.user_id,
      name,
      email: r.email,
      initials: initialsOf(name),
      color: colorFor(name),
      role: ROLE_LABEL[r.role] ?? r.role,
      roleTone: r.role,
      loginsMonth: Number(r.logins_month) || 0,
      logins30d: Number(r.logins_30d) || 0,
      actions30d: Number(r.actions_30d) || 0,
      lastActive: r.last_active ? timeAgo(r.last_active) : "Never",
      lastActiveAt: r.last_active,
    };
  });
}

/** One page of the activity trail, newest first. */
export async function listActivity(params) {
  const supabase = await createClient();
  const { rows, total } = await runPaged(
    (p) =>
      paged(
        supabase
          .from("activity_log")
          // Whose it is, by name: named, so the join stays one join whatever else comes to link the log and users.
          .select(`*, user:users!activity_log_user_id_fkey${inner(Boolean(p.filters?.user))}(id, first_name, last_name, email, role)`, { count: "exact" })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        p,
        { search: ["detail"], columns: { action: "action", user: "user.email" } }
      ),
    params
  );

  return {
    rows: rows.map((r) => {
      const u = one(r.user);
      const name = fullName(u) || u?.email || "—";
      return {
        id: r.id,
        who: name,
        initials: initialsOf(name),
        color: colorFor(name),
        role: ROLE_LABEL[u?.role] ?? u?.role ?? "—",
        action: actionLabel(r.action),
        actionKey: r.action,
        detail: r.detail ?? "",
        entity: r.entity ?? "",
        entityId: r.entity_id,
        when: dateTime(r.created_at),
        ago: timeAgo(r.created_at),
      };
    }),
    total,
  };
}

/** The distinct actions recorded, for the activity page's filter. */
export async function getActivityActions() {
  const supabase = await createClient();
  const { data } = await supabase.from("activity_log").select("action");
  const seen = [...new Set((data ?? []).map((r) => r.action))].sort();
  return seen.map((a) => ({ value: a, label: actionLabel(a) }));
}
