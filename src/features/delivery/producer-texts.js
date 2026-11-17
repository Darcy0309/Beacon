/**
 * Texts to a client's producers (Sean, Nov 2026): as an appointment's email goes to the client (deliverLead),
 * each producer ticked for Texts in Project Info gets a short text from Lighthouse's Twilio number when the
 * appointment is set, confirmed or rescheduled (lib/producer-texts.js says which and what). Each kept in
 * producer_texts, once per producer per call; Twilio then says how it went (app/api/twilio/sms?step=status).
 */

import "server-only";
import { apptDateText } from "@/lib/email-templates";
import { producerTextTo } from "@/lib/project-info";
import { producerTextBody, producerTextKind } from "@/lib/producer-texts";
import { textSender, twilioApi, twilioConfig } from "@/lib/server/twilio";
import { e164, textFailure } from "@/lib/texts";

/**
 * Text the producers about the call's appointment, if it set, moved or confirmed one. `loaded`: loadLeadSheet()'s;
 * `producers`: the Project Info's; `from`: the business's name; `emailed`: the client gets its email too.
 * Returns { sent, failed } (nothing to send: zeros). Without Twilio's keys, nothing is sent or kept.
 */
export async function textProducers(admin, { leadId, callRecordId, loaded, producers, from, origin, emailed = true }) {
  const to = producerTextTo(producers);
  const t = loaded?.texting;
  const kind = t ? producerTextKind(t) : null;
  if (!to.length || !kind) return { sent: 0, failed: 0 };
  const config = twilioConfig();
  if (!config) return { sent: 0, failed: 0 };

  const body = producerTextBody(kind, {
    from, company: loaded.sheet.company, when: apptDateText(t.apptDate), time: t.time,
    contact: t.contact, phone: t.phone, emailed,
  });
  const sender = textSender(config);
  let sent = 0;
  let failed = 0;
  for (const p of to) {
    const number = e164(p.mobile);
    // Kept first, so a delivery run twice (QA sending it again) texts each producer once.
    const { data: row, error: keepError } = await admin.from("producer_texts").insert({
      lead_id: leadId, call_record_id: callRecordId, project_id: loaded.project?.id ?? null, kind, to_number: number,
      to_name: p.name || null, body,
    }).select("id").maybeSingle();
    if (keepError) {
      if (keepError.code !== "23505") console.error("[producer-texts] not kept", leadId, keepError.message);
      continue;
    }
    try {
      const msg = await twilioApi(config, "/Messages.json", {
        method: "POST",
        form: { ...sender.form, To: number, Body: body, ...(origin ? { StatusCallback: `${origin}/api/twilio/sms?step=status` } : {}) },
      });
      await admin.from("producer_texts").update({ twilio_sid: msg.sid, status: msg.status || "queued" }).eq("id", row.id);
      sent += 1;
    } catch (err) {
      await admin.from("producer_texts").update({ status: "failed", error: textFailure(err?.code, err?.message)?.slice(0, 500) ?? null }).eq("id", row.id);
      console.error("[producer-texts] not sent", leadId, number, err?.message ?? err);
      failed += 1;
    }
  }
  return { sent, failed };
}
