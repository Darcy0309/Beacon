/**
 * The Call Log's words and addresses (Sean, Nov 2026), shared by the page, Call Activity's links to it,
 * and the tests. Pure.
 */

/** A length of time as the Streams report wrote it: "0:00:17", "1:29:00". */
export function talkClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Each kind of call, as Call Activity counts them: [key, label, the count's key on getCallLog()'s counts]. */
export const CALL_KINDS = [
  ["out_handled", "Outbound handled"],
  ["in_handled", "Inbound handled"],
  ["missed", "Missed"],
  ["out_cancelled", "Outbound cancelled"],
];
export const CALL_KIND_LABEL = Object.fromEntries(CALL_KINDS);
const KIND_KEYS = new Set(["out", "in", ...CALL_KINDS.map(([k]) => k)]);

/** Call Activity's column keys, as the Call Log's kinds. */
export const ACTIVITY_KIND = { total: null, outHandled: "out_handled", inHandled: "in_handled", missed: "missed", outCancelled: "out_cancelled" };

/** "none": the calls in that rang no one; a user id; else null (everyone). */
export function readCallUser(v) {
  if (v === "none") return "none";
  return /^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null;
}
export const readCallKind = (v) => (KIND_KEYS.has(v) ? v : null);

/** The digits of a number searched for ("(602) 555-0100" → "6025550100"); fewer than three: none. */
export function callNumberDigits(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length >= 3 ? d.slice(0, 15) : null;
}

/** The Call Log's address: { user ("none" or an id), kind, q, from, to, all (all time), page }, the empty ones left out. */
export function callLogHref({ user = null, kind = null, q = null, from = null, to = null, all = false, page = null } = {}) {
  const p = new URLSearchParams();
  if (user != null) p.set("user", String(user));
  if (kind) p.set("kind", kind);
  if (q) p.set("q", q);
  if (all) p.set("range", "all");
  else {
    if (from) p.set("from", from);
    if (to) p.set("to", to);
  }
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/reports/calls?${s}` : "/reports/calls";
}
