import Topbar from "@/components/layout/topbar";
import SettingsForm from "@/features/settings/components/settings-form";
import { getSettings } from "@/features/settings/queries";
import PayRulesForm from "@/features/pay/components/pay-rules-form";
import PaySchedule from "@/features/pay/components/pay-schedule";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { getBonusRules, getPayRules } from "@/features/pay/queries";
import BonusPlansSettings from "@/features/pay/components/bonus-plans-settings";
import { mailServerInfo } from "@/lib/server/mail";
import SicCodesCard from "@/features/sic/components/sic-codes-card";
import CargoTypesCard from "@/features/cargo/components/cargo-types-card";
import IdleSettings from "@/features/settings/components/idle-settings";
import DeliverySettings from "@/features/settings/components/delivery-settings";
import { getCargoTypes } from "@/features/cargo/queries";
import DeletedRecordsCard from "@/features/trash/components/deleted-records-card";
import EmailTemplatesCard from "@/features/email/components/email-templates-card";
import { getAllEmailTemplates } from "@/features/email/templates";
import { getDeletedRecords } from "@/features/trash/queries";
import { createClient } from "@/lib/supabase/server";
import ApptTextSettings from "@/features/settings/components/appt-text-settings";
import CallRecordingSettings from "@/features/settings/components/call-recording-settings";
import { apptTextSettings } from "@/lib/appointment-texts";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ settings }, payRules, today, sic, deleted, cargo, templates, tz, texting, bonusRules] = await Promise.all([
    getSettings(), getPayRules(), getBusinessToday(),
    supabase.from("sic_codes").select("code", { count: "exact", head: true }),
    getDeletedRecords(),
    getCargoTypes(),
    getAllEmailTemplates(),
    getBusinessTimeZone(),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("appt_texts", true).is("deleted_at", null),
    getBonusRules(),
  ]);

  return (
    <>
      <Topbar title="Settings" sub="Branding, security, email, pay and time" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <SettingsForm settings={settings} mailServer={mailServerInfo()} />
        {/* What managers pick from in a lead's Email box (client, Nov 2026). */}
        <EmailTemplatesCard templates={templates} />
        {/* The text a prospect gets the day before their appointment, on the projects that have it on (client, Nov 2026). */}
        <ApptTextSettings value={apptTextSettings(settings.appt_texts, tz)} projects={texting.count ?? 0} />
        {/* Every call on the Lighthouse phone recorded, without pressing Record (Sean, Nov 2026). */}
        <CallRecordingSettings value={settings.phone} />
        <DeliverySettings value={settings.delivery} />
        <IdleSettings minutes={settings.security?.idle_minutes} />
        <PayRulesForm rules={payRules} />
        <PaySchedule periods={payRules.time.schedule} today={today} editable />
        {/* The lead and appointment managers' bonus plans (Sean, Nov 2026). */}
        <BonusPlansSettings rules={bonusRules} />
        <SicCodesCard count={sic.count ?? 0} />
        <CargoTypesCard types={cargo} />
        <DeletedRecordsCard records={deleted} />
      </div>
    </>
  );
}
