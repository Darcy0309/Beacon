/**
 * Project Info (Sean, Oct 2026): the client profile sheet kept with each
 * project, read and written. Read as the signed-in person (Row Level
 * Security decides whose), or with the server's role for a private link.
 * Written only with the server's role, once the caller has checked who is
 * asking (actions.js). A DB dev project's Project Info is the appointment
 * project's it promotes to, as its calendar is.
 */

import "server-only";
import { normalizeState } from "@/lib/csv";
import { fullName } from "@/lib/format";
import { MAX_PRODUCERS, US_STATES, WEEKDAYS, cleanProducers } from "@/lib/project-info";
import { fail } from "@/lib/server/action-helpers";
import { readInfoToken, sameKey } from "@/lib/server/info-link";
import { one, readAll } from "@/lib/server/query-helpers";
import { cross, formValues, schemas, validate } from "@/lib/validate";

const PROFILE_COLUMNS = `project_id, agent_mobile, agent_email, states_licensed, producers, top_carriers, avoid_carriers, avoid_days,
  special_programs, personal_lines, min_employees, quote_time, quote_min_time, wc_mono, wc_min_employees, auto_mono, auto_min_autos,
  health_only, health_min_lives, value_added, exclusive_program, industry_notes, link_key, updated_at, updated_via,
  editor:users(first_name, last_name, role)`;

/**
 * The project whose Project Info `projectId` shows ({ id, name, asked, own,
 * tied }): the appointment project a DB dev project is tied to (`tied`),
 * one sheet for them all, unless the DB dev project keeps its own (`own`;
 * Sean, Oct 2026); else its own. The project itself should the appointment
 * project be gone. Null when the project is not there (or, read as the
 * signed-in person, not theirs to see).
 */
export async function resolveInfoProject(db, projectId) {
  const { data: asked, error } = await db.from("projects").select("id, name, appt_project_id")
    .eq("id", Number(projectId)).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!asked) return null;
  if (asked.appt_project_id) {
    const [{ data: appt }, { data: mine }] = await Promise.all([
      db.from("projects").select("id, name").eq("id", asked.appt_project_id).is("deleted_at", null).maybeSingle(),
      db.from("project_profiles").select("own").eq("project_id", asked.id).maybeSingle(),
    ]);
    if (appt && !mine?.own) return { id: appt.id, name: appt.name, asked, own: false, tied: appt };
    if (appt) return { id: asked.id, name: asked.name, asked, own: true, tied: appt };
  }
  return { id: asked.id, name: asked.name, asked, own: false, tied: null };
}

/**
 * A project's Project Info as the pages show it and the form fills in from,
 * one flat record in the columns' names: the client and project, the
 * project's office (the agent, their phone and address), and the rest of
 * the sheet; who changed it last and how; and the DB dev projects that
 * share it (`shared_with`). Never the link's key. Null when there is no
 * such project to see.
 */
export async function loadProjectInfo(db, projectId) {
  const target = await resolveInfoProject(db, projectId);
  if (!target) return null;
  const [{ data: project, error }, { data: profile, error: profileError }, { data: sharing }] = await Promise.all([
    db.from("projects").select("id, name, contact_name, contact_title, phone, address, city, state, zip, company:companies(id, name, email)")
      .eq("id", target.id).maybeSingle(),
    db.from("project_profiles").select(PROFILE_COLUMNS).eq("project_id", target.id).maybeSingle(),
    db.from("projects").select("id, name, profile:project_profiles(own)").eq("appt_project_id", target.id).is("deleted_at", null).order("name"),
  ]);
  if (error) throw error;
  if (profileError) throw profileError;
  if (!project) return null;
  const company = one(project.company);
  const editor = one(profile?.editor);
  const p = profile ?? {};
  return {
    project_id: project.id,
    project_name: project.name,
    asked_id: target.asked.id,
    asked_name: target.asked.name,
    // The tied DB dev projects that use this sheet (not the ones keeping their own).
    shared_with: (sharing ?? []).filter((x) => !one(x.profile)?.own).map((x) => x.name),
    // A tied DB dev project: whether it keeps its own, and the appointment project it is tied to.
    own: target.own,
    tied_id: target.tied?.id ?? null,
    tied_name: target.tied?.name ?? null,
    client_name: company?.name ?? null,
    client_email: company?.email ?? null,
    contact_name: project.contact_name, contact_title: project.contact_title, phone: project.phone,
    address: project.address, city: project.city, state: project.state, zip: project.zip,
    agent_mobile: p.agent_mobile ?? null,
    agent_email: p.agent_email ?? null,
    states_licensed: p.states_licensed ?? [],
    producers: cleanProducers(p.producers),
    top_carriers: p.top_carriers ?? [],
    avoid_carriers: p.avoid_carriers ?? [],
    avoid_days: (p.avoid_days ?? []).map(Number),
    special_programs: p.special_programs ?? null,
    personal_lines: p.personal_lines ?? null,
    min_employees: p.min_employees ?? null,
    quote_time: p.quote_time ?? null,
    quote_min_time: p.quote_min_time ?? null,
    wc_mono: p.wc_mono ?? null,
    wc_min_employees: p.wc_min_employees ?? null,
    auto_mono: p.auto_mono ?? null,
    auto_min_autos: p.auto_min_autos ?? null,
    health_only: p.health_only ?? null,
    health_min_lives: p.health_min_lives ?? null,
    value_added: p.value_added ?? null,
    exclusive_program: p.exclusive_program ?? null,
    industry_notes: p.industry_notes ?? null,
    updated_at: profile && profile.updated_via ? profile.updated_at : null,
    updated_by: editor ? fullName(editor) || null : null,
    updated_by_client: editor?.role === "client",
    updated_via: p.updated_via ?? null,
    has_link: Boolean(p.link_key),
  };
}

/** The carriers to pick from: the Insurance Companies list's names, A to Z. */
export async function carrierNames(db) {
  const rows = await readAll((from, to) => db.from("agencies").select("name").is("deleted_at", null).order("name").order("id").range(from, to));
  return [...new Set(rows.map((r) => r.name).filter(Boolean))];
}

/**
 * What a private link opens: { info, link } for a link still good (signed,
 * not expired, and its key still the project's), else { problem } to show.
 * Read with the server's role.
 */
export async function infoByLink(admin, token) {
  const link = readInfoToken(token);
  if (!link) return { problem: "This link has expired or is not valid. Ask Signature Marketing to send you a new one." };
  const { data: row } = await admin.from("project_profiles").select("link_key").eq("project_id", link.projectId).maybeSingle();
  if (!sameKey(row?.link_key, link.linkKey)) return { problem: "This link has been replaced by a newer one. Use the latest link you were sent, or ask Signature Marketing for a new one." };
  const info = await loadProjectInfo(admin, link.projectId);
  if (!info || info.project_id !== link.projectId) return { problem: "This project is no longer available." };
  return { info, link };
}

const yes = (v) => (v === "yes" ? true : v === "no" ? false : null);
const whole = (v) => (v === "" || v == null ? null : Number(String(v).replace(/,/g, "")));
const text = (v) => (v === "" || v == null ? null : v);

/**
 * A Project Info form, read and checked: { office, profile, values } to
 * write, or { failed } (a fail() result, with each field's problem) to send
 * back. `carriers`: the names on the list; `kept`: the carriers already
 * saved, which stay good should they have come off the list since.
 */
export function readInfoForm(formData, { carriers = [], kept = [] } = {}) {
  const values = formValues(formData, Object.keys(schemas.projectInfo));
  const { errors } = validate(values, schemas.projectInfo, cross.projectInfo);

  const several = (name) => [...new Set(formData.getAll(name).map((v) => String(v).trim()).filter(Boolean))];
  const states = several("states_licensed").map((s) => s.toUpperCase()).filter((s) => US_STATES.includes(s)).sort();
  const known = new Set([...carriers, ...kept]);
  const pickCarriers = (name) => {
    const list = several(name).slice(0, 200);
    const off = list.filter((c) => !known.has(c));
    if (off.length) errors[name] = `Choose carriers from the list (not on it: ${off.slice(0, 3).join(", ")})`;
    return list;
  };
  const top = pickCarriers("top_carriers");
  const avoid = pickCarriers("avoid_carriers");
  const days = WEEKDAYS.map(([d]) => d).filter((d) => several("avoid_days").includes(String(d)));

  const count = Object.keys(errors).length;
  if (count) {
    const echo = { ...values, states_licensed: states, top_carriers: top, avoid_carriers: avoid, avoid_days: days };
    return { failed: fail(count === 1 ? Object.values(errors)[0] : `Please fix ${count} highlighted fields.`, errors, echo) };
  }

  const producers = cleanProducers(Array.from({ length: MAX_PRODUCERS }, (_, i) => i + 1).map((n) => ({
    first: values[`producer_first_${n}`], last: values[`producer_last_${n}`], email: values[`producer_email_${n}`],
    leads: values[`producer_leads_${n}`] === "on",
  })));
  return {
    values,
    office: {
      contact_name: text(values.contact_name), address: text(values.address), city: text(values.city),
      state: normalizeState(values.state), zip: text(values.zip), phone: text(values.phone),
    },
    profile: {
      agent_mobile: text(values.agent_mobile), agent_email: text(values.agent_email),
      states_licensed: states, producers, top_carriers: top, avoid_carriers: avoid, avoid_days: days,
      special_programs: text(values.special_programs), personal_lines: yes(values.personal_lines),
      min_employees: whole(values.min_employees), quote_time: text(values.quote_time), quote_min_time: text(values.quote_min_time),
      wc_mono: yes(values.wc_mono), wc_min_employees: yes(values.wc_mono) ? whole(values.wc_min_employees) : null,
      auto_mono: yes(values.auto_mono), auto_min_autos: yes(values.auto_mono) ? whole(values.auto_min_autos) : null,
      health_only: yes(values.health_only), health_min_lives: yes(values.health_only) ? whole(values.health_min_lives) : null,
      value_added: text(values.value_added), exclusive_program: text(values.exclusive_program), industry_notes: text(values.industry_notes),
    },
  };
}

/** The carriers a project's Project Info already has, which stay good on the next save. */
export async function keptCarriers(admin, projectId) {
  const { data } = await admin.from("project_profiles").select("top_carriers, avoid_carriers").eq("project_id", projectId).maybeSingle();
  return [...(data?.top_carriers ?? []), ...(data?.avoid_carriers ?? [])];
}

/**
 * Write a checked form (readInfoForm()) to a project's Project Info and its
 * office, with the server's role: `userId` who did it (none for a link),
 * `via` "app" or "link". Returns what went wrong, or null.
 */
export async function writeProjectInfo(admin, projectId, { office, profile }, { userId = null, via = "app" } = {}) {
  const { error } = await admin.from("project_profiles").upsert(
    { project_id: projectId, ...profile, updated_at: new Date().toISOString(), updated_by: userId, updated_via: via },
    { onConflict: "project_id" }
  );
  if (error) return error.message;
  const { error: officeError } = await admin.from("projects").update(office).eq("id", projectId);
  return officeError ? officeError.message : null;
}

// What a Project Info sheet holds (not who changed it, nor its link's key).
const SHEET = ["agent_mobile", "agent_email", "states_licensed", "producers", "top_carriers", "avoid_carriers", "avoid_days", "special_programs",
  "personal_lines", "min_employees", "quote_time", "quote_min_time", "wc_mono", "wc_min_employees", "auto_mono", "auto_min_autos",
  "health_only", "health_min_lives", "value_added", "exclusive_program", "industry_notes"];
const OFFICE = ["contact_name", "contact_title", "phone", "address", "city", "state", "zip"];
const sheetOf = (row) => Object.fromEntries(SHEET.map((k) => [k, row?.[k] ?? null]).filter(([, v]) => v != null));
const filled = (row) => Object.entries(sheetOf(row)).some(([, v]) => !(Array.isArray(v) && v.length === 0));

/**
 * A tied DB dev project keeps its own Project Info (`own`), starting from a
 * copy of the shared one (and the appointment project's office where its
 * own is blank); or (`own` false) uses the shared one again, its own kept
 * aside. With the server's role. Returns what went wrong, or null.
 */
export async function setOwnInfo(admin, projectId, own) {
  const { data: p } = await admin.from("projects").select("id, appt_project_id, " + OFFICE.join(", ")).eq("id", projectId).maybeSingle();
  if (!p?.appt_project_id) return "Only a project tied to an appointment project shares its Project Info.";
  if (!own) {
    const { error } = await admin.from("project_profiles").update({ own: false }).eq("project_id", projectId);
    return error?.message ?? null;
  }
  const [{ data: shared }, { data: appt }] = await Promise.all([
    admin.from("project_profiles").select(SHEET.join(", ")).eq("project_id", p.appt_project_id).maybeSingle(),
    admin.from("projects").select(OFFICE.join(", ")).eq("id", p.appt_project_id).maybeSingle(),
  ]);
  const { error } = await admin.from("project_profiles").upsert({ project_id: projectId, ...sheetOf(shared), own: true }, { onConflict: "project_id" });
  if (error) return error.message;
  const office = Object.fromEntries(OFFICE.filter((k) => !p[k] && appt?.[k]).map((k) => [k, appt[k]]));
  if (Object.keys(office).length) {
    const { error: officeError } = await admin.from("projects").update(office).eq("id", projectId);
    if (officeError) return officeError.message;
  }
  return null;
}

/**
 * A DB dev project just tied to an appointment project, whatever order they
 * were made in: Project Info filled in on the DB dev project goes to the
 * appointment project when that one has none yet, so the shared sheet is
 * not empty. With the server's role.
 */
export async function carryInfoOnTie(admin, dbdevId, apptId) {
  const { data: rows } = await admin.from("project_profiles").select(`project_id, own, ${SHEET.join(", ")}`).in("project_id", [dbdevId, apptId]);
  const mine = rows?.find((r) => r.project_id === dbdevId);
  const theirs = rows?.find((r) => r.project_id === apptId);
  if (!mine || mine.own || !filled(mine) || filled(theirs)) return;
  const { error } = await admin.from("project_profiles").upsert({ project_id: apptId, ...sheetOf(mine) }, { onConflict: "project_id" });
  if (error) console.error("[project info] not carried over", dbdevId, apptId, error.message);
}
