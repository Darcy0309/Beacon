#!/usr/bin/env node
/** Unit tests for a voicemail's notification, read back for its card: who, how long, the recording, the lead, the transcript. */
import { callRecordingOf, notificationText, recordingOf, voicemailOf } from "../../src/features/notifications/voicemail.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const SID = "RE2cc368aeafc1b5066c7f427b2df079b0";
const listen = `Listen: https://beacon-rosy-eta.vercel.app/api/phone/recordings/${SID}`;

const plain = voicemailOf({ title: "Voicemail from (657) 297-0941", body: `0:06 long\n${listen}` });
check("one as Lighthouse writes it today: who, the recording, how long", plain?.from === "(657) 297-0941" && plain.recordingSid === SID && plain.seconds === 6 && plain.lead === null && plain.transcript === null, JSON.stringify(plain));

const full = voicemailOf({ title: "Voicemail from (480) 555-0101", body: `Delta Door · Dana Reyes\n1:02:03 long\n${listen}\nTranscript: Hi, it's Dana.\nCall me back.` });
check("…with its lead, an hour's length, and its transcript over two lines",
  full?.lead === "Delta Door · Dana Reyes" && full.seconds === 3723 && full.transcript === "Hi, it's Dana.\nCall me back.", JSON.stringify(full));

check("not a voicemail: another notice, or one with no recording", voicemailOf({ title: "Account notice", body: listen }) === null &&
  voicemailOf({ title: "Voicemail from (480) 555-0101", body: "0:06 long" }) === null && voicemailOf(null) === null);

const shown = notificationText({ title: "Voicemail from (510) 831-0107", body: `0:06 long\n${listen}` });
check("it reads as the call missed, without the recording's address", shown.title === "You missed a call from (510) 831-0107" && shown.body === "Left a voicemail · 0:06", JSON.stringify(shown));
check("…naming the lead when it is one's", notificationText({ title: "Voicemail from (480) 555-0101", body: `Delta Door · Dana Reyes\n1:15 long\n${listen}` }).body === "Left a voicemail · 1:15 · Delta Door · Dana Reyes");
check("any other notification reads as it is", JSON.stringify(notificationText({ title: "New lead", body: "Delta Door" })) === JSON.stringify({ title: "New lead", body: "Delta Door" }));

// A call recorded with the phone's Record button (Nov 2026), told to whoever recorded it.
const rec = { title: "Recorded call with (510) 831-0107", body: `Delta Door · Dana Reyes\n0:42 long\n${listen}` };
const r = callRecordingOf(rec);
check("a recorded call: the other number, the recording, how long, the lead", r?.from === "(510) 831-0107" && r.recordingSid === SID && r.seconds === 42 && r.lead === "Delta Door · Dana Reyes", JSON.stringify(r));
check("…not a voicemail, and a voicemail not a recorded call", voicemailOf(rec) === null && callRecordingOf({ title: "Voicemail from (657) 297-0941", body: `0:06 long\n${listen}` }) === null);
check("either, saying which", recordingOf(rec)?.kind === "recording" && recordingOf({ title: "Voicemail from (657) 297-0941", body: `0:06 long\n${listen}` })?.kind === "voicemail" && recordingOf({ title: "New lead", body: "x" }) === null);
const recShown = notificationText(rec);
check("it reads as the call recorded, without the recording's address", recShown.title === "Your call with (510) 831-0107 was recorded" && recShown.body === "Recording ready to play · 0:42 · Delta Door · Dana Reyes", JSON.stringify(recShown));
check("…a number with no lead", notificationText({ title: "Recorded call with (657) 297-0941", body: `0:05 long\n${listen}` }).body === "Recording ready to play · 0:05");

console.log(failures ? `\n${failures} voicemail check(s) failed.\n` : "\nAll voicemail checks passed.\n");
process.exit(failures ? 1 : 0);
