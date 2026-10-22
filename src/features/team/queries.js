/** Meet the Team: the staff, with their photos, what they do and how they are doing. */

import "server-only";
import { createClient } from "@/lib/supabase/server";

const n = (v) => (v == null ? null : Number(v));

/**
 * Every active member of staff (team_directory()): { id, name, role, photo, bio, mine, does, since,
 * status ("calling" | "active" | "away"), lastCall, kudos, birthday, giftsToday, leadsMonth,
 * apptsMonth, leadsTotal, apptsTotal } (the totals for a client only: what they did for it).
 */
export async function getTeam() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_directory");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, name: r.name ?? "Team member", role: r.role, photo: r.photo_path, bio: r.bio, mine: Boolean(r.mine),
    does: r.does, since: r.since, status: r.status, lastCall: r.last_call, kudos: n(r.kudos) ?? 0,
    birthday: Boolean(r.birthday_today), giftsToday: n(r.gifts_today) ?? 0,
    leadsMonth: n(r.leads_month) ?? 0, apptsMonth: n(r.appts_month) ?? 0, leadsTotal: n(r.leads_total), apptsTotal: n(r.appts_total),
  }));
}

/** This week's spotlight: { appointments, leads, calls }, each { id, name, photo, count } or missing; null when turned off. */
export async function getTeamSpotlight() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_spotlight");
  if (error) throw error;
  return data ?? null;
}
