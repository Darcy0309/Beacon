#!/usr/bin/env node
/** Unit tests for a recorded call's AI summary (Nov 2026): the transcript as Claude reads it, and its answer as kept. */
import { SUMMARY_SCHEMA, readSummary, transcriptText } from "../../src/lib/call-summary.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const lines = [
  { side: 1, at: 0.6, text: "Hi, this is Sean with Signature Marketing." },
  { side: 2, at: 3.2, text: "Hey Sean, Marco here." },
  { side: 2, at: 65.4, text: "  " },
];
const text = transcriptText(lines, { ours: "Sean Fipps", theirs: "Marco Ruiz" });
check("one line a turn, time and who", text === "0:00 Sean Fipps (our caller): Hi, this is Sean with Signature Marketing.\n0:03 Marco Ruiz (prospect): Hey Sean, Marco here.", text);
check("unnamed: Caller and Contact", transcriptText([{ side: 2, at: 1, text: "Hello?" }]) === "0:01 Contact (prospect): Hello?");
check("nothing said: empty", transcriptText([]) === "" && transcriptText(null) === "");

const ok = readSummary(JSON.stringify({ overview: " Reached Marco. ", points: ["Renews March", "", "With Progressive"], next_step: "Meeting Friday 10 AM" }));
check("its answer kept, trimmed", ok?.overview === "Reached Marco." && ok.points.length === 2 && ok.next_step === "Meeting Friday 10 AM", JSON.stringify(ok));
check("no next step: null", readSummary({ overview: "Voicemail.", points: [], next_step: "" })?.next_step === null);
check("unreadable or empty: null", readSummary("not json") === null && readSummary({ overview: "" }) === null && readSummary(null) === null);
check("at most 8 points", readSummary({ overview: "x", points: Array(12).fill("p"), next_step: "" }).points.length === 8);
check("schema: every field required, nothing else", SUMMARY_SCHEMA.required.length === 3 && SUMMARY_SCHEMA.additionalProperties === false);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\ncall summary: all passed");
