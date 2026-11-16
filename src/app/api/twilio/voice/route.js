import { after, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { callClock, formatDial, searchDigits } from "@/lib/phone";
import { CALLS_ROLES, phoneSettings, twilioConfig } from "@/lib/server/twilio";
import { callableNumber, identityOf, twiml, userIdOf, validTwilioSignature, xml } from "@/lib/twilio-voice";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCallTranscript } from "@/lib/server/call-transcripts";
import { fullName } from "@/lib/format";
import { DEFAULT_VOICEMAIL_GREETING, VOICE, boxParam, parseBox } from "@/lib/phone-lines";
import { boxPeople, callerIdFor, greetingFor, lastCaller, lineOf, lineSettings, staffByExtension } from "@/lib/server/phone-lines";

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
// Said in the AI voice (Sean, Nov 2026: "Would it be an AI voice? If so, that would be cool").
const say = (text) => `<Say voice="${VOICE}">${xml(text)}</Say>`;
const play = (url) => `<Play>${xml(url)}</Play>`;
// A manager's extension rings them this long before their voicemail.
const EXTENSION_RING_SECONDS = 30;
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
  // Whose voicemail the call is for (Sean, Nov 2026): a manager's, a line's, the general one; none, the admins'.
  const box = parseBox(here.searchParams.get("box"));
  const boxed = (s, b = box) => `${self(s)}${b ? `&box=${boxParam(b)}` : ""}`;
  const toVoicemail = async (b) => answer(await voicemail(admin, b, boxed("left", b), `${publicOrigin(request.headers)}${self("transcribed")}`));
  if (step === "after") {
    // The call in, as a whole: answered by someone, or not (Call Activity counts it missed when it rang no one).
    await logLeg(admin, { ...params, CallStatus: params.DialCallStatus === "completed" ? "completed" : "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
    return params.DialCallStatus === "completed" ? answer("<Hangup/>") : toVoicemail(box);
  }
  if (step === "left") {
    await tellOfVoicemail(admin, params, publicOrigin(request.headers), box);
    return answer("<Hangup/>");
  }

  /** Ring these people where they have the phone open; nobody there (or nobody to ring), the box's voicemail. */
  const ringThem = async (ids, b, seconds = RING_SECONDS) => {
    const ring = admin && ids.length ? (await presentStaff(admin)).filter((id) => ids.includes(id)) : [];
    await logLeg(admin, { ...params, CallStatus: ring.length ? "initiated" : "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
    if (!ring.length) return toVoicemail(b);
    const clients = ring.map((id) => `<Client${statusOf("in", id)}>${xml(identityOf(id))}</Client>`).join("");
    const { notice } = await phoneSettings(admin);
    return answer(`${notice ? say(RECORDING_NOTICE) : ""}<Dial timeout="${seconds}" answerOnBridge="true" action="${xml(boxed("after", b))}" method="POST">${clients}</Dial>`);
  };
  /** The managers' line: its greeting, waiting for an extension (# or a pause ends it). `again`: said after a wrong one. */
  const attendant = async (again = "") => {
    const { attendantGreeting } = await lineSettings(admin);
    // Call Activity has the call from its start; an extension's ring, or the general voicemail, says how it went.
    if (!again) await logLeg(admin, { ...params, CallStatus: "initiated", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
    const next = `${self("ext")}${again ? "&try=2" : ""}`;
    return answer(`<Gather input="dtmf" timeout="5" finishOnKey="#" actionOnEmptyResult="true" action="${xml(next)}" method="POST">${again ? say(again) : ""}${say(attendantGreeting)}</Gather>`);
  };
  if (step === "ext") {
    // An extension dialed: that manager rings, then their voicemail. None: the general voicemail. A wrong one: once more.
    const digits = String(params.Digits ?? "").replace(/\D/g, "");
    const general = async () => {
      await logLeg(admin, { ...params, CallStatus: "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
      return toVoicemail({ kind: "general", id: null });
    };
    if (!digits) return general();
    const who = await staffByExtension(admin, digits);
    if (who) return ringThem([who], { kind: "user", id: who }, EXTENSION_RING_SECONDS);
    if (here.searchParams.get("try") !== "2") return attendant("Sorry, that extension is not in service.");
    return general();
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
    // The caller ID (Sean, Nov 2026): the one picked in the phone, else the local line in the project's area code.
    const from = await callerIdFor(admin, { requested: params.CallerId, leadId, fallback: config.callerId });
    return answer(`<Dial callerId="${xml(from.number)}" answerOnBridge="true"><Number${tones}${told}${statusOf("out", userId, leadId)}>${xml(to.number)}</Number></Dial>`);
  }

  // A call to one of the lines (Sean, Nov 2026): the managers' line answers with its greeting; a line for chosen
  // people rings them; a local caller ID called back rings the manager who last called that number (else the greeting).
  const line = await lineOf(admin, params.To);
  if (line?.kind === "attendant") return attendant();
  if (line?.kind === "main") return ringThem(line.ring_user_ids ?? [], { kind: "line", id: line.id });
  if (line?.kind === "local") {
    const last = await lastCaller(admin, params.From);
    return last ? ringThem([last], { kind: "user", id: last }) : attendant();
  }

  // A number not listed (the one Twilio number before the lines): everyone with the phone open rings, else voicemail.
  const ring = admin ? await presentStaff(admin) : [];
  await logLeg(admin, { ...params, CallStatus: ring.length ? "initiated" : "no-answer", CallDuration: "0" }, new URLSearchParams("dir=in"), { whole: true });
  if (!ring.length) return toVoicemail(null);
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

/**
 * A box's greeting (a manager's own, recorded or in the AI voice; else the usual one), and up to three minutes of
 * message; # or silence ends it. Twilio writes out its words (`transcribed`, an address).
 */
async function voicemail(admin, box, action, transcribed) {
  const greeting = await greetingFor(admin, box, { say, play, fallback: DEFAULT_VOICEMAIL_GREETING });
  return `${greeting}<Record maxLength="180" timeout="6" finishOnKey="#" playBeep="true" trim="trim-silence" action="${xml(action)}" method="POST" transcribe="true" transcribeCallback="${xml(transcribed)}"/>${say("We did not get a message. Goodbye.")}<Hangup/>`;
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

/**
 * A voicemail left: a notification (pushed to their desktop too) to its box's people (Sean, Nov 2026: a manager's
 * own; the general voicemail's 1-2 people, "the voicemails have been coming to my inbox… which I don't want
 * anymore"; a line's), who may play it; else each administrator. It names the lead when the number is one's.
 */
async function tellOfVoicemail(admin, params, origin, box = null) {
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
  const title = `${box?.kind === "general" ? "General voicemail" : "Voicemail"} from ${from}`;
  const { error } = await admin.rpc("phone_voicemail_notice_to", {
    p_users: await boxPeople(admin, box), p_sid: sid, p_title: title, p_body: body, p_link: lead ? `/leads/${lead.id}` : null,
  });
  if (error) console.error("[twilio/voice] voicemail notice", error.message);
}
