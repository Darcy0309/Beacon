"use server";

/** Signing in and out, two-factor, and changing your password. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { check, currentAppUser, fail, logActivity, ok, s } from "@/lib/server/action-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cross, safeInternalPath, schemas } from "@/lib/validate";

const DISABLED_MESSAGE = "This account has been disabled. Contact an administrator.";

export async function signIn(prevState, formData) {
  const { values, failed } = check(formData, schemas.login);
  if (failed) return failed;
  const { email, password } = values;
  // Only ever back into the app — never off to a host a link put in the URL.
  const next = safeInternalPath(s(formData, "next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Supabase reports a disabled (banned) account before it checks the
    // password, which would tell anyone which emails have accounts here.
    if (error.code === "user_banned" || error.code === "invalid_credentials" || /banned|invalid login/i.test(error.message)) {
      return fail("That email and password don't match an active account.");
    }
    return fail(error);
  }

  // With two-factor enrolled the password only gets the user to aal1; the
  // login page then asks for the code.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    revalidatePath("/", "layout");
    return { ...ok({ mfa: true }), mfa: true };
  }

  const { disabled } = await finishSignIn(supabase);
  if (disabled) return fail(DISABLED_MESSAGE);
  redirect(next);
}

/** Second step of signing in: the six-digit code from the authenticator app. */
export async function verifyTwoFactor(prevState, formData) {
  const code = s(formData, "code")?.replace(/\s/g, "") ?? "";
  const next = safeInternalPath(s(formData, "next"));
  if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit code from your authenticator app.", { code: "Six digits, please." });

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return fail(listError);

  const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
  if (!factor) return fail("No authenticator is set up for this account.");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return fail(error.message === "Invalid TOTP code entered" ? "That code is not right. Try the current one." : error);

  const { disabled } = await finishSignIn(supabase);
  if (disabled) return fail(DISABLED_MESSAGE);
  redirect(next);
}

/** Stamp the last login and record it, once a sign-in is fully authenticated. */
/**
 * The last step of a sign-in, after any two-factor code. A disabled account
 * is signed straight back out: the database already gives it nothing, this
 * just says so instead of showing an empty workspace.
 */
async function finishSignIn(supabase) {
  const me = await currentAppUser(supabase);
  if (me?.status === "disabled") {
    await supabase.auth.signOut();
    return { disabled: true };
  }
  if (me) {
    // Recorded the way the legacy app's UserMaster.LastLogin did.
    await supabase.from("users").update({ last_login: new Date().toISOString() }).eq("id", me.id);
    await logActivity(supabase, "sign_in", { userId: me.id });
  }
  revalidatePath("/", "layout");
  return { disabled: false };
}

/**
 * Set or change your own password. An invited account becomes active the
 * moment its password is set; administrators are told when anyone who is
 * not an administrator changes theirs.
 */
export async function changePassword(prevState, formData) {
  const { values, failed } = check(formData, schemas.password, cross.password);
  if (failed) return failed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("You are signed out.");

  const { error } = await supabase.auth.updateUser({ password: values.password });
  if (error) {
    return fail(/different from the old/i.test(error.message) ? "Choose a password you haven't used before." : error);
  }

  const { data: activated } = await supabase.rpc("activate_invited_account");
  const me = await currentAppUser(supabase);
  await logActivity(supabase, "password.change", { userId: me?.id });
  // Admins hear about it (never for admins, at most once per quarter hour). The
  // notice is raised here, with the service key, only after the password
  // really changed — users cannot raise it themselves.
  if (me && me.role !== "admin") {
    const admin = createAdminClient();
    if (admin) {
      const { error: noticeError } = await admin.rpc("notify_password_changed", { p_auth_id: user.id, p_first_time: Boolean(activated) });
      if (noticeError) console.error("[password] admin notice", noticeError.message);
    }
  }

  revalidatePath("/", "layout");
  return ok({ activated: Boolean(activated) });
}

/**
 * Start setting up an authenticator app: returns the QR code and the secret
 * to type in by hand. The factor stays unverified until confirmTwoFactor().
 */
export async function startTwoFactor() {
  const supabase = await createClient();

  // A half-finished attempt from earlier would block a new one.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: "Lighthouse",
  });
  if (error) return fail(error);

  // Supabase hands back an SVG, sometimes already wearing a `data:` prefix.
  // Base64 keeps the markup's own quotes and hashes out of the URL.
  const svg = String(data.totp.qr_code).replace(/^data:image\/svg\+xml;(utf-8|charset=utf-8),/, "");
  const qr = `data:image/svg+xml;base64,${Buffer.from(decodeURIComponent(svg), "utf8").toString("base64")}`;

  return ok({ factorId: data.id, qr, secret: data.totp.secret });
}

/** Confirm the authenticator with its first code, switching two-factor on. */
export async function confirmTwoFactor(prevState, formData) {
  const factorId = s(formData, "factor_id");
  const code = s(formData, "code")?.replace(/\s/g, "") ?? "";
  if (!factorId) return fail("Start the setup again.");
  if (!/^\d{6}$/.test(code)) return fail("Enter the six-digit code from your authenticator app.", { code: "Six digits, please." });

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return fail(error.message === "Invalid TOTP code entered" ? "That code is not right. Try the current one." : error);

  await logActivity(supabase, "mfa.enable");
  revalidatePath("/security");
  return ok({ enabled: true });
}

/** Switch two-factor off by removing every enrolled authenticator. */
export async function disableTwoFactor() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return fail(error);

  for (const f of data?.all ?? []) {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (unenrollError) return fail(unenrollError);
  }

  await logActivity(supabase, "mfa.disable");
  revalidatePath("/security");
  return ok({ enabled: false });
}

export async function signOut() {
  const supabase = await createClient();
  await logActivity(supabase, "sign_out");
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
