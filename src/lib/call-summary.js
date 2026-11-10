// A recorded call's transcript and summary (client, Nov 2026): Twilio's sentences made into the
// lines the Conversation shows, and what Claude is asked to summarize. Pure, so the server and the
// tests share it.

/** Seconds from the start for a Twilio offset: "12.48", "0:00:12.480", or a number. 0 when unreadable. */
export function offsetSeconds(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  const s = String(value ?? "").trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(s);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/**
 * The transcript as lines, in order: [{ side, at, text }], side 1 ours and 2 theirs (each side of a
 * recorded call is on its own channel), one line for each turn: a side's sentences one after another
 * run together.
 */
export function transcriptLines(sentences) {
  const lines = [];
  for (const s of [...(sentences ?? [])].sort((a, b) => (a.sentence_index ?? 0) - (b.sentence_index ?? 0))) {
    const text = String(s?.transcript ?? "").trim();
    if (!text) continue;
    const side = Number(s.media_channel) === 2 ? 2 : 1;
    const last = lines.at(-1);
    if (last && last.side === side) last.text = `${last.text} ${text}`;
    else lines.push({ side, at: Math.round(offsetSeconds(s.start_time) * 10) / 10, text });
  }
  return lines;
}

/** "m:ss" into the call. */
export const atClock = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const SUMMARY_SYSTEM = `You summarize recorded phone calls for a CRM used by an appointment-setting team that calls businesses about their commercial insurance.
Write the summary in plain text: two to four sentences, no heading, no bullet points, no preamble.
Say who was reached, what was discussed, how the call ended, and any next step agreed (a callback, an appointment, information to send), with the day and time when one was given.
Use only what the transcript says. If it is too short or unclear to summarize, say so in one sentence.
The transcript labels each side; the labels may be imperfect, so rely on what is said when they seem swapped.`;

/** What Claude is asked: the call's facts, then the transcript, side by side. */
export function summaryPrompt({ company, contact, caller, direction, lines }) {
  const ours = caller ? `${caller} (our caller)` : "Our caller";
  const theirs = contact ? `${contact} (the contact)` : "The contact";
  const facts = [
    company ? `Business: ${company}` : null,
    contact ? `Contact on file: ${contact}` : null,
    caller ? `Our caller: ${caller}` : null,
    direction ? `Call: ${direction === "in" ? "they called us" : "we called them"}` : null,
  ].filter(Boolean).join("\n");
  const said = (lines ?? []).map((l) => `[${atClock(l.at)}] ${l.side === 2 ? theirs : ours}: ${l.text}`).join("\n");
  return `${facts}\n\n<transcript>\n${said}\n</transcript>\n\nSummarize this call.`;
}
