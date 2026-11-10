/**
 * A recorded call's transcript (client, Nov 2026), from the server:
 *
 *   startCallTranscript()      a recording done: Twilio's Conversational Intelligence asked to transcribe it
 *   finishCallTranscript()     Twilio says a transcript is ready (app/api/twilio/intelligence), or it is
 *                              looked at again later: its sentences kept as lines
 *   catchUpCallTranscripts()   any left waiting (a webhook missed) looked at again
 *
 * Its key, in the server's environment: TWILIO_INTELLIGENCE_SERVICE_SID, the Intelligence Service
 * (GA…) transcripts are made in (scripts/twilio-setup.mjs makes it); without it, calls aren't transcribed.
 *
 * Every write is the server's own (phone_recordings: service role), and only for recordings it
 * already keeps: what Twilio is asked about is looked up with the account's own login.
 */

import "server-only";
import { twilioConfig } from "@/lib/server/twilio";
import { transcriptLines } from "@/lib/call-transcript";

// Twilio's Intelligence API (TWILIO_INTELLIGENCE_URL only for the tests' stand-in).
const intelligenceUrl = () => (process.env.TWILIO_INTELLIGENCE_URL?.trim() || "https://intelligence.twilio.com").replace(/\/+$/, "");
const serviceSid = () => process.env.TWILIO_INTELLIGENCE_SERVICE_SID?.trim() || null;

async function intelligence(config, path, { method = "GET", form } = {}) {
  const res = await fetch(`${intelligenceUrl()}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.message || `Twilio answered ${res.status}`), { status: res.status, code: data?.code });
  return data;
}

const mark = (admin, recordingSid, fields) =>
  admin.from("phone_recordings").update({ ...fields, transcript_updated_at: new Date().toISOString() }).eq("recording_sid", recordingSid);

/** A recording done: Twilio asked to transcribe it, ours on channel 1 and theirs on 2. Quietly nothing when not set up. */
export async function startCallTranscript(admin, { recordingSid, callerName }) {
  const config = twilioConfig();
  const service = serviceSid();
  if (!admin || !config || !service) return;
  try {
    const t = await intelligence(config, "/v2/Transcripts", {
      method: "POST",
      form: {
        ServiceSid: service,
        CustomerKey: recordingSid,
        Channel: JSON.stringify({
          media_properties: { source_sid: recordingSid },
          participants: [
            { channel_participant: 1, role: "Agent", ...(callerName ? { full_name: callerName } : {}) },
            { channel_participant: 2, role: "Customer" },
          ],
        }),
      },
    });
    await mark(admin, recordingSid, { transcript_status: "transcribing", transcript_sid: t.sid, transcript_error: null });
  } catch (err) {
    console.error("[call-transcripts] not started", err?.message ?? err);
    await mark(admin, recordingSid, { transcript_status: "failed", transcript_error: `The call couldn't be sent for transcribing: ${err?.message ?? "Twilio refused it"}` });
  }
}

/**
 * A transcript Twilio has (or may have) finished: kept as lines. Only one of ours
 * (phone_recordings.transcript_sid), only while 'transcribing'; still in progress, left for later.
 */
export async function finishCallTranscript(admin, transcriptSid) {
  const config = twilioConfig();
  if (!admin || !config || !/^GT[0-9a-f]{32}$/i.test(transcriptSid ?? "")) return;
  const { data: rec } = await admin.from("phone_recordings").select("recording_sid, transcript_status").eq("transcript_sid", transcriptSid).maybeSingle();
  if (!rec || rec.transcript_status !== "transcribing") return;

  let t;
  try {
    t = await intelligence(config, `/v2/Transcripts/${transcriptSid}`);
  } catch (err) {
    return console.error("[call-transcripts] unreadable", err?.message ?? err);
  }
  if (["failed", "canceled", "error"].includes(t.status)) {
    await mark(admin, rec.recording_sid, { transcript_status: "failed", transcript_error: "Twilio couldn't transcribe this call." });
    return;
  }
  if (t.status !== "completed") return; // still at it

  const sentences = [];
  try {
    let next = `/v2/Transcripts/${transcriptSid}/Sentences?PageSize=5000`;
    for (let page = 0; next && page < 5; page++) {
      const data = await intelligence(config, next);
      sentences.push(...(data.sentences ?? []));
      const url = data.meta?.next_page_url;
      next = url ? url.replace(/^https?:\/\/[^/]+/, "") : null;
    }
  } catch (err) {
    return console.error("[call-transcripts] sentences unreadable", err?.message ?? err);
  }

  const lines = transcriptLines(sentences);
  await admin.from("phone_recordings")
    .update({
      transcript_status: "done", transcript: lines, transcript_updated_at: new Date().toISOString(),
      transcript_error: lines.length ? null : "Nothing was said that could be transcribed.",
    })
    .eq("recording_sid", rec.recording_sid).eq("transcript_status", "transcribing");
}

const STALE_MS = 60_000;

/**
 * Transcripts left waiting: Twilio may have finished one without its webhook reaching us. Run after
 * a response (next/server after()). `recordings`: rows with recording_sid, transcript_sid,
 * transcript_status, transcript_updated_at.
 */
export async function catchUpCallTranscripts(admin, recordings) {
  const now = Date.now();
  for (const r of recordings ?? []) {
    if (r.transcript_status !== "transcribing" || !r.transcript_sid) continue;
    if (now - new Date(r.transcript_updated_at ?? 0).getTime() <= STALE_MS) continue;
    await mark(admin, r.recording_sid, { transcript_status: "transcribing" }); // not asked again for another minute
    await finishCallTranscript(admin, r.transcript_sid);
  }
}
