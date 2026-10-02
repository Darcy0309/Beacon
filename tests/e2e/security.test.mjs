/**
 * Access control and account management, end to end.
 *
 *   Part A: attacks through the API as real users; every one must fail.
 *   Part B: an administrator manages a user in a real browser: invite, the
 *           email link, setting a password, disable/enable, two-factor
 *           reset, and delete; plus the guards on their own account.
 *
 *   npm run test:e2e      (local stack + the app running)
 */
import { APP_URL } from "../support/env.mjs";
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { signIn, adminClient, sessionCookies, cookieHeader } from "../support/auth.mjs";
import { sql, lit } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const admin = adminClient();

section("Part A: attacks through the API");
{
  const c = await signIn("client@beacon.test");
  const { data, error } = await c.sb.from("users").update({ role: "admin" }).eq("id", c.me.id).select();
  check("client cannot make themselves admin", !!error || (data ?? []).length === 0, error?.message ?? `updated ${data?.length}`);
  const { error: e2 } = await c.sb.from("users").update({ company_id: 8 }).eq("id", c.me.id);
  check("client cannot switch company", !!e2, e2?.message);
  const { error: e3 } = await c.sb.from("users").update({ phone: "555-0101" }).eq("id", c.me.id);
  check("client can still edit own profile fields", !e3, e3?.message);
  check("role unchanged in the database", sql("select role from public.users where email='client@beacon.test'") === "client");
}
{
  // Disabled: an existing session sees nothing and cannot switch itself back on.
  sql("update public.users set status='disabled' where email='agent@beacon.test'");
  try {
    const a = await signIn("agent@beacon.test");
    const { data: leads } = await a.sb.from("leads").select("id").limit(5);
    check("disabled agent's session reads no leads", (leads ?? []).length === 0, `${leads?.length} rows`);
    await a.sb.from("users").update({ status: "active" }).eq("auth_id", a.session.user.id);
    check("disabled agent cannot re-enable themselves", sql("select status from public.users where email='agent@beacon.test'") === "disabled");
  } finally {
    sql("update public.users set status='active' where email='agent@beacon.test'");
  }
}
{
  const m = await signIn("sean@beacon.test");
  const { data } = await m.sb.from("alert_rules").update({ enabled: false }).eq("trigger", "bulletin_posted").select();
  check("manager cannot switch off alert rules", (data ?? []).length === 0, `updated ${data?.length}`);
  const { error } = await m.sb.rpc("send_notification", { p_user_ids: [m.me.id + 1], p_roles: [], p_title: "x", p_body: null, p_link: "/\t/evil.com" });
  check("tab-smuggled notification link refused", !!error, error?.message);
}
{
  const html = await fetch(`${APP_URL}/login?next=//evil.example/login`).then((r) => r.text());
  check("open redirect ?next=//evil neutralised", html.match(/name="next" value="([^"]*)"/)?.[1] === "/");
  check("normal ?next kept", (await fetch(`${APP_URL}/login?next=/leads/5`).then((r) => r.text())).includes('name="next" value="/leads/5"'));
  check("login shows the two-factor note, not the old IP-lock notice", !/approved IP addresses/.test(html) && /two-factor/i.test(html));
  const proto = await fetch(`${APP_URL}/login?error=constructor`);
  const protoHtml = await proto.text();
  check("?error=constructor renders no notice", proto.status === 200 && !/role="alert"/.test(protoHtml) && !/function Object/.test(protoHtml));
  check("?error=link shows the expired-link notice", /sign-in link has expired/.test(await fetch(`${APP_URL}/login?error=link`).then((r) => r.text())));
}
{
  // Behind a proxy the email-link callback must answer on the public host.
  const forwarded = { "x-forwarded-host": "crm.example.com", "x-forwarded-proto": "https" };
  const r = await fetch(`${APP_URL}/auth/callback?code=bogus&next=/leads`, { redirect: "manual", headers: forwarded });
  check("callback redirects to the forwarded host", (r.headers.get("location") ?? "").startsWith("https://crm.example.com/login?error=link"), r.headers.get("location"));
  const r2 = await fetch(`${APP_URL}/auth/callback?next=${encodeURIComponent("//evil.example")}`, { redirect: "manual", headers: forwarded });
  const loc2 = r2.headers.get("location") ?? "";
  check("callback ?next=//evil stays in the app", loc2.startsWith("https://crm.example.com/auth/complete?next=") && !loc2.includes("evil"), loc2);
}
{
  const c = await signIn("client@beacon.test");
  const { error } = await c.sb.rpc("notify_password_changed", { p_auth_id: c.session.user.id, p_first_time: false });
  check("users cannot send the password-changed notice themselves", !!error, error?.message ?? "call allowed");
  const { data: docs } = await c.sb.from("documents").delete().gt("id", 0).select("id");
  check("client cannot delete documents", (docs ?? []).length === 0, `deleted ${docs?.length}`);
  const a = await signIn("admin@beacon.test");
  const { data: star } = await a.sb.rpc("user_by_email", { p_email: "*@beacon.test" });
  const { data: under } = await a.sb.rpc("user_by_email", { p_email: "agent_beacon.test" });
  const { data: exact } = await a.sb.rpc("user_by_email", { p_email: " Agent@Beacon.TEST " });
  check("email lookup treats * and _ literally", (star ?? []).length === 0 && (under ?? []).length === 0, `${star?.length} / ${under?.length}`);
  check("email lookup ignores case and spaces", (exact ?? []).length === 1);
}
{
  // The proxy stamps the verified user on a request header; a visitor who
  // sends it themselves, on a path the proxy would otherwise skip, gets nothing.
  const adminAuth = sql("select auth_id from public.users where email='admin@beacon.test'");
  const r = await fetch(`${APP_URL}/users.png`, { redirect: "manual", headers: { "x-lighthouse-auth-id": adminAuth } });
  const body = r.status === 200 ? await r.text() : "";
  check("a forged auth-id header is not believed", r.status !== 200 || !body.includes("Users & Access"), `${r.status}`);
}

section("Part B: user management in the browser (admin)");
const browser = await launchBrowser();
const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage();
const openRowMenu = (name) => page.pointer(`button[aria-label="Actions for ${name}"]`);
const submitUserForm = () => page.ev(`document.querySelector('input[name="email"]').form.requestSubmit()`);
const NEW_PASSWORD = "Harbour-Light-2026";

const email = `newrep.${Math.floor(Math.random() * 1e6)}@beacon.test`;
sql("delete from public.users where email like 'newrep.%@beacon.test'");

try {
  // Invite
  await page.go("/users");
  check("Invite button present", await page.click("button", "Invite user"));
  await sleep(800);
  await page.fill('input[name="first_name"]', "Nova");
  await page.fill('input[name="last_name"]', "Reyes");
  await page.fill('input[name="email"]', email);
  await page.fill('select[name="role"]', "agent");
  await submitUserForm();
  const inviteToast = await page.waitToast(/Invitation sent/, 8000);
  const invitedRow = sql(`select status || '|' || coalesce(auth_id::text,'') from public.users where email=${lit(email)}`);
  check("invite creates a directory row with an auth id", /^invited\|[0-9a-f-]{36}$/.test(invitedRow), invitedRow);
  check("invite creates the auth account", sql(`select count(*) from auth.users where email=${lit(email)}`) === "1");
  check("toast confirms the invitation", /Invitation sent/.test(inviteToast), inviteToast);

  // Resend, while still invited
  await page.go("/users?q=" + encodeURIComponent(email));
  check("row menu opens for the invitee", await openRowMenu("Nova Reyes"));
  await sleep(600);
  check("Resend invitation offered while invited", await page.menuItem("Resend invitation"));
  const resendToast = await page.waitToast(/Invitation sent again/, 8000);
  check("resend confirmed", /Invitation sent again/.test(resendToast), resendToast);
  check("resend keeps the same sign-in", sql(`select status || '|' || coalesce(auth_id::text,'') from public.users where email=${lit(email)}`) === invitedRow);
  check("resend logged", sql(`select count(*) from public.activity_log where action='user.reinvite' and detail=${lit(email)}`) === "1");

  // The email link → set a password → active. The invitee gets their own cookie jar.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  check("invitation link generated (stand-in for the email)", !linkErr && link?.properties?.hashed_token, linkErr?.message);
  const invitee = await (await browser.newContext()).newPage({ width: 1200, height: 900 });
  await invitee.go(`/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${encodeURIComponent("/security?welcome=1")}`, 6000);
  check("link signs the invitee in and lands on the password form", (await invitee.url()) === "/security?welcome=1", await invitee.url());
  check("welcome copy shown", /Choose a password to finish/.test(await invitee.text()));
  await invitee.fill('input[name="password"]', NEW_PASSWORD);
  await invitee.fill('input[name="confirm"]', NEW_PASSWORD);
  await invitee.ev(`document.querySelector('input[name="password"]').form.requestSubmit()`);
  check("account becomes active after setting the password", await until(() => sql(`select status from public.users where email=${lit(email)}`) === "active", { timeout: 8000 }));
  const newcomer = await signIn(email, NEW_PASSWORD);
  check("invitee can sign in with the new password", !newcomer.error && newcomer.me?.role === "agent", newcomer.error?.message);
  const { data: agentLeads } = await newcomer.sb.from("leads").select("id").limit(1);
  check("…and has agent access", (agentLeads ?? []).length === 1);
  check("password change logged in activity", sql(`select count(*) from public.activity_log a join public.users u on u.id=a.user_id where u.email=${lit(email)} and a.action='password.change'`) === "1");
  check("admins notified that the invitation was accepted", sql(`select count(*) from public.notifications n join public.users u on u.id=n.user_id where u.role='admin' and n.kind='system' and n.title = ${lit(`Invitation accepted: ${email}`)}`) === "1");
  invitee.close();

  const securityHtml = await fetch(`${APP_URL}/security`, { headers: { cookie: cookieHeader(await sessionCookies("admin@beacon.test")) } }).then((r) => r.text());
  check("admin's own Security page shows the password card", /Change password|Password/.test(securityHtml));

  // Edit: the dialog, focus return, then disable
  await page.go("/users?q=" + encodeURIComponent(email));
  check("row menu opens", await openRowMenu("Nova Reyes"));
  await sleep(600);
  check("Edit item present and real", await page.menuItem("Edit"));
  await sleep(900);
  check("edit dialog shows the user", (await page.ev(`document.querySelector('input[name="email"]')?.value`)) === email);
  await page.key("Escape");
  await sleep(700);
  check("closing the dialog returns focus to the row's ⋯ button", (await page.ev("document.activeElement?.getAttribute('aria-label')")) === "Actions for Nova Reyes");
  await openRowMenu("Nova Reyes");
  await sleep(600);
  check("no Resend invitation once they have accepted", !(await page.ev(`[...document.querySelectorAll('[role=menuitem]')].some((e) => e.textContent.includes('Resend'))`)));
  await page.menuItem("Edit");
  await sleep(900);
  await page.fill('select[name="status"]', "disabled");
  await submitUserForm();
  check("status saved as disabled", await until(() => sql(`select status from public.users where email=${lit(email)}`) === "disabled", { timeout: 8000 }));
  const banned = await admin.auth.admin.getUserById(sql(`select auth_id from public.users where email=${lit(email)}`));
  check("auth account banned while disabled", Boolean(banned.data?.user?.banned_until), banned.data?.user?.banned_until ?? "not banned");
  const disabledSignIn = await signIn(email, NEW_PASSWORD);
  check("disabled user cannot sign in", !!disabledSignIn.error, disabledSignIn.error?.message ?? "signed in!");
  check("disable logged", sql(`select count(*) from public.activity_log where action='user.disable' and detail=${lit(email)}`) === "1");

  // Enable again: the ban lifts
  await page.go("/users?q=" + encodeURIComponent(email));
  await openRowMenu("Nova Reyes");
  await sleep(600);
  await page.menuItem("Edit");
  await sleep(900);
  await page.fill('select[name="status"]', "active");
  await submitUserForm();
  await until(() => sql(`select status from public.users where email=${lit(email)}`) === "active", { timeout: 8000 });
  await sleep(1000);
  const reenabled = await signIn(email, NEW_PASSWORD);
  check("re-enabled account signs in again", !reenabled.error, reenabled.error?.message);

  // Reset two-factor (a verified factor needs a secret, or Auth itself breaks)
  const authId = sql(`select auth_id from public.users where email=${lit(email)}`);
  sql(`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at) values (gen_random_uuid(), ${lit(authId)}, 'phone', 'totp', 'verified', 'JBSWY3DPEHPK3PXP', now(), now())`);
  await page.go("/users?q=" + encodeURIComponent(email));
  check("Two-factor column shows On", /\bON\b/i.test(await page.ev(`[...document.querySelectorAll('tbody td')].map((t) => t.innerText).join('|')`)));
  await openRowMenu("Nova Reyes");
  await sleep(600);
  check("Reset two-factor item present", await page.menuItem("Reset two-factor"));
  await sleep(800);
  check("confirmation dialog asks first", /Reset two-factor for Nova Reyes/.test(await page.text()));
  await page.click("[role=dialog] button", "Reset");
  check("factor removed", await until(() => sql(`select count(*) from auth.mfa_factors where user_id=${lit(authId)}`) === "0", { timeout: 8000 }));
  check("reset logged", sql(`select count(*) from public.activity_log where action='mfa.reset' and detail=${lit(email)}`) === "1");

  // An administrator cannot delete themselves
  await page.go("/users?q=admin%40beacon.test");
  const adminName = sql("select concat_ws(' ', first_name, last_name) from public.users where email='admin@beacon.test'");
  await openRowMenu(adminName);
  await sleep(600);
  let selfToast = "";
  if (await page.menuItem("Delete")) {
    await sleep(800);
    await page.click("[role=dialog] button", "Delete");
    selfToast = await page.waitToast(/can't delete your own/);
  }
  check("admin cannot delete themselves", sql("select count(*) from public.users where email='admin@beacon.test'") === "1" && /can't delete your own/.test(selfToast), selfToast);

  // Delete for real
  await page.go("/users?q=" + encodeURIComponent(email));
  await openRowMenu("Nova Reyes");
  await sleep(600);
  await page.menuItem("Delete");
  await sleep(800);
  const confirmText = await page.text();
  check("delete asks for confirmation", /Delete Nova Reyes\?/.test(confirmText));
  check("…and says what happens to their work", /set them to Disabled instead/.test(confirmText));
  await page.click("[role=dialog] button", "Delete");
  check("directory row deleted", await until(() => sql(`select count(*) from public.users where email=${lit(email)}`) === "0", { timeout: 8000 }));
  check("auth account deleted", sql(`select count(*) from auth.users where email=${lit(email)}`) === "0");
  check("delete logged", sql(`select count(*) from public.activity_log where action='user.delete' and detail=${lit(email)}`) === "1");
} finally {
  browser.close();
  sql("delete from public.notifications where kind='system' and title like '%newrep.%'; delete from public.activity_log where detail like 'newrep.%'");
}

{
  const m = await signIn("sean@beacon.test");
  const { data } = await m.sb.rpc("activate_invited_account");
  check("activate_invited_account is a no-op for active users", data === false);
}

finish("security");
