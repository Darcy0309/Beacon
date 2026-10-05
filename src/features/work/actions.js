"use server";

/** Recording call results from the lead sheet. */

import { check, fail, logActivity, n, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

// record_call_result() explains what a result needs; show it beside the field.
const FIELD_FOR = [
  [/Ultimate X-Date/i, "ultimate_xdate"],
  [/appointment date|date has passed/i, "appt_date"],
  [/appointment time|like 9:30 AM/i, "appt_time"],
  [/corrected renewal date/i, "corrected_xdate"],
];

// What a Lead or an Appointment cannot be saved without: [field, what it is, what to say beside it].
const NEEDS = {
  promote: [["ultimate_xdate", "the Ultimate X-Date", "Required for a Lead: confirm the renewal date"]],
  appointment: [
    ["ultimate_xdate", "the Ultimate X-Date", "Required for an Appointment: confirm the renewal date"],
    ["appt_date", "the appointment date", "Choose the date"],
    ["appt_time", "the appointment time", "Choose the time"],
  ],
};

const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/**
 * Record one call result. The database applies everything the result does
 * (list, weight, promotion, appointment, QA, pay) in one transaction. A Lead
 * or an Appointment needs its Ultimate X-Date, and an appointment its date
 * and time: anything missing is named, all at once, before anything is
 * saved. When the call came from a call list, the answer carries the next
 * name on it.
 */
export async function recordCallResult(prevState, formData) {
  const { values, failed } = check(formData, schemas.callResult);
  if (failed) return failed;

  const supabase = await createClient();
  const leadId = Number(values.lead_id);

  const { data: result } = await supabase.from("call_results").select("effect").eq("id", Number(values.result_id)).maybeSingle();
  const missing = (NEEDS[result?.effect] ?? []).filter(([field]) => !values[field]);
  if (missing.length) {
    return fail(
      `Missing ${listed(missing.map(([, what]) => what))}.`,
      Object.fromEntries(missing.map(([field, , say]) => [field, say])),
      values
    );
  }

  const appointment = values.appt_date
    ? { date: values.appt_date, time: values.appt_time || null, duration: n(formData, "duration_min"), rep_name: s(formData, "rep_name") }
    : null;

  const { data, error } = await supabase.rpc("record_call_result", {
    p_lead_id: leadId,
    p_result_id: Number(values.result_id),
    p_notes: values.notes || null,
    p_appointment: appointment,
    p_corrected_xdate: values.corrected_xdate || null,
    p_ultimate_xdate: values.ultimate_xdate || null,
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
