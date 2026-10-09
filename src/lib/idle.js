/**
 * Signing out after a while without activity (Sean, Oct 2026): a session
 * left open, on a desk someone else can reach, ends after 30 minutes with no
 * use. Account managers, agents and clients; administrators have no limit.
 *
 * The browser keeps the time (IdleGuard: any tab's activity counts, with a
 * warning before the end) and tells the server, which keeps the last word in
 * a cookie: a laptop closed overnight or a browser reopened later finds the
 * session over (the proxy). The cookie names the session it belongs to, so
 * a new sign-in never inherits an old one's clock.
 */

export const IDLE_MINUTES = 30;
/** The warning shows this long before the end. */
export const IDLE_WARNING_MINUTES = 2;
/** The server allows this much more: the browser reports activity once a minute at most. */
export const IDLE_GRACE_MINUTES = 2;
/** `${last activity, ms}.${auth session id}`, httpOnly. */
export const IDLE_COOKIE = "lh_idle";

/** The minutes without activity a role may stay signed in, or null for no limit. */
export const idleLimitFor = (role) => (role && role !== "admin" ? IDLE_MINUTES : null);

/** The auth session id inside an access token (its session_id claim). */
export function sessionIdOf(accessToken) {
  try {
    const part = String(accessToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(part, "base64").toString("utf8"))?.session_id ?? null;
  } catch {
    return null;
  }
}

/** The cookie's value for a session active now. */
export const idleCookieValue = (sessionId, now = Date.now()) => `${now}.${sessionId}`;

/**
 * Whether the idle cookie says this session has been left too long: only
 * when it belongs to the same session, and the last activity is more than
 * the limit (and its grace) ago.
 */
export function idleExpired(cookie, sessionId, now = Date.now()) {
  const m = /^(\d+)\.(.+)$/.exec(String(cookie ?? ""));
  if (!m || !sessionId || m[2] !== sessionId) return false;
  return now - Number(m[1]) > (IDLE_MINUTES + IDLE_GRACE_MINUTES) * 60_000;
}
