// The phone lines (Sean, Nov 2026): the account's Twilio numbers and what each is for, the extensions that ring
// a manager, the voicemail boxes and their greetings, and the local caller ID a call goes out with. Pure, so the
// voice webhook, the settings and the tests share it.

/** What a line is for: [kind, label, what it does]. */
export const LINE_KINDS = [
  ["attendant", "Managers' line", "The \"insurance office\" greeting: an extension rings that manager; none dialed, the general voicemail"],
  ["main", "Rings chosen people", "Rings the people chosen (Signature Marketing: Sean and Mike), then their voicemail"],
  ["local", "Local caller ID", "Calls go out from it in its area code; a call back to it rings the manager who last called that number"],
];
export const KIND_LABEL = Object.fromEntries(LINE_KINDS.map(([k, label]) => [k, label]));

/** What the managers' line says first (Settings → Phone Lines changes it). Vague on purpose: it serves any client. */
export const DEFAULT_ATTENDANT_GREETING =
  "Thank you for calling the insurance office. If you know your party's extension, please dial it now. Otherwise, please stay on the line to leave a message.";
/** A general voicemail's greeting, and any box with none of its own. */
export const DEFAULT_VOICEMAIL_GREETING =
  "Sorry, no one can take your call right now. Please leave your name, number and a short message after the tone, and we will call you back.";
/** A manager's greeting until they write or record their own: in the AI voice, with their first name. */
export const defaultPersonalGreeting = (firstName) =>
  `You've reached ${String(firstName ?? "").trim() || "my line"}. I can't take your call right now. Please leave your name, number and a short message after the tone, and I'll call you back.`;
/** The AI voice everything is said in (Amazon Polly's neural Joanna, through Twilio). */
export const VOICE = "Polly.Joanna-Neural";

/** A US number as Twilio writes it ("+16025550100"), or null: "(602) 555-0100", "602.555.0100", "1-602-555-0100". */
export function e164(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null;
}

/** "+16025550100" → "(602) 555-0100". */
export const lineNumberLabel = (n) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(n ?? ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(n ?? "");
};

/** An extension as it is kept and dialed: 1 to 8 digits (as the user form takes it), or null. */
export function extensionDigits(value) {
  const v = String(value ?? "").trim();
  return /^\d{1,8}$/.test(v) ? v : null;
}

/**
 * Whose voicemail a call ends in: "user-42" (a manager's own), "line-7" (a line's people), "general" (the
 * managers' line with no extension dialed), or null (a number not listed: the administrators, as before).
 * It travels in the webhook's own address, which Twilio signs (no colon in it: the address must sign the same
 * as Twilio asked for it).
 */
export function parseBox(value) {
  const m = /^(user|line)-([1-9]\d{0,17})$/.exec(String(value ?? ""));
  if (m) return { kind: m[1], id: Number(m[2]) };
  return value === "general" ? { kind: "general", id: null } : null;
}
export const boxParam = (box) => (!box ? "" : box.kind === "general" ? "general" : `${box.kind}-${box.id}`);

/**
 * The caller ID a call goes out with: the one asked for when it is one of ours; else, picked for the call
 * (Sean: managers "used a local callerID depending on where they're calling"), the local line in the project's
 * area code (its office phone, as Project Info shows it); else the company's own number.
 *
 *   lines      [{ number, kind, area_code }]   the account's lines
 *   requested  the number the phone asked for, or "auto" / nothing
 *   areaCode   the project's area code, when the call is from a lead
 *   fallback   TWILIO_CALLER_ID
 * → { number, how: "chosen" | "project" | "default" }
 */
export function pickCallerId({ lines = [], requested = null, areaCode = null, fallback }) {
  const asked = e164(requested);
  if (asked && (asked === fallback || lines.some((l) => l.number === asked))) return { number: asked, how: "chosen" };
  const local = areaCode ? lines.find((l) => l.kind === "local" && l.area_code === areaCode) : null;
  if (local) return { number: local.number, how: "project" };
  return { number: fallback, how: "default" };
}

/**
 * The local lines to pick from in the phone, matching what is typed: an area code ("715"), a number's
 * digits, or words of its label ("eau claire"). Area code order.
 */
export function searchLines(lines, typed) {
  const t = String(typed ?? "").trim().toLowerCase();
  const digits = t.replace(/\D/g, "");
  return lines
    .filter((l) => !t || (digits && l.number.includes(digits)) || (l.label ?? "").toLowerCase().includes(t))
    .sort((a, b) => a.number.localeCompare(b.number));
}
