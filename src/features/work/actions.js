"use server";

/** Recording call results from the lead sheet. */

import { check, fail, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

// record_call_result() explains what a result needs; show it beside the field.
const FIELD_FOR = [
  [/appointment date|date has passed/i, "appt_date"],
  [/like 9:30 AM/i, "appt_time"],
  [/corrected renewal date/i, "corrected_xdate"],
];

/**
 * Record one call result. The database applies everything the result does
 * (list, weight, promotion, appointment, QA, pay) in one transaction. When
 * the call came from a call list, the answer carries the next name on it.
 */
export async function recordCallResult(prevState, formData) {
  const { values, failed } = check(formData, schemas.callResult);
  if (failed) return failed;

  const supabase = await createClient();
  const leadId = Number(values.lead_id);
  const appointment = values.appt_date
    ? { date: values.appt_date, time: values.appt_time || null, duration: n(formData, "duration_min"), rep_name: s(formData, "rep_name") }
    : null;

  const { data, error } = await supabase.rpc("record_call_result", {
    p_lead_id: leadId,
    p_result_id: Number(values.result_id),
    p_notes: values.notes || null,
    p_appointment: appointment,
    p_corrected_xdate: values.corrected_xdate || null,
  });
  if (error) {
    const field = FIELD_FOR.find(([re]) => re.test(error.message))?.[1];
    return fail(error, field ? { [field]: error.message } : null, values);
  }

  await logActivity(supabase, "lead.call", { entity: "lead", entityId: leadId, detail: data.result });

  // The next name: on the list the rep came from, if there is one.
  let next = null;
  const listId = n(formData, "project_id");
  if (listId) {
    const { data: rows } = await supabase.rpc("call_list", { p_project_id: listId, p_limit: 2 });
    next = (rows ?? []).find((r) => r.id !== leadId)?.id ?? null;
  }

  // No revalidatePath here: every page this touches renders fresh on each
  // visit, and revalidating would re-render the sheet being viewed at once.
  // The panel refreshes or moves on to the next name itself.
  return ok({ ...data, next, listId });
}
