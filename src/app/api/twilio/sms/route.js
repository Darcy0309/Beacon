import { NextResponse } from "next/server";
import { formatDial } from "@/lib/phone";
import { twilioConfig } from "@/lib/server/twilio";
import { twiml, validTwilioSignature } from "@/lib/twilio-voice";
import { publicOrigin } from "@/lib/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { e164, textDigits, textFailure } from "@/lib/texts";

export const dynamic = "force-dynamic";

// Where a text has got to; once at one of these it stays there.
const FINAL = ["delivered", "undelivered", "failed"];

/**
 * Texts on the phone's Twilio number (Nov 2026), as Twilio tells of them (the number's Messaging
 * webhook, which scripts/twilio-setup.mjs sets, and each text's StatusCallback):
 *
 *   (no step)      a text received: kept on the Conversation of the lead whose number it came from,
 *                  and whoever last texted that number is told (else the lead's rep, else the administrators)
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
