import Topbar from "@/components/layout/topbar";
import SettingsForm from "@/features/settings/components/settings-form";
import { getSettings } from "@/features/settings/queries";
import PayRulesForm from "@/features/pay/components/pay-rules-form";
import PaySchedule from "@/features/pay/components/pay-schedule";
import { getBusinessToday } from "@/lib/server/business-day";
import { getPayRules } from "@/features/pay/queries";
import { mailServerInfo } from "@/lib/server/mail";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [{ settings }, payRules, today] = await Promise.all([getSettings(), getPayRules(), getBusinessToday()]);

  return (
    <>
      <Topbar title="Settings" sub="Branding, security, email, pay and time" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <SettingsForm settings={settings} mailServer={mailServerInfo()} />
        <PayRulesForm rules={payRules} />
        <PaySchedule periods={payRules.time.schedule} today={today} editable />
      </div>
    </>
  );
}
