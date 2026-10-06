import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { pushServer, sendPush } from "@/lib/server/push";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const CHUNK = 200; // ids per query, to keep each request's address short
const AT_ONCE = 20; // pushes in flight at a time
const FRESH_MS = 10 * 60 * 1000; // a notification older than this is not pushed

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

function sameSecret(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Push new notifications to their people's browsers. Called by the database
 * after notifications are added (tg_notifications_push, through pg_net),
 * with their ids and the shared secret; not by people.
 *
 * Each notification is pushed once (pushed_at), only while it is new and
 * unread, to every browser its person turned notifications on in. A browser
 * the push service says is gone is forgotten.
 */
export async function POST(request) {
  const secret = process.env.PUSH_DELIVER_SECRET;
  if (!secret || !sameSecret(request.headers.get("x-push-secret") ?? "", secret)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!pushServer() || !admin) return NextResponse.json({ error: "Push is not set up on the server" }, { status: 503 });

  let ids = [];
  try {
    ids = (await request.json())?.ids;
  } catch {
    /* no body: nothing to push */
  }
  ids = Array.isArray(ids) ? [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, 5000) : [];

  // Claim them: whatever another call already pushed is not pushed again.
  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const notes = [];
  for (const part of chunks(ids, CHUNK)) {
    const { data, error } = await admin
      .from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .in("id", part)
      .is("pushed_at", null)
      .is("read_at", null)
      .gte("created_at", since)
      .select("id, user_id, kind, title, body, sender_name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    notes.push(...(data ?? []));
  }

  const people = [...new Set(notes.map((n) => n.user_id))];
  const browsers = [];
  for (const part of chunks(people, CHUNK)) {
    const { data, error } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", part);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    browsers.push(...(data ?? []));
  }

  const jobs = notes.flatMap((n) =>
    browsers
      .filter((b) => b.user_id === n.user_id)
      .map((b) => [
        b,
        {
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: [n.sender_name ? `From ${n.sender_name}` : null, n.body ? String(n.body).slice(0, 400) : null].filter(Boolean).join("\n"),
          url: `/notifications/${n.id}`,
        },
      ])
  );

  const reached = new Set();
  const gone = new Set();
  let failed = 0;
  for (const batch of chunks(jobs, AT_ONCE)) {
    const results = await Promise.all(batch.map(([b, payload]) => sendPush(b, payload).then((r) => [b, r])));
    for (const [b, r] of results) {
      if (r.gone) gone.add(b.id);
      else if (r.status >= 200 && r.status < 300) reached.add(b.id);
      else {
        failed += 1;
        console.error("[push]", b.endpoint.slice(0, 60), r.status, r.error);
      }
    }
  }

  if (gone.size) await admin.from("push_subscriptions").delete().in("id", [...gone]);
  if (reached.size) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", [...reached]);

  return NextResponse.json({ notifications: notes.length, sent: jobs.length - failed - gone.size, failed, removed: gone.size });
}
