import { ShieldCheck, History, KeyRound, UserRound, Camera } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import TwoFactorSetup from "@/features/auth/components/two-factor-setup";
import PasswordForm from "@/features/auth/components/password-form";
import ProfileForm from "@/features/auth/components/profile-form";
import PictureUpload from "@/components/shared/picture-upload";
import { setMyPhoto } from "@/features/auth/actions";
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
    // This is where someone with an invitation or a temporary password must set their own: their
    // recent activity is beside the point, and never a reason for the page not to open.
    listActivity({ page: 1, perPage: 10, q: "", filters: {} }).catch((err) => {
      console.error("[security] recent activity", err?.message ?? err);
      return { rows: [] };
    }),
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
      {/* The forms keep a width a form reads well at; what was done lately runs beside them. */}
      <div className="grid flex-1 grid-cols-1 content-start items-start gap-4 p-4 sm:p-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
        <Card accent={welcome ? "var(--neon-cyan)" : undefined}>
          <SectionHeader label={welcome ? "Set your password" : "Password"} icon={KeyRound} />
          <PasswordForm welcome={welcome} reset={reset} temporary={temporary || (me?.status === "invited" && Boolean(me?.must_change_password))} isClient={me?.role === "client"} />
        </Card>

        {/* Their own contact details; the sign-in email and role stay an administrator's. */}
        {me?.status === "active" ? (
          <Card>
            <SectionHeader label="My Profile" icon={UserRound} />
            <ProfileForm me={{ first_name: me.first_name, last_name: me.last_name, phone: me.phone, mobile: me.mobile, email: me.email, bio: me.bio ?? "", birthday: me.birthday ?? null }} staff={me.role !== "client"} />
          </Card>
        ) : null}

        {/* Staff: their photo, on Meet the Team for the clients to put a face to the name. */}
        {me?.status === "active" && me.role !== "client" ? (
          <Card data-my-photo>
            <SectionHeader label="My Photo" icon={Camera} />
            <div className="p-5">
              <PictureUpload folder={`user/${me.id}`} path={me.photo_path} name={[me.first_name, me.last_name].filter(Boolean).join(" ")} save={setMyPhoto}
                label="Clients see it on Meet the Team. A clear head-and-shoulders picture works best." />
            </div>
          </Card>
        ) : null}

        <Card accent="var(--neon-emerald)">
          <SectionHeader label="Two-Factor Authentication" icon={ShieldCheck} />
          <TwoFactorSetup enabled={twoFactor.enabled} factors={twoFactor.factors} />
        </Card>

        </div>

        <Card>
          <SectionHeader label="Your Recent Activity" icon={History} />
          <div className="p-2">
            {mine.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              mine.map((r) => (
                <div key={r.id} data-list-row className="rounded-lg px-3 py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`min-w-0 truncate text-sm font-medium ${r.actionKey === "sign_in" ? "text-primary" : r.actionKey.startsWith("mfa") ? "text-emerald-500" : ""}`}>{r.action}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.when}</span>
                  </div>
                  {r.detail ? <div className="truncate text-xs text-muted-foreground" title={r.detail}>{r.detail}</div> : null}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
