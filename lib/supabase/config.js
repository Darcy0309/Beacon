// Supabase connection settings, read once so every caller agrees on whether
// the app is configured. NEXT_PUBLIC_* values are inlined at build time, so
// they must be present in the environment when `next build` runs (on Vercel:
// Project → Settings → Environment Variables, then redeploy).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Request header carrying the verified auth user id from the proxy to the
 * app, so Server Components can skip a second round-trip to Supabase Auth.
 * The proxy always overwrites it, so a client cannot supply its own.
 */
export const AUTH_ID_HEADER = "x-beacon-auth-id";

const isLocalUrl = /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(SUPABASE_URL);

// On a hosted deployment a localhost URL means the local .env values were
// copied across — the database is unreachable from there.
const runningHosted = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.RENDER);

/** Why the app cannot talk to Supabase, or null when everything is set. */
export function supabaseConfigProblem() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return "missing";
  if (runningHosted && isLocalUrl) return "localhost";
  return null;
}

export const isSupabaseConfigured = supabaseConfigProblem() === null;
