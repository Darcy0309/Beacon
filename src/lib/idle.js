/**
 * Signing out after a while without activity (Sean, Oct 2026): a session
 * left open, on a desk someone else can reach, ends after a time with no
 * use. Account managers, agents and clients, each as long as an
 * administrator sets in Settings (30 minutes until then; Never for none);
 * administrators have no limit. A call on the phone counts as activity.
 *
 * The browser keeps the time (IdleGuard: any tab's activity counts, with a
 * warning before the end) and tells the server, which keeps the last word in
 * a cookie: a laptop closed overnight or a browser reopened later finds the
 * session over (the proxy). The cookie names the session it belongs to, so
 * a new sign-in never inherits an old one's clock.
 */

export const IDLE_MINUTES = 30;
/** What Settings offers for each role, in minutes; 0 is never. */
export const IDLE_CHOICES = [[0, "Never"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [480, "8 hours"]];
/** The roles it is set for. */
export const IDLE_ROLES = [["manager", "Account managers"], ["agent", "Agents"], ["client", "Clients"]];
/** The warning shows this long before the end. */
export const IDLE_WARNING_MINUTES = 2;
/** The server allows this much more: the browser reports activity once a minute at most. */
export const IDLE_GRACE_MINUTES = 2;
/** `${last activity, ms}.${limit, minutes}.${auth session id}`, httpOnly. */
export const IDLE_COOKIE = "lh_idle";

/**
 * The minutes without activity a role may stay signed in, or null for no
 * limit: as Settings has it (`minutes`: { manager, agent, client }, the
 * security setting's idle_minutes), else IDLE_MINUTES. Administrators: none.
 */
export function idleLimitFor(role, minutes = null) {
  if (!role || role === "admin") return null;
  const m = Number(minutes?.[role]);
  if (minutes?.[role] === 0 || m === 0) return null;
  return IDLE_CHOICES.some(([v]) => v === m) ? m : IDLE_MINUTES;
}

/** A limit as words: "30 minutes", "1 hour", "4 hours". */
export const idleSpan = (minutes) => {
  const m = Number(minutes) || IDLE_MINUTES;
  return m >= 60 && m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;
};

/** The limit kept in an idle cookie, or IDLE_MINUTES for one set before limits were settable. */
export const idleLimitOf = (cookie) => Number(/^\d+\.(\d+)\.[^.]+$/.exec(String(cookie ?? ""))?.[1]) || IDLE_MINUTES;

/** The auth session id inside an access token (its session_id claim). */
export function sessionIdOf(accessToken) {
  try {
    const part = String(accessToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"))?.session_id ?? null;
  } catch {
    return null;
  }
}

/** The cookie's value for a session active now, with its limit. */
export const idleCookieValue = (sessionId, now = Date.now(), limit = IDLE_MINUTES) => `${now}.${limit}.${sessionId}`;

/**
 * Whether the idle cookie says this session has been left too long: only
 * when it belongs to the same session, and the last activity is more than
 * the limit (and its grace) ago.
 */
export function idleExpired(cookie, sessionId, now = Date.now()) {
  // The limit inside it (a cookie set before limits were settable has none: IDLE_MINUTES).
  const m = /^(\d+)\.(?:(\d+)\.)?([^.]+)$/.exec(String(cookie ?? ""));
  if (!m || !sessionId || m[3] !== sessionId) return false;
  const limit = m[2] ? Number(m[2]) : IDLE_MINUTES;
  return now - Number(m[1]) > (limit + IDLE_GRACE_MINUTES) * 60_000;
}
