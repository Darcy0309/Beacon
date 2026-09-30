"use server";

/**
 * Users & access: invitations, roles, disabling, two-factor resets, deletion.
 * Administrators only. The Auth admin API used here bypasses Row Level
 * Security, so every action checks the caller's role itself.
 */

import { revalidatePath } from "next/cache";
import { NOT_DELETED, check, currentAppUser, fail, idFrom, logActivity, n, ok, requestOrigin, s } from "@/lib/server/action-helpers";
import { ADMIN_UNAVAILABLE, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cross, schemas } from "@/lib/validate";

/**
 * Invite a new user or change an existing one. Administrators only — the
 * database enforces that too, but this uses the Auth admin API, which does
 * not, so the check is made here as well.
 *
 * Inviting sends the person an email whose link sets their password; the
 * account stays "invited" until then. Disabling bans the account at the
 * Auth layer as well, so its existing session dies at the next refresh.
 */
export async function saveUser(prevState, formData) {
  const { failed } = check(formData, schemas.user, cross.user);
  if (failed) return failed;

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators can manage user accounts.");

  const id = idFrom(formData);
  const payload = {
    first_name: s(formData, "first_name"),
    last_name: s(formData, "last_name"),
    email: s(formData, "email")?.toLowerCase(),
    phone: s(formData, "phone"),
    role: s(formData, "role") || "agent",
    company_id: n(formData, "company_id"),
    username: s(formData, "username"),
  };

  if (id) {
    const status = s(formData, "status") || "active";
    if (id === me.id && (payload.role !== "admin" || status !== "active")) {
      return fail("You can't remove your own administrator access. Ask another administrator to.");
    }
    const { data: before } = await supabase.from("users").select("auth_id, status, email").eq("id", id).maybeSingle();
    if (!before) return fail("That user no longer exists.");
    const sameEmail = (before.email ?? "").toLowerCase() === payload.email;
    if (before.auth_id && !sameEmail) {
      return fail("The email of an account that can sign in can't be changed here. Invite a new user instead.", { email: "Can't change" });
    }
    // Keep the stored spelling; only the letter case of what was typed may differ.
    if (sameEmail) payload.email = before.email;

    const { error } = await supabase.from("users").update({ ...payload, status }).eq("id", id);
    if (error) return fail(error);

    if (before.status !== status && before.auth_id) {
      const admin = createAdminClient();
      if (admin) {
        const { error: banError } = await admin.auth.admin.updateUserById(before.auth_id, {
          ban_duration: status === "disabled" ? "876600h" : "none",
        });
        if (banError) console.error("[users] ban/unban", banError.message);
      }
      await logActivity(supabase, status === "disabled" ? "user.disable" : "user.enable", { entity: "user", entityId: id, detail: before.email });
    }
    await logActivity(supabase, "user.update", { entity: "user", entityId: id, detail: payload.email });
    revalidatePath("/users");
    return ok({ email: payload.email });
  }

  // A new account is a real invitation, not a directory row. Rows made by the
  // old invite form have no sign-in behind them; inviting the same email again
  // attaches one to that row instead of creating a second person. A pending
  // invitation (expired link, lost email) is simply sent again.
  const existing = await userByEmail(supabase, payload.email);
  if (existing?.auth_id && existing.status !== "invited") {
    return fail("An account with that email already exists.", { email: "Already in use" });
  }

  const sent = await sendInvitation(supabase, payload.email, payload, existing);
  if (sent.error) return fail(sent.error);

  await logActivity(supabase, existing?.auth_id ? "user.reinvite" : "user.invite", { entity: "user", entityId: sent.id, detail: payload.email });
  revalidatePath("/users");
  return ok({ email: payload.email, resent: Boolean(existing?.auth_id) });
}

/**
 * Exact, case-insensitive email lookup. Never a LIKE pattern: through the API
 * both "_" and "*" act as wildcards, so "john_doe@" or "j*@" would match (and
 * take over) someone else's row.
 */
async function userByEmail(supabase, email) {
  const { data } = await supabase.rpc("user_by_email", { p_email: email });
  return data?.[0] ?? null;
}

/**
 * Send (or re-send) an invitation email and make sure the directory row is
 * linked to the sign-in it creates. Supabase re-sends to an address that has
 * not accepted yet; an accepted one would have been refused before this.
 */
async function sendInvitation(supabase, email, details, existing) {
  const admin = createAdminClient();
  if (!admin) return { error: ADMIN_UNAVAILABLE };
  const origin = await requestOrigin();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/security?welcome=1")}`,
    data: { first_name: details.first_name ?? null, last_name: details.last_name ?? null },
  });
  if (inviteError) {
    return { error: /already/i.test(inviteError.message) ? "That person has already accepted an invitation and can sign in." : inviteError.message };
  }

  const row = { ...details, email, status: "invited", auth_id: invited.user.id };
  const { data: saved, error } = existing
    ? await supabase.from("users").update(row).eq("id", existing.id).select("id").single()
    : await supabase.from("users").insert(row).select("id").single();
  if (error) {
    // A brand-new sign-in with no directory row would block this email for good.
    if (!existing?.auth_id) await admin.auth.admin.deleteUser(invited.user.id).catch(() => {});
    return { error: error.message };
  }
  return { id: saved.id };
}

/** "Resend invitation" from the row menu: for anyone who has not set a password yet. */
export async function resendInvitation(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");
  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators can send invitations.");

  const { data: target } = await supabase
    .from("users")
    .select("id, auth_id, status, email, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!target) return fail("That user no longer exists.");
  if (target.auth_id && target.status !== "invited") return fail(`${target.email} has already accepted and can sign in.`);
  // An invitation makes the account usable; a disabled one stays off until an admin enables it.
  if (target.status === "disabled") return fail("This account is disabled. Enable it before sending an invitation.");

  const sent = await sendInvitation(
    supabase,
    target.email,
    { first_name: target.first_name, last_name: target.last_name },
    target
  );
  if (sent.error) return fail(sent.error);

  await logActivity(supabase, "user.reinvite", { entity: "user", entityId: id, detail: target.email });
  revalidatePath("/users");
  return ok({ id });
}

/** Remove a lost or replaced authenticator so the person can sign in with their password and enrol again. */
export async function resetUserTwoFactor(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators can reset two-factor.");

  const { data: target } = await supabase.from("users").select("auth_id, email").eq("id", id).maybeSingle();
  if (!target) return fail("That user no longer exists.");
  if (!target.auth_id) return fail("That user has never signed in, so there is nothing to reset.");

  const admin = createAdminClient();
  if (!admin) return fail(ADMIN_UNAVAILABLE);
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: target.auth_id });
  if (error) return fail(error);
  for (const f of data?.factors ?? []) {
    const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: target.auth_id });
    if (deleteError) return fail(deleteError);
  }

  await logActivity(supabase, "mfa.reset", { entity: "user", entityId: id, detail: target.email });
  revalidatePath("/users");
  return ok({ id, removed: (data?.factors ?? []).length });
}

/** Remove an account entirely: the directory row and, with the admin key, the sign-in itself. */
export async function deleteUser(formData) {
  const id = idFrom(formData);
  if (!id) return fail("Missing id.");

  const supabase = await createClient();
  const me = await currentAppUser(supabase);
  if (me?.role !== "admin") return fail("Only administrators can delete user accounts.");
  if (me.id === id) return fail("You can't delete your own account.");

  const { data: target } = await supabase.from("users").select("auth_id, email").eq("id", id).maybeSingle();
  if (!target) return fail("That user no longer exists.");

  // Sign-in first: if that fails nothing has changed and the admin can retry.
  // Deleting it clears users.auth_id (on delete set null), then the row goes.
  // The other order could leave a sign-in with no directory row, which would
  // block ever inviting that email again.
  if (target.auth_id) {
    const admin = createAdminClient();
    if (!admin) return fail(ADMIN_UNAVAILABLE);
    const { error: authError } = await admin.auth.admin.deleteUser(target.auth_id);
    if (authError && authError.status !== 404) {
      console.error("[users] auth delete", authError.message);
      return fail(`Couldn't remove ${target.email}'s sign-in: ${authError.message}`);
    }
  }

  const { data: gone, error } = await supabase.from("users").delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!gone?.length) return fail(NOT_DELETED);

  await logActivity(supabase, "user.delete", { entity: "user", entityId: id, detail: target.email });
  revalidatePath("/users");
  return ok({ id });
}
