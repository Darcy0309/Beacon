/**
 * Sending email from the server, through the mail server named in the
 * server's environment (Vercel: Project → Settings → Environment Variables):
 *
 *   SMTP_HOST      e.g. smtp.resend.com, smtp.postmarkapp.com, smtp.office365.com
 *   SMTP_PORT      587 (encrypted with STARTTLS; the default) or 465 (encrypted from the start)
 *   SMTP_USER      the login
 *   SMTP_PASSWORD  its password or API key
 *
 * Never a setting in the database: whoever could change the host there
 * could have the password sent to a server of their own. The From address
 * is a setting (Settings › Email), and must be one the mail service lets
 * this login send from.
 */

import "server-only";
import nodemailer from "nodemailer";

/** The mail server and its login, or null when the environment does not name one. */
export function mailServer() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return { host, port: Number(process.env.SMTP_PORT) || 587, user, pass };
}

/** Where mail goes, for the Settings screen: never the password. */
export function mailServerInfo() {
  const m = mailServer();
  return m ? { host: m.host, port: m.port, user: m.user } : null;
}

// The only place a login may go unencrypted: this machine (the tests' mail catcher).
const THIS_MACHINE = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Send one email; resolves with its Message-ID. Throws the mail library's
 * error, whose `code` and `response` say what went wrong (see mailFailure()).
 */
export async function sendMail(message) {
  const m = mailServer();
  if (!m) throw Object.assign(new Error("No mail server is set"), { code: "ENOCONFIG" });

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
