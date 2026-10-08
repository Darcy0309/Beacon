/** Quality QA: reviewed calls. */

import "server-only";
import { shortDate, shortName } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

export const QA_RESULT_OPTIONS = ["Passed", "Review", "Failed"].map((v) => ({ value: v, label: v }));

const toQaView = (c) => ({
  id: c.id,
  rep: shortName(one(c.user)),
  client: one(c.lead)?.company_name ?? "—",
  score: c.qa_score ?? 0,
  result: c.qa_result ?? "Review",
  date: shortDate(c.call_date),
});

/**
 * One page of scored calls, plus every score for the tiles and the reps
 * who appear in the scored calls, for the rep facet. Search matches the
 * lead's company name; the rep facet filters by user id.
 */
export async function listQaCalls(params) {
  const supabase = await createClient();
  const searching = Boolean(params.q);
  const [{ rows, total }, { data: scores }, { data: reps }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("call_records")
            .select(
              `id, call_date, qa_score, qa_result, user:users(id, first_name, last_name, email), lead:leads${inner(searching)}(company_name)`,
              { count: "exact" }
            )
            .not("qa_score", "is", null)
            .order("call_date", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["company_name"], table: "lead", columns: { result: "qa_result", rep: "user_id" } }
        ),
      params
    ),
    supabase.from("call_records").select("qa_score, qa_result").not("qa_score", "is", null),
    supabase.from("users").select("id, first_name, last_name, email").in("role", ["manager", "agent"]).order("id"),
  ]);

  return {
    rows: rows.map(toQaView),
    total,
    stats: (scores ?? []).map((c) => ({ score: c.qa_score ?? 0, result: c.qa_result ?? "Review" })),
    reps: (reps ?? []).map((u) => ({ value: String(u.id), label: shortName(u) })),
  };
}

/**
 * Appointments set from a call and waiting for QA, oldest first. The client
 * is told about an appointment only once it passes here. Shown with the
 * lead's client notes, which agents see; the call notes are for
 * administrators and managers only.
 */
export async function getQaQueue() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(`id, appt_date, appt_time, rep_name, appt_create_date, set_stage,
      setter:users!appointments_user_id_fkey(id, first_name, last_name, email),
      project:projects!appointments_project_id_fkey(name),
      lead:leads(id, company_name, contact_name, phone, client_note),
      call:call_records!appointments_call_record_id_fkey(call_result)`)
    .eq("qa_status", "pending")
    .order("appt_create_date")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    leadId: one(a.lead)?.id,
    company: one(a.lead)?.company_name ?? "—",
    contact: one(a.lead)?.contact_name ?? "—",
    phone: one(a.lead)?.phone ?? "—",
    project: one(a.project)?.name ?? "—",
    setterId: one(a.setter)?.id ?? null,
    setBy: shortName(one(a.setter)),
    result: one(a.call)?.call_result ?? "Appointment",
    notes: one(a.lead)?.client_note ?? null,
    when: `${shortDate(a.appt_date)}${a.appt_time ? ` · ${a.appt_time}` : ""}`,
    with: a.rep_name,
    set: shortDate(a.appt_create_date),
  }));
}
