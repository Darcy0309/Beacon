/** A project's calendar: the appointments on it and the time blocked out. */

import "server-only";
import { minutesOf } from "@/lib/project-calendar";
import { one } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

/**
 * What a project's calendar has from `from` to `to`: its appointments (not
 * the invalid ones) and blocked time. A DB dev project's calendar is the
 * appointment project's it promotes to. Runs as the signed-in person, so a
 * client sees only their own projects', and only appointments QA has let
 * them see. Null when the project is not theirs to see.
 */
export async function getProjectCalendar({ projectId, from, to }) {
  const supabase = await createClient();
  const { data: calendarId } = await supabase.rpc("calendar_project", { p_project_id: Number(projectId) });
  if (!calendarId) return null;
  const [project, appts, blocks] = await Promise.all([
    supabase.from("projects").select("id, name").eq("id", calendarId).maybeSingle(),
    supabase.from("appointments")
      .select("id, appt_date, appt_time, duration_min, confirmed_at, lead:leads(id, company_name)")
      .eq("project_id", calendarId).is("invalid_at", null).gte("appt_date", from).lte("appt_date", to).limit(2000),
    supabase.from("calendar_blocks")
      .select("id, starts_on, ends_on, start_time, end_time, note, by:users!calendar_blocks_created_by_fkey(first_name, last_name, role)")
      .eq("project_id", calendarId).lte("starts_on", to).gte("ends_on", from).limit(2000),
  ]);
  if (!project.data) return null;
  if (appts.error) throw appts.error;
  if (blocks.error) throw blocks.error;
  return {
    projectId: calendarId,
    name: project.data.name,
    from,
    to,
    appointments: (appts.data ?? []).map((a) => ({
      id: a.id, date: a.appt_date, time: a.appt_time, duration: a.duration_min ?? 30, confirmed: Boolean(a.confirmed_at),
      company: one(a.lead)?.company_name ?? null, leadId: one(a.lead)?.id ?? null,
    })),
    blocks: (blocks.data ?? []).map((b) => {
      const by = one(b.by);
      return {
        id: b.id, startsOn: b.starts_on, endsOn: b.ends_on, start: b.start_time ? minutesOf(b.start_time) : null,
        end: b.end_time ? minutesOf(b.end_time) : null, note: b.note,
        by: by ? [by.first_name, by.last_name].filter(Boolean).join(" ") || null : null, byClient: by?.role === "client",
      };
    }),
  };
}

/**
 * The project calendars the signed-in person can open, for a picker:
 * appointment projects, and DB dev projects that keep a calendar of their
 * own (none to promote to). Row Level Security decides which.
 */
export async function getCalendarProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects")
    .select("id, name, appt_project_id, type:project_types(code), company:companies(name)").order("name");
  if (error) throw error;
  return (data ?? [])
    .filter((p) => one(p.type)?.code === "APPT" || !p.appt_project_id)
    .map((p) => ({ value: p.id, label: [one(p.company)?.name, p.name].filter(Boolean).join(" · ") }));
}
