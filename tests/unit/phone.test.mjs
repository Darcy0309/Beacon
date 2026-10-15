#!/usr/bin/env node
/** Unit tests for the phone: numbers as they are dialed, as they are called, and a call's length. */
import { callClock, dialable, formatDial, numberOfTel, searchDigits, telOf } from "../../src/lib/phone.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("what can be dialed: digits, * and #, a leading +", dialable("(602) 555-0144 ext") === "6025550144" && dialable("+44 20 7946") === "+44207946" && dialable("*67#") === "*67#");
check("a US number grouped as it grows", ["6", "602", "6025", "602555", "6025550", "6025550144"].map(formatDial).join("|") === "6|602|(602) 5|(602) 555|(602) 555-0|(602) 555-0144",
  ["6", "602", "6025", "602555", "6025550", "6025550144"].map(formatDial).join("|"));
check("…its leading 1 kept apart", formatDial("16025550144") === "1 (602) 555-0144");
check("…anything else as typed", formatDial("*67") === "*67" && formatDial("+442079460000") === "+442079460000" && formatDial("123456789012") === "123456789012");
check("called with the US country code", telOf("(602) 555-0144") === "tel:+16025550144" && telOf("16025550144") === "tel:+16025550144" && telOf("*67") === "tel:*67" && telOf("") === null);
check("a Call button's number, its extension left off", numberOfTel("tel:+12142697488,203") === "2142697488" && numberOfTel("tel:+16025550144") === "6025550144");
check("ten digits for a lead search, or none", searchDigits("+1 (602) 555-0144") === "6025550144" && searchDigits("555-0144") === null);
check("a call's length", callClock(7000) === "0:07" && callClock(750000) === "12:30" && callClock(3723000) === "1:02:03" && callClock(-5) === "0:00");

console.log(failures ? `\n${failures} phone check(s) failed.\n` : "\nAll phone checks passed.\n");
process.exit(failures ? 1 : 0);
