/** The signed-in user's profile, read once per request. */

import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { fullName, initialsOf, shortName } from "@/lib/format";
import { one } from "@/lib/server/query-helpers";
import { AUTH_ID_HEADER } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's profile, or null when signed out.
 *
 * The proxy has already verified the session for this request and stamped
 * the auth id on a request header, so only the profile query is needed.
 * Falls back to asking Supabase Auth when the header is absent. Cached per
 * request: the layout and the dashboard both call it.
 */
export const getCurrentUser = cache(async function getCurrentUser() {
  const supabase = await createClient();

  let authId = (await headers()).get(AUTH_ID_HEADER);
  if (!authId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authId = user?.id ?? null;
  }
  if (!authId) return null;

  const { data } = await supabase
    .from("users")
    .select("*, company:companies(id, name)")
    .eq("auth_id", authId)
    .maybeSingle();
  if (!data) return null;

  return {
    ...data,
    company: one(data.company),
    name: fullName(data),
    short: shortName(data),
    initials: initialsOf(fullName(data)),
  };
});
