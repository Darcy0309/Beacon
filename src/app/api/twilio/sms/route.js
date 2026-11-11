import { NextResponse } from "next/server";
import { formatDial } from "@/lib/phone";
import { twilioConfig } from "@/lib/server/twilio";
import { twiml, validTwilioSignature } from "@/lib/twilio-voice";
import { publicOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { e164, textDigits, textFailure } from "@/lib/texts";
import { APPT_REPLY_MEANS, apptReply } from "@/lib/appointment-texts";
import { apptWhen } from "@/lib/format";

export const dynamic = "force-dynamic";

// Where a text has got to; once at one of these it stays there.
const FINAL = ["delivered", "undelivered", "failed"];

/**
 * Texts on the phone's Twilio number (Nov 2026), as Twilio tells of them (the number's Messaging
 * webhook, which scripts/twilio-setup.mjs sets, and each text's StatusCallback):
 *
 *   (no step)      a text received: kept on the Conversation of the lead whose number it came from,
 *                  and whoever last texted that number is told (else the lead's rep, else the administrators);
 *                  a Y, N or R answering an appointment reminder (Nov 2026) is kept on the reminder and
 *                  its appointment's manager told, to mark it confirmed or call the prospect
 *   ?step=status   how a text sent is going: sent, delivered, or not, and why
 *
 * Only Twilio can ask: every request carries its signature, made with the account's Auth Token.
 */
export async function POST(request) {
  const config = twilioConfig();
  if (!config) return NextResponse.json({ error: "Twilio is not set up on the server" }, { status: 503 });

  let params = {};
  try {
    params = Object.fromEntries([...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    // No form: the signature below fails.
  }
  const here = new URL(request.url);
  const url = `${publicOrigin(request.headers)}${here.pathname}${here.search}`;
  if (!validTwilioSignature(config.authToken, url, params, request.headers.get("x-twilio-signature"))) {
    console.error("[twilio/sms] signature did not match", url);
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (params.AccountSid !== config.accountSid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const admin = createAdminClient();
  const sid = /^(SM|MM)[0-9a-f]{32}$/i.test(params.MessageSid ?? "") ? params.MessageSid : null;

  if (here.searchParams.get("step") === "status") {
    if (admin && sid) {
      const status = String(params.MessageStatus ?? "").slice(0, 20);
      const failed = ["undelivered", "failed"].includes(status);
      const { error } = await admin.from("lead_texts")
        .update({ status, error: failed ? textFailure(params.ErrorCode, params.ErrorMessage) : null, updated_at: new Date().toISOString() })
        .eq("twilio_sid", sid)
        .not("status", "in", `(${FINAL.join(",")})`);
      if (error) console.error("[twilio/sms] status", error.message);
    }
    return new NextResponse(null, { status: 204 });
  }

  if (admin && sid) await keepReply(admin, params, sid);
  // Nothing sent back: the reply is answered from Lighthouse, by a person.
  return new NextResponse(twiml(""), { headers: { "content-type": "text/xml; charset=utf-8" } });
}

/** A text received: on the lead's Conversation, and someone told. Twilio may send it twice; it is kept once. */
async function keepReply(admin, params, sid) {
  const digits = textDigits(params.From);
  const from = digits ? e164(digits) : String(params.From ?? "").slice(0, 40);
  // The conversation it answers: the last text sent to this number, else a lead with the number.
  const { data: last } = digits
    ? await admin.from("lead_texts").select("lead_id, user_id").eq("direction", "out").eq("to_number", from).not("lead_id", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  let lead = null;
  if (last?.lead_id) {
    ({ data: lead } = await admin.from("leads").select("id, company_name, contact_name, assigned_user_id").eq("id", last.lead_id).is("deleted_at", null).maybeSingle());
  }
  if (!lead && digits) {
    ({ data: lead } = await admin.from("leads").select("id, company_name, contact_name, assigned_user_id").is("deleted_at", null)
      .ilike("search_text", `%${digits}%`).order("updated_at", { ascending: false }).limit(1).maybeSingle());
  }

  const media = Math.max(0, Number.parseInt(params.NumMedia, 10) || 0);
  const body = String(params.Body ?? "").slice(0, 1600);
  const { data: kept, error } = await admin.from("lead_texts")
    .upsert({ lead_id: lead?.id ?? null, direction: "in", from_number: from, to_number: String(params.To ?? "").slice(0, 40), body, media, status: "received", twilio_sid: sid },
      { onConflict: "twilio_sid", ignoreDuplicates: true })
    .select("id");
  if (error) return console.error("[twilio/sms] keeping a reply", error.message);
  if (!kept?.length) return; // already kept

  // An answer to an appointment reminder: its manager is told what it means.
  if (lead && (await tellOfApptReply(admin, lead, body))) return;

  // Who is told: whoever last texted the number, else the lead's rep, else the administrators.
  const to = [last?.lead_id === lead?.id ? last?.user_id : null, lead?.assigned_user_id].find(Boolean);
  const { data: person } = to ? await admin.from("users").select("id").eq("id", to).eq("status", "active").maybeSingle() : { data: null };
  let ids = person ? [person.id] : [];
  if (!ids.length) {
    const { data: admins } = await admin.from("users").select("id").eq("role", "admin").eq("status", "active");
    ids = (admins ?? []).map((u) => u.id);
  }
  const who = lead ? `${lead.company_name}${lead.contact_name ? ` · ${lead.contact_name}` : ""}` : formatDial(digits ?? from);
  const said = [body, media ? `(${media} photo${media === 1 ? "" : "s"})` : null].filter(Boolean).join(" ") || "(empty text)";
  const { error: noticeError } = ids.length
    ? await admin.rpc("lead_text_notice", { p_users: ids, p_title: `Text from ${who}`, p_body: said, p_link: lead ? `/leads/${lead.id}?tab=conversation` : null })
    : { error: null };
  if (noticeError) console.error("[twilio/sms] reply notice", noticeError.message);
}

// A reply this long after its reminder is taken as about something else.
const REPLY_WITHIN_MS = 4 * 24 * 60 * 60 * 1000;

/**
 * A Y, N or R answering the lead's latest appointment reminder (Nov 2026): kept on the reminder, and
 * the appointment's manager (whoever follows it up, else who set it; else the administrators) told,
 * to mark it confirmed or call the prospect. True when it was one.
 */
async function tellOfApptReply(admin, lead, body) {
  const answer = apptReply(body);
  if (!answer) return false;
  const since = new Date(Date.now() - REPLY_WITHIN_MS).toISOString();
  const { data: reminder } = await admin.from("appointment_texts")
    .select("appointment_id, appointment:appointments(id, appt_date, appt_time, user_id, follow_up_user_id)")
    .eq("lead_id", lead.id).not("sent_at", "is", null).gte("sent_at", since)
    .order("sent_at", { ascending: false }).limit(1).maybeSingle();
  const appt = Array.isArray(reminder?.appointment) ? reminder.appointment[0] : reminder?.appointment;
  if (!appt) return false;

  const { error } = await admin.from("appointment_texts").update({ reply: answer, replied_at: new Date().toISOString() }).eq("appointment_id", appt.id);
  if (error) console.error("[twilio/sms] appointment reply", error.message);

  const managers = [appt.follow_up_user_id, appt.user_id].filter(Boolean);
  const { data: active } = managers.length ? await admin.from("users").select("id").in("id", managers).eq("status", "active") : { data: [] };
  const manager = managers.find((id) => (active ?? []).some((u) => u.id === id));
  let ids = manager ? [manager] : [];
  if (!ids.length) {
    const { data: admins } = await admin.from("users").select("id").eq("role", "admin").eq("status", "active");
    ids = (admins ?? []).map((u) => u.id);
  }
  const who = lead.contact_name || lead.company_name;
  const { error: noticeError } = ids.length
    ? await admin.rpc("lead_text_notice", {
        p_users: ids,
        p_title: `${who} replied ${answer}: ${APPT_REPLY_MEANS[answer]}`,
        p_body: `${lead.company_name} · appointment ${apptWhen(appt.appt_date, appt.appt_time)}. They texted: "${String(body).trim().slice(0, 200)}"`
          + (answer === "Y" ? " Mark it Confirmed in Lighthouse." : ""),
        p_link: `/leads/${lead.id}?tab=conversation`,
      })
    : { error: null };
  if (noticeError) console.error("[twilio/sms] appointment reply notice", noticeError.message);
  return true;
}
