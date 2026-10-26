/** A project's calendar: the appointments on it and the time blocked out. */

import "server-only";
import { after } from "next/server";
import { refreshStaleFeeds } from "@/features/calendar/sync";
import { minutesOf, weeklyBlock } from "@/lib/project-calendar";
import { one, readAll } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

const BLOCK_COLUMNS = "id, starts_on, ends_on, start_time, end_time, note, feed_id, by:users!calendar_blocks_created_by_fkey(first_name, last_name, role)";

const NOTE_COLUMNS = "id, on_date, at_time, until_time, body, by:users!calendar_notes_created_by_fkey(first_name, last_name, role)";

// A note on a time of day as the calendar shows it; `project`: the calendar it is on, when several are shown together.
function shapeNote(n) {
  const by = one(n.by);
  return {
    id: n.id, date: n.on_date, start: minutesOf(n.at_time), end: n.until_time ? minutesOf(n.until_time) : null, text: n.body,
    by: by ? [by.first_name, by.last_name].filter(Boolean).join(" ") || null : null, byClient: by?.role === "client",
    ...(n.project ? { project: one(n.project)?.name ?? null } : {}),
  };
}

// A block as the calendar shows it; `project`: the calendar it is on, when several are shown together.
function shapeBlock(b) {
  const by = one(b.by);
  return {
    id: b.id, startsOn: b.starts_on, endsOn: b.ends_on, start: b.start_time ? minutesOf(b.start_time) : null,
    end: b.end_time ? minutesOf(b.end_time) : null, note: b.note,
    // Busy on someone's own calendar (connected to this one): no more is known of it than when.
    synced: b.feed_id != null,
    by: by ? [by.first_name, by.last_name].filter(Boolean).join(" ") || null : null, byClient: by?.role === "client",
    ...(b.project ? { project: one(b.project)?.name ?? null } : {}),
  };
}

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
  const asked = Number(projectId);
  const [project, appts, blocks, mine, notes] = await Promise.all([
    // With the weekdays the client takes no appointments on (its Project Info).
    supabase.from("projects").select("id, name, profile:project_profiles(avoid_days)").eq("id", calendarId).maybeSingle(),
    supabase.from("appointments")
      .select("id, appt_date, appt_time, duration_min, confirmed_at, lead:leads(id, company_name)")
      .eq("project_id", calendarId).is("invalid_at", null).gte("appt_date", from).lte("appt_date", to).limit(2000),
    // Read in pages: a connected personal calendar can add a busy time for every meeting, past the API's 1,000-row cap.
    readAll((first, last) => supabase.from("calendar_blocks")
      .select(BLOCK_COLUMNS)
      .eq("project_id", calendarId).lte("starts_on", to).gte("ends_on", from).order("starts_on").order("id").range(first, last))
      .then((data) => ({ data }), (error) => ({ error })),
    // A DB dev project keeping its own Project Info: opened from it, its own days to avoid.
    asked !== calendarId
      ? supabase.from("project_profiles").select("own, avoid_days").eq("project_id", asked).maybeSingle()
      : Promise.resolve({ data: null }),
    // Notes on its times ("Hour Text"): what someone wrote against a time of day.
    supabase.from("calendar_notes").select(NOTE_COLUMNS).eq("project_id", calendarId).gte("on_date", from).lte("on_date", to)
      .order("on_date").order("at_time").limit(2000),
  ]);
  if (!project.data) return null;
  // Personal calendars connected to this one are read again, once this answer has gone, when they have gone stale.
  after(() => refreshStaleFeeds(calendarId).catch((err) => console.error("[calendar sync]", err?.message ?? err)));
  if (appts.error) throw appts.error;
  if (blocks.error) throw blocks.error;
  if (notes.error) throw notes.error;
  const avoid = mine.data?.own ? mine.data.avoid_days : one(project.data.profile)?.avoid_days;
  const weekly = weeklyBlock({ projectId: calendarId, days: avoid, from, to });
  return {
    projectId: calendarId,
    name: project.data.name,
    from,
    to,
    appointments: (appts.data ?? []).map((a) => ({
      id: a.id, date: a.appt_date, time: a.appt_time, duration: a.duration_min ?? 30, confirmed: Boolean(a.confirmed_at),
      company: one(a.lead)?.company_name ?? null, leadId: one(a.lead)?.id ?? null,
    })),
    blocks: [...(weekly ? [weekly] : []), ...(blocks.data ?? []).map(shapeBlock)],
    notes: (notes.data ?? []).map(shapeNote),
  };
}

/** The notes on the times of several project calendars shown together, each with its project. */
export async function getNotesAcross({ projectIds, from, to }) {
  if (!projectIds?.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("calendar_notes").select(`${NOTE_COLUMNS}, project:projects(name)`)
    .in("project_id", projectIds).gte("on_date", from).lte("on_date", to).order("on_date").order("at_time").limit(2000);
  if (error) throw error;
  return (data ?? []).map(shapeNote);
}

/**
 * The time blocked out from `from` to `to` on several project calendars
 * shown together (a client's: all of its projects'), each block with the
 * project whose calendar it is on. Row Level Security decides which.
 */
export async function getBlocksAcross({ projectIds, from, to }) {
  if (!projectIds?.length) return [];
  const supabase = await createClient();
  // Read in pages, as on one calendar: synced busy times can pass the API's 1,000-row cap, and ordered by
  // day a single read would drop the latest blocked days. And each one's days to avoid (Project Info).
  const [data, profiles] = await Promise.all([
    readAll((first, last) => supabase.from("calendar_blocks")
      .select(`${BLOCK_COLUMNS}, project_id, project:projects(name)`)
      .in("project_id", projectIds).lte("starts_on", to).gte("ends_on", from).order("starts_on").order("id").range(first, last)),
    supabase.from("project_profiles").select("project_id, avoid_days, project:projects(name)").in("project_id", projectIds),
  ]);
  if (profiles.error) throw profiles.error;
  // Personal calendars connected to any of them are read again when they have gone stale, as on one calendar.
  after(() => Promise.all(projectIds.slice(0, 12).map((id) => refreshStaleFeeds(id).catch((err) => console.error("[calendar sync]", err?.message ?? err)))));
  const weekly = (profiles.data ?? [])
    .map((p) => weeklyBlock({ projectId: p.project_id, days: p.avoid_days, from, to, project: one(p.project)?.name ?? null }))
    .filter(Boolean);
  return [...weekly, ...(data ?? []).map(shapeBlock)];
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

/**
 * The personal calendar the signed-in person connected to a project's
 * calendar, if any: where it is from, when it was last read and how that
 * went. Never the link.
 */
export async function getMyCalendarFeed(calendarProjectId) {
  const supabase = await createClient();
  const { data } = await supabase.from("calendar_feeds")
    .select("id, provider, busy_count, last_synced_at, last_error").eq("project_id", Number(calendarProjectId)).maybeSingle();
  return data
    ? { id: data.id, provider: data.provider, busy: data.busy_count, syncedAt: data.last_synced_at, error: data.last_error }
    : null;
}
