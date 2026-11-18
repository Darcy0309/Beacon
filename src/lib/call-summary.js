// A recorded call's AI summary (client, Nov 2026): what Claude is given and what it gives back.
// Pure, so the server and the tests share it.

import { atClock } from "./call-transcript.js";

/** The JSON schema Claude's answer follows (structured outputs). */
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string", description: "Two or three plain sentences: who was reached, what happened, how it ended." },
    points: {
      type: "array",
      items: { type: "string" },
      description: "Up to 6 short facts worth keeping: renewal or X-date, current carrier, what they pay, decision maker, objections, anything promised.",
    },
    next_step: { type: "string", description: "The agreed next step with its day and time if one was set; an empty string if none." },
  },
  required: ["overview", "points", "next_step"],
  additionalProperties: false,
};

const clip = (s, n) => String(s ?? "").trim().slice(0, n);

/** The transcript as text for Claude: one "m:ss Name: words" line per turn. */
export function transcriptText(lines, { ours, theirs } = {}) {
  const us = clip(ours, 80) || "Caller";
  const them = clip(theirs, 80) || "Contact";
  return (lines ?? [])
    .filter((l) => String(l?.text ?? "").trim())
    .map((l) => `${atClock(l.at)} ${l.side === 2 ? `${them} (prospect)` : `${us} (our caller)`}: ${String(l.text).trim()}`)
    .join("\n");
}

/** Claude's answer made safe to keep and show: { overview, points, next_step }, or null if unusable. */
export function readSummary(value) {
  let v = value;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!v || typeof v !== "object") return null;
  const overview = clip(v.overview, 1200);
  if (!overview) return null;
  const points = (Array.isArray(v.points) ? v.points : []).map((p) => clip(p, 300)).filter(Boolean).slice(0, 8);
  const next = clip(v.next_step, 300);
  return { overview, points, next_step: next || null };
}
