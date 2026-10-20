"use server";

/** Recording call results from the lead sheet. */

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, n, ok, requestOrigin, s } from "@/lib/server/action-helpers";
import { cleanCriteria } from "@/lib/call-list-filter";
import { deliverLead } from "@/features/delivery/server";
import { holdDelivery, holdKind, readDeliverySettings } from "@/features/delivery/holds";
import { holds } from "@/lib/delivery-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { APPOINTMENT_NOTICES, sendsSheet } from "@/lib/delivery";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";
import { getCallListOptions } from "@/features/work/queries";

// record_call_result() explains what a result needs; show it beside the field.
const FIELD_FOR = [
  [/Ultimate X-Date/i, "ultimate_xdate"],
  [/appointment date|date has passed/i, "appt_date"],
  [/appointment time|like 9:30 AM/i, "appt_time"],
  [/corrected renewal date/i, "corrected_xdate"],
  [/note for the client/i, "client_note"],
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

  const { data: result } = await supabase.from("call_results").select("name, effect, delivers").eq("id", Number(values.result_id)).maybeSingle();
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
    // What the client is told, when the result sends them the lead: given
    // only when the panel asked for it, so an empty box clears it.
    p_client_note: sendsSheet(result) && formData.has("client_note") ? (s(formData, "client_note") ?? "") : null,
  });
  if (error) {
    const field = FIELD_FOR.find(([re]) => re.test(error.message))?.[1];
    return fail(error, field ? { [field]: error.message } : null, values);
  }

  await logActivity(supabase, "lead.call", { entity: "lead", entityId: leadId, detail: data.result });

  // Confirming or cancelling an appointment: the Client notes written with it (why it was cancelled,
  // what the client should know) go on the lead before its sheet goes out. record_call_result keeps
  // them only as a name becomes a Lead or an Appointment.
  if (APPOINTMENT_NOTICES[result?.effect] && formData.has("client_note")) {
    const { error: noteError } = await supabase.from("leads").update({ client_note: s(formData, "client_note") }).eq("id", leadId);
    if (noteError) console.error("[call result] client note not saved", leadId, noteError.message);
  }

  // A lead or an appointment goes to the client: its sheet, emailed to the
  // project's delivery addresses, once the rep has moved on. So does news of
  // the appointment: confirmed, or cancelled (marked invalid).
  // Unless Settings › Delivery holds that kind in QA (Sean, Oct 2026): then it waits there, for an
  // administrator or the next clearing.
  if (sendsSheet(result)) {
    const [me, origin, settings] = await Promise.all([currentAppUser(supabase), requestOrigin(), readDeliverySettings(supabase)]);
    const admin = holds(settings, holdKind(result)) ? createAdminClient() : null;
    if (admin) {
      try {
        await holdDelivery(admin, { leadId, callRecordId: data.call_record_id, result, userId: me?.id ?? null });
      } catch (err) {
        // Held nowhere: sent, rather than lost.
        console.error("[call result] not held, sent", leadId, err?.message ?? err);
        after(() => deliverLead({ leadId, callRecordId: data.call_record_id, sentBy: me?.id ?? null, origin }));
      }
    } else {
      after(() => deliverLead({ leadId, callRecordId: data.call_record_id, sentBy: me?.id ?? null, origin }));
    }
  }

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

/**
 * Keep the caller's filter for a project's call list (`criteria`, JSON):
 * the list, Start calling, Skip and the next name after a result all follow
 * it. An empty filter clears it.
 */
/**
 * The Filter panel's choices for a call list (each city, ZIP, county,
 * industry, carrier, year, developer, result and source on it, with counts):
 * read when the panel is first opened, not on every page of the list, since
 * working them out goes over every name on it. The database decides whose
 * list may be read.
 */
export async function loadCallListOptions(formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("Missing project.");
  const rep = idFrom(formData, "rep");
  try {
    return ok(await getCallListOptions(projectId, rep));
  } catch (err) {
    return fail(err?.message ?? "The filter's choices could not be read.");
  }
}

export async function saveCallListFilter(formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("Missing project.");
  let criteria;
  try {
    criteria = cleanCriteria(JSON.parse(String(formData.get("criteria") ?? "{}")));
  } catch {
    return fail("That filter could not be read.");
  }
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || !["admin", "manager", "agent"].includes(me.role)) return fail("Only staff have call lists.");
  const { error } = Object.keys(criteria).length
    ? await supabase.from("call_list_filters").upsert(
        { user_id: me.id, project_id: projectId, criteria, updated_at: new Date().toISOString() },
        { onConflict: "user_id,project_id" })
    : await supabase.from("call_list_filters").delete().eq("user_id", me.id).eq("project_id", projectId);
  if (error) return fail(error);
  revalidatePath(`/work/${projectId}`);
  return ok({ criteria });
}
