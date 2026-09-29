import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

/**
 * Supabase client with the service-role key, for the few things only the
 * Auth admin API can do: invite a person, ban or unban an account, delete
 * an account, reset a lost authenticator.
 *
 * It bypasses Row Level Security, so it is never handed to a request as a
 * whole. Every action that uses it first checks the caller's role itself.
 * Returns null when the key is not configured, and callers say so plainly
 * rather than failing halfway through.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !SUPABASE_URL) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: supabaseFetch },
  });
}

export const ADMIN_UNAVAILABLE =
  "This needs the server's SUPABASE_SERVICE_ROLE_KEY, which is not set. Add it to the environment (server-only) and redeploy.";
