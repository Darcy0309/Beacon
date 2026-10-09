#!/usr/bin/env node
/** Unit tests for signing out after 30 minutes without activity: who has a limit, and when a session counts as left. */
import { IDLE_MINUTES, idleCookieValue, idleExpired, idleLimitFor, sessionIdOf } from "../../src/lib/idle.js";

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

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll idle checks passed.");
