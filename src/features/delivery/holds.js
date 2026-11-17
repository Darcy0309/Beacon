/**
 * Leads and appointments held in QA before they go to the client (Sean, Oct
 * 2026; migration 20261118100000): held as a call makes them, when Settings ›
 * Delivery says so; sent by an administrator from the QA page, or by the
 * schedule; failed back to their manager with a note, and back in the queue
 * once the manager marks them fixed. With the server's role: the callers
 * check who is asking.
 */

import "server-only";
import { deliverySettings } from "@/lib/delivery-schedule";
import { APPOINTMENT_NOTICES } from "@/lib/delivery";
import { deliverLead } from "@/features/delivery/server";

/** Settings › Delivery, read with whatever client is at hand. */
export async function readDeliverySettings(db) {
  const { data } = await db.from("app_settings").select("value").eq("key", "delivery").maybeSingle();
  return deliverySettings(data?.value);
}

/** Which kind a delivering call result is: an appointment (set, confirmed or cancelled), else a lead. */
export const holdKind = (result) => (result?.effect === "appointment" || APPOINTMENT_NOTICES[result?.effect] ? "appointment" : "lead");

/** Hold a call's lead or appointment instead of emailing the client now. */
export async function holdDelivery(admin, { leadId, callRecordId, result, userId }) {
  const { data: call } = await admin.from("call_records").select("appointment_id, project_id").eq("id", callRecordId).maybeSingle();
  const { error } = await admin.from("delivery_holds").insert({
    lead_id: leadId, call_record_id: callRecordId, appointment_id: call?.appointment_id ?? null, project_id: call?.project_id ?? null,
    kind: holdKind(result), label: String(result?.name ?? "").slice(0, 80) || null, user_id: userId ?? null,
  });
  if (error) throw error;
}

// A claim older than this was cut off part way (the server's time limit): it is held again.
const STUCK_MINUTES = 10;
// The schedule stops claiming more before the server's limit (maxDuration 300 s); the rest go at the next clearing.
const SCHEDULE_BUDGET_MS = 200_000;

/**
 * Send held ones: `ids` (an administrator's pick, failed ones too), or every
 * one waiting (the schedule). Each is claimed as it is sent ('sending', with
 * the time), so two at once never send it twice, and one cut off part way is
 * held again after STUCK_MINUTES (Sean, Nov 2026: a long backlog left the rest
 * stuck); an appointment's QA passes as it goes. Returns how many went.
 */
export async function releaseHolds(admin, { ids = null, sentBy = null, origin, budgetMs = ids ? Infinity : SCHEDULE_BUDGET_MS }) {
  const started = Date.now();
  const stuck = new Date(Date.now() - STUCK_MINUTES * 60_000).toISOString();
  // Claims cut off part way: back in the queue.
  await admin.from("delivery_holds").update({ status: "held" }).eq("status", "sending").or(`sending_at.is.null,sending_at.lt.${stuck}`);
  let list = admin.from("delivery_holds").select("id").order("created_at").limit(5000);
  list = ids ? list.in("id", ids).in("status", ["held", "failed"]) : list.eq("status", "held");
  const { data: waiting, error } = await list;
  if (error) throw error;
  let sent = 0;
  for (const { id } of waiting ?? []) {
    if (Date.now() - started > budgetMs) break;
    const { data: h } = await admin.from("delivery_holds").update({ status: "sending", sending_at: new Date().toISOString() })
      .eq("id", id).in("status", ids ? ["held", "failed"] : ["held"]).select("id, lead_id, call_record_id, appointment_id").maybeSingle();
    if (!h) continue; // taken by another send meanwhile
    try {
      if (h.appointment_id) {
        const { error: qaError } = await admin.rpc("release_appointment_qa", { p_appointment_id: h.appointment_id, p_by: sentBy });
        if (qaError) console.error("[holds] QA not passed", h.appointment_id, qaError.message);
      }
      await deliverLead({ leadId: h.lead_id, callRecordId: h.call_record_id, sentBy, origin });
      await admin.from("delivery_holds").update({ status: "sent", sent_at: new Date().toISOString(), sent_by: sentBy }).eq("id", h.id);
      sent += 1;
    } catch (err) {
      // Not sent: back in the queue for the next try.
      console.error("[holds] not sent", h.id, err?.message ?? err);
      await admin.from("delivery_holds").update({ status: "held" }).eq("id", h.id);
    }
  }
  return sent;
}

/**
 * Hold one back: not sent, its manager told why (unless `notify` is false,
 * when QA has told them already); an appointment fails its QA too.
 */
export async function failHold(admin, { id, note, by, notify = true }) {
  const { data: h, error } = await admin.from("delivery_holds")
    .update({ status: "failed", note, failed_by: by, failed_at: new Date().toISOString(), fixed_at: null })
    .eq("id", id).in("status", ["held", "failed"])
    .select("id, lead_id, user_id, appointment_id, call_record_id, kind, lead:leads(company_name)").maybeSingle();
  if (error) throw error;
  if (!h) return false;
  if (h.appointment_id) {
    const { data: appt } = await admin.from("appointments").update({ qa_status: "failed", qa_by: by, qa_at: new Date().toISOString(), qa_note: note })
      .eq("id", h.appointment_id).eq("qa_status", "pending").select("call_record_id").maybeSingle();
    if (appt?.call_record_id) await admin.from("call_records").update({ qa_result: "Failed", qa_date: new Date().toISOString() }).eq("id", appt.call_record_id);
  }
  if (notify && h.user_id) {
    const company = (Array.isArray(h.lead) ? h.lead[0] : h.lead)?.company_name ?? "a lead";
    const { error: noteError } = await admin.rpc("notify_users", {
      p_recipients: [h.user_id], p_kind: h.kind === "appointment" ? "appointment" : "lead",
      p_title: `Held back by QA: ${company}`, p_body: `${note} Fix it, then mark it fixed on the lead sheet.`,
      p_link: `/leads/${h.lead_id}`, p_rule: "appt_qa", p_batch: null, p_sender: by,
    });
    if (noteError) console.error("[holds] manager not told", h.id, noteError.message);
  }
  return true;
}

/** The manager put it right: it waits again, for the next clearing or an administrator; an appointment, for QA again. */
export async function fixHold(admin, id) {
  const { data: h, error } = await admin.from("delivery_holds")
    .update({ status: "held", fixed_at: new Date().toISOString() })
    .eq("id", id).eq("status", "failed").select("id, appointment_id").maybeSingle();
  if (error) throw error;
  if (h?.appointment_id) {
    await admin.from("appointments").update({ qa_status: "pending", qa_by: null, qa_at: null }).eq("id", h.appointment_id).eq("qa_status", "failed");
  }
  return Boolean(h);
}
