import Topbar from "@/components/topbar";
import SettingsForm from "@/components/settings-form";
import { getSettings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { settings, ipWhitelist } = await getSettings();

  return (
    <>
      <Topbar title="Settings" sub="Organization, branding, email, and access control" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <SettingsForm settings={settings} ipWhitelist={ipWhitelist} />
      </div>
    </>
  );
}
