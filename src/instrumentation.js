/**
 * Runs once when a server instance starts. The first Supabase call over a
 * cold connection is several seconds slower than the rest, so open one before
 * a visitor is waiting on it. Deliberately not awaited: `register` blocks the
 * server from accepting requests until it returns.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  import("@/lib/supabase/fetch")
    .then(({ warmPool, startPoolHeartbeat }) => {
      warmPool();
      startPoolHeartbeat();
    })
    .catch(() => {
      // A warm pool is an optimisation; the app works without it.
    });
}
