#!/usr/bin/env node
/** Unit tests for the phone lines (Sean, Nov 2026): numbers, extensions, voicemail boxes, the caller ID picked, greeting WAVs. */
import assert from "node:assert/strict";
import { boxParam, defaultPersonalGreeting, e164, extensionDigits, lineNumberLabel, parseBox, pickCallerId, searchLines } from "../../src/lib/phone-lines.js";
import { encodeWav, wavSeconds } from "../../src/lib/wav.js";

// Numbers as Twilio writes them, however they are typed.
assert.equal(e164("(715) 555-0100"), "+17155550100");
assert.equal(e164("1-715-555-0100"), "+17155550100");
assert.equal(e164("+1 715.555.0100"), "+17155550100");
assert.equal(e164("555-0100"), null, "seven digits: no area code");
assert.equal(e164("(115) 555-0100"), null, "no area code starts with 1");
assert.equal(lineNumberLabel("+17155550100"), "(715) 555-0100");

// Extensions: digits, as the user form takes them.
assert.equal(extensionDigits(" 203 "), "203");
assert.equal(extensionDigits("x203"), null);
assert.equal(extensionDigits(""), null);

// A voicemail box travels in the webhook's address and back.
for (const box of [{ kind: "user", id: 42 }, { kind: "line", id: 7 }, { kind: "general", id: null }]) {
  assert.deepEqual(parseBox(boxParam(box)), box);
}
assert.equal(parseBox("user-0"), null);
assert.equal(parseBox("user:2"), null, "no colon: it must sign as Twilio asks");
assert.equal(parseBox("user-abc"), null);
assert.equal(parseBox(null), null);
assert.match(defaultPersonalGreeting("Jen"), /^You've reached Jen\. /);
assert.match(defaultPersonalGreeting(""), /^You've reached my line\. /);

// The caller ID a call goes out with (Sean: a local one, wherever they're calling).
const lines = [
  { number: "+17155550100", kind: "local", area_code: "715" },
  { number: "+16125550100", kind: "local", area_code: "612" },
  { number: "+18885550100", kind: "attendant", area_code: "888" },
];
const fallback = "+16025550199";
assert.deepEqual(pickCallerId({ lines, areaCode: "715", fallback }), { number: "+17155550100", how: "project" }, "the project's area code");
assert.deepEqual(pickCallerId({ lines, areaCode: "414", fallback }), { number: fallback, how: "default" }, "no local line there: the company's number");
assert.deepEqual(pickCallerId({ lines, requested: "(612) 555-0100", areaCode: "715", fallback }), { number: "+16125550100", how: "chosen" }, "one picked wins");
assert.deepEqual(pickCallerId({ lines, requested: "+13125550100", areaCode: "715", fallback }), { number: "+17155550100", how: "project" }, "a number not ours is never used");
assert.deepEqual(pickCallerId({ lines, requested: fallback, fallback }), { number: fallback, how: "chosen" });
assert.deepEqual(pickCallerId({ lines: [{ ...lines[2] }], areaCode: "888", fallback }), { number: fallback, how: "default" }, "only local lines are picked by area code");

// The phone's search: an area code, digits, or a label.
const labelled = [{ number: "+17155550100", label: "Eau Claire, WI" }, { number: "+16125550100", label: "Minneapolis" }];
assert.deepEqual(searchLines(labelled, "715").map((l) => l.number), ["+17155550100"]);
assert.deepEqual(searchLines(labelled, "minne").map((l) => l.number), ["+16125550100"]);
assert.equal(searchLines(labelled, "").length, 2);

// A greeting recorded in the browser, as a WAV Twilio can play: 16-bit mono at 16 kHz.
const second = new Float32Array(48000).map((_, i) => Math.sin(i / 10) * 0.5);
const wav = encodeWav([second.subarray(0, 24000), second.subarray(24000)], 48000);
const view = new DataView(wav);
assert.equal(String.fromCharCode(...new Uint8Array(wav, 0, 4)), "RIFF");
assert.equal(String.fromCharCode(...new Uint8Array(wav, 8, 4)), "WAVE");
assert.equal(view.getUint16(22, true), 1, "mono");
assert.equal(view.getUint32(24, true), 16000, "16 kHz");
assert.equal(view.getUint16(34, true), 16, "16-bit");
assert.equal(wavSeconds(wav), 1, "a second in, a second out");
assert.equal(wav.byteLength, 44 + 16000 * 2);

console.log("phone-lines: ok");
