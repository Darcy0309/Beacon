import { ClipboardList, Pencil } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ProjectInfoView from "@/features/project-info/components/project-info-view";
import { ProjectInfoDialog } from "@/features/project-info/components/project-info-form";
import { getClientProjectInfos } from "@/features/project-info/queries";
import { getCarrierNames } from "@/features/insurance/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * A client's own Project Info (Sean, Oct 2026), one for each of their
 * projects, to keep up to date from their sign-in: the account managers
 * read it on every call they make for them, the producers ticked for leads
 * get each lead and appointment by email, and the days to avoid stay off
 * the project's calendar.
 */
export default async function ProjectInfoPage() {
  const [me, infos, carriers] = await Promise.all([getCurrentUser(), getClientProjectInfos(), getCarrierNames()]);

  return (
    <>
      <Topbar title="Project Info" sub={me?.company?.name ?? undefined} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <p className="max-w-3xl text-sm text-muted-foreground">
          What our account managers work your {infos.length === 1 ? "project" : "projects"} from, and read on every call they make for you.
          The producers ticked for leads get each lead and appointment by email, and the days to avoid stay off the calendar.
        </p>
        {infos.map((info) => (
          <Card key={info.project_id} data-info-project={info.project_id} className="overflow-hidden">
            <SectionHeader wrap label={info.project_name} icon={ClipboardList}
              action={<ProjectInfoDialog info={info} carriers={carriers} trigger={<Button size="sm" data-edit-project-info><Pencil /> Edit</Button>} />} />
            <ProjectInfoView info={info} wide emptyHint="Fill it in with Edit." />
          </Card>
        ))}
        {infos.length === 0 ? <Card className="p-6 text-sm text-muted-foreground">You have no projects yet.</Card> : null}
      </div>
    </>
  );
}
