// A recorded call's transcript (client, Nov 2026): Twilio's sentences made into the lines the
// Conversation shows. Pure, so the server and the tests share it.

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
