"use server";

/** Time blocked out on a project's calendar. */

import { revalidatePath } from "next/cache";
import { check, currentAppUser, fail, idFrom, logActivity, ok } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { minutesOf } from "@/lib/project-calendar";
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
