import Link from "@/components/shared/intent-link";
import { ChevronRight, KeyRound, ShieldCheck, SlidersHorizontal, UserRound, Voicemail } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import { Card } from "@/components/ui/card";
import ProfileForm from "@/features/auth/components/profile-form";
import VoicemailGreeting from "@/features/phone/components/voicemail-greeting";
import ProfilePreferences from "@/features/profile/components/profile-preferences";
import ProfileAvatar from "@/features/profile/components/profile-avatar";
import { getMyTwoFactor } from "@/features/auth/queries";
import { ROLES } from "@/lib/nav";
import { mediumDate, timeAgo } from "@/lib/format";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * My Profile (Nov 2026), from the sidebar's picture and name: who you are in Lighthouse at a glance (staff click their
 * avatar for their photo); your details and voicemail greeting (here from My Security); this computer's preferences (the look, desktop notifications,
 * your time zone); and where your sign-in stands, with My Security a click away for the password and two-factor.
 */
export default async function ProfilePage() {
  const [me, twoFactor] = await Promise.all([getCurrentUser(), getMyTwoFactor()]);
  if (!me) return null;
  const staff = me.role !== "client";
  const active = me.status === "active";
  const calls = active && ["admin", "manager", "agent"].includes(me.role);
  const name = [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email;
  const facts = [
    ["Email", <span key="e" className="break-all">{me.email}</span>],
    me.company?.name ? ["Client", me.company.name] : null,
    me.phone_ext ? ["Extension", <span key="x" className="tabular-nums">{me.phone_ext}</span>] : null,
    me.start_date ? ["Started", mediumDate(me.start_date)] : null,
    me.last_login ? ["Last signed in", timeAgo(me.last_login)] : null,
  ].filter(Boolean);

  return (
    <>
      <Topbar title="My Profile" sub={me.email} />
      <div className="grid flex-1 grid-cols-1 content-start items-start gap-4 p-4 sm:p-6 xl:grid-cols-3" data-my-profile>
        <div className="space-y-4 xl:col-span-2">
          {/* Who you are here, at a glance. */}
          <Card className="overflow-hidden" data-profile-header>
            <div className="flex flex-wrap items-center gap-5 p-5">
              {/* Staff click it to add or change their photo (Nov 2026: in place of a My Photo box). */}
              <ProfileAvatar userId={me.id} path={me.photo_path} initials={me.initials} editable={active && staff} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-semibold" data-profile-name>{name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <ToneBadge tone={me.role === "admin" ? "amber" : me.role === "client" ? "violet" : "cyan"}>
                    {me.role === "client" && me.project_scope === "only" ? "Agent" : ROLES[me.role]?.label ?? me.role}
                  </ToneBadge>
                  {me.salesRep ? <ToneBadge tone="emerald">Sales Rep</ToneBadge> : null}
                  {twoFactor.enabled ? <ToneBadge tone="emerald">Two-factor on</ToneBadge> : <ToneBadge tone="slate">Two-factor off</ToneBadge>}
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--panel-border)] px-5 py-4 text-sm sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex min-w-0 gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Your own details; the sign-in email and role stay an administrator's. */}
          {active ? (
            <Card>
              <SectionHeader label="My Details" icon={UserRound} />
              <ProfileForm me={{ first_name: me.first_name, last_name: me.last_name, phone: me.phone, mobile: me.mobile, email: me.email, bio: me.bio ?? "", birthday: me.birthday ?? null }} staff={staff} />
            </Card>
          ) : null}

          {/* Staff who take calls: what their extension's voicemail says (Sean, Nov 2026: an AI voice, or their own). */}
          {calls ? (
            <Card data-my-voicemail>
              <SectionHeader label="My Voicemail Greeting" icon={Voicemail} />
              <VoicemailGreeting me={{ first_name: me.first_name, phone_ext: me.phone_ext, voicemail_greeting: me.voicemail_greeting,
                voicemail_use_recording: me.voicemail_use_recording, voicemail_audio_path: me.voicemail_audio_path }} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionHeader label="Preferences" icon={SlidersHorizontal} />
            <ProfilePreferences />
          </Card>

          {/* The sign-in itself stays on My Security: password and two-factor. */}
          <Card data-profile-security>
            <SectionHeader label="Sign-in & Security" icon={ShieldCheck} />
            <div className="divide-y divide-[var(--panel-border)] text-sm">
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex items-center gap-2"><KeyRound className="size-4 text-muted-foreground" aria-hidden /> Password</span>
                <span className="text-muted-foreground">Set</span>
              </div>
              <div className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" aria-hidden /> Two-factor authentication</span>
                <span className={twoFactor.enabled ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{twoFactor.enabled ? "On" : "Off"}</span>
              </div>
              <Link href="/security" className="flex items-center justify-between gap-3 px-5 py-3 font-medium text-primary hover:bg-muted/40" data-profile-to-security>
                Change your password or two-factor <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
