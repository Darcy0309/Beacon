/**
 * Sending email from the server. Set one of these in the server's
 * environment (Vercel: Project → Settings → Environment Variables):
 *
 *   RESEND_API_KEY  Resend's API, over HTTPS (works wherever the web does;
 *                   what Resend recommends on Vercel), or else
 *   SMTP_HOST, SMTP_PORT (587 STARTTLS, the default, or 465), SMTP_USER
 *   and SMTP_PASSWORD: any mail server, e.g. smtp.office365.com
 *
 * Never a setting in the database: whoever could change the host there
 * could have the password sent to a server of their own. The From address
 * is a setting (Settings › Email), and must be one the service lets this
 * login send from (for Resend: on a domain verified there).
 */

import "server-only";
import nodemailer from "nodemailer";
import { mailboxHeader, resendFailure } from "@/lib/email";

const RESEND = "https://api.resend.com/emails";

/** How mail goes out, with its login, or null when the environment names nothing. */
export function mailServer() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) return { kind: "resend", key };
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return { kind: "smtp", host, port: Number(process.env.SMTP_PORT) || 587, user, pass };
}

/** Where mail goes, for the Settings screen: never the password or key. */
export function mailServerInfo() {
  const m = mailServer();
  if (!m) return null;
  return m.kind === "resend" ? { host: "api.resend.com", port: 443, user: "a Resend API key" } : { host: m.host, port: m.port, user: m.user };
}

// The only place a login may go unencrypted: this machine (the tests' mail catcher).
const THIS_MACHINE = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Send one email ({ from, replyTo, to, subject, text, html? }, addresses
 * as { name, address }); resolves with its id. Throws an error whose `code`
 * and `response` say what went wrong (see mailFailure()).
 */
export async function sendMail(message) {
  const m = mailServer();
  if (!m) throw Object.assign(new Error("No mail server is set"), { code: "ENOCONFIG" });
  return m.kind === "resend" ? sendWithResend(m.key, message) : sendWithSmtp(m, message);
}

async function sendWithResend(key, { from, replyTo, to, subject, text, html }) {
  let res;
  try {
    res = await fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: mailboxHeader(from),
        to: [typeof to === "string" ? to : to.address],
        reply_to: replyTo ? [mailboxHeader(replyTo)] : undefined,
        subject,
        text,
        html,
      }),
      // A service that never answers must not hold the request open.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw Object.assign(new Error(err?.message ?? "Resend could not be reached"), { code: "ECONNECTION" });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw resendFailure(res.status, body);
  return { messageId: body?.id ?? null };
}

async function sendWithSmtp(m, message) {
  const transport = nodemailer.createTransport({
    host: m.host,
    port: m.port,
    secure: m.port === 465,
    requireTLS: m.port !== 465 && !THIS_MACHINE.has(m.host),
    auth: { user: m.user, pass: m.pass },
    // A server that never answers must not hold the request open.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    const info = await transport.sendMail(message);
    return { messageId: info.messageId ?? null };
  } finally {
    transport.close();
  }
}
