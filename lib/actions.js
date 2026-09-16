"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseCsv, rowsToLeads } from "@/lib/csv";
import { validate, formValues, schemas, cross, validateIpList } from "@/lib/validate";

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

  // Record the login the way the legacy app's UserMaster.LastLogin did.
  const me = await currentAppUser(supabase);
  if (me) {
    await supabase.from("users").update({ last_login: new Date().toISOString() }).eq("id", me.id);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
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

  revalidatePath("/users");
  return ok();
}

export async function setUserIpLock(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing user id.");
  const locked = formData.get("ip_locked") === "true";
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ ip_locked: locked }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/users");
  return ok({ id });
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

export async function addIpAddress(prevState, formData) {
  const ip = s(formData, "ip_address");
  if (!ip) return fail("IP address is required.", { ip_address: "Required" });
  const bad = validateIpList(ip);
  if (!bad.ok) return fail(bad.error, { ip_address: bad.error });
  const supabase = await createClient();
  const { error } = await supabase
    .from("ip_whitelist")
    .insert({ ip_address: ip, label: s(formData, "label") });
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok();
}

export async function removeIpAddress(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const { error } = await supabase.from("ip_whitelist").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/settings");
  return ok({ id });
}

/**
 * Saves the whole settings screen in one submit: the organization, branding and
 * mail groups, plus the IP allow-list (one address per line).
 */
export async function saveSettings(prevState, formData) {
  const { values, failed } = check(formData, schemas.settings);
  if (failed) return failed;

  const ipCheck = validateIpList(formData.get("ip_whitelist"));
  if (!ipCheck.ok) {
    return fail(ipCheck.error, { ip_whitelist: ipCheck.error }, { ...values, ip_whitelist: String(formData.get("ip_whitelist") ?? "") });
  }

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

  // Replace the allow-list with exactly what the textarea holds (already validated).
  const wanted = ipCheck.list;

  const { data: currentIps } = await supabase.from("ip_whitelist").select("id, ip_address");
  const have = currentIps ?? [];

  const toRemove = have.filter((r) => !wanted.includes(r.ip_address)).map((r) => r.id);
  if (toRemove.length) {
    const { error } = await supabase.from("ip_whitelist").delete().in("id", toRemove);
    if (error) return fail(error);
  }

  const haveSet = new Set(have.map((r) => r.ip_address));
  const toAdd = wanted.filter((ip) => !haveSet.has(ip)).map((ip) => ({ ip_address: ip }));
  if (toAdd.length) {
    const { error } = await supabase.from("ip_whitelist").insert(toAdd);
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

  const { records: parsed, errors: skipped, headers } = rowsToLeads(rows);
  if (!headers.includes("company_name")) {
    return fail("No recognisable company column — expected a 'Company' heading.");
  }

  const supabase = await createClient();
  const me = await currentAppUser(supabase);

  // "New" is the landing status for imported records, as in the legacy import.
  const { data: newStatus } = await supabase
    .from("lead_statuses")
    .select("id")
    .eq("code", "new")
    .maybeSingle();

  const now = new Date().toISOString();
  let errors = skipped;
  const records = parsed.map((rec) => ({
    ...rec,
    project_id: projectId,
    status_id: newStatus?.id ?? null,
    list_source: rec.list_source || listSource,
    lead_date: now,
    import_date: now,
  }));

  if (records.length === 0) return fail("No valid rows found in that file.");

  // Insert in chunks so a large list does not blow the request limit.
  let imported = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error, count } = await supabase
      .from("leads")
      .insert(chunk, { count: "exact" });
    if (error) {
      errors += chunk.length;
    } else {
      imported += count ?? chunk.length;
    }
  }

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

  revalidatePath("/imports");
  revalidatePath("/leads");
  revalidatePath("/");
  return ok({ imported, errors, total: rows.length - 1 });
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
