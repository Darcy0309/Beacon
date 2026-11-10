/** Email templates (client, Nov 2026): the ones to pick from, and all of them for Settings. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

const shape = (t) => ({
  id: t.id,
  name: t.name,
  subject: t.subject ?? "",
  body: t.body ?? "",
  active: t.active,
  attachments: (Array.isArray(t.attachments) ? t.attachments : []).map((a) => ({ path: a.path, name: a.name, size: Number(a.size) || 0, type: a.type ?? null })),
  updatedAt: t.updated_at,
});

/** The templates a sender picks from in the Email box: the active ones, by name. [] without any (or for a client). */
export async function getEmailTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").select("*").eq("active", true).order("name");
  if (error) {
    console.warn("[email] templates unavailable:", error.message);
    return [];
  }
  return (data ?? []).map(shape);
}

/** Every template, active or not, for Settings (administrators). */
export async function getAllEmailTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(shape);
}
