/**
 * The shared kernel of every server action: one result shape
 * ({ ok, data, error, fieldErrors, values }), form parsing and validation,
 * the acting user, and the activity log.
 *
 * Not a "use server" module itself — these are helpers, not endpoints.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { publicOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { AUTH_ID_HEADER } from "@/lib/supabase/config";
import { formValues, validate } from "@/lib/validate";

export const ok = (data = null) => ({ ok: true, data, error: null, fieldErrors: null, values: null });

/**
 * Failure result. `fieldErrors` maps field -> message for inline display and
 * `values` echoes what was submitted so the form can keep the user's input.
 */
export const fail = (error, fieldErrors = null, values = null) => ({
  ok: false,
  data: null,
  error: String(error?.message || error),
  fieldErrors,
  values,
});

/**
 * Validate a FormData against a schema. Returns { values } on success or a
 * ready-to-return fail() result on failure.
 */
export function check(formData, schema, crossFn) {
  const values = formValues(formData, Object.keys(schema));
  const { ok: valid, errors } = validate(values, schema, crossFn);
  if (!valid) {
    const first = Object.values(errors)[0];
    const count = Object.keys(errors).length;
    return {
      values,
      failed: fail(count === 1 ? first : `Please fix ${count} highlighted fields.`, errors, values),
    };
  }
  return { values, failed: null };
}

/**
 * For updates: keep only the columns the form actually submitted. A form that
 * has no input for a column (the lead form has none for website or address,
 * the project form none for client name) must leave that column alone, not
 * write NULL over what is there.
 */
export function onlySubmitted(formData, payload) {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => formData.has(key)));
}

/** Positive integer from a FormData, or null. Used by the small toggle/delete actions. */
export function idFrom(formData, key = "id") {
  const v = String(formData.get(key) ?? "").trim();
  return /^[1-9]\d*$/.test(v) ? Number(v) : null;
}

/**
 * Trim a form value, returning null for blanks so empty inputs clear columns.
 * Line breaks are stored as "\n": a browser sends a textarea's as "\r\n".
 */
export const s = (form, key) => {
  const v = form.get(key);
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\r\n?/g, "\n").trim();
  return t === "" ? null : t;
};

export const n = (form, key) => {
  const v = s(form, key);
  return v === null ? null : Number(v);
};

/**
 * Who is acting: their id, role, status and email, or null when signed out.
 *
 * The proxy has already verified the session for this request and put the
 * verified auth id on a request header (it overwrites any header sent with
 * the request), so asking Supabase Auth again only cost a round trip on
 * every save. Without the header, it asks. Row Level Security still checks
 * every query against the session itself.
 */
export async function currentAppUser(supabase) {
  let authId = (await headers()).get(AUTH_ID_HEADER);
  if (!authId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authId = user?.id ?? null;
  }
  if (!authId) return null;
  const { data } = await supabase
    .from("users")
    .select("id, role, status, email")
    .eq("auth_id", authId)
    .maybeSingle();
  return data ?? null;
}

/** The app's public origin, for links in emails we ask Supabase to send. */
export async function requestOrigin() {
  return publicOrigin(await headers());
}

/**
 * Record what someone did, for the activity screen. Never blocks or fails the
 * action that triggered it — a lost log line must not cost a saved record.
 * Pass `userId` when the caller already knows it, to save a round trip.
 */
export async function logActivity(supabase, action, { entity, entityId, detail, userId } = {}) {
  try {
    const id = userId ?? (await currentAppUser(supabase))?.id;
    if (!id) return;
    await supabase.from("activity_log").insert({
      user_id: id,
      action,
      entity: entity ?? null,
      entity_id: entityId ?? null,
      detail: detail ? String(detail).slice(0, 200) : null,
    });
  } catch (err) {
    console.error("[activity]", action, err?.message ?? err);
  }
}

// Row Level Security answers a delete it refuses with "0 rows", not an
// error, so a delete must check that something actually went.
export const NOT_DELETED = "Nothing was deleted — you may not have permission, or it was already removed.";

/**
 * Delete one record of a kind that is kept: a client, project, lead,
 * appointment, insurance company, document, bulletin post or user. Its row
 * stays in the database, flagged as deleted and hidden from everyone
 * (migration 20261104100000); an administrator can restore it under
 * Settings. The caller's own rights decide, as for any delete. Returns
 * null when it went, else what to say.
 */
export async function removeRecord(supabase, table, id) {
  const { data: gone, error } = await supabase.rpc("remove_record", { p_table: table, p_id: id });
  if (error) return String(error.message || error);
  return gone ? null : NOT_DELETED;
}

/**
 * Shared delete helper: one record, by id, then revalidate. `log`:
 * { action, entity, name } puts it in the activity log, with what the
 * record was called (its `name` column, read while it can still be seen).
 */
export async function deleteRow(table, formData, paths, log = null) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { data: before } = log?.name ? await supabase.from(table).select(log.name).eq("id", id).maybeSingle() : { data: null };
  const problem = await removeRecord(supabase, table, id);
  if (problem) return fail(problem);
  if (log) await logActivity(supabase, log.action, { entity: log.entity, entityId: id, detail: before?.[log.name] ?? null });
  for (const p of paths) revalidatePath(p);
  return ok({ id });
}
