/**
 * Signing in as the seeded users, the two ways the tests need:
 *   signIn()        a supabase-js client acting as that user (API tests)
 *   sessionCookies() the cookies the app itself sets (browser and HTTP tests)
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY, PASSWORD } from "./env.mjs";
import { sleep } from "./assert.mjs";

/** A client signed in as `email`, plus that user's directory row. */
export async function signIn(email, password = PASSWORD) {
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { sb, error };
  await sleep(300);
  const { data: me } = await sb.from("users").select("id, role, status").eq("email", email).maybeSingle();
  return { sb, me, session: data.session };
}

/** The Auth admin API (service role). Only for arranging test state. */
export function adminClient() {
  if (!SERVICE_ROLE_KEY) throw new Error("No service-role key for the local stack.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** The session cookies @supabase/ssr would set for `email`, as name → value. */
export async function sessionCookies(email, password = PASSWORD) {
  const jar = new Map();
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return jar;
}

/** The same cookies as a Cookie request header. */
export const cookieHeader = (jar) => [...jar].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
