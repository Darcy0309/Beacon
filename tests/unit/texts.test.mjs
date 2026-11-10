#!/usr/bin/env node
/** Unit tests for texting a lead (Nov 2026): its numbers, how long a text goes, and Twilio's refusals in words. */
import { e164, leadTextNumbers, textDigits, textFailure, textParts, TEXT_LIMIT } from "../../src/lib/texts.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("ten digits however it was typed", textDigits("(602) 555-0142") === "6025550142" && textDigits("+1 602.555.0142") === "6025550142" && textDigits("16025550142") === "6025550142");
check("…and none for what isn't a US number", textDigits("555-0142") === null && textDigits("") === null && textDigits("1025550142") === null && textDigits(null) === null);
check("as Twilio writes it", e164("6025550142") === "+16025550142" && e164(null) === null);

const numbers = leadTextNumbers({
  phone: "602-555-0100", contact_name: "Dana Reyes", contact_phone: "602-555-0100", contact_mobile: "(480) 555-0111",
  decision_maker: "Sam Lee", dm_mobile: "480-555-0122", contact2_phone: "bad",
});
check("a lead's numbers, mobiles first, each once", JSON.stringify(numbers) === JSON.stringify([
  { digits: "4805550111", label: "Dana Reyes · mobile" },
  { digits: "4805550122", label: "Sam Lee · mobile" },
  { digits: "6025550100", label: "Business phone" },
]), JSON.stringify(numbers));
check("…none when it has none", leadTextNumbers({}).length === 0 && leadTextNumbers(null).length === 0);

check("one text up to 160 plain characters", textParts("a".repeat(160)) === 1 && textParts("a".repeat(161)) === 2 && textParts("") === 0);
check("…70 with an emoji", textParts(`${"a".repeat(69)}🙂`) === 2 && textParts("Thanks 🙂") === 1);
check("the longest allowed", TEXT_LIMIT === 1600 && textParts("a".repeat(1600)) === 11);

check("Twilio's refusals in words", /replied STOP/.test(textFailure(21610)) && /A2P 10DLC/.test(textFailure("30034")) && /isn't a mobile/.test(textFailure(21614)));
check("…an unknown one with Twilio's own message", textFailure(99999, "Something odd") === "Twilio refused it: Something odd" && textFailure() === "The text couldn't be sent.");

console.log(failures ? `\n${failures} texts check(s) failed.\n` : "\nAll texts checks passed.\n");
process.exit(failures ? 1 : 0);
