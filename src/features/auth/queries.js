/** The signed-in user's own security settings. */

import "server-only";
import { shortDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Whether the signed-in user has an authenticator app set up. */
export async function getMyTwoFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { enabled: false, factors: [] };
  const totp = data?.totp ?? [];
  return {
    enabled: totp.some((f) => f.status === "verified"),
    factors: totp.map((f) => ({ id: f.id, name: f.friendly_name, status: f.status, created: shortDate(f.created_at) })),
  };
}
