#!/usr/bin/env node
/** The Call Log's addresses and filters (Sean, Nov 2026). */
import assert from "node:assert/strict";
import { callLogHref, callNumberDigits, readCallKind, readCallUser, talkClock } from "../../src/lib/call-log.js";

assert.equal(talkClock(95), "0:01:35");
assert.equal(talkClock(5340), "1:29:00");

assert.equal(readCallUser("12"), 12);
assert.equal(readCallUser("none"), "none");
assert.equal(readCallUser("x"), null);
assert.equal(readCallKind("missed"), "missed");
assert.equal(readCallKind("drop table"), null);

// Any form of a number; a leading 1 dropped; too short to search: none.
assert.equal(callNumberDigits("(602) 555-0100"), "6025550100");
assert.equal(callNumberDigits("+1 602 555 0100"), "6025550100");
assert.equal(callNumberDigits("0100"), "0100");
assert.equal(callNumberDigits("55"), null);

assert.equal(callLogHref({ user: 4, kind: "out_handled", from: "2026-11-17", to: "2026-11-17" }), "/reports/calls?user=4&kind=out_handled&from=2026-11-17&to=2026-11-17");
assert.equal(callLogHref({ user: "none", all: true, from: "2026-11-17" }), "/reports/calls?user=none&range=all");
assert.equal(callLogHref({ q: "0100", page: 2 }), "/reports/calls?q=0100&page=2");
assert.equal(callLogHref(), "/reports/calls");

console.log("call log: ok");
