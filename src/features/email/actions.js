"use server";

/** Emailing a name's contact from its lead sheet. */

import { check, currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { mailServer, sendMail } from "@/lib/server/mail";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_LIMITS, isReservedAddress, mailFailure, oneLine } from "@/lib/email";
import { EMAIL_ATTACH_MB } from "@/lib/email-templates";
import { fullName } from "@/lib/format";
import { schemas } from "@/lib/validate";

/**
 * Send an email to a name's contact: from the company's address (Settings ›
 * Email) under the sender's name, with replies going to the sender. Only
 * someone who may work the name (can_work_lead()) can send one, at most
 * EMAIL_LIMITS.perHour an hour each.
 *
 * With a template picked (client, Nov 2026), its files go with it: those of the template's own the
 * sender kept (`attach`), read from storage by the server, never a path of the sender's choosing.
 *
 * Every attempt is kept on the name's history, sent or not. The server
 * writes it with its own role after sending, so nobody can add, change or
 * fake one from the app.
 */
export async function sendLeadEmail(prevState, formData) {
  // A browser sends a textarea's line breaks as CRLF. Keep them as typed and
  // as the box counted them, one character each, so a message the box
  // allowed is never too long here.
  formData.set("body", String(formData.get("body") ?? "").replace(/\r\n?/g, "\n"));
  const { values, failed } = check(formData, schemas.leadEmail);
  if (failed) return failed;
  const leadId = Number(values.lead_id);
  const subject = oneLine(values.subject);

  const supabase = await createClient();
  const [me, { data: allowed, error }] = await Promise.all([
    currentAppUser(supabase),
    supabase.rpc("can_work_lead", { p_lead_id: leadId }),
  ]);
  if (error) return fail(error, null, values);
  if (!me || !allowed) return fail("This name is not on your call list, so you can't email it.", null, values);

  if (!mailServer()) return fail(mailFailure({ code: "ENOCONFIG" }), null, values);
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE, null, values);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count, error: countError }, { data: settings }, { data: profile }] = await Promise.all([
    admin.from("lead_emails").select("id", { count: "exact", head: true }).eq("user_id", me.id).gte("created_at", hourAgo),
    supabase.from("app_settings").select("key, value").in("key", ["mail", "organization"]),
    supabase.from("users").select("first_name, last_name, email").eq("id", me.id).single(),
  ]);
  if (countError) return fail(countError, null, values);
  if (count >= EMAIL_LIMITS.perHour) {
    return fail(`You've sent ${EMAIL_LIMITS.perHour} emails in the last hour, the most allowed. Try again a little later.`, null, values);
  }
  const setting = (key) => settings?.find((s) => s.key === key)?.value ?? {};
  const from = setting("mail").from;
  if (!from) return fail("There's no address to send from yet: an administrator sets it in Settings › Email.", null, values);
  const name = fullName(profile) || setting("organization").name || "";

  // The template's files the sender kept.
  const templateId = /^[1-9]\d{0,17}$/.test(String(formData.get("template_id") ?? "")) ? Number(formData.get("template_id")) : null;
  const wanted = new Set(formData.getAll("attach").map(String));
  let files = [];
  if (templateId && wanted.size) {
    const { data: template } = await supabase.from("email_templates").select("attachments").eq("id", templateId).maybeSingle();
    const chosen = (template?.attachments ?? []).filter((a) => a?.path && wanted.has(a.path));
    if (chosen.reduce((n, a) => n + (Number(a.size) || 0), 0) > EMAIL_ATTACH_MB * 1024 * 1024) {
      return fail(`The attachments come to more than ${EMAIL_ATTACH_MB} MB: take one or two off and send again.`, null, values);
    }
    for (const a of chosen) {
      const { data: blob, error: readError } = await admin.storage.from("email-templates").download(a.path);
      if (readError || !blob) return fail(`${a.name} couldn't be attached: it may have been taken off the template. Pick the template again.`, null, values);
      files.push({ filename: a.name, content: Buffer.from(await blob.arrayBuffer()), contentType: a.type || blob.type || undefined });
    }
  }

  let messageId = null;
  let problem = null;
  try {
    ({ messageId } = await sendMail({
      from: { name, address: from },
      // Replies come back to the sender, unless their sign-in is a test
      // address no mail reaches: then to the From address.
      replyTo: isReservedAddress(profile?.email ?? me.email) ? undefined : { name, address: profile?.email ?? me.email },
      to: values.to,
      subject,
      text: values.body,
      attachments: files.length ? files : undefined,
    }));
  } catch (err) {
    problem = mailFailure(err);
    console.error("[email] lead", leadId, err?.code ?? "", err?.response ?? err?.message ?? err);
  }

  const { error: keepError } = await admin.from("lead_emails").insert({
    lead_id: leadId,
    user_id: me.id,
    to_address: values.to,
    subject,
    body: values.body,
    status: problem ? "failed" : "sent",
    error: problem ? problem.slice(0, 500) : null,
    message_id: messageId ? String(messageId).slice(0, 300) : null,
    template_id: templateId,
    attachments: files.map((f) => f.filename),
  });
  if (keepError) console.error("[email] not kept on the lead's history", leadId, keepError.message);

  // `kept`: the failed attempt is on the lead's history now, so the sheet can show it.
  if (problem) return { ...fail(problem, null, values), data: { kept: !keepError } };
  await logActivity(supabase, "lead.email", { entity: "lead", entityId: leadId, detail: values.to, userId: me.id });
  return ok({ to: values.to });
}
