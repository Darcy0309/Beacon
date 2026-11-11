#!/usr/bin/env node
/** Unit tests for the lead's Conversation as one thread (Nov 2026): calls, texts, logged results and reminders together. */
import { conversationThread } from "../../src/lib/conversation-thread.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const items = [
  { key: "c1", kind: "call", dir: "out", at: "2026-11-10T14:00:00Z", userId: 7 },
  { key: "t1", kind: "text", dir: "out", at: "2026-11-10T14:10:00Z" },
  { key: "c2", kind: "call", dir: "out", at: "2026-11-10T15:00:00Z", userId: 7 },
  { key: "c3", kind: "call", dir: "out", at: "2026-11-10T15:05:00Z", userId: 9 },
];
const log = [
  { id: 1, at: "2026-11-10T14:02:00Z", result: "No answer", notes: null, stage: "DBDev", by: "Sean", userId: 7 },
  { id: 2, at: "2026-11-10T15:03:00Z", result: "Call back", notes: "Ask for Henry", stage: "DBDev", by: "Sean", userId: 7 },
  { id: 3, at: "2026-11-10T20:00:00Z", result: "Appointment", notes: null, stage: "Appt", by: "Sean", userId: 7 },
  { id: 4, reminder: true, at: "2026-11-10T15:04:00Z", by: "Sean", sent: false, forWhen: "11/11 2:00 PM", note: "Ask for Henry" },
  { id: 5, at: "2026-11-10T13:00:00Z", result: "Busy", notes: null, stage: null, by: "Kristy", userId: null },
];
const thread = conversationThread(items, log);
const byKey = Object.fromEntries(thread.map((i) => [i.key, i]));

check("a result goes on the caller's latest call before it", byKey.c1.result?.result === "No answer" && byKey.c2.result?.result === "Call back" && byKey.c2.result?.notes === "Ask for Henry");
check("…never on another caller's call", byKey.c3.result === null);
check("…not one more than two hours after the call: stands by itself", byKey.l3?.kind === "result" && byKey.l3.result === "Appointment");
check("…nor one with no caller", byKey.l5?.kind === "result");
check("a reminder stands by itself", byKey.r4?.kind === "reminder" && byKey.r4.note === "Ask for Henry");
check("oldest first, every item once", thread.map((i) => i.key).join() === "l5,c1,t1,c2,r4,c3,l3", thread.map((i) => i.key).join());
check("the calls handed in are left as they were", items[0].result === undefined);
check("…none from none", conversationThread(null, null).length === 0 && conversationThread([], []).length === 0);

const twice = conversationThread([{ key: "c9", kind: "call", at: "2026-11-10T10:00:00Z", userId: 1 }], [
  { id: 10, at: "2026-11-10T10:01:00Z", result: "No answer", userId: 1 },
  { id: 11, at: "2026-11-10T10:02:00Z", result: "Busy", userId: 1 },
]);
check("one call, one result: a second is kept by itself", twice.find((i) => i.key === "c9").result.result === "No answer" && twice.some((i) => i.key === "l11"));

console.log(failures ? `\n${failures} conversation thread check(s) failed.\n` : "\nAll conversation thread checks passed.\n");
process.exit(failures ? 1 : 0);
