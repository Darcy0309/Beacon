import Topbar from "@/components/layout/topbar";
import SettingsForm from "@/features/settings/components/settings-form";
import { getSettings } from "@/features/settings/queries";
import PayRulesForm from "@/features/pay/components/pay-rules-form";
import PaySchedule from "@/features/pay/components/pay-schedule";
import { getBusinessToday } from "@/lib/server/business-day";
import { getPayRules } from "@/features/pay/queries";
import { mailServerInfo } from "@/lib/server/mail";
import SicCodesCard from "@/features/sic/components/sic-codes-card";
import CargoTypesCard from "@/features/cargo/components/cargo-types-card";
import IdleSettings from "@/features/settings/components/idle-settings";
import DeliverySettings from "@/features/settings/components/delivery-settings";
import { getCargoTypes } from "@/features/cargo/queries";
import DeletedRecordsCard from "@/features/trash/components/deleted-records-card";
import { getDeletedRecords } from "@/features/trash/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ settings }, payRules, today, sic, deleted, cargo] = await Promise.all([
    getSettings(), getPayRules(), getBusinessToday(),
    supabase.from("sic_codes").select("code", { count: "exact", head: true }),
    getDeletedRecords(),
    getCargoTypes(),
  ]);

  return (
    <>
      <Topbar title="Settings" sub="Branding, security, email, pay and time" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <SettingsForm settings={settings} mailServer={mailServerInfo()} />
        <DeliverySettings value={settings.delivery} />
        <IdleSettings minutes={settings.security?.idle_minutes} />
        <PayRulesForm rules={payRules} />
        <PaySchedule periods={payRules.time.schedule} today={today} editable />
        <SicCodesCard count={sic.count ?? 0} />
        <CargoTypesCard types={cargo} />
        <DeletedRecordsCard records={deleted} />
      </div>
    </>
  );
}
