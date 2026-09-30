"use server";

/** Workspace settings. */

import { revalidatePath } from "next/cache";
import { check, fail, ok, s } from "@/lib/server/action-helpers";
import { createClient } from "@/lib/supabase/server";
import { schemas } from "@/lib/validate";

/** Saves the whole settings screen in one submit: organization, branding and mail. */
export async function saveSettings(prevState, formData) {
  const { values, failed } = check(formData, schemas.settings);
  if (failed) return failed;

  const supabase = await createClient();

  const groups = [
    { key: "organization", value: { name: s(formData, "org_name") } },
    {
      key: "branding",
      value: { product: s(formData, "product_name"), logo: s(formData, "logo") },
    },
    {
      key: "mail",
      value: {
        host: s(formData, "mail_host"),
        from: s(formData, "mail_from"),
        provider: s(formData, "mail_provider"),
      },
    },
  ];

  // Merge into whatever is already stored so untouched keys survive.
  const { data: existing } = await supabase.from("app_settings").select("key, value");
  const current = Object.fromEntries((existing ?? []).map((r) => [r.key, r.value]));

  for (const g of groups) {
    const merged = { ...(current[g.key] ?? {}) };
    for (const [k, v] of Object.entries(g.value)) if (v !== null) merged[k] = v;
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: g.key, value: merged, updated_at: new Date().toISOString() });
    if (error) return fail(error);
  }

  revalidatePath("/settings");
  return ok();
}

export async function saveSetting(prevState, formData) {
  const key = s(formData, "key");
  if (!key) return fail("Missing setting key.");

  let value;
  try {
    value = JSON.parse(String(formData.get("value") ?? "{}"));
  } catch {
    return fail("Value must be valid JSON.");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return fail(error);

  revalidatePath("/settings");
  return ok();
}
