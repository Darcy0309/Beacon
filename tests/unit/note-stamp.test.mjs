#!/usr/bin/env node
/** Unit tests for the stamp at the start of each new note line, and the trail it keeps. */
import { dropEmptyLine, noteStamp, withNewLine } from "../../src/lib/note-stamp.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const stamp = noteStamp({ username: "SeanF" }, "America/Phoenix");
check("the stamp: the day and who, “10/8/26 seanf:”", /^\d{1,2}\/\d{1,2}\/\d{2} seanf:$/.test(stamp), stamp);
check("…the name from first name and last initial when there is no username", noteStamp({ first_name: "Mike", last_name: "Preston" }, "UTC").endsWith(" mikep:"));
check("an empty box starts with the stamp", withNewLine("", stamp) === `${stamp} `);
const trail = "10/6/26 seanf: Appt set with Daniel – Tue 10am";
check("one with notes keeps them and starts a new stamped line under them", withNewLine(`${trail}\n\n`, stamp) === `${trail}\n${stamp} `);
check("a new line left empty goes", dropEmptyLine(`${trail}\n${stamp} `, stamp) === trail && dropEmptyLine(`${stamp}  `, stamp) === "");
check("…one written in stays", dropEmptyLine(`${trail}\n${stamp} Moved to Thu 2pm`, stamp) === `${trail}\n${stamp} Moved to Thu 2pm`);
check("…and an older line with the same stamp is never touched", dropEmptyLine(`${stamp} first\n${stamp} `, stamp) === `${stamp} first`);

console.log(failures ? `\n${failures} note stamp check(s) failed.\n` : "\nAll note stamp checks passed.\n");
process.exit(failures ? 1 : 0);
