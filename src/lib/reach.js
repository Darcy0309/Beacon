/**
 * Calls to the server that don't get there, said (Oct 2026: every error a
 * notice). A server action answers { ok, error }; when the call itself fails
 * (offline, the server down, a deploy mid-way), it throws instead, and a
 * button that only checks `ok` would do nothing at all.
 */

export const REACH_ERROR = "Couldn't reach Lighthouse. Check your connection and try again.";

/** Whether an error is the call failing to get there, not the server saying no. */
export function isNetworkError(e) {
  const text = `${e?.name ?? ""} ${e?.message ?? e ?? ""}`;
  return /failed to fetch|networkerror|network error|load failed|fetch failed|network request failed|chunkloaderror|loading chunk|connection (closed|reset|refused)|the network connection was lost/i.test(text);
}

/**
 * A page from before a new deployment calling the server (Nov 2026: "Server Action … was not found on the
 * server", signing out after a deploy): its Server Action ids are the old deployment's. Loading the page
 * again picks up the new ones.
 */
export function isStaleDeploy(e) {
  return /server action .* was not found on the server|failed-to-find-server-action/i.test(`${e?.message ?? e ?? ""}`);
}

export const UPDATED_NOTICE = "Lighthouse was just updated. Loading the new version…";
const RELOADED_KEY = "lighthouse.reloadedForUpdate";

/**
 * Load the page again for a new deployment, once: true when it will. Not again within half a minute, so a
 * page that still fails after loading again shows its error instead of reloading for ever.
 */
export function reloadForUpdate() {
  if (typeof window === "undefined") return false;
  try {
    if (Date.now() - Number(window.sessionStorage.getItem(RELOADED_KEY) || 0) < 30_000) return false;
    window.sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    // No session storage (a private window): load it again all the same.
  }
  setTimeout(() => window.location.reload(), 700);
  return true;
}

/** Next's own signals (a redirect, notFound()), thrown to be handled by the router: not failures. */
export function isNextSignal(e) {
  return typeof e?.digest === "string" && /^NEXT_(REDIRECT|HTTP_ERROR_FALLBACK|NOT_FOUND)/.test(e.digest);
}

/** A server action called so that a call that doesn't get there comes back failed ({ ok: false, error }), as the server's own no does. */
export async function reach(call) {
  try {
    return await call();
  } catch (e) {
    if (isNextSignal(e)) throw e;
    if (isStaleDeploy(e) && reloadForUpdate()) return { ok: false, data: null, error: UPDATED_NOTICE, fieldErrors: null, values: null };
    return { ok: false, data: null, error: isNetworkError(e) ? REACH_ERROR : "Something went wrong. Try again, and tell an administrator if it keeps happening.", fieldErrors: null, values: null };
  }
}
