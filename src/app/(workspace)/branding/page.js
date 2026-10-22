import { Globe, Palette } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import PictureUpload from "@/components/shared/picture-upload";
import { Card } from "@/components/ui/card";
import WebsiteForm from "@/features/clients/components/website-form";
import { setCompanyLogo } from "@/features/clients/actions";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Branding (the old client Branding page): a client's own logo, shown in
 * their workspace, and their website.
 */
export default async function BrandingPage() {
  const me = await getCurrentUser();
  const company = me?.company;
  return (
    <>
      <Topbar title="Branding" sub={company?.name ?? "Your company"} />
      <div className="grid flex-1 grid-cols-1 content-start gap-4 p-4 sm:p-6 xl:grid-cols-2">
        {company ? (
          <>
            <Card data-branding-logo>
              <SectionHeader label="Your Logo" icon={Palette} />
              <div className="p-5">
                <PictureUpload kind="logo" folder={`company/${company.id}`} path={company.logo_path} name={company.name} save={setCompanyLogo}
                  label="Shown in your workspace, under ours. PNG with a see-through background looks best." />
              </div>
            </Card>
            <Card>
              <SectionHeader label="Your Website" icon={Globe} />
              <div className="p-5">
                <WebsiteForm website={company.website} />
              </div>
            </Card>
          </>
        ) : (
          <Card><p className="p-10 text-center text-sm text-muted-foreground">Your sign-in is not tied to a client account. An administrator can set that up.</p></Card>
        )}
      </div>
    </>
  );
}
