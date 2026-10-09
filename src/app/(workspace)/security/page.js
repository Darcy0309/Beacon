import { ShieldCheck, History, KeyRound, UserRound } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import TwoFactorSetup from "@/features/auth/components/two-factor-setup";
import PasswordForm from "@/features/auth/components/password-form";
import ProfileForm from "@/features/auth/components/profile-form";
import ToneBadge from "@/components/shared/tone-badge";
import { Card } from "@/components/ui/card";
import { listActivity } from "@/features/activity/queries";
import { getMyTwoFactor } from "@/features/auth/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Everyone's own security settings: password, two-factor, and their recent activity. */
export default async function SecurityPage({ searchParams }) {
  const params = await searchParams;
  const [me, twoFactor, { rows }] = await Promise.all([
    getCurrentUser(),
    getMyTwoFactor(),
    listActivity({ page: 1, perPage: 10, q: "", filters: {} }),
  ]);

  // A fresh invitation lands here to set a password; so does an invited
  // account that wandered elsewhere before doing so.
  // From a "forgot your password" email: set a new one.
  const reset = params?.reset === "1";
  // Signed in with a temporary password an administrator gave them: their own first.
  const temporary = !reset && me?.status !== "invited" && Boolean(me?.must_change_password);
  const welcome = reset || temporary || params?.welcome === "1" || me?.status === "invited";
  const mine = rows.filter((r) => r.who === me?.name).slice(0, 8);

  return (
    <>
      <Topbar title="My Security" sub={me?.email ?? "Your sign-in settings"} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card accent={welcome ? "var(--neon-cyan)" : undefined}>
          <SectionHeader label={welcome ? "Set your password" : "Password"} icon={KeyRound} />
          <PasswordForm welcome={welcome} reset={reset} temporary={temporary || (me?.status === "invited" && Boolean(me?.must_change_password))} isClient={me?.role === "client"} />
        </Card>

        {/* Their own contact details; the sign-in email and role stay an administrator's. */}
        {me?.status === "active" ? (
          <Card>
            <SectionHeader label="My Profile" icon={UserRound} />
            <ProfileForm me={{ first_name: me.first_name, last_name: me.last_name, phone: me.phone, mobile: me.mobile, email: me.email }} />
          </Card>
        ) : null}

        <Card accent="var(--neon-emerald)">
          <SectionHeader label="Two-Factor Authentication" icon={ShieldCheck} />
          <TwoFactorSetup enabled={twoFactor.enabled} factors={twoFactor.factors} />
        </Card>

        <Card>
          <SectionHeader label="Your Recent Activity" icon={History} />
          <div className="p-2">
            {mine.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              mine.map((r) => (
                <div key={r.id} data-list-row className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <ToneBadge tone={r.actionKey === "sign_in" ? "cyan" : r.actionKey.startsWith("mfa") ? "emerald" : "slate"}>
                    {r.action}
                  </ToneBadge>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.detail}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{r.when}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
