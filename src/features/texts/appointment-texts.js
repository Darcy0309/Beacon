/**
 * Appointment reminder texts (client, Nov 2026), from the server: the reminders the database queued
 * (queue_appointment_texts(), the day before at the hour set in Settings) sent from Lighthouse's
 * number, each kept on the lead's Conversation; app/api/appointments/texts asks for it.
 */

import "server-only";
import { fullName } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { textSender, twilioApi, twilioConfig } from "@/lib/server/twilio";
import { apptDateText } from "@/lib/email-templates";
import { apptTextBody, apptTextSettings } from "@/lib/appointment-texts";
import { e164, leadTextNumbers, textFailure } from "@/lib/texts";
import { todayIn } from "@/lib/dates";

const NUMBERS = "phone, contact_name, contact_phone, contact_mobile, decision_maker, dm_phone, dm_mobile, contact2_name, contact2_phone, contact2_mobile";
// One claimed but never finished (the server stopped part way) is tried again after this.
const STALE_MS = 15 * 60 * 1000;

const APPT_SELECT = `id, appt_date, appt_time, rep_name, project_id, set_project_id, invalid_at, deleted_at, status:appointment_statuses(name),
  setter:users!appointments_user_id_fkey(first_name, last_name),
  lead:leads(id, company_name, producer_name, ${NUMBERS}, project:projects!leads_project_id_fkey(contact_name, company:companies(name)))`;

/** The reminder text's settings (Settings › Appointment texts): its wording and clock, and today on it. */
async function reminderSettings(admin) {
  const [{ data: setting }, { data: tzRow }] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "appt_texts").maybeSingle(),
    admin.rpc("business_tz"),
  ]);
  const settings = apptTextSettings(setting?.value, tzRow ?? undefined);
  return { settings, today: todayIn(settings.zone) };
}

/**
 * Text an appointment's reminder (`a`, read with APPT_SELECT) to its lead's mobile, and keep it on the lead's
 * Conversation (`userId`: who sent it by hand; none for the scheduled one). { text_id, error } (error: why not).
 */
async function textReminder(admin, config, a, { settings, today, origin, userId = null }) {
  const lead = one(a?.lead);
  if (!a || !lead) return { error: "The appointment or its lead is gone." };
  if (String(a.appt_date) < today) return { error: "The appointment had passed before the reminder could go." };
  const to = leadTextNumbers(lead)[0];
  if (!to) return { error: "There's no mobile number on the lead to text." };

  const sender = textSender(config);
  const project = one(lead.project);
  const body = apptTextBody(settings.body, {
    first_name: String(lead.contact_name ?? "").trim().split(/\s+/)[0],
    company: lead.company_name,
    client: one(project?.company)?.name,
    agent_name: a.rep_name || lead.producer_name || project?.contact_name,
    appt_date: apptDateText(a.appt_date, today.slice(0, 4)),
    appt_time: a.appt_time,
    my_name: fullName(one(a.setter)),
  });
  const row = { lead_id: lead.id, user_id: userId, appointment_id: a.id, direction: "out", from_number: sender.number, to_number: e164(to.digits), body };
  let message = null;
  let refused = null;
  try {
    message = await twilioApi(config, "/Messages.json", {
      method: "POST",
      form: { ...sender.form, To: e164(to.digits), Body: body, StatusCallback: `${origin}/api/twilio/sms?step=status` },
    });
  } catch (err) {
    refused = textFailure(err?.code, err?.message);
  }
  const { data: kept, error: keepError } = await admin.from("lead_texts")
    .insert(message
      ? { ...row, twilio_sid: message.sid, status: message.status || "queued", from_number: message.from || row.from_number }
      : { ...row, status: "failed", error: refused })
    .select("id").maybeSingle();
  if (keepError) console.error("[appointment-texts] keeping a text", keepError.message);
  return { text_id: kept?.id ?? null, error: message ? null : refused, to: to.digits };
}

/**
 * An appointment's reminder sent now, by hand (Sean, Nov 2026: "an option for managers to send out directly along
 * with the scheduled time … resend to prospects if they ever say they never received the text"). The scheduled one
 * still goes at its time. { error } or { to } (the number texted).
 */
export async function sendReminderNow(admin, appointmentId, { origin, userId }) {
  const config = twilioConfig();
  if (!admin || !config) return { error: "Texting isn't connected yet: the server needs its Twilio keys." };
  const [{ data: a, error }, { settings, today }] = await Promise.all([
    admin.from("appointments").select(APPT_SELECT).eq("id", appointmentId).maybeSingle(),
    reminderSettings(admin),
  ]);
  if (error) return { error: error.message };
  if (!a || a.deleted_at) return { error: "That appointment is gone." };
  if (a.invalid_at || ["Cancelled", "Held", "No Show", "Invalid"].includes(one(a.status)?.name)) {
    return { error: `This appointment is ${String(one(a.status)?.name ?? "invalid").toLowerCase()}, so there's nothing to remind them of.` };
  }
  const { data: texting } = await admin.from("projects").select("id").in("id", [a.project_id, a.set_project_id].filter(Boolean)).eq("appt_texts", true).limit(1);
  if (!texting?.length) return { error: "Appointment reminder texts are off for this project: turn them on in the project's Edit first." };
  const sent = await textReminder(admin, config, a, { settings, today, origin, userId });
  return sent.error ? { error: sent.error } : { to: sent.to };
}

/** Send the reminders waiting. `origin`: the app's address, for Twilio's word on each. { sent, failed }. */
export async function sendAppointmentTexts(admin, origin) {
  const config = twilioConfig();
  if (!admin || !config) return { sent: 0, failed: 0, waiting: true };

  const now = new Date();
  const { data: claimed, error } = await admin.from("appointment_texts")
    .update({ claimed_at: now.toISOString() })
    .is("sent_at", null).is("error", null)
    .or(`claimed_at.is.null,claimed_at.lt.${new Date(now.getTime() - STALE_MS).toISOString()}`)
    .select("appointment_id");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return { sent: 0, failed: 0 };

  const { settings, today } = await reminderSettings(admin);
  const { data: appts, error: apptError } = await admin.from("appointments").select(APPT_SELECT).in("id", claimed.map((c) => c.appointment_id));
  if (apptError) {
    // Left to be tried again (STALE_MS) rather than marked as gone.
    throw new Error(apptError.message);
  }

  let sent = 0;
  let failed = 0;
  for (const c of claimed) {
    const a = (appts ?? []).find((x) => x.id === c.appointment_id);
    const done = await textReminder(admin, config, a, { settings, today, origin });
    await admin.from("appointment_texts").update(done.error
      ? { error: done.error, text_id: done.text_id ?? null }
      : { sent_at: new Date().toISOString(), text_id: done.text_id }).eq("appointment_id", c.appointment_id);
    if (done.error) failed++;
    else sent++;
  }
  return { sent, failed };
}
