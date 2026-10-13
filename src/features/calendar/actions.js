"use server";

/** Time blocked out on a project's calendar. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { busyTimes, calendarLink } from "@/lib/busy-times";
import { todayIn } from "@/lib/dates";
import { minutesOf } from "@/lib/project-calendar";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { fetchCalendar, syncFeed } from "@/features/calendar/sync";
import { schemas } from "@/lib/validate";

const asTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/**
 * Block out time on a project's calendar: whole days, or between two times
 * each day from `starts_on` to `ends_on` (one day when no end is given).
 * Anyone who can see the calendar can: staff, and the client's own people.
 */
export async function addCalendarBlock(prevState, formData) {
  const { values, failed } = check(formData, schemas.calendarBlock);
  if (failed) return failed;
  const endsOn = values.ends_on || values.starts_on;
  if (endsOn < values.starts_on) return fail("The last day is before the first", { ends_on: "On or after the first day" }, values);
  const allDay = formData.getAll("all_day").includes("on");
  const start = allDay ? null : minutesOf(values.start_time);
  const end = allDay ? null : minutesOf(values.end_time);
  if (!allDay && (start == null || end == null)) return fail("Choose the times, or tick All day", { start_time: "Choose a time" }, values);
  if (!allDay && end <= start) return fail("The end time is not after the start", { end_time: "After the start time" }, values);

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Sign in again to do that.");
  const { data, error } = await supabase.from("calendar_blocks").insert({
    project_id: Number(values.project_id), starts_on: values.starts_on, ends_on: endsOn,
    start_time: allDay ? null : asTime(start), end_time: allDay ? null : asTime(end), note: values.note || null,
  }).select("id, project_id").single();
  if (error) return fail(/row-level security/i.test(error.message) ? "That calendar is not yours to change." : error, null, values);
  await logActivity(supabase, "calendar.block", { entity: "project", entityId: data.project_id, detail: `${values.starts_on}${endsOn !== values.starts_on ? ` to ${endsOn}` : ""}`, userId: me.id });
  revalidatePath("/calendar");
  return ok({ id: data.id });
}

/** Take blocked time off a calendar. */
export async function removeCalendarBlock(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing block.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_blocks").delete().eq("id", id).select("id, project_id");
  if (error) return fail(error);
  if (!data?.length) return fail("That is already gone, or not yours to remove.");
  await logActivity(supabase, "calendar.unblock", { entity: "project", entityId: data[0].project_id });
  revalidatePath("/calendar");
  return ok({ id });
}

/**
 * Connect my own calendar to a project's calendar by its private link
 * (Google, Outlook or iCloud): the link is read once here, so a wrong one is
 * said at once, then kept (mine alone to read) and its busy times put on
 * the calendar. Connecting again replaces the link.
 */
export async function connectCalendar(prevState, formData) {
  const projectId = idFrom(formData, "project_id");
  if (!projectId) return fail("Missing project.");
  const link = calendarLink(formData.get("url"));
  if (link.error) return fail(link.error, { url: link.error });
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Sign in again to do that.");
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  const [{ data: calendarId }, { data: tz }] = await Promise.all([
    supabase.rpc("calendar_project", { p_project_id: projectId }), supabase.rpc("business_tz"),
  ]);
  if (!calendarId) return fail("That calendar is not yours to connect to.");
  const timeZone = tz || "America/Phoenix";

  // Read it before keeping it: a link that is not a calendar is refused here.
  try {
    busyTimes(await fetchCalendar(link.url), { timeZone, from: todayIn(timeZone), to: todayIn(timeZone) });
  } catch (err) {
    const message = err?.name === "TimeoutError" ? "The calendar took too long to answer. Try again." : String(err?.message ?? "That calendar could not be read.");
    return fail(message, { url: message });
  }

  const { data: mine } = await supabase.from("calendar_feeds").select("id").eq("project_id", calendarId).maybeSingle();
  const saved = mine
    ? await supabase.from("calendar_feeds").update({ url: link.url, provider: link.provider, last_error: null }).eq("id", mine.id).select("id, user_id, project_id, url").single()
    : await supabase.from("calendar_feeds").insert({ project_id: calendarId, user_id: me.id, url: link.url, provider: link.provider }).select("id, user_id, project_id, url").single();
  if (saved.error) return fail(/row-level security/i.test(saved.error.message) ? "That calendar is not yours to connect to." : saved.error);

  const result = await syncFeed(admin, saved.data, timeZone);
  await logActivity(supabase, "calendar.connect", { entity: "project", entityId: calendarId, detail: link.provider, userId: me.id });
  revalidatePath("/calendar");
  return result.ok ? ok({ provider: link.provider, busy: result.busy }) : fail(result.error, { url: result.error });
}

/** Read my connected calendar again now. */
export async function syncCalendarNow(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing calendar.");
  const supabase = await createClient();
  // Mine alone can be read here: Row Level Security shows no one else's.
  const [{ data: feed }, { data: tz }] = await Promise.all([
    supabase.from("calendar_feeds").select("id, user_id, project_id, url").eq("id", id).maybeSingle(), supabase.rpc("business_tz"),
  ]);
  if (!feed) return fail("That is not your calendar.");
  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  const result = await syncFeed(admin, feed, tz || "America/Phoenix");
  revalidatePath("/calendar");
  return result.ok ? ok({ busy: result.busy }) : fail(result.error);
}

/** Disconnect my calendar from a project's: its busy times go from the calendar with it. */
export async function disconnectCalendar(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing calendar.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_feeds").delete().eq("id", id).select("id, project_id");
  if (error) return fail(error);
  if (!data?.length) return fail("That is already disconnected, or not yours.");
  await logActivity(supabase, "calendar.disconnect", { entity: "project", entityId: data[0].project_id });
  revalidatePath("/calendar");
  return ok({ id });
}
