import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigProblem } from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the auth session from the request cookies, so RLS runs as the
 * signed-in user.
 *
 * Wrapped in React's cache so every query helper in one request shares a
 * single client instead of each building its own.
 */
export const createClient = cache(async function createClient() {
  const problem = supabaseConfigProblem();
  if (problem) {
    throw new Error(
      problem === "localhost"
        ? `NEXT_PUBLIC_SUPABASE_URL points at ${SUPABASE_URL}, which is not reachable from a hosted deployment.`
        : "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. See /setup."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — the proxy refreshes the
            // session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
});
