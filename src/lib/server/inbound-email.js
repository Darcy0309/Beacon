/**
 * Email replies to a lead's email (Sean, Nov 2026), from the server: on only once the reply domain and
 * Resend's webhook secret are set; until then emails go out with the sender's own address to reply to, as
 * before.
 *
 *   INBOUND_REPLY_DOMAIN    the domain Resend receives replies on (reply.signaturemktg.net)
 *   RESEND_WEBHOOK_SECRET   the secret Resend signs its webhooks with (whsec_…)
 *   RESEND_API_KEY          to read a reply in full (Resend's webhook carries only who and what it is)
 *   RESEND_API_URL          only for the tests' stand-in
 */

import "server-only";
import { randomBytes } from "node:crypto";
import { replyAddress } from "@/lib/inbound-email";

export const replyDomain = () => process.env.INBOUND_REPLY_DOMAIN?.trim().toLowerCase() || null;
export const webhookSecret = () => process.env.RESEND_WEBHOOK_SECRET?.trim() || null;
const resendKey = () => process.env.RESEND_API_KEY?.trim() || null;
const resendBase = () => (process.env.RESEND_API_URL?.trim() || "https://api.resend.com").replace(/\/+$/, "");

/** Whether replies come back to Lighthouse. */
export const repliesOn = () => Boolean(replyDomain() && webhookSecret() && resendKey());

/** A new email's reply address: { token, address }, or null while replies are off. */
export function newReplyAddress() {
  const domain = replyDomain();
  if (!repliesOn() || !domain) return null;
  const token = randomBytes(16).toString("hex");
  return { token, address: replyAddress(token, domain) };
}

/** A reply Resend received, in full ({ from, subject, text, html, headers, … }), or null when it can't be read. */
export async function receivedEmail(id) {
  const key = resendKey();
  if (!key || !/^[A-Za-z0-9_-]{1,100}$/.test(String(id ?? ""))) return null;
  try {
    const res = await fetch(`${resendBase()}/emails/receiving/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    if (!res.ok) {
      console.error("[inbound email] reading it", id, res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("[inbound email] reading it", id, err?.message ?? err);
    return null;
  }
}
