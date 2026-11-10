import "server-only";

/** Program Funding (client, Nov 2026): a project's plan and payments; the payments due across clients. */

import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/server/query-helpers";

const payment = (r) => ({
  id: r.id, kind: r.kind, seq: r.seq, period: r.period, label: r.label, due: r.due_date, amount: Number(r.amount),
  leads: r.leads, appts: r.appts, fees: Number(r.fees), paidAt: r.paid_at, repRemindedAt: r.rep_reminded_at, clientRemindedAt: r.client_reminded_at,
});

/** A project's plan (null when none is set), its payments by due date, and its client's reminders switch. Null for someone who can't see them. */
export async function getProjectFunding(projectId) {
  const supabase = await createClient();
  const [{ data: plan }, { data: rows, error }, { data: project }] = await Promise.all([
    supabase.from("project_funding").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_payments").select("*").eq("project_id", projectId).order("due_date", { ascending: true, nullsFirst: false }).order("seq"),
    supabase.from("projects").select("company:companies(id, payment_reminders)").eq("id", projectId).maybeSingle(),
  ]);
  if (error) return null;
  // Whether the client takes payment reminders (its page's switch).
  return { plan: plan ?? null, payments: (rows ?? []).map(payment), reminders: Boolean(one(project?.company)?.payment_reminders) };
}

/**
 * The payments the signed-in person looks after (the database keeps a Sales Rep to their
 * clients'): unpaid, and those paid in the last 60 days, each with its project and client.
 */
export async function getPaymentsDue(today) {
  const supabase = await createClient();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 60 * 86400000).toISOString();
  const { data, error } = await supabase.from("project_payments")
    .select("*, project:projects(id, name, deleted_at, company:companies(id, name, payment_reminders, sales_rep:users!companies_sales_rep_id_fkey(first_name, last_name)))")
    .or(`paid_at.is.null,paid_at.gte.${since}`)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const project = one(r.project);
    const company = one(project?.company);
    const rep = one(company?.sales_rep);
    return {
      ...payment(r),
      projectId: project?.id, project: project?.name ?? "—", deleted: Boolean(project?.deleted_at),
      clientId: company?.id, client: company?.name ?? "—",
      reminders: Boolean(company?.payment_reminders),
      salesRep: rep ? [rep.first_name, rep.last_name].filter(Boolean).join(" ") : null,
    };
  }).filter((p) => !p.deleted);
}
