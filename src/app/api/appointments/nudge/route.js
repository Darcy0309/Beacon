import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { mailFailure } from "@/lib/email";
import { publicOrigin } from "@/lib/origin";
import { mailServer, sendMail } from "@/lib/server/mail";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
// A batch of emails can take a while.
export const maxDuration = 300;

function sameSecret(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Email the reminders to update an appointment (Sean, Oct 2026): called by
 * the database (nudge_appointment_updates(), through pg_net) with the push
 * secret, not by people, once it has queued them (appointment_nudges) on
 * the 2nd and 4th business day after an appointment still at No Status.
 * Each goes once; one that fails says why and is not tried again.
 */
export async function POST(request) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !sameSecret(request.headers.get("x-push-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "The server's role is not set up" }, { status: 503 });
  if (!mailServer()) return NextResponse.json({ sent: 0, error: "No mail server is set" });

  const [{ data: queued, error }, { data: settings }] = await Promise.all([
    admin.from("appointment_nudges").select("id, email, subject, body, link").is("sent_at", null).is("error", null).order("id").limit(200),
    admin.from("app_settings").select("key, value").in("key", ["mail", "organization"]),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const setting = (k) => settings?.find((x) => x.key === k)?.value ?? {};
  const from = setting("mail").from;
  if (!from) return NextResponse.json({ sent: 0, error: "No From address is set (Settings › Email)" });
  const org = setting("organization").name || "Signature Marketing";
  const origin = publicOrigin(request.headers);

  let sent = 0;
  for (const n of queued ?? []) {
    const url = `${origin}${n.link}`;
    const text = `${n.body}\n\nUpdate it here: ${url}\n\n${org}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">
<p>${esc(n.body)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Update the appointment</a></p>
<p style="color:#6b7280;font-size:13px">${esc(org)}</p></div>`;
    try {
      await sendMail({ from: { name: org, address: from }, to: n.email, subject: n.subject, text, html });
      await admin.from("appointment_nudges").update({ sent_at: new Date().toISOString() }).eq("id", n.id);
      sent += 1;
    } catch (err) {
      await admin.from("appointment_nudges").update({ error: mailFailure(err).slice(0, 500) }).eq("id", n.id);
    }
  }
  return NextResponse.json({ sent, queued: queued?.length ?? 0 });
}
