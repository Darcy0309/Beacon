/**
 * A recorded call's transcript and summary (client, Nov 2026), from the server:
 *
 *   startCallTranscript()   a recording done: Twilio's Conversational Intelligence asked to transcribe it
 *   finishCallTranscript()  Twilio says a transcript is ready (app/api/twilio/intelligence), or it is
 *                           looked at again later: its sentences kept, then summarized
 *   summarizeCall()         Claude writes a few sentences about the call
 *   catchUpCallAi()         any left waiting (a webhook missed, a summary cut short) tried again
 *
 * Its keys, in the server's environment:
 *   TWILIO_INTELLIGENCE_SERVICE_SID   the Intelligence Service (GA…) transcripts are made in
 *                                     (scripts/twilio-setup.mjs makes it); without it, calls aren't transcribed
 *   ANTHROPIC_API_KEY                 Claude, for the summary; without it, a transcript only
 *
 * Every write is the server's own (phone_recordings: service role), and only for recordings it
 * already keeps: what Twilio is asked about is looked up with the account's own login.
 */

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { twilioConfig } from "@/lib/server/twilio";
import { SUMMARY_SYSTEM, summaryPrompt, transcriptLines } from "@/lib/call-summary";
import { fullName } from "@/lib/format";

const SUMMARY_MODEL = "claude-opus-5-5";
// Twilio's Intelligence API (TWILIO_INTELLIGENCE_URL only for the tests' stand-in).
const intelligenceUrl = () => (process.env.TWILIO_INTELLIGENCE_URL?.trim() || "https://intelligence.twilio.com").replace(/\/+$/, "");
const serviceSid = () => process.env.TWILIO_INTELLIGENCE_SERVICE_SID?.trim() || null;

/** Whether recorded calls are transcribed (Twilio and its Intelligence Service set up). */
export const transcribes = () => Boolean(twilioConfig() && serviceSid());

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
  admin.from("phone_recordings").update({ ...fields, ai_updated_at: new Date().toISOString() }).eq("recording_sid", recordingSid);

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
    await mark(admin, recordingSid, { ai_status: "transcribing", transcript_sid: t.sid, ai_error: null });
  } catch (err) {
    console.error("[call-ai] transcript not started", err?.message ?? err);
    await mark(admin, recordingSid, { ai_status: "failed", ai_error: `The call couldn't be sent for transcribing: ${err?.message ?? "Twilio refused it"}` });
  }
}

/**
 * A transcript Twilio has (or may have) finished: kept as lines, then summarized. Only one of ours
 * (phone_recordings.transcript_sid), only once (claimed from 'transcribing'); still in progress, left for later.
 */
export async function finishCallTranscript(admin, transcriptSid) {
  const config = twilioConfig();
  if (!admin || !config || !/^GT[0-9a-f]{32}$/i.test(transcriptSid ?? "")) return;
  const { data: rec } = await admin.from("phone_recordings").select("recording_sid, ai_status").eq("transcript_sid", transcriptSid).maybeSingle();
  if (!rec || rec.ai_status !== "transcribing") return;

  let t;
  try {
    t = await intelligence(config, `/v2/Transcripts/${transcriptSid}`);
  } catch (err) {
    return console.error("[call-ai] transcript unreadable", err?.message ?? err);
  }
  if (["failed", "canceled", "error"].includes(t.status)) {
    await mark(admin, rec.recording_sid, { ai_status: "failed", ai_error: "Twilio couldn't transcribe this call." });
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
    return console.error("[call-ai] sentences unreadable", err?.message ?? err);
  }

  // Claimed: whoever moves it off 'transcribing' first keeps and summarizes it.
  const { data: claimed } = await admin.from("phone_recordings")
    .update({ ai_status: "summarizing", transcript: transcriptLines(sentences), ai_error: null, ai_updated_at: new Date().toISOString() })
    .eq("recording_sid", rec.recording_sid).eq("ai_status", "transcribing").select("recording_sid");
  if (claimed?.length) await summarizeCall(admin, rec.recording_sid);
}

/** Claude's summary of a transcribed call: a few sentences, kept with it. Without a key, the transcript stands alone. */
export async function summarizeCall(admin, recordingSid) {
  const { data: rec } = await admin.from("phone_recordings").select("recording_sid, call_sid, user_id, lead_id, transcript").eq("recording_sid", recordingSid).maybeSingle();
  if (!rec) return;
  const lines = Array.isArray(rec.transcript) ? rec.transcript : [];
  if (!lines.length) return mark(admin, recordingSid, { ai_status: "done", summary: null, ai_error: "Nothing was said that could be transcribed." });
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return mark(admin, recordingSid, { ai_status: "done", summary: null });

  const [{ data: lead }, { data: user }, { data: leg }] = await Promise.all([
    rec.lead_id ? admin.from("leads").select("company_name, contact_name").eq("id", rec.lead_id).maybeSingle() : { data: null },
    rec.user_id ? admin.from("users").select("first_name, last_name").eq("id", rec.user_id).maybeSingle() : { data: null },
    admin.from("phone_calls").select("direction").or(`call_sid.eq.${rec.call_sid},parent_sid.eq.${rec.call_sid}`).limit(1).maybeSingle(),
  ]);

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 16000,
      // A summary of a call is simple work: low effort keeps it quick and inexpensive.
      output_config: { effort: "low" },
      // Declined by a safety check: the same request goes to the model Anthropic picks for it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SUMMARY_SYSTEM,
      messages: [{
        role: "user",
        content: summaryPrompt({ company: lead?.company_name, contact: lead?.contact_name, caller: fullName(user) || null, direction: leg?.direction, lines }),
      }],
    });
    if (response.stop_reason === "refusal") {
      await mark(admin, recordingSid, { ai_status: "done", summary: null, ai_error: "No summary for this call." });
      return;
    }
    const summary = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    await mark(admin, recordingSid, { ai_status: "done", summary: summary || null, ai_error: summary ? null : "No summary for this call." });
  } catch (err) {
    const why = err instanceof Anthropic.AuthenticationError ? "the server's Claude key was refused"
      : err instanceof Anthropic.RateLimitError ? "Claude is busy; it's tried again later"
      : err instanceof Anthropic.APIError ? `Claude answered ${err.status ?? "with an error"}`
      : "Claude couldn't be reached";
    console.error("[call-ai] summary", err?.message ?? err);
    // Busy or unreachable: left 'summarizing', so catchUpCallAi() tries again; refused for good: said so.
    if (err instanceof Anthropic.RateLimitError || !(err instanceof Anthropic.APIError) || (err.status ?? 0) >= 500) return;
    await mark(admin, recordingSid, { ai_status: "done", summary: null, ai_error: `No summary: ${why}.` });
  }
}

const STALE_TRANSCRIPT_MS = 60_000;
const STALE_SUMMARY_MS = 3 * 60_000;

/**
 * Recordings left waiting: a transcript Twilio may have finished without its webhook reaching us,
 * a summary cut short (Claude busy, the server stopped). Run after a response (next/server after()).
 * `recordings`: rows with recording_sid, transcript_sid, ai_status, ai_updated_at.
 */
export async function catchUpCallAi(admin, recordings) {
  const now = Date.now();
  for (const r of recordings ?? []) {
    const age = now - new Date(r.ai_updated_at ?? 0).getTime();
    if (r.ai_status === "transcribing" && r.transcript_sid && age > STALE_TRANSCRIPT_MS) {
      await mark(admin, r.recording_sid, { ai_status: "transcribing" }); // not asked again for another minute
      await finishCallTranscript(admin, r.transcript_sid);
    } else if (r.ai_status === "summarizing" && age > STALE_SUMMARY_MS) {
      const { data: claimed } = await admin.from("phone_recordings").update({ ai_updated_at: new Date().toISOString() })
        .eq("recording_sid", r.recording_sid).eq("ai_status", "summarizing").lt("ai_updated_at", new Date(now - STALE_SUMMARY_MS).toISOString()).select("recording_sid");
      if (claimed?.length) await summarizeCall(admin, r.recording_sid);
    }
  }
}
