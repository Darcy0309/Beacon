import { notFound } from "next/navigation";
import Link from "@/components/shared/intent-link";
import { ArrowLeft } from "lucide-react";
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
import PhoneLinesSettings from "@/features/settings/components/phone-lines-settings";
import { apptTextSettings } from "@/lib/appointment-texts";
import CampaignTypesCard from "@/features/campaign-types/components/campaign-types-card";
import { getCampaignTypes } from "@/features/campaign-types/queries";
import DashboardLayoutCard from "@/features/dashboard/components/dashboard-layout-card";
import { getMyDashboardLayout } from "@/features/dashboard/queries";
import { getCurrentUser } from "@/lib/server/session";
import SettingsIcon from "@/features/settings/components/settings-icon";
import { SETTINGS_AREAS, settingsArea } from "@/features/settings/areas";

export const dynamic = "force-dynamic";

/** Each area's cards, with only what they read. */
const AREAS = {
  // Branding, the mail server and sign-in security (one form), and signing out an idle session.
  general: async () => {
    const { settings } = await getSettings();
    return (
      <>
        <SettingsForm settings={settings} mailServer={mailServerInfo()} />
        <IdleSettings minutes={settings.security?.idle_minutes} />
      </>
    );
  },
  // The dashboard's sections, the administrator's own and each kind's default (Sean, Nov 2026: moved here from the dashboard).
  dashboard: async () => <DashboardLayoutCard layout={await getCurrentUser().then(getMyDashboardLayout)} />,
  // The lines, extensions and voicemail (Sean, Nov 2026: the toll-free lines moved from PanTerra), and every call recorded.
  phone: async () => {
    const supabase = await createClient();
    const [{ settings }, lines, callers] = await Promise.all([
      getSettings(),
      supabase.from("phone_lines").select("id, number, kind, label, ring_user_ids, area_code").order("kind").order("number"),
      supabase.from("users").select("id, first_name, last_name, email, phone_ext").in("role", ["admin", "manager", "agent"]).eq("status", "active")
        .is("deleted_at", null).order("first_name").order("last_name").limit(500),
    ]);
    return (
      <>
        <PhoneLinesSettings lines={lines.data ?? []} staff={callers.data ?? []} value={settings.phone ?? {}} />
        <CallRecordingSettings value={settings.phone} />
      </>
    );
  },
  // What managers pick from in a lead's Email box; how leads go to clients; the text the day before an appointment.
  messages: async () => {
    const supabase = await createClient();
    const [{ settings }, templates, tz, texting] = await Promise.all([
      getSettings(), getAllEmailTemplates(), getBusinessTimeZone(),
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("appt_texts", true).is("deleted_at", null),
    ]);
    return (
      <>
        <EmailTemplatesCard templates={templates} />
        <div id="delivery" className="scroll-mt-24"><DeliverySettings value={settings.delivery} /></div>
        <ApptTextSettings value={apptTextSettings(settings.appt_texts, tz)} projects={texting.count ?? 0} />
      </>
    );
  },
  pay: async () => {
    const [payRules, today, bonusRules] = await Promise.all([getPayRules(), getBusinessToday(), getBonusRules()]);
    return (
      <>
        <PayRulesForm rules={payRules} />
        <PaySchedule periods={payRules.time.schedule} today={today} editable />
        {/* The lead and appointment managers' bonus plans (Sean, Nov 2026). */}
        <BonusPlansSettings rules={bonusRules} />
      </>
    );
  },
  leads: async () => {
    const supabase = await createClient();
    const [campaignTypes, sic, cargo] = await Promise.all([
      getCampaignTypes(),
      supabase.from("sic_codes").select("code", { count: "exact", head: true }),
      getCargoTypes(),
    ]);
    return (
      <>
        {/* Lead sheets for other industries (Sean, Nov 2026). */}
        <CampaignTypesCard types={campaignTypes} />
        <SicCodesCard count={sic.count ?? 0} />
        <CargoTypesCard types={cargo} />
      </>
    );
  },
  trash: async () => <DeletedRecordsCard records={await getDeletedRecords()} />,
};

/** One area of Settings (client, Nov 2026), with the others a click away along its top. */
export default async function SettingsAreaPage({ params }) {
  const { area } = await params;
  const meta = settingsArea(area);
  if (!meta || !AREAS[area]) notFound();
  const cards = await AREAS[area]();
  return (
    <>
      <Topbar title="Settings" sub={meta.title} />
      <div className="flex-1 space-y-4 p-4 sm:p-6" data-settings-page={area}>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/settings" data-settings-back
            className="back-link mr-2 inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
            <ArrowLeft className="size-3.5" /> All settings
          </Link>
          <nav aria-label="Settings areas" className="flex flex-wrap gap-1.5">
            {SETTINGS_AREAS.map((a) => (
              <Link key={a.key} href={`/settings/${a.key}`} aria-current={a.key === area ? "page" : undefined} data-settings-tab={a.key}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${a.key === area ? "border-primary bg-primary/10 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary"}`}>
                <SettingsIcon name={a.icon} className="size-3.5" /> {a.title}
              </Link>
            ))}
          </nav>
        </div>
        {cards}
      </div>
    </>
  );
}
