"use server";

/**
 * Project Info (Sean, Oct 2026): changed by an administrator or the
 * client's own people (from their sign-in, or from the private link sent
 * when they come on board), never by a manager or agent. Each action checks
 * who is asking, then writes with the server's role.
 */

import { revalidatePath } from "next/cache";
import { addressLine } from "@/lib/project-info";
import { isReservedAddress, mailFailure, oneLine } from "@/lib/email";
import { fullName } from "@/lib/format";
import { check, currentAppUser, fail, idFrom, logActivity, ok, requestOrigin } from "@/lib/server/action-helpers";
import { INFO_LINK_DAYS, infoToken, newLinkKey } from "@/lib/server/info-link";
import { mailServer, sendMail } from "@/lib/server/mail";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";
import { carrierNames, infoByLink, keptCarriers, loadProjectInfo, readInfoForm, resolveInfoProject, setOwnInfo, writeProjectInfo } from "./server";

const NOT_YOURS = "Only an administrator or the client can change Project Info.";

/** Pages that show a project's Project Info, fresh after a change. */
function refresh(projectId) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/project-info");
}

/**
 * Save Project Info from the app: an administrator, or one of the client's
 * own people for a project of theirs (Row Level Security decides, reading
 * the project as them). A DB dev project's goes on the appointment project
 * it promotes to.
 */
export async function saveProjectInfo(prevState, formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("That project no longer exists.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || me.status !== "active" || !["admin", "client"].includes(me.role)) return fail(NOT_YOURS);
  const target = await resolveInfoProject(supabase, projectId);
  if (!target) return fail("That project no longer exists.");

  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  const [carriers, kept] = await Promise.all([carrierNames(admin), keptCarriers(admin, target.id)]);
  const form = readInfoForm(formData, { carriers, kept });
  if (form.failed) return form.failed;
  const problem = await writeProjectInfo(admin, target.id, form, { userId: me.id, via: "app" });
  if (problem) return fail(problem, null, form.values);

  await logActivity(supabase, "project.info", { entity: "project", entityId: target.id, detail: target.name, userId: me.id });
  refresh(target.id);
  return ok({ projectId: target.id });
}

/**
 * Save Project Info from the private link: no sign-in, so the link decides
 * which project, and only while it is good (signed, not expired, and still
 * the project's latest).
 */
export async function saveProjectInfoByLink(prevState, formData) {
  const admin = createAdminClient();
  if (!admin) return fail("Project Info can't be saved right now. Please try again later.");
  const opened = await infoByLink(admin, formData.get("token"));
  if (opened.problem) return fail(opened.problem);
  const { info } = opened;

  const [carriers, kept] = await Promise.all([carrierNames(admin), keptCarriers(admin, info.project_id)]);
  const form = readInfoForm(formData, { carriers, kept });
  if (form.failed) return form.failed;
  const problem = await writeProjectInfo(admin, info.project_id, form, { via: "link" });
  if (problem) {
    console.error("[project info] link save", info.project_id, problem);
    return fail("Your Project Info could not be saved. Please try again.", null, form.values);
  }
  refresh(info.project_id);
  return ok({ savedAt: new Date().toISOString() });
}

/** The signed-in administrator, with a project's Project Info as they see it; or { failed }. */
async function adminWithInfo(supabase, projectId) {
  const me = await currentAppUser(supabase);
  if (!me || me.status !== "active" || me.role !== "admin") return { failed: fail("Only an administrator can send the client their link.") };
  const info = projectId ? await loadProjectInfo(supabase, projectId) : null;
  if (!info) return { failed: fail("That project no longer exists.") };
  const admin = createAdminClient();
  if (!admin) return { failed: fail(ADMIN_UNAVAILABLE) };
  return { me, info, admin };
}

/** The project's link key, made the first time a link is asked for (or anew with `fresh`: earlier links stop working). */
async function linkKey(admin, projectId, fresh = false) {
  if (!fresh) {
    const { data } = await admin.from("project_profiles").select("link_key").eq("project_id", projectId).maybeSingle();
    if (data?.link_key) return data.link_key;
  }
  const key = newLinkKey();
  const { error } = await admin.from("project_profiles").upsert({ project_id: projectId, link_key: key }, { onConflict: "project_id" });
  if (error) throw error;
  return key;
}

const linkFor = async (projectId, key) => {
  const token = infoToken(projectId, key);
  return token ? `${await requestOrigin()}/client-profile/${token}` : null;
};

/**
 * The private link to a project's Project Info, for an administrator to copy
 * or send: { url, days }. Good for INFO_LINK_DAYS, without signing in.
 */
export async function makeInfoLink(formData) {
  const supabase = await createClient();
  const { failed, info, admin } = await adminWithInfo(supabase, idFrom(formData, "project_id"));
  if (failed) return failed;
  const url = await linkFor(info.project_id, await linkKey(admin, info.project_id));
  if (!url) return fail("A link could not be made: the server has no secret to sign it with.");
  return ok({ url, days: INFO_LINK_DAYS });
}

/** Stop every link sent before: the project gets a new key, and a new link to send. */
export async function resetInfoLink(formData) {
  const supabase = await createClient();
  const { failed, me, info, admin } = await adminWithInfo(supabase, idFrom(formData, "project_id"));
  if (failed) return failed;
  const url = await linkFor(info.project_id, await linkKey(admin, info.project_id, true));
  await logActivity(supabase, "project.info_link_reset", { entity: "project", entityId: info.project_id, detail: info.project_name, userId: me.id });
  return ok({ url, days: INFO_LINK_DAYS });
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Email the client the private link to fill in their Project Info, from the
 * company's address, with replies to the administrator who sent it.
 */
export async function sendInfoLink(prevState, formData) {
  const { values, failed: invalid } = check(formData, schemas.infoLink);
  if (invalid) return invalid;
  const supabase = await createClient();
  const { failed, me, info, admin } = await adminWithInfo(supabase, Number(values.project_id));
  if (failed) return fail(failed.error, null, values);
  if (!mailServer()) return fail(mailFailure({ code: "ENOCONFIG" }), null, values);

  const { data: settings } = await supabase.from("app_settings").select("key, value").in("key", ["mail", "organization"]);
  const setting = (k) => settings?.find((s) => s.key === k)?.value ?? {};
  const from = setting("mail").from;
  if (!from) return fail("There's no address to send from: set it in Settings › Email.", null, values);
  const org = setting("organization").name || "Signature Marketing";
  const url = await linkFor(info.project_id, await linkKey(admin, info.project_id));
  if (!url) return fail("A link could not be made: the server has no secret to sign it with.", null, values);

  // The sender by name ("Sean Fipps at Signature Marketing"); without one, just the company, never an email address.
  const { data: sender } = await supabase.from("users").select("first_name, last_name").eq("id", me.id).maybeSingle();
  const named = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ").trim();
  const who = named || org;
  const greeting = `Hi${values.name ? ` ${oneLine(values.name)}` : ""},`;
  const project = info.project_name;
  const subject = oneLine(`Your Project Info for ${project}`);
  const intro = `${named ? `${named} at ${org}` : org} has set up your project, ${project}${info.client_name ? ` for ${info.client_name}` : ""}, in Lighthouse.`;
  const ask = "Please fill in your Project Info: your agent and office, the producers taking appointments (and who should get each lead and appointment by email), the carriers you write with and those you can't compete with, the days to keep appointments off, and what qualifies an appointment. Our account managers read it on every call they make for you.";
  const after = `The link works for ${INFO_LINK_DAYS} days, without signing in. Once you have your Lighthouse sign-in, you can change it any time under Project Info.`;
  const office = addressLine(info);
  const text = `${greeting}\n\n${intro}\n\n${ask}\n\nFill in your Project Info: ${url}\n\n${after}${office ? `\n\nThe office we have on file: ${office}` : ""}\n\n${org}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">
<p>${esc(greeting)}</p><p>${esc(intro)}</p><p>${esc(ask)}</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Fill in your Project Info</a></p>
<p style="color:#374151;font-size:14px">${esc(after)}</p>
${office ? `<p style="color:#6b7280;font-size:13px">The office we have on file: ${esc(office)}</p>` : ""}
<p style="color:#6b7280;font-size:13px">${esc(org)}</p></div>`;
  const replyTo = me.email && !isReservedAddress(me.email) ? { name: who, address: me.email } : undefined;
  try {
    await sendMail({ from: { name: org, address: from }, replyTo, to: values.to, subject, text, html });
  } catch (err) {
    return fail(`The email was not sent: ${mailFailure(err)}`, null, values);
  }
  await logActivity(supabase, "project.info_link", { entity: "project", entityId: info.project_id, detail: `${project} · to ${values.to}`, userId: me.id });
  return ok({ to: values.to, url });
}

/**
 * A tied DB dev project: keep its own Project Info (own=1; a copy of the
 * shared one to start from), or use the appointment project's again (own=0).
 * Administrators.
 */
export async function setProjectInfoOwn(formData) {
  const projectId = idFrom(formData, "project_id");
  const own = formData.get("own") === "1";
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me || me.status !== "active" || me.role !== "admin") return fail("Only an administrator can change this.");
  const { data: project } = projectId ? await supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle() : { data: null };
  if (!project) return fail("That project no longer exists.");
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  const problem = await setOwnInfo(admin, project.id, own);
  if (problem) return fail(problem);
  await logActivity(supabase, own ? "project.info_own" : "project.info_shared", { entity: "project", entityId: project.id, detail: project.name, userId: me.id });
  refresh(project.id);
  revalidatePath("/projects", "layout");
  return ok({ own });
}
