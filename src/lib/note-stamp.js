// The date and who at the start of each new note line ("10/8/26 seanf: "),
// so a lead's notes read as a trail of who wrote what, when. Pure, for the
// note boxes and the tests.

import { todayIn, todayIso } from "./dates.js";

/**
 * "10/8/26 seanf:" — the day is the business's (`timeZone`), the name the
 * username, or first name and last initial.
 */
export function noteStamp(user, timeZone) {
  const [y, m, d] = (timeZone ? todayIn(timeZone) : todayIso()).split("-");
  const who = (user?.username || `${user?.first_name ?? ""}${(user?.last_name ?? "").slice(0, 1)}` || "me").toLowerCase().replace(/\s+/g, "");
  return `${Number(m)}/${Number(d)}/${y.slice(2)} ${who}:`;
}

/** The notes with a new line begun under them, stamped: what to add goes after it. */
export function withNewLine(value, stamp) {
  const text = String(value ?? "").replace(/\s+$/, "");
  return text ? `${text}\n${stamp} ` : `${stamp} `;
}

/** A new line that was begun but never written in says nothing: it goes. */
export function dropEmptyLine(value, stamp) {
  const text = String(value ?? "");
  const escaped = stamp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(^|\\n)${escaped}\\s*$`), "");
}
