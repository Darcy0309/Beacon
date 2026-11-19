import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { htmlText, parseMailbox, replyText, replyToken, verifySvix } from "@/lib/inbound-email";
import { isReservedAddress, mailFailure, oneLine } from "@/lib/email";
import { receivedEmail, webhookSecret } from "@/lib/server/inbound-email";
import { mailServer, sendMail } from "@/lib/server/mail";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/**
 * A reply to an email sent from a lead (Sean, Nov 2026: "the reply email is not attaching to this thread").
 * Resend receives it at the email's own Reply-To address (reply-<token>@ the reply domain) and posts
 * email.received here, signed (Svix). The reply is read in full from Resend, kept on the lead with the email
 * it answers (its own words, the quoted earlier message cut off), and whoever sent that email is told in
 * Lighthouse and sent a copy. Public in proxy.js: only Resend's signature lets anything in. Answers 2xx once
 * done or when there is nothing to do; a failure to read it from Resend answers 502, for Resend to try again.
 */
export async function POST(request) {
  const secret = webhookSecret();
  if (!secret) return new NextResponse(null, { status: 503 });
  const body = await request.text();
  const signed = verifySvix(body, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, secret);
  if (!signed) return new NextResponse(null, { status: 401 });

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (event?.type !== "email.received") return new NextResponse(null, { status: 204 });
  const d = event.data ?? {};
  const token = replyToken([...(d.to ?? []), ...(d.received_for ?? [])]);
  const admin = createAdminClient();
  if (!token || !admin || !d.email_id) return new NextResponse(null, { status: 204 });

  const { data: sent } = await admin.from("lead_emails").select("id, lead_id, user_id, subject, to_address")
    .eq("reply_token", token).eq("direction", "out").maybeSingle();
  if (!sent) return new NextResponse(null, { status: 204 });
  const { data: already } = await admin.from("lead_emails").select("id").eq("resend_id", String(d.email_id)).maybeSingle();
  if (already) return new NextResponse(null, { status: 204 });

  const full = await receivedEmail(d.email_id);
  if (!full) return new NextResponse(null, { status: 502 });
  const sender = parseMailbox(full.headers?.from ?? full.from ?? d.from);
  const text = replyText(full.text || htmlText(full.html)).slice(0, 10000) || "(no text)";
  const subject = oneLine(full.subject || d.subject || `Re: ${sent.subject}`).slice(0, 200) || `Re: ${sent.subject}`;
  const from = (sender.name ? `${sender.name} <${sender.address}>` : sender.address ?? "").slice(0, 320) || null;

  const { data: kept, error } = await admin.from("lead_emails").insert({
    lead_id: sent.lead_id, user_id: sent.user_id, direction: "in", status: "received",
    to_address: String((d.to ?? [])[0] ?? sent.to_address).slice(0, 254), from_address: from,
    subject, body: text, in_reply_to_id: sent.id, resend_id: String(d.email_id),
  }).select("id").maybeSingle();
  if (error) {
    // The same reply twice (Resend trying again): kept once.
    if (error.code === "23505") return new NextResponse(null, { status: 204 });
    console.error("[inbound email] keeping it", error.message);
    return new NextResponse(null, { status: 500 });
  }

  const { data: lead } = await admin.from("leads").select("id, company_name, contact_name").eq("id", sent.lead_id).maybeSingle();
  const who = [lead?.company_name, sender.name ?? sender.address].filter(Boolean).join(" · ") || "a lead";
  const link = `/leads/${sent.lead_id}?tab=emails`;

  // Whoever sent the email it answers is told; with nobody (gone, disabled), the administrators.
  const { data: person } = sent.user_id
    ? await admin.from("users").select("id, email, first_name").eq("id", sent.user_id).eq("status", "active").maybeSingle()
    : { data: null };
  let ids = person ? [person.id] : [];
  if (!ids.length) {
    const { data: admins } = await admin.from("users").select("id").eq("role", "admin").eq("status", "active");
    ids = (admins ?? []).map((u) => u.id);
  }
  if (ids.length) {
    const { error: noticeError } = await admin.rpc("lead_text_notice", { p_users: ids, p_title: `Email from ${who}`, p_body: text.slice(0, 500), p_link: link });
    if (noticeError) console.error("[inbound email] notice", noticeError.message);
  }

  // …and sent a copy, to answer from their own inbox if they like (replying goes to the prospect).
  if (person?.email && !isReservedAddress(person.email) && mailServer()) {
    const { data: settings } = await admin.from("app_settings").select("key, value").in("key", ["mail", "organization"]);
    const setting = (k) => settings?.find((x) => x.key === k)?.value ?? {};
    const companyFrom = setting("mail").from;
    const org = setting("organization").name || "Signature Marketing";
    if (companyFrom) {
      const url = `${publicOrigin(request.headers)}${link}`;
      try {
        await sendMail({
          from: { name: org, address: companyFrom },
          replyTo: sender.address ? { name: sender.name ?? undefined, address: sender.address } : undefined,
          to: person.email,
          subject: oneLine(`Reply from ${who}: ${subject}`).slice(0, 250),
          text: `${sender.name ?? sender.address ?? "The prospect"} replied to your email "${sent.subject}"${lead?.company_name ? ` about ${lead.company_name}` : ""}:\n\n${text}\n\nIt's on the lead in Lighthouse: ${url}\nReplying to this email goes to ${sender.address ?? "them"} directly.`,
        });
      } catch (err) {
        console.error("[inbound email] the copy", mailFailure(err));
      }
    }
  }
  return NextResponse.json({ kept: kept?.id ?? null });
}
