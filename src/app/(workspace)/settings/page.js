import Topbar from "@/components/layout/topbar";
import SettingsForm from "@/features/settings/components/settings-form";
import { getSettings } from "@/features/settings/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { settings } = await getSettings();

  return (
    <>
      <Topbar title="Settings" sub="Branding, security, and email" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <SettingsForm settings={settings} />
      </div>
    </>
  );
}
