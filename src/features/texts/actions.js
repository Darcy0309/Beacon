"use server";

/** Texting a lead's contact from its lead sheet's Conversation (Nov 2026). */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { check, currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { CALLS_ROLES, textSender, twilioApi, twilioConfig } from "@/lib/server/twilio";
import { publicOrigin } from "@/lib/origin";
import { TEXTS_PER_HOUR, e164, leadTextNumbers, textDigits, textFailure } from "@/lib/texts";
import { schemas } from "@/lib/validate";

/**
 * Send a text to one of a lead's numbers, from the phone's Twilio number. Only staff who may work
 * the name (can_work_lead()), at most TEXTS_PER_HOUR an hour each. Kept on the lead's Conversation
 * sent or not; Twilio then says how it went (app/api/twilio/sms?step=status).
 */
export async function sendLeadText(prevState, formData) {
  formData.set("body", String(formData.get("body") ?? "").replace(/\r\n?/g, "\n"));
  const { values, failed } = check(formData, schemas.leadText);
  if (failed) return failed;
  const leadId = Number(values.lead_id);
  const body = values.body.trim();
  if (!body) return fail("Write the text first", { body: "Write the text first" }, values);

  const supabase = await createClient();
  const [me, { data: allowed, error }, { data: lead }] = await Promise.all([
    currentAppUser(supabase),
    supabase.rpc("can_work_lead", { p_lead_id: leadId }),
    supabase.from("leads").select("id, phone, contact_name, contact_phone, contact_mobile, decision_maker, dm_phone, dm_mobile, contact2_name, contact2_phone, contact2_mobile").eq("id", leadId).maybeSingle(),
  ]);
  if (error) return fail(error, null, values);
  if (!me || !CALLS_ROLES.includes(me.role) || !allowed || !lead) return fail("This name is not on your call list, so you can't text it.", null, values);

  // Only one of the lead's own numbers.
  const digits = textDigits(values.to);
  if (!digits || !leadTextNumbers(lead).some((n) => n.digits === digits)) {
    return fail("Text one of the numbers on this lead.", { to: "Not one of this lead's numbers" }, values);
  }

  const config = twilioConfig();
  if (!config) return fail("Texting isn't connected yet: the server needs its Twilio keys.", null, values);
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE, null, values);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin.from("lead_texts").select("id", { count: "exact", head: true })
    .eq("user_id", me.id).eq("direction", "out").gte("created_at", hourAgo);
  if (countError) return fail(countError, null, values);
  if (count >= TEXTS_PER_HOUR) return fail(`You've sent ${TEXTS_PER_HOUR} texts in the last hour, the most allowed. Try again a little later.`, null, values);

  const sender = textSender(config);
  const row = { lead_id: leadId, user_id: me.id, direction: "out", from_number: sender.number, to_number: e164(digits), body };
  let sent = null;
  let refused = null;
  try {
    sent = await twilioApi(config, "/Messages.json", {
      method: "POST",
      form: { ...sender.form, To: e164(digits), Body: body, StatusCallback: `${publicOrigin(await headers())}/api/twilio/sms?step=status` },
    });
  } catch (err) {
    refused = textFailure(err?.code, err?.message);
  }

  const { error: saveError } = await admin.from("lead_texts").insert(
    sent
      ? { ...row, twilio_sid: sent.sid, status: sent.status || "queued", from_number: sent.from || row.from_number }
      : { ...row, status: "failed", error: refused }
  );
  if (saveError) console.error("[texts] keeping a text", saveError.message);
  await logActivity(supabase, sent ? "lead.text" : "lead.text_failed", { entity: "lead", entityId: leadId, detail: `To ${e164(digits)}`, userId: me.id });
  revalidatePath(`/leads/${leadId}`);
  if (!sent) return fail(refused, null, values);
  return ok({ to: e164(digits) });
}
