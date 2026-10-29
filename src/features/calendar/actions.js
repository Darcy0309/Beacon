"use server";

/** Time blocked out on a project's calendar. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { busyTimes, calendarLink } from "@/lib/busy-times";
import { addDays, daysBetween, todayIn, weekdayOf } from "@/lib/dates";
import { minutesOf } from "@/lib/project-calendar";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { fetchCalendar, syncFeed } from "@/features/calendar/sync";
import { schemas } from "@/lib/validate";

const asTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/**
 * Block out time on a project's calendar: whole days, or between two times
 * each day from `starts_on` to `ends_on` (one day when no end is given), or
 * (Sean, Oct 2026) only on the `weekdays` ticked, every week until then, up
 * to a year. Anyone who can see the calendar can: staff, and the client's
 * own people.
 */
export async function addCalendarBlock(prevState, formData) {
  const { values, failed } = check(formData, schemas.calendarBlock);
  if (failed) return failed;
  const repeats = formData.get("repeat") === "weekly";
  const weekdays = repeats ? [...new Set(formData.getAll("weekdays").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
  if (repeats && !weekdays.length) return fail("Tick the days of the week it repeats on", { weekdays: "Tick at least one day" }, values);
  if (repeats && !values.ends_on) return fail("Choose the day it repeats until", { ends_on: "Choose the last day" }, values);
  const endsOn = values.ends_on || values.starts_on;
  if (endsOn < values.starts_on) return fail("The last day is before the first", { ends_on: "On or after the first day" }, values);
  if (daysBetween(values.starts_on, endsOn) > 366) return fail("Block out a year at most at a time", { ends_on: "Within a year of the first day" }, values);
  if (repeats && !Array.from({ length: Math.min(7, daysBetween(values.starts_on, endsOn) + 1) }, (_, i) => weekdayOf(addDays(values.starts_on, i))).some((d) => weekdays.includes(d))) {
    return fail("None of those days fall between the first day and the last", { weekdays: "Not between those days" }, values);
  }
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
    weekdays: repeats ? weekdays : null,
  }).select("id, project_id").single();
  if (error) return fail(/row-level security/i.test(error.message) ? "That calendar is not yours to change." : error, null, values);
  await logActivity(supabase, "calendar.block", { entity: "project", entityId: data.project_id, detail: `${values.starts_on}${endsOn !== values.starts_on ? ` to ${endsOn}` : ""}${repeats ? ` every ${weekdays.join(",")}` : ""}`, userId: me.id });
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
 * A note on a time of day on a project's calendar (the old "Hour Text"): it
 * says something about the time (a reserved slot, someone back at 2) without
 * keeping appointments off it. Anyone who can see the calendar can add one.
 */
export async function addCalendarNote(prevState, formData) {
  const { values, failed } = check(formData, schemas.calendarNote);
  if (failed) return failed;
  const at = minutesOf(values.at_time);
  if (at == null) return fail("Choose the time", { at_time: "Choose a time" }, values);
  const until = values.until_time ? minutesOf(values.until_time) : null;
  if (until != null && until <= at) return fail("The end must be after the start", { until_time: "After the start" }, values);
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (!me) return fail("Sign in again to do that.");
  const { data, error } = await supabase.from("calendar_notes").insert({
    project_id: Number(values.project_id), on_date: values.on_date, at_time: asTime(at), until_time: until == null ? null : asTime(until), body: values.body.trim(),
  }).select("id, project_id").single();
  if (error) return fail(/row-level security/i.test(error.message) ? "That calendar is not yours to change." : error, null, values);
  await logActivity(supabase, "calendar.note", { entity: "project", entityId: data.project_id, detail: `${values.on_date} ${values.at_time}${values.until_time ? `–${values.until_time}` : ""}`, userId: me.id });
  revalidatePath("/calendar");
  return ok({ id: data.id });
}

/** Take a note off a calendar. */
export async function removeCalendarNote(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing note.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_notes").delete().eq("id", id).select("id, project_id");
  if (error) return fail(error);
  if (!data?.length) return fail("That is already gone, or not yours to remove.");
  await logActivity(supabase, "calendar.note_remove", { entity: "project", entityId: data[0].project_id });
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
