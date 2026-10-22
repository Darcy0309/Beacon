/**
 * The emails the database queues for the app to send (email_outbox):
 * appointment updates to the administrators and the manager who set the
 * appointment, and the reminders to update one to the client's people and
 * the project's agent. Sent as they are: each once, one that fails says why
 * and is not tried again. Needs the server's own role (admin client).
 */

import "server-only";
import { mailFailure } from "@/lib/email";
import { mailServer, sendMail } from "@/lib/server/mail";

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const BUTTON = { appointment_nudge: "Update the appointment", appointment_update: "Open the lead" };

/** Send what is queued (up to 200); resolves to { sent, queued } or { sent: 0, error }. */
export async function flushOutbox(admin, origin) {
  if (!mailServer()) return { sent: 0, error: "No mail server is set" };
  const [{ data: queued, error }, { data: settings }] = await Promise.all([
    admin.from("email_outbox").select("id, kind, email, subject, body, link").is("sent_at", null).is("error", null).order("id").limit(200),
    admin.from("app_settings").select("key, value").in("key", ["mail", "organization"]),
  ]);
  if (error) return { sent: 0, error: error.message };
  const setting = (k) => settings?.find((x) => x.key === k)?.value ?? {};
  const from = setting("mail").from;
  if (!from) return { sent: 0, error: "No From address is set (Settings › Email)" };
  const org = setting("organization").name || "Signature Marketing";

  let sent = 0;
  for (const m of queued ?? []) {
    // Claimed first, so a second run at the same time does not send it again.
    const { data: mine } = await admin.from("email_outbox").update({ sent_at: new Date().toISOString() }).eq("id", m.id).is("sent_at", null).select("id");
    if (!mine?.length) continue;
    const url = m.link ? `${origin}${m.link}` : null;
    const text = `${m.body}${url ? `\n\n${BUTTON[m.kind] ?? "Open Lighthouse"}: ${url}` : ""}\n\n${org}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">
<p style="white-space:pre-line">${esc(m.body)}</p>
${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">${esc(BUTTON[m.kind] ?? "Open Lighthouse")}</a></p>` : ""}
<p style="color:#6b7280;font-size:13px">${esc(org)}</p></div>`;
    try {
      await sendMail({ from: { name: org, address: from }, to: m.email, subject: m.subject, text, html });
      sent += 1;
    } catch (err) {
      await admin.from("email_outbox").update({ sent_at: null, error: mailFailure(err).slice(0, 500) }).eq("id", m.id);
    }
  }
  return { sent, queued: queued?.length ?? 0 };
}
