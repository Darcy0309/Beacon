/**
 * Push subscriptions, against the database as real signed-in users: a
 * browser is saved for whoever signs in on it (moving from someone who used
 * it before), only the browsers' own push services are accepted, people
 * see and remove only their own, and nobody writes the table directly.
 *
 * Runs on its own test client and removes everything it made.
 *
 *   npm run test:integration
 */
import { createClient } from "@supabase/supabase-js";
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { ANON_KEY, SUPABASE_URL } from "../support/env.mjs";

const RUN = Date.now();
const userId = (email) => Number(sql(`select id from public.users where email=${lit(email)}`));
const AGENT = userId("agent@beacon.test");
const SEAN = userId("sean@beacon.test");
const P256DH = "BOrN3x8vS1ttzOq3aKz1q9Lw2nYc5uTg0pXQm7dE4fVhJkLmNoPqRsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVwXyZ0";
const AUTH = "k3x9Qw2Lp8Rt5Yv1";
const endpoint = (host, tail = "") => `https://${host}/push/${RUN}${tail}`;
const owner = (url) => sql(`select coalesce((select user_id::text from public.push_subscriptions where endpoint = ${lit(url)}), 'none')`);

const agent = (await signIn("agent@beacon.test")).sb;
const sean = (await signIn("sean@beacon.test")).sb;
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const save = (sb, url) => sb.rpc("save_push_subscription", { p_endpoint: url, p_p256dh: P256DH, p_auth: AUTH, p_user_agent: "test" });

try {
  section("Only the browsers' own push services");
  for (const host of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns2-bl2p.notify.windows.com"]) {
    const url = endpoint(host);
    const { error } = await save(agent, url);
    check(`${host} is accepted`, !error && owner(url) === String(AGENT), error?.message);
  }
  for (const [url, why] of [
    [`http://fcm.googleapis.com/push/${RUN}`, "not encrypted"],
    [endpoint("evil.example"), "somewhere else"],
    [endpoint("fcm.googleapis.com.evil.example"), "a look-alike name"],
    [endpoint("127.0.0.1:3000"), "the server itself"],
  ]) {
    const { error } = await save(agent, url);
    check(`refused: ${why}`, /not a browser push service/.test(error?.message ?? "") && owner(url) === "none", error?.message ?? "saved");
  }

  section("A browser belongs to whoever signs in on it");
  {
    const url = endpoint("fcm.googleapis.com", "/shared");
    await save(agent, url);
    await save(agent, url);
    check("saving it again keeps one row", sql(`select count(*) from public.push_subscriptions where endpoint=${lit(url)}`) === "1");
    const { error } = await save(sean, url);
    check("someone else signing in on it takes it over", !error && owner(url) === String(SEAN), error?.message);
    const mine = async (sb) => ((await sb.from("push_subscriptions").select("endpoint")).data ?? []).map((r) => r.endpoint);
    check("each person sees only their own browsers", (await mine(sean)).includes(url) && !(await mine(agent)).includes(url));
    await agent.rpc("remove_push_subscription", { p_endpoint: url });
    check("…and cannot remove someone else's", owner(url) === String(SEAN));
    await sean.rpc("remove_push_subscription", { p_endpoint: url });
    check("removing your own works", owner(url) === "none");
  }

  section("Nobody writes the table directly");
  {
    const { error: inserted } = await agent.from("push_subscriptions").insert({ user_id: AGENT, endpoint: endpoint("fcm.googleapis.com", "/direct"), p256dh: P256DH, auth: AUTH });
    check("an insert from the app is refused", Boolean(inserted), inserted?.message);
    const { error: signedOut } = await save(anon, endpoint("fcm.googleapis.com", "/anon"));
    check("signed out, nothing can be saved", Boolean(signedOut), signedOut?.message);
  }
} finally {
  sql(`delete from public.push_subscriptions where endpoint like ${lit(`%/push/${RUN}%`)}`);
}

finish("push subscription");
