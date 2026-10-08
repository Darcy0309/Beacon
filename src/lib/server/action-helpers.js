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

export async function currentAppUser(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, role, status, email")
    .eq("auth_id", user.id)
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

/** Shared delete helper — one row, by id, then revalidate. */
// Row Level Security answers a delete it refuses with "0 rows", not an
// error, so a delete must check that something actually went.
export const NOT_DELETED = "Nothing was deleted — you may not have permission, or it was already removed.";

export async function deleteRow(table, formData, paths) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return fail(NOT_DELETED);
  for (const p of paths) revalidatePath(p);
  return ok({ id });
}
