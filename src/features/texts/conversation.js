/**
 * A lead's Conversation (Nov 2026): the calls made to and taken from its numbers on the phone's Twilio
 * line (with their recordings), and the texts sent and received, oldest first.
 */

import "server-only";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/server/session";
import { twilioConfig } from "@/lib/server/twilio";
import { fullName } from "@/lib/format";
import { e164, leadTextNumbers } from "@/lib/texts";
import { catchUpCallTranscripts } from "@/lib/server/call-transcripts";

const NUMBERS = "id, phone, contact_name, contact_phone, contact_mobile, decision_maker, dm_phone, dm_mobile, contact2_name, contact2_phone, contact2_mobile";

/**
 * { items, numbers, ourNumber } for a lead its viewer can see, or null (not staff, or not theirs to see).
 * items: { key, kind: "call" | "text", dir: "out" | "in", at, ... }:
 *   a call: { seconds, answered, userId, by, them, from, to, recording: { sid, seconds, canPlay, transcript } | null }
 *     transcript (only for whoever may play it): { status: none|transcribing|done|failed, lines, error } | null (Nov 2026)
 *   a text: { body, media, status, error, by, from, to }
 */
export async function getLeadConversation(leadId) {
  const me = await getCurrentUser();
  if (!["admin", "manager", "agent"].includes(me?.role)) return null;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select(NUMBERS).eq("id", leadId).maybeSingle();
  if (!lead) return null;
  const admin = createAdminClient();
  const numbers = leadTextNumbers(lead);
  const ourNumber = twilioConfig()?.callerId ?? null;
  if (!admin) return { items: [], numbers, ourNumber };

  const tels = numbers.map((n) => e164(n.digits));
  const LEG = "call_sid, parent_sid, user_id, direction, number, started_at, answered_at, ended_at, talk_seconds";
  const [{ data: texts }, { data: own }, older] = await Promise.all([
    admin.from("lead_texts").select("id, user_id, direction, from_number, to_number, body, media, status, error, created_at").eq("lead_id", lead.id).order("created_at").limit(500),
    // Its calls: the ones made from it (Sean, Nov 2026: a recording on the lead and project it was called
    // for, never on another lead with the same number), and calls in on them.
    admin.from("phone_calls").select(LEG).eq("lead_id", lead.id).order("started_at").limit(500),
    olderCalls(admin, lead.id, tels, LEG),
  ]);
  const legs = [...(own ?? []), ...older].sort((a, b) => String(a.started_at).localeCompare(String(b.started_at)));

  // The calls: one out per leg dialed; one in per call (its legs, one for each browser it rang, under it).
  const calls = [];
  for (const c of legs) {
    if (c.direction === "out" && c.user_id) {
      calls.push({ key: `c${c.call_sid}`, dir: "out", at: c.started_at, number: c.number, answered: Boolean(c.answered_at), ended: Boolean(c.ended_at), seconds: c.talk_seconds, userId: c.user_id, recordedOn: c.parent_sid });
    } else if (c.direction === "in" && !c.user_id && c.call_sid === c.parent_sid) {
      const taken = legs.find((l) => l.parent_sid === c.call_sid && l.user_id && l.answered_at);
      calls.push({ key: `c${c.call_sid}`, dir: "in", at: c.started_at, number: c.number, answered: Boolean(taken), ended: Boolean(c.ended_at), seconds: taken?.talk_seconds ?? 0, userId: taken?.user_id ?? null, recordedOn: taken?.call_sid ?? null });
    }
  }
  const recordedOn = calls.map((c) => c.recordedOn).filter(Boolean);
  const { data: recordings } = recordedOn.length
    ? await admin.from("phone_recordings").select("recording_sid, call_sid, user_id, seconds, created_at, transcript_status, transcript_error, transcript_updated_at, transcript_sid, transcript").in("call_sid", recordedOn).order("created_at")
    : { data: [] };

  // Transcripts left waiting: looked at again once this is answered.
  const waiting = (recordings ?? []).filter((r) => r.transcript_status === "transcribing");
  if (waiting.length) after(() => catchUpCallTranscripts(admin, waiting).catch((err) => console.error("[conversation] catch-up", err?.message ?? err)));

  const people = [...new Set([...calls.map((c) => c.userId), ...(texts ?? []).map((t) => t.user_id)].filter(Boolean))];
  const { data: users } = people.length ? await admin.from("users").select("id, first_name, last_name").in("id", people) : { data: [] };
  const nameOf = (id) => fullName(users?.find((u) => u.id === id)) || null;

  const items = [
    ...calls.map((c) => {
      const rec = (recordings ?? []).find((r) => r.call_sid === c.recordedOn);
      const canPlay = Boolean(rec) && (me.role === "admin" || rec.user_id === me.id);
      return {
        key: c.key, kind: "call", dir: c.dir, at: c.at, seconds: c.seconds, answered: c.answered, ended: c.ended,
        userId: c.userId,
        by: c.userId ? nameOf(c.userId) : null,
        them: lead.contact_name || null,
        from: c.dir === "out" ? ourNumber : c.number,
        to: c.dir === "out" ? c.number : ourNumber,
        recording: rec ? {
          sid: rec.recording_sid, seconds: rec.seconds, canPlay,
          // Every one that can be played has its transcript, or a way to ask for it ("none": never sent).
          transcript: canPlay ? { status: rec.transcript_status ?? "none", lines: rec.transcript ?? [], error: rec.transcript_error } : null,
        } : null,
      };
    }),
    ...(texts ?? []).map((t) => ({
      key: `t${t.id}`, kind: "text", dir: t.direction, at: t.created_at, body: t.body, media: t.media, status: t.status, error: t.error,
      by: t.user_id ? nameOf(t.user_id) : null, from: t.from_number, to: t.to_number,
    })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return { items, numbers, ourNumber };
}

/**
 * Calls from before each kept its lead (phone_calls.lead_id, Nov 2026) that none could be found for:
 * on this lead only where the number is on no other lead.
 */
async function olderCalls(admin, leadId, tels, columns) {
  if (!tels.length) return [];
  const { data: legs } = await admin.from("phone_calls").select(columns).is("lead_id", null).in("number", tels).order("started_at").limit(500);
  if (!legs?.length) return [];
  const mine = [];
  for (const tel of new Set(legs.map((l) => l.number))) {
    const digits = String(tel).replace(/\D/g, "").slice(-10);
    if (digits.length < 10) continue;
    const { data: others } = await admin.from("leads").select("id").is("deleted_at", null).neq("id", leadId).ilike("search_text", `%${digits}%`).limit(1);
    if (!others?.length) mine.push(tel);
  }
  return legs.filter((l) => mine.includes(l.number));
}
