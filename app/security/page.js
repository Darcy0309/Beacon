import { ShieldCheck, History } from "lucide-react";
import Topbar from "@/components/topbar";
import SectionHeader from "@/components/section-header";
import TwoFactorSetup from "@/components/two-factor-setup";
import ToneBadge from "@/components/tone-badge";
import { Card } from "@/components/ui/card";
import { getMyTwoFactor, getCurrentUser, listActivity } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Everyone's own security settings: two-factor, and their recent activity. */
export default async function SecurityPage() {
  const [me, twoFactor, { rows }] = await Promise.all([
    getCurrentUser(),
    getMyTwoFactor(),
    listActivity({ page: 1, perPage: 10, q: "", filters: {} }),
  ]);

  const mine = rows.filter((r) => r.who === me?.name).slice(0, 8);

  return (
    <>
      <Topbar title="My Security" sub={me?.email ?? "Your sign-in settings"} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
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
