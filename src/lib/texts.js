// Texting a lead's contact from its lead sheet (Nov 2026), through the phone's Twilio number: what a
// text may be, which of the lead's numbers it can go to, and how Twilio's refusals read.
// Pure, so the server, the Conversation tab and the tests share it.

/** The longest text Lighthouse sends: ten parts of a long text (Twilio joins them on the phone). */
export const TEXT_LIMIT = 1600;
/** At most this many texts an hour from one person. */
export const TEXTS_PER_HOUR = 60;

/** Ten digits for a US number given any way ("(602) 555-0142", "+16025550142"), else null. */
export function textDigits(value) {
  const d = String(value ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? ten : null;
}

/** As Twilio writes it: "+16025550142". */
export const e164 = (digits) => (digits ? `+1${digits}` : null);

/**
 * The lead's numbers a text can go to, mobiles first (a business line seldom takes texts), each once:
 * [{ digits, label }]. `r`: the lead's record.
 */
export function leadTextNumbers(r) {
  const people = [
    [r?.contact_name || "Contact", r?.contact_mobile, r?.contact_phone],
    [r?.decision_maker || "Decision maker", r?.dm_mobile, r?.dm_phone],
    [r?.contact2_name || "2nd contact", r?.contact2_mobile, r?.contact2_phone],
  ];
  const list = [
    ...people.map(([who, mobile]) => [mobile, `${who} · mobile`]),
    [r?.phone, "Business phone"],
    ...people.map(([who, , phone]) => [phone, `${who} · phone`]),
  ];
  const seen = new Set();
  const out = [];
  for (const [value, label] of list) {
    const digits = textDigits(value);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    out.push({ digits, label });
  }
  return out;
}

/** How many texts a message goes as: 160 plain characters in one (153 a part when longer), 70 with emoji and the like (67). */
export function textParts(body) {
  const s = String(body ?? "");
  if (!s) return 0;
  // The plain set texts use (GSM-7); anything else sends the whole text as Unicode.
  const plain = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(s);
  // Unicode texts count as phones do: an emoji is two.
  const chars = plain ? [...s].length : s.length;
  const one = plain ? 160 : 70;
  const part = plain ? 153 : 67;
  return chars <= one ? 1 : Math.ceil(chars / part);
}

// Twilio's error codes for a text, in words (twilio.com/docs/api/errors).
const FAILURES = {
  21211: "That isn't a valid phone number.",
  21408: "Texts can't go to that region from this account.",
  21610: "This number has replied STOP, so it can't be texted. They can reply START to allow texts again.",
  21612: "Twilio can't text that number from Lighthouse's number.",
  21614: "That number can't take texts: it isn't a mobile.",
  21606: "Lighthouse's phone number can't send texts: it needs texting turned on in Twilio.",
  21659: "Lighthouse's phone number can't send texts yet (it isn't registered for texting in Twilio).",
  30003: "The phone couldn't be reached: it may be off or out of service.",
  30004: "The text was blocked by the person's phone or carrier.",
  30005: "That number doesn't exist or is no longer in service.",
  30006: "That number is a landline or can't take texts.",
  30007: "The carrier filtered the text as spam.",
  30008: "The text couldn't be delivered (the carrier didn't say why).",
  30032: "Texting isn't set up for Lighthouse's number yet: it needs a toll-free verification in Twilio.",
  30034: "Texting isn't set up for Lighthouse's number yet: it needs its A2P 10DLC registration finished in Twilio.",
};

/** A Twilio error code (or message) as words for whoever sent the text. */
export function textFailure(code, message) {
  return FAILURES[Number(code)] ?? (message ? `Twilio refused it: ${message}` : "The text couldn't be sent.");
}

/** A text's status as shown beside it. */
export const TEXT_STATUS = {
  queued: "Sending",
  accepted: "Sending",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  undelivered: "Not delivered",
  failed: "Not sent",
  received: "Received",
};
