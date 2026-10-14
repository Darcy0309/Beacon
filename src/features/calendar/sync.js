/**
 * Reading a connected personal calendar and keeping its busy times on a
 * project's calendar. Server only: the link is the person's alone, read
 * with the service role and never sent to a browser.
 */

import "server-only";
import { addDays, todayIn } from "@/lib/dates";
import { busyTimes, calendarLink } from "@/lib/busy-times";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
/** How far ahead busy times are kept, and how long they are trusted before the link is read again. */
export const SYNC_DAYS = 90;
export const STALE_MINUTES = 15;

const asTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

/**
 * A calendar link's text. The link was typed in by someone, so every hop is
 * held to calendarLink(): https, on Google's, Outlook's or iCloud's hosts,
 * nowhere else (never this server's own network). Redirects are followed
 * by hand, three at most, each checked the same way; the answer is given
 * ten seconds and three megabytes.
 */
export async function fetchCalendar(link) {
  let target = link;
  for (let hop = 0; hop < 4; hop++) {
    const checked = calendarLink(target);
    if (checked.error) throw new Error(hop ? "That link leads somewhere that is not a calendar." : checked.error);
    const res = await fetch(checked.url, {
      redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store",
      headers: { accept: "text/calendar, text/plain;q=0.8", "user-agent": "Lighthouse-Calendar-Sync" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) throw new Error("That link could not be opened.");
      target = new URL(next, checked.url).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new Error("That link is not open to read: copy the private (secret) link again.");
    if (!res.ok) throw new Error(`The calendar did not answer (${res.status}). Try again in a minute.`);
    // Read up to the limit and no further, whatever length is claimed.
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error("That calendar is too large to read.");
      }
      chunks.push(value);
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
  }
  throw new Error("That link could not be opened.");
}

/** A failure in words a person can act on (never the link). */
const reason = (err) => (err?.name === "TimeoutError" || err?.name === "AbortError" ? "The calendar took too long to answer." : String(err?.message ?? "The calendar could not be read.")).slice(0, 280);

/**
 * Read a connected calendar (`feed`: its row) and replace the busy times it
 * put on its project's calendar with what it says now, from today for
 * SYNC_DAYS. On a failure what was there stays, and the reason is kept for
 * its owner. Returns { ok, busy } or { ok: false, error }.
 */
export async function syncFeed(admin, feed, timeZone) {
  const today = todayIn(timeZone);
  try {
    const text = await fetchCalendar(feed.url);
    const blocks = busyTimes(text, { timeZone, from: today, to: addDays(today, SYNC_DAYS) });
    // What it put there before is everything up to its newest row now: a list of their ids would stop
    // at the API's 1,000-row cap and leave the rest behind on every read.
    const { data: newest, error: oldError } = await admin.from("calendar_blocks").select("id").eq("feed_id", feed.id)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (oldError) throw new Error(oldError.message);
    for (let i = 0; i < blocks.length; i += 250) {
      const { error } = await admin.from("calendar_blocks").insert(blocks.slice(i, i + 250).map((b) => ({
        project_id: feed.project_id, feed_id: feed.id, created_by: feed.user_id, starts_on: b.startsOn, ends_on: b.endsOn,
        start_time: b.start == null ? null : asTime(b.start), end_time: b.end == null ? null : asTime(b.end),
      })));
      if (error) throw new Error(error.message);
    }
    // The new ones are in: now the ones they replace go.
    if (newest) {
      const { error } = await admin.from("calendar_blocks").delete().eq("feed_id", feed.id).lte("id", newest.id);
      if (error) throw new Error(error.message);
    }
    await admin.from("calendar_feeds").update({ last_synced_at: new Date().toISOString(), last_error: null, busy_count: blocks.length }).eq("id", feed.id);
    return { ok: true, busy: blocks.length };
  } catch (err) {
    const error = reason(err);
    await admin.from("calendar_feeds").update({ last_synced_at: new Date().toISOString(), last_error: error }).eq("id", feed.id);
    return { ok: false, error };
  }
}

/**
 * Read again the calendars connected to a project's calendar that have not
 * been read for STALE_MINUTES, whoever is looking at it: a manager sees a
 * client's busy times as they stand, without the client signing in. Each is
 * claimed first, so two people opening the calendar read it once.
 */
export async function refreshStaleFeeds(calendarProjectId) {
  const admin = createAdminClient();
  if (!admin) return 0;
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: due } = await admin.from("calendar_feeds")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("project_id", calendarProjectId)
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .select("id, user_id, project_id, url");
  if (!due?.length) return 0;
  const { data: tz } = await admin.rpc("business_tz");
  await Promise.all(due.map((feed) => syncFeed(admin, feed, tz || "America/Phoenix")));
  return due.length;
}
