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
  "carriers.import": "Imported carriers",
  "project.create": "Created a project",
  "project.update": "Updated a project",
  "company.create": "Created a client",
  "company.update": "Updated a client",
  "user.create": "Created a user",
  "user.update": "Updated a user",
  "leads.import": "Imported leads",
};

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
          .select(`*, user:users${inner(Boolean(p.filters?.user))}(id, first_name, last_name, email, role)`, { count: "exact" })
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
        action: ACTION_LABEL[r.action] ?? r.action,
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
  return seen.map((a) => ({ value: a, label: ACTION_LABEL[a] ?? a }));
}
