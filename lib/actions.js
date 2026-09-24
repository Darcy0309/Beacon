"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, rowsToImport } from "@/lib/csv";
import { validate, formValues, schemas, cross } from "@/lib/validate";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ok = (data = null) => ({ ok: true, data, error: null, fieldErrors: null, values: null });

/**
 * Failure result. `fieldErrors` maps field -> message for inline display and
 * `values` echoes what was submitted so the form can keep the user's input.
 */
const fail = (error, fieldErrors = null, values = null) => ({
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
function check(formData, schema, crossFn) {
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

/** Positive integer from a FormData, or null. Used by the small toggle/delete actions. */
function idFrom(formData, key = "id") {
  const v = String(formData.get(key) ?? "").trim();
  return /^[1-9]\d*$/.test(v) ? Number(v) : null;
}

/** Trim a form value, returning null for blanks so empty inputs clear columns. */
const s = (form, key) => {
  const v = form.get(key);
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};
const n = (form, key) => {
  const v = s(form, key);
  return v === null ? null : Number(v);
};

async function currentAppUser(supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", user.id)
    .maybeSingle();
  return data ?? null;
}

/**
 * Record what someone did, for the activity screen. Never blocks or fails the
 * action that triggered it — a lost log line must not cost a saved record.
 * Pass `userId` when the caller already knows it, to save a round trip.
 */
async function logActivity(supabase, action, { entity, entityId, detail, userId } = {}) {
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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signIn(prevState, formData) {
  const { values, failed } = check(formData, schemas.login);
  if (failed) return failed;
  const { email, password } = values;
  const next = s(formData, "next") || "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(error);

  // With two-factor enrolled the password only gets the user to aal1; the
  // login page then asks for the code.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    revalidatePath("/", "layout");
    return { ...ok({ mfa: true }), mfa: true };
  }

  await finishSignIn(supabase);
  redirect(next);
}

/** Second step of signing in: the six-digit code from the authenticator app. */
export async function verifyTwoFactor(prevState, formData) {
  const code = s(formData, "code")?.replace(/\s/g, "") ?? "";
  const next = s(formData, "next") || "/";
  if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit code from your authenticator app.", { code: "Six digits, please." });

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return fail(listError);

  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return fail("No authenticator is set up for this account.");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return fail(error.message === "Invalid TOTP code entered" ? "That code is not right. Try the current one." : error);

  await finishSignIn(supabase);
  redirect(next);
}

/** Stamp the last login and record it, once a sign-in is fully authenticated. */
async function finishSignIn(supabase) {
  const me = await currentAppUser(supabase);
  if (me) {
    // Recorded the way the legacy app's UserMaster.LastLogin did.
    await supabase.from("users").update({ last_login: new Date().toISOString() }).eq("id", me.id);
    await logActivity(supabase, "sign_in", { userId: me.id });
  }
  revalidatePath("/", "layout");
}

/**
 * Start setting up an authenticator app: returns the QR code and the secret
 * to type in by hand. The factor stays unverified until confirmTwoFactor().
 */
export async function startTwoFactor() {
  const supabase = await createClient();

  // A half-finished attempt from earlier would block a new one.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Lighthouse",
  });
  if (error) return fail(error);

  // Supabase hands back an SVG, sometimes already wearing a `data:` prefix.
  // Base64 keeps the markup's own quotes and hashes out of the URL.
  const svg = String(data.totp.qr_code).replace(/^data:image\/svg\+xml;(utf-8|charset=utf-8),/, "");
  const qr = `data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(svg), "utf8").toString("base64")}`;

  return ok({ factorId: data.id, qr, secret: data.totp.secret });
}

/** Confirm the authenticator with its first code, switching two-factor on. */
export async function confirmTwoFactor(prevState, formData) {
  const factorId = s(formData, "factor_id");
  const code = s(formData, "code")?.replace(/\s/g, "") ?? "";
  if (!factorId) return fail("Start the setup again.");
  if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit code from your authenticator app.", { code: "Six digits, please." });

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return fail(error.message === "Invalid TOTP code entered" ? "That code is not right. Try the current one." : error);

  await logActivity(supabase, "mfa.enable");
  revalidatePath("/security");
  return ok({ enabled: true });
}

/** Switch two-factor off by removing every enrolled authenticator. */
export async function disableTwoFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return fail(error);

  for (const f of data?.all ?? []) {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (unenrollError) return fail(unenrollError);
  }

  await logActivity(supabase, "mfa.disable");
  revalidatePath("/security");
  return ok({ enabled: false });
}

export async function signOut() {
  const supabase = await createClient();
  await logActivity(supabase, "sign_out");
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

function leadPayload(formData) {
  return {
    company_name: s(formData, "company_name"),
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    phone: s(formData, "phone"),
    email: s(formData, "email"),
    website: s(formData, "website"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    zip: s(formData, "zip"),
    county: s(formData, "county"),
    sic_code: s(formData, "sic_code"),
    description: s(formData, "description"),
    list_source: s(formData, "list_source"),
    employees: s(formData, "employees"),
    covered_employees: s(formData, "covered_employees"),
    autos: s(formData, "autos"),
    sales_volume: s(formData, "sales_volume"),
    years_in_business: s(formData, "years_in_business"),
    estimated_annual_premium: s(formData, "estimated_annual_premium"),
    notes_dcm: s(formData, "notes_dcm"),
    notes_client: s(formData, "notes_client"),
    status_id: n(formData, "status_id"),
    project_id: n(formData, "project_id"),
    agency_id: n(formData, "agency_id"),
    assigned_user_id: n(formData, "assigned_user_id"),
  };
}

export async function createLead(prevState, formData) {
  const { failed } = check(formData, schemas.lead);
  if (failed) return failed;

  const supabase = await createClient();
  const payload = leadPayload(formData);

  const { data, error } = await supabase
    .from("leads")
    .insert({ ...payload, lead_date: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return fail(error);

  await logActivity(supabase, "lead.create", { entity: "lead", entityId: data?.id, detail: payload.company_name });
  revalidatePath("/leads");
  revalidatePath("/");
  return ok(data);
}

export async function updateLead(prevState, formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing lead id.");
  const { failed } = check(formData, schemas.lead);
  if (failed) return failed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ ...leadPayload(formData), date_last_worked: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);

  await logActivity(supabase, "lead.update", { entity: "lead", entityId: id });
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok({ id });
}

export async function deleteLead(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing lead id.");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return fail(error);
  await logActivity(supabase, "lead.delete", { entity: "lead", entityId: id });
  revalidatePath("/leads");
  return ok({ id });
}

/** Quick inline status change from the leads table. */
export async function setLeadStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "status_id");
  if (!id || !statusId) return fail("Missing lead or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status_id: statusId, date_last_worked: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  return ok({ id });
}

/** Log a call against a lead (the legacy tblCallRecord behaviour). */
export async function logCall(prevState, formData) {
  const { values, failed } = check(formData, schemas.call);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const leadId = Number(values.lead_id);

  const { error } = await supabase.from("call_records").insert({
    lead_id: leadId,
    project_id: n(formData, "project_id"),
    user_id: me?.id ?? null,
    call_result: s(formData, "call_result"),
    notes: s(formData, "notes"),
  });
  if (error) return fail(error);

  await supabase
    .from("leads")
    .update({
      date_last_worked: new Date().toISOString(),
      call_result_dbdv: s(formData, "call_result"),
    })
    .eq("id", leadId);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/qa");
  return ok();
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export async function createAppointment(prevState, formData) {
  const { values, failed } = check(formData, schemas.appointment, cross.appointment);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const leadId = Number(values.lead_id);
  const apptDate = values.appt_date;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      lead_id: leadId,
      user_id: n(formData, "user_id") ?? me?.id ?? null,
      rep_name: s(formData, "rep_name"),
      appt_date: apptDate,
      appt_time: s(formData, "appt_time"),
      duration_min: n(formData, "duration_min") ?? 30,
      status_id: n(formData, "status_id"),
      list_source: s(formData, "list_source"),
    })
    .select("id")
    .single();
  if (error) return fail(error);

  await supabase
    .from("leads")
    .update({ appt_created_date: new Date().toISOString() })
    .eq("id", leadId);

  revalidatePath("/appointments");
  revalidatePath("/calendar");
  revalidatePath("/");
  return ok(data);
}

export async function updateAppointment(prevState, formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing appointment id.");
  // lead_id is fixed on an existing appointment, so it is not part of this form.
  const { lead_id: _omit, ...editSchema } = schemas.appointment;
  const { failed } = check(formData, editSchema, cross.appointment);
  if (failed) return failed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({
      appt_date: s(formData, "appt_date"),
      appt_time: s(formData, "appt_time"),
      duration_min: n(formData, "duration_min") ?? 30,
      status_id: n(formData, "status_id"),
      rep_name: s(formData, "rep_name"),
      status_update_date: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return fail(error);

  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

export async function setAppointmentStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "status_id");
  if (!id || !statusId) return fail("Missing appointment or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status_id: statusId, status_update_date: new Date().toISOString() })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

export async function deleteAppointment(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing appointment id.");
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/appointments");
  revalidatePath("/calendar");
  return ok({ id });
}

// ---------------------------------------------------------------------------
// Companies ("Clients") and projects
// ---------------------------------------------------------------------------

export async function saveCompany(prevState, formData) {
  const { failed } = check(formData, schemas.company);
  if (failed) return failed;

  const supabase = await createClient();
  const id = idFrom(formData);
  const payload = {
    name: s(formData, "name"),
    contact_name: s(formData, "contact_name"),
    contact_title: s(formData, "contact_title"),
    email: s(formData, "email"),
    phone: s(formData, "phone"),
    address: s(formData, "address"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    zip: s(formData, "zip"),
    website: s(formData, "website"),
    sic_code: s(formData, "sic_code"),
    status: s(formData, "status") || "active",
  };
  const { error } = id
    ? await supabase.from("companies").update(payload).eq("id", id)
    : await supabase.from("companies").insert(payload);
  if (error) return fail(error);

  await logActivity(supabase, id ? "company.update" : "company.create", { entity: "company", entityId: id ?? null });
  revalidatePath("/clients");
  return ok();
}

export async function saveProject(prevState, formData) {
  const { failed } = check(formData, schemas.project, cross.project);
  if (failed) return failed;

  const supabase = await createClient();
  const id = idFrom(formData);
  const payload = {
    name: s(formData, "name"),
    company_id: n(formData, "company_id"),
    project_type_id: n(formData, "project_type_id"),
    status_id: n(formData, "status_id"),
    description: s(formData, "description"),
    client_name: s(formData, "client_name"),
    start_date: s(formData, "start_date"),
    end_date: s(formData, "end_date"),
    amount_paid: n(formData, "amount_paid"),
  };
  const { error } = id
    ? await supabase.from("projects").update(payload).eq("id", id)
    : await supabase.from("projects").insert(payload);
  if (error) return fail(error);

  await logActivity(supabase, id ? "project.update" : "project.create", { entity: "project", entityId: id ?? null });
  revalidatePath("/projects");
  return ok();
}

// ---------------------------------------------------------------------------
// Bulletin board
// ---------------------------------------------------------------------------

export async function postBulletin(prevState, formData) {
  const { values, failed } = check(formData, schemas.bulletin);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  const message = values.message;

  const { error } = await supabase.from("bulletin_board").insert({
    message,
    message_type: s(formData, "message_type") || "IN",
    project_id: n(formData, "project_id"),
    user_id: me?.id ?? null,
  });
  if (error) return fail(error);

  revalidatePath("/bulletin");
  revalidatePath("/");
  return ok();
}

export async function archiveBulletin(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("bulletin_board")
    .update({ status: "archived" })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/bulletin");
  return ok({ id });
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function submitFeedback(prevState, formData) {
  const supabase = await createClient();
  const me = await currentAppUser(supabase);

  const { error } = await supabase.from("feedback").insert({
    appointment_id: n(formData, "appointment_id"),
    lead_id: n(formData, "lead_id"),
    user_id: me?.id ?? null,
    nature_id: n(formData, "nature_id"),
    fb_status_id: n(formData, "fb_status_id"),
    rating: n(formData, "rating"),
    content: s(formData, "content"),
    additional_comment: s(formData, "additional_comment"),
    submitted_by: s(formData, "submitted_by"),
  });
  if (error) return fail(error);

  revalidatePath("/feedback");
  return ok();
}

export async function setFeedbackStatus(formData) {
  const id = idFrom(formData);
  const statusId = idFrom(formData, "fb_status_id");
  if (!id || !statusId) return fail("Missing feedback or status.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback")
    .update({ fb_status_id: statusId })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath("/feedback");
  return ok({ id });
}

// ---------------------------------------------------------------------------
// Users & access
// ---------------------------------------------------------------------------

export async function saveUser(prevState, formData) {
  const { failed } = check(formData, schemas.user, cross.user);
  if (failed) return failed;

  const supabase = await createClient();
  const id = idFrom(formData);
  const payload = {
    first_name: s(formData, "first_name"),
    last_name: s(formData, "last_name"),
    email: s(formData, "email"),
    phone: s(formData, "phone"),
    role: s(formData, "role") || "agent",
    status: s(formData, "status") || "invited",
    company_id: n(formData, "company_id"),
    username: s(formData, "username"),
  };
  const { error } = id
    ? await supabase.from("users").update(payload).eq("id", id)
    : await supabase.from("users").insert(payload);
  if (error) return fail(error);

  await logActivity(supabase, id ? "user.update" : "user.create", { entity: "user", entityId: id ?? null });
  revalidatePath("/users");
  return ok();
}

// ---------------------------------------------------------------------------
// Alerts, IP whitelist, settings
// ---------------------------------------------------------------------------

export async function setAlertRuleEnabled(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing rule id.");
  const enabled = formData.get("enabled") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("alert_rules").update({ enabled }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/alerts");
  return ok({ id });
}

/** Saves the whole settings screen in one submit: organization, branding and mail. */
export async function saveSettings(prevState, formData) {
  const { values, failed } = check(formData, schemas.settings);
  if (failed) return failed;

  const supabase = await createClient();

  const groups = [
    { key: "organization", value: { name: s(formData, "org_name") } },
    {
      key: "branding",
      value: { product: s(formData, "product_name"), logo: s(formData, "logo") },
    },
    {
      key: "mail",
      value: {
        host: s(formData, "mail_host"),
        from: s(formData, "mail_from"),
        provider: s(formData, "mail_provider"),
      },
    },
  ];

  // Merge into whatever is already stored so untouched keys survive.
  const { data: existing } = await supabase.from("app_settings").select("key, value");
  const current = Object.fromEntries((existing ?? []).map((r) => [r.key, r.value]));

  for (const g of groups) {
    const merged = { ...(current[g.key] ?? {}) };
    for (const [k, v] of Object.entries(g.value)) if (v !== null) merged[k] = v;
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: g.key, value: merged, updated_at: new Date().toISOString() });
    if (error) return fail(error);
  }

  revalidatePath("/settings");
  return ok();
}

export async function saveSetting(prevState, formData) {
  const key = s(formData, "key");
  if (!key) return fail("Missing setting key.");

  let value;
  try {
    value = JSON.parse(String(formData.get("value") ?? "{}"));
  } catch {
    return fail("Value must be valid JSON.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return fail(error);

  revalidatePath("/settings");
  return ok();
}

// ---------------------------------------------------------------------------
// CSV lead import (the legacy Imports module)
// ---------------------------------------------------------------------------

const MAX_CSV_BYTES = 5 * 1024 * 1024;

export async function importLeadsCsv(prevState, formData) {
  const { failed } = check(formData, schemas.csvImport);
  if (failed) return failed;

  const file = formData.get("file");
  if (!file || typeof file === "string" || file.size === 0) {
    return fail("Choose a CSV file to import.", { file: "Choose a file" });
  }
  if (!/\.csv$/i.test(file.name) && !/csv/i.test(file.type || "")) {
    return fail("Only .csv files can be imported.", { file: "Must be a .csv file" });
  }
  if (file.size > MAX_CSV_BYTES) {
    return fail("That file is larger than 5 MB.", { file: "Files must be 5 MB or smaller" });
  }

  const projectId = n(formData, "project_id");
  const listSource = s(formData, "list_source");

  let text;
  try {
    text = await file.text();
  } catch (e) {
    return fail(e);
  }

  const rows = parseCsv(text);
  if (rows.length < 2) return fail("That file has no data rows.");

  const { rows: parsed, errors: skipped, headers } = rowsToImport(rows);
  if (!headers.includes("company_name")) {
    return fail("No recognisable company column — expected a 'Company' heading.");
  }

  const supabase = await createClient();
  const me = await currentAppUser(supabase);

  // The sheet's call results decide the status; "New" covers anything else.
  const { data: statusRows } = await supabase.from("lead_statuses").select("id, code");
  const statusId = Object.fromEntries((statusRows ?? []).map((r) => [r.code, r.id]));

  const { data: apptStatus } = await supabase
    .from("appointment_statuses")
    .select("id")
    .eq("name", "Scheduled")
    .maybeSingle();

  const now = new Date().toISOString();
  let errors = skipped;
  let imported = 0;
  let details = 0;
  let appointments = 0;

  // Insert in chunks so a large list does not blow the request limit. Each
  // chunk returns its new ids, which the insurance and appointment rows hang
  // off — so a lead's X-dates arrive with it rather than in a second pass
  // that could half-finish.
  for (let i = 0; i < parsed.length; i += 250) {
    const chunk = parsed.slice(i, i + 250);
    const payload = chunk.map(({ lead, status }) => ({
      ...lead,
      project_id: projectId,
      status_id: statusId[status] ?? statusId.new ?? null,
      list_source: lead.list_source || listSource,
      lead_date: now,
      import_date: now,
    }));

    const { data: inserted, error } = await supabase.from("leads").insert(payload).select("id");
    if (error || !inserted) {
      console.error("[import] lead chunk failed:", error?.message);
      errors += chunk.length;
      continue;
    }
    imported += inserted.length;

    // PostgREST returns the new rows in the order they were sent.
    const insuranceRows = [];
    const appointmentRows = [];
    inserted.forEach((row, j) => {
      const source = chunk[j];
      if (!source) return;
      if (source.insurance) insuranceRows.push({ lead_id: row.id, ...source.insurance });
      if (source.appointment) {
        appointmentRows.push({
          lead_id: row.id,
          appt_date: source.appointment.appt_date,
          appt_time: source.appointment.appt_time ?? null,
          status_id: apptStatus?.id ?? null,
          rep_name: source.lead.producer_name ?? null,
          list_source: source.lead.list_source || listSource,
          appt_create_date: now,
        });
      }
    });

    if (insuranceRows.length) {
      const { error: insError } = await supabase.from("insurance_details").insert(insuranceRows);
      if (insError) console.error("[import] insurance rows failed:", insError.message);
      else details += insuranceRows.length;
    }
    if (appointmentRows.length) {
      const { error: apptError } = await supabase.from("appointments").insert(appointmentRows);
      if (apptError) console.error("[import] appointment rows failed:", apptError.message);
      else appointments += appointmentRows.length;
    }
  }

  if (imported === 0) return fail("No rows could be imported from that file.");

  const { error: batchError } = await supabase.from("import_batches").insert({
    file_name: file.name,
    source: listSource,
    project_id: projectId,
    row_count: rows.length - 1,
    imported_count: imported,
    error_count: errors,
    status: imported > 0 ? "completed" : "failed",
    imported_by: me?.id ?? null,
  });
  if (batchError) return fail(batchError);

  await logActivity(supabase, "leads.import", {
    entity: "import",
    detail: `${imported} of ${rows.length - 1} rows from ${file.name}`,
  });
  revalidatePath("/imports");
  revalidatePath("/leads");
  revalidatePath("/");
  return ok({ imported, errors, details, appointments, total: rows.length - 1 });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function deleteDocument(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing document id.");
  const supabase = await createClient();
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/documents");
  return ok({ id });
}

// ---------------------------------------------------------------------------
// Remaining deletes
// ---------------------------------------------------------------------------

/** Shared delete helper — one row, by id, then revalidate. */
async function deleteRow(table, formData, paths) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return fail(error);
  for (const p of paths) revalidatePath(p);
  return ok({ id });
}

export async function deleteProject(formData) {
  return deleteRow("projects", formData, ["/projects", "/clients"]);
}

export async function deleteCompany(formData) {
  return deleteRow("companies", formData, ["/clients", "/projects"]);
}

export async function deleteAgency(formData) {
  return deleteRow("agencies", formData, ["/insurance-companies"]);
}

export async function deleteUser(formData) {
  return deleteRow("users", formData, ["/users"]);
}

export async function deleteBulletin(formData) {
  return deleteRow("bulletin_board", formData, ["/bulletin", "/"]);
}
