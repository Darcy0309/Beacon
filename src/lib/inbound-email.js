// Email replies to a lead's email (Sean, Nov 2026: "the reply email is not attaching to this thread").
// Each email sent from a lead has a Reply-To address of its own on the reply domain; Resend receives the
// reply there and tells Lighthouse (app/api/email/inbound). Pure, so the server and the tests share it.

import { createHmac, timingSafeEqual } from "node:crypto";

/** The address replies to one email go to: "reply-<token>@<domain>". */
export const replyAddress = (token, domain) => `reply-${token}@${domain}`;

/** The token of the first reply address among `addresses` (to, received_for…), or null. */
export function replyToken(addresses) {
  for (const a of [addresses].flat()) {
    const m = /(?:^|[<\s"])reply-([a-f0-9]{24,64})@/i.exec(` ${String(a ?? "")}`);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/**
 * A reply's own words: the earlier message it quotes cut off ("On … wrote:", "-----Original Message-----",
 * an Outlook "From: … Sent: …" block, or lines quoted with ">" at its end), trimmed. The whole text when
 * cutting would leave nothing.
 */
export function replyText(text) {
  const s = String(text ?? "").replace(/\r\n?/g, "\n");
  const cuts = [
    /^\s*On .{3,300}wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*From: .+\n\s*(Sent|Date): .+$/im,
    /^\s*_{10,}\s*$/m,
  ].map((re) => re.exec(s)?.index ?? -1).filter((i) => i > 0);
  let own = cuts.length ? s.slice(0, Math.min(...cuts)) : s;
  // Quoted lines at the end.
  own = own.replace(/(\n\s*>.*)+\s*$/, "");
  own = own.trim();
  return own || s.trim();
}

/** Plain text from an email's HTML, for a reply with no text part. */
export function htmlText(html) {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

/** "Dana Reyes <dana@x.com>" → { name: "Dana Reyes", address: "dana@x.com" }. */
export function parseMailbox(value) {
  const s = String(value ?? "").trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  return { name: null, address: s.toLowerCase() || null };
}

/**
 * A webhook from Resend, checked as Svix signs it: HMAC-SHA256 of "<svix-id>.<svix-timestamp>.<body>" with
 * the secret (whsec_ and base64), one of the space-separated "v1,<base64>" in svix-signature, and sent in
 * the last five minutes. `now` in seconds.
 */
export function verifySvix(body, { id, timestamp, signature }, secret, now = Math.floor(Date.now() / 1000)) {
  if (!body || !id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  let key;
  try {
    key = Buffer.from(String(secret).replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return String(signature).split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
