#!/usr/bin/env node
/** Unit tests for a recorded call's transcript (Nov 2026): Twilio's sentences as the lines the Conversation shows. */
import { atClock, offsetSeconds, transcriptLines } from "../../src/lib/call-transcript.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("Twilio's offsets as seconds", offsetSeconds("12.48") === 12.48 && offsetSeconds("0:01:05.5") === 65.5 && offsetSeconds("1:02") === 62 && offsetSeconds(3) === 3 && offsetSeconds("") === 0 && offsetSeconds(null) === 0);
check("m:ss into the call", atClock(0) === "0:00" && atClock(65.9) === "1:05" && atClock(-3) === "0:00");

const lines = transcriptLines([
  { sentence_index: 2, media_channel: 2, start_time: "4.1", transcript: "This is Marco." },
  { sentence_index: 0, media_channel: 1, start_time: "0.5", transcript: "Hi, it's Sean from Signature." },
  { sentence_index: 1, media_channel: 1, start_time: "2.2", transcript: "Is this the owner?" },
  { sentence_index: 3, media_channel: 2, start_time: "6", transcript: "  " },
  { sentence_index: 4, media_channel: 2, start_time: "7", transcript: "Sure, Friday works." },
]);
check("in order, one line a turn, empty sentences dropped", JSON.stringify(lines) === JSON.stringify([
  { side: 1, at: 0.5, text: "Hi, it's Sean from Signature. Is this the owner?" },
  { side: 2, at: 4.1, text: "This is Marco. Sure, Friday works." },
]), JSON.stringify(lines));
check("…none from none", transcriptLines([]).length === 0 && transcriptLines(null).length === 0);

console.log(failures ? `\n${failures} call transcript check(s) failed.\n` : "\nAll call transcript checks passed.\n");
process.exit(failures ? 1 : 0);
