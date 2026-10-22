import { UsersRound } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import TeamGrid from "@/features/team/components/team-grid";
import { getTeam } from "@/features/team/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Meet the Team (the old Meet DCM): the staff with their photos and a line
 * about each. A client sees first the people who work their projects.
 */
export default async function TeamPage() {
  const [me, team] = await Promise.all([getCurrentUser(), getTeam()]);
  const client = me?.role === "client";
  const groups = client
    ? [
        { key: "mine", label: "Working on your projects", people: team.filter((m) => m.mine) },
        { key: "rest", label: "The rest of the team", people: team.filter((m) => !m.mine) },
      ]
    : [{ key: "all", label: null, people: team }];

  return (
    <>
      <Topbar title="Meet the Team" sub={client ? "The people behind your leads and appointments" : `${team.length} on the team`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader label="Meet the Team" icon={UsersRound} />
          <div className="p-5">
            {team.length ? <TeamGrid groups={groups} /> : <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the team yet.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
