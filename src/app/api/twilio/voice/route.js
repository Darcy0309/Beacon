import { after, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { callClock, formatDial, searchDigits } from "@/lib/phone";
import { CALLS_ROLES, phoneSettings, twilioConfig } from "@/lib/server/twilio";
import { callableNumber, identityOf, twiml, userIdOf, validTwilioSignature, xml } from "@/lib/twilio-voice";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCallTranscript } from "@/lib/server/call-transcripts";
import { fullName } from "@/lib/format";

export const dynamic = "force-dynamic";

// How long a call coming in rings the staff before it goes to voicemail (Sean, Nov 2026: 25 seconds was
// too short, a longer ringtone heard only twice). The phone's own limit is longer still (phone.jsx, RING_MS).
const RING_SECONDS = 45;
// Someone whose browser fetched a calling token this recently has the phone open (tokens last 10 minutes).
const PRESENT_MS = 12 * 60 * 1000;
// Twilio rings at most ten browsers at once.
const MAX_RINGS = 10;
// Said first on every call while "Record every call" is on, with its notice (Settings → Call Recording).
const RECORDING_NOTICE = "This call may be recorded.";
const VOICEMAIL_GREETING = "Sorry, no one can take your call right now. Please leave a message after the tone, and we will call you back.";

const say = (text) => `<Say voice="Polly.Joanna">${xml(text)}</Say>`;
const answer = (inner) => new NextResponse(twiml(inner), { headers: { "content-type": "text/xml; charset=utf-8" } });

/**
 * The phone's Twilio line, as Twilio asks what to do with a call (the TwiML
 * App's and the Twilio number's Voice URL; scripts/twilio-setup.mjs sets both):
 *
 *   a call from a browser (From "client:lh_42")   rings the number it asked for, from the Twilio number
 *   a call to the Twilio number                   rings everyone with the phone open, then voicemail
 *   ?step=after   the ring ended: voicemail unless someone answered
 *   ?step=left    a voicemail was left: the administrators are told, with a link to hear it
 *   ?step=status  how a call's leg to one person went (rang, answered, ended, for how long): Call Activity
 *   ?step=transcribed  Twilio's transcript of a voicemail, added to its notification
 *   ?step=recorded     a call recorded with the phone's Record button is ready (&user=, who pressed it):
 *                      kept, and they are told, with a player (app/api/phone/recording asks for this);
 *                      &auto=1, recorded by "Record every call": kept without telling them
 *   ?step=notice       said to the person called as they answer, before the call is put through:
 *                      "This call may be recorded" (Record every call, with its notice)
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
    console.error("[twilio/voice] signature did not match", url);
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  if (params.AccountSid !== config.accountSid) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const admin = createAdminClient();
  const step = here.searchParams.get("step");
  const self = (s) => `${here.pathname}?step=${s}`;
  // Where Twilio tells how each person's leg of a call went (it asks for the whole address): who, which way.
  const statusOf = (dir, userId, leadId = null) =>
    ` statusCallback="${xml(`${publicOrigin(request.headers)}${self("status")}&dir=${dir}&user=${userId}${leadId ? `&lead=${leadId}` : ""}`)}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST"`;

  // A voicemail's words, once Twilio has transcribed them (it can for one up to two minutes long).
  if (step === "notice") return answer(say(RECORDING_NOTICE));
  if (step === "transcribed") {
    const text = String(params.TranscriptionText ?? "").trim();
    if (admin && params.TranscriptionStatus === "completed" && text && /^RE[0-9a-f]{32}$/i.test(params.RecordingSid ?? "")) {
      const { error } = await admin.rpc("phone_voicemail_transcript", { p_recording: params.RecordingSid, p_text: text.slice(0, 4000) });
      if (error) console.error("[twilio/voice] transcript", error.message);
    }
    return new NextResponse(null, { status: 204 });
  }
  if (step === "recorded") {
    await tellOfRecording(admin, params, here.searchParams, publicOrigin(request.headers));
    return new NextResponse(null, { status: 204 });
  }
  if (step === "status") {
    await logLeg(admin, params, here.searchParams);
    return new NextResponse(null, { status: 204 });
  }
  if (step === "after") {
    // The call in, as a whole: answered by someone, or not (Call Activity counts it missed when it rang no one).
    await logLeg(admin, { ...params, CallStatus: params.DialCallStatus === "completed" ? "completed" : "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
    return answer(params.DialCallStatus === "completed" ? "<Hangup/>" : voicemail(self("left"), `${publicOrigin(request.headers)}${self("transcribed")}`));
  }
  if (step === "left") {
    await tellOfVoicemail(admin, params, publicOrigin(request.headers));
    return answer("<Hangup/>");
  }

  // A call from a browser: someone with the phone, still allowed it, to a number Lighthouse may call.
  if (String(params.From).startsWith("client:")) {
    const userId = userIdOf(params.From);
    const { data: caller } = userId && admin ? await admin.from("users").select("role, status").eq("id", userId).maybeSingle() : { data: null };
    if (!caller || !CALLS_ROLES.includes(caller.role) || caller.status !== "active") {
      return answer(`${say("This account cannot make calls.")}<Hangup/>`);
    }
    const to = callableNumber(params.To);
    if (!to) return answer(`${say("This number cannot be called from Lighthouse.")}<Hangup/>`);
    const tones = to.tones ? ` sendDigits="${xml(to.tones)}"` : "";
    // Every call recorded, with its notice: said to them as they answer, before they are put through.
    const { notice } = await phoneSettings(admin);
    const told = notice ? ` url="${xml(`${publicOrigin(request.headers)}${self("notice")}`)}" method="POST"` : "";
    // The lead it is made from (the phone sends it): the call, and its recording, are on that lead alone.
    const leadId = /^[1-9]\d{0,17}$/.test(params.Lead ?? "") ? Number(params.Lead) : null;
    return answer(`<Dial callerId="${xml(config.callerId)}" answerOnBridge="true"><Number${tones}${told}${statusOf("out", userId, leadId)}>${xml(to.number)}</Number></Dial>`);
  }

  // A call to the Twilio number: everyone with the phone open rings (the first to answer takes it), else voicemail.
  const ring = admin ? await presentStaff(admin) : [];
  await logLeg(admin, { ...params, CallStatus: ring.length ? "initiated" : "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
  if (!ring.length) return answer(voicemail(self("left"), `${publicOrigin(request.headers)}${self("transcribed")}`));
  const clients = ring.map((id) => `<Client${statusOf("in", id)}>${xml(identityOf(id))}</Client>`).join("");
  // Every call recorded, with its notice: the caller hears it before it rings.
  const { notice } = await phoneSettings(admin);
  return answer(`${notice ? say(RECORDING_NOTICE) : ""}<Dial timeout="${RING_SECONDS}" answerOnBridge="true" action="${xml(self("after"))}" method="POST">${clients}</Dial>`);
}

/**
 * Call Activity's record of a leg (phone_calls): a person's (?user=) call out or in (?dir=), or with
 * `whole`, a call in itself, no one's, which counts as missed when it rang nobody.
 */
async function logLeg(admin, params, query, { whole = false } = {}) {
  const dir = query.get("dir");
  const user = whole ? null : /^[1-9]\d{0,17}$/.test(query.get("user") ?? "") ? Number(query.get("user")) : null;
  if (!admin || !/^CA[0-9a-f]{32}$/i.test(params.CallSid ?? "") || !["out", "in"].includes(dir) || (!whole && !user)) return;
  const { error } = await admin.rpc("phone_call_event", {
    p_sid: params.CallSid,
    p_parent: whole ? params.CallSid : params.ParentCallSid || null,
    p_user: user,
    p_direction: dir,
    p_number: (dir === "out" ? params.To : params.From) || null,
    p_status: String(params.CallStatus ?? "").slice(0, 20) || "initiated",
    p_duration: Number.parseInt(params.CallDuration, 10) || 0,
    p_lead: /^[1-9]\d{0,17}$/.test(query.get("lead") ?? "") ? Number(query.get("lead")) : null,
  });
  if (error) console.error("[twilio/voice] call activity", error.message);
}

/** The greeting, and up to three minutes of message; # or silence ends it. Twilio writes out its words (`transcribed`, an address). */
function voicemail(action, transcribed) {
  return `${say(VOICEMAIL_GREETING)}<Record maxLength="180" timeout="6" finishOnKey="#" playBeep="true" trim="trim-silence" action="${xml(action)}" method="POST" transcribe="true" transcribeCallback="${xml(transcribed)}"/>${say("We did not get a message. Goodbye.")}<Hangup/>`;
}

/** The staff with the phone open now, the most recently seen first (at most MAX_RINGS). */
async function presentStaff(admin) {
  const { data, error } = await admin
    .from("phone_presence")
    .select("user_id, seen_at, user:users!inner(role, status)")
    .gte("seen_at", new Date(Date.now() - PRESENT_MS).toISOString())
    .in("user.role", CALLS_ROLES)
    .eq("user.status", "active")
    .order("seen_at", { ascending: false })
    .limit(MAX_RINGS);
  if (error) console.error("[twilio/voice] presence", error.message);
  return (data ?? []).map((p) => p.user_id);
}

/**
 * A call recorded and done (Twilio's recording status, completed): kept on phone_recordings, and the
 * person who recorded it told, with the other number, the lead when it is one's, and how long.
 */
async function tellOfRecording(admin, params, query, origin) {
  const sid = params.RecordingSid;
  const secs = Number(params.RecordingDuration) || 0;
  const user = /^[1-9]\d{0,17}$/.test(query.get("user") ?? "") ? Number(query.get("user")) : null;
  if (!admin || params.RecordingStatus !== "completed" || !/^RE[0-9a-f]{32}$/i.test(sid ?? "") || !/^CA[0-9a-f]{32}$/i.test(params.CallSid ?? "") || !user || secs < 1) return;

  // The other end: Call Activity's leg of this call (a call out's leg is the browser's call's child; a call in's, the browser's own).
  const { data: legs } = await admin
    .from("phone_calls")
    .select("number, lead_id")
    .or(`call_sid.eq.${params.CallSid},parent_sid.eq.${params.CallSid}`)
    .not("number", "is", null)
    .not("number", "like", "client:%")
    .order("lead_id", { ascending: true, nullsFirst: false })
    .limit(1);
  const digits = searchDigits(legs?.[0]?.number);
  // The lead the call is on (Sean, Nov 2026: never another lead with the same number); none, nobody's.
  const leadId = legs?.[0]?.lead_id ?? null;
  const { data: lead } = leadId
    ? await admin.from("leads").select("id, company_name, contact_name").is("deleted_at", null).eq("id", leadId).maybeSingle()
    : { data: null };
  const other = digits ? formatDial(digits) : "a caller";
  const body = [
    lead ? `${lead.company_name}${lead.contact_name ? ` · ${lead.contact_name}` : ""}` : null,
    `${callClock(secs * 1000)} long`,
    `Listen: ${origin}/api/phone/recordings/${sid}`,
  ].filter(Boolean).join("\n");
  // Recorded by "Record every call" (&auto=1): kept without a notification (there would be one for every call).
  const quiet = query.get("auto") === "1";
  const { data: fresh, error } = await admin.rpc("phone_recording_saved", {
    p_sid: sid, p_call: params.CallSid, p_user: user, p_number: digits || null, p_seconds: secs, p_lead: lead?.id ?? null,
    p_title: quiet ? null : `Recorded call with ${other}`, p_body: body, p_link: lead ? `/leads/${lead.id}` : null,
  });
  if (error) return console.error("[twilio/voice] call recording", error.message);
  // New: transcribed (Nov 2026), after Twilio has its answer.
  if (fresh) {
    after(async () => {
      const { data: who } = await admin.from("users").select("first_name, last_name").eq("id", user).maybeSingle();
      await startCallTranscript(admin, { recordingSid: sid, callerName: fullName(who) || null });
    });
  }
}

/** A voicemail left: a notification to each administrator (pushed to their desktop too), naming the lead when the number is one's. */
async function tellOfVoicemail(admin, params, origin) {
  const sid = params.RecordingSid;
  const secs = Number(params.RecordingDuration) || 0;
  if (!admin || !/^RE[0-9a-f]{32}$/i.test(sid ?? "") || secs < 1) return;

  const digits = searchDigits(params.From);
  const { data: lead } = digits
    ? await admin.from("leads").select("id, company_name, contact_name").is("deleted_at", null).ilike("search_text", `%${digits}%`).limit(1).maybeSingle()
    : { data: null };
  const from = digits ? formatDial(digits) : params.From || "an unknown number";
  const body = [
    lead ? `${lead.company_name}${lead.contact_name ? ` · ${lead.contact_name}` : ""}` : null,
    `${callClock(secs * 1000)} long`,
    `Listen: ${origin}/api/phone/recordings/${sid}`,
  ].filter(Boolean).join("\n");
  const { error } = await admin.rpc("phone_voicemail_notice", { p_title: `Voicemail from ${from}`, p_body: body, p_link: lead ? `/leads/${lead.id}` : null });
  if (error) console.error("[twilio/voice] voicemail notice", error.message);
}
