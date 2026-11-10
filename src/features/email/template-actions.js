"use server";

/** Email templates (client, Nov 2026): kept by administrators in Settings. */

import { revalidatePath } from "next/cache";
import { currentAppUser, fail, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_LIMITS, oneLine } from "@/lib/email";

const BUCKET = "email-templates";
const PATH = /^template\/[0-9a-f-]{36}\/[\w.-]{1,120}$/;

async function asAdmin() {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  return { supabase, me: me?.role === "admin" ? me : null };
}

const refresh = () => {
  revalidatePath("/settings");
  revalidatePath("/leads", "layout");
};

/** The files a template keeps: those uploaded to its bucket, by the path the upload gave. */
const cleanFiles = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((a) => PATH.test(String(a?.path ?? "")))
    .slice(0, 10)
    .map((a) => ({ path: a.path, name: oneLine(String(a.name ?? "file")).slice(0, 160) || "file", size: Math.max(0, Number(a.size) || 0), type: a.type ? String(a.type).slice(0, 120) : null }));

/**
 * Save a template, new (no id) or changed: { id?, name, subject, body, attachments, active }.
 * Files taken off it are removed from storage.
 */
export async function saveEmailTemplate(input) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator keeps the email templates.");
  const name = oneLine(String(input?.name ?? "")).slice(0, 80);
  const subject = oneLine(String(input?.subject ?? "")).slice(0, EMAIL_LIMITS.subject);
  const body = String(input?.body ?? "").replace(/\r\n?/g, "\n");
  const errors = {};
  if (!name) errors.name = "Give it a name";
  if (!subject) errors.subject = "Give it a subject";
  if (!body.trim()) errors.body = "Write the message";
  if (body.length > EMAIL_LIMITS.body) errors.body = `Keep it under ${EMAIL_LIMITS.body.toLocaleString()} characters`;
  if (Object.keys(errors).length) return fail("Fill in what's marked.", errors);
  const attachments = cleanFiles(input?.attachments);
  const row = { name, subject, body, attachments, active: input?.active !== false, updated_by: me.id, updated_at: new Date().toISOString() };

  const id = Number(input?.id) || null;
  let before = [];
  if (id) {
    const { data } = await supabase.from("email_templates").select("attachments").eq("id", id).maybeSingle();
    before = Array.isArray(data?.attachments) ? data.attachments : [];
  }
  const { data, error } = id
    ? await supabase.from("email_templates").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("email_templates").insert({ ...row, created_by: me.id }).select("id").single();
  if (error) return fail(/email_templates_name/.test(error.message) ? "There's already a template with that name." : error, /email_templates_name/.test(error.message) ? { name: "Already taken" } : null);
  if (!data) return fail("That template no longer exists.");

  const kept = new Set(attachments.map((a) => a.path));
  const gone = before.map((a) => a?.path).filter((p) => p && !kept.has(p));
  if (gone.length) await supabase.storage.from(BUCKET).remove(gone).catch(() => {});
  await logActivity(supabase, id ? "email_template.update" : "email_template.create", { entity: "email_template", entityId: data.id, detail: name, userId: me.id });
  refresh();
  return ok({ id: data.id });
}

/** Delete a template and its files. Emails already sent keep what they said. */
export async function deleteEmailTemplate(templateId) {
  const id = Number(templateId) || null;
  if (!id) return fail("That template was not found.");
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator keeps the email templates.");
  const { data, error } = await supabase.from("email_templates").delete().eq("id", id).select("name, attachments");
  if (error) return fail(error);
  if (!data?.length) return fail("That template was not found.");
  const files = (data[0].attachments ?? []).map((a) => a?.path).filter(Boolean);
  if (files.length) await supabase.storage.from(BUCKET).remove(files).catch(() => {});
  await logActivity(supabase, "email_template.delete", { entity: "email_template", entityId: id, detail: data[0].name, userId: me.id });
  refresh();
  return ok();
}

/** A file uploaded and then not saved with a template (the dialog closed): taken out of storage. */
export async function discardTemplateFiles(paths) {
  const { supabase, me } = await asAdmin();
  if (!me) return fail("Only an administrator keeps the email templates.");
  const list = (Array.isArray(paths) ? paths : []).filter((p) => PATH.test(String(p))).slice(0, 10);
  if (!list.length) return ok();
  // Only files no template holds.
  const { data } = await supabase.from("email_templates").select("attachments");
  const held = new Set((data ?? []).flatMap((t) => (t.attachments ?? []).map((a) => a?.path)));
  const loose = list.filter((p) => !held.has(p));
  if (loose.length) await supabase.storage.from(BUCKET).remove(loose).catch(() => {});
  return ok();
}
