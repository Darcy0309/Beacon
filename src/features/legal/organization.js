/**
 * Who the public Privacy Policy and Terms pages speak for (client, Nov 2026: the texting
 * registration, A2P 10DLC, asks for both, naming the registered brand): the Company name in
 * Settings, and how to reach it. Read with the server's key, since the visitor isn't signed in;
 * only these values leave.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const LEGAL_DEFAULTS = { name: "Signature Marketing", email: "info@signaturemktg.net", phone: null };

export async function legalOrganization() {
  const admin = createAdminClient();
  if (!admin) return LEGAL_DEFAULTS;
  const { data } = await admin.from("app_settings").select("value").eq("key", "organization").maybeSingle();
  const v = data?.value ?? {};
  const text = (x) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return {
    name: text(v.name) ?? LEGAL_DEFAULTS.name,
    email: text(v.email) ?? LEGAL_DEFAULTS.email,
    phone: text(v.phone) ?? LEGAL_DEFAULTS.phone,
  };
}
