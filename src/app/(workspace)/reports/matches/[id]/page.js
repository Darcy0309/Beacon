import { notFound } from "next/navigation";
import { ArrowLeft, Combine } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import AddMatches from "@/features/matches/components/add-matches";
import { getProjectMatches } from "@/features/matches/queries";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A project's matches, to bring in (Sean, Nov 2026). Administrators only. */
export default async function ProjectMatches({ params }) {
  const [{ id: raw }, me] = await Promise.all([params, getCurrentUser()]);
  if (me?.role !== "admin" || !/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  const supabase = await createClient();
  const [{ data: project }, matches, today] = await Promise.all([
    supabase.from("projects").select("id, name, appt_project_id, type:project_types(code), company:companies(name)").eq("id", id).is("deleted_at", null).maybeSingle(),
    getProjectMatches(id),
    getBusinessToday(),
  ]);
  if (!project) notFound();
  const type = (Array.isArray(project.type) ? project.type[0] : project.type)?.code;
  const client = (Array.isArray(project.company) ? project.company[0] : project.company)?.name;

  return (
    <>
      <Topbar title={project.name} sub={`${client ? `${client} · ` : ""}${matches.length.toLocaleString()} matches`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/reports/matches" className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to the Match Tool
        </Link>
        <Card data-project-matches={id}>
          <SectionHeader label="Names on this list we have elsewhere with a renewal date" icon={Combine} />
          <AddMatches projectId={id} isDbdev={type === "DBDV"} hasAppt={type === "APPT" || Boolean(project.appt_project_id)} matches={matches} today={today} />
        </Card>
      </div>
    </>
  );
}
