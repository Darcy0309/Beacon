import { UsersRound } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import TeamGrid from "@/features/team/components/team-grid";
import { getTeam, getTeamSpotlight } from "@/features/team/queries";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Meet the Team (the old Meet DCM, and more): the staff with their photos,
 * what they do and whether they are on the phones now; the week's spotlight;
 * a message, a thank-you, and on someone's birthday a gift. A client sees
 * first the people who work their projects, with what each did for them.
 */
export default async function TeamPage() {
  const [me, team, spotlight, today, tz] = await Promise.all([getCurrentUser(), getTeam(), getTeamSpotlight(), getBusinessToday(), getBusinessTimeZone()]);
  const client = me?.role === "client";
  const groups = client
    ? [
        { key: "mine", label: "Working on your projects", people: team.filter((m) => m.mine) },
        { key: "rest", label: "The rest of the team", people: team.filter((m) => !m.mine) },
      ]
    : [{ key: "all", label: null, people: team }];
  const calling = team.filter((m) => m.status === "calling").length;

  return (
    <>
      <Topbar title="Meet the Team" sub={client ? "The people behind your leads and appointments" : `${team.length} on the team${calling ? ` · ${calling} on the phones now` : ""}`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <SectionHeader label="Meet the Team" icon={UsersRound} />
          <div className="p-5">
            {team.length ? (
              <TeamGrid groups={groups} me={{ id: me?.id, role: me?.role }} spotlight={spotlight} spotlightOn={spotlight !== null}
                today={today} timeZone={tz} />
            ) : <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the team yet.</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
