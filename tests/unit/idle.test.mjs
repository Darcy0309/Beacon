#!/usr/bin/env node
/** Unit tests for signing out after 30 minutes without activity: who has a limit, and when a session counts as left. */
import { IDLE_MINUTES, idleCookieValue, idleExpired, idleLimitFor, idleLimitOf, idleSpan, sessionIdOf } from "../../src/lib/idle.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

check("managers, agents and clients are signed out after 30 minutes", ["manager", "agent", "client"].every((r) => idleLimitFor(r) === 30) && IDLE_MINUTES === 30);
check("…administrators have no limit", idleLimitFor("admin") === null && idleLimitFor(undefined) === null);

const now = Date.UTC(2026, 9, 9, 15, 0);
const sid = "4f1c2d3e-0000-4000-8000-000000000001";
check("a session used 31 minutes ago is still inside the grace", !idleExpired(idleCookieValue(sid, now - 31 * 60_000), sid, now));
check("…one left 33 minutes is over", idleExpired(idleCookieValue(sid, now - 33 * 60_000), sid, now));
check("…but only for the session it names: a new sign-in never inherits an old clock", !idleExpired(idleCookieValue(sid, now - 600 * 60_000), "another-session", now));
check("…and nonsense is not proof of anything", !idleExpired("garbage", sid, now) && !idleExpired(undefined, sid, now));

const payload = Buffer.from(JSON.stringify({ sub: "x", session_id: sid })).toString("base64url");
check("the session id is read from an access token", sessionIdOf(`h.${payload}.s`) === sid && sessionIdOf("not-a-token") === null);

// As Settings sets it, per role (Oct 2026).
const set = { manager: 60, agent: 0, client: 15 };
check("Settings sets each role's time: an hour for managers, never for agents, 15 minutes for clients",
  idleLimitFor("manager", set) === 60 && idleLimitFor("agent", set) === null && idleLimitFor("client", set) === 15 && idleLimitFor("admin", set) === null);
check("…a time not offered, or none set, is 30 minutes", idleLimitFor("manager", { manager: 7 }) === 30 && idleLimitFor("client", {}) === 30);
check("the cookie carries its session's limit: an hour's session used 61 minutes ago is still on",
  !idleExpired(idleCookieValue(sid, now - 61 * 60_000, 60), sid, now) && idleExpired(idleCookieValue(sid, now - 63 * 60_000, 60), sid, now) && idleLimitOf(idleCookieValue(sid, now, 60)) === 60);
check("…a cookie from before (no limit in it) keeps 30 minutes", idleExpired(`${now - 33 * 60_000}.${sid}`, sid, now) && !idleExpired(`${now - 31 * 60_000}.${sid}`, sid, now) && idleLimitOf(`${now}.${sid}`) === 30);
check("the time in words", idleSpan(30) === "30 minutes" && idleSpan(60) === "1 hour" && idleSpan(240) === "4 hours" && idleSpan(15) === "15 minutes");

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll idle checks passed.");
