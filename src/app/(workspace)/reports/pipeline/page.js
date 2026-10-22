import { Gauge } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import KeepFilters from "@/features/reports/components/keep-filters";
import PipelineReport from "@/features/reports/components/pipeline-report";
import XdateFilterBar from "@/features/reports/components/xdate-filter-bar";
import { getPipelineManagers, getPipelineReport } from "@/features/reports/queries";
import { getSalesReps } from "@/features/users/queries";
import { pipelineMonths, readXdateFilters } from "@/lib/pipeline";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/server/query-helpers";

export const dynamic = "force-dynamic";

const FILTER_KEYS = ["client", "rep", "type", "project", "managers", "months"];

/**
 * The Pipeline Report for managers (Sean, Oct 2026): as on X-Dates by Month,
 * on the projects they are assigned to; each project's name opens its call
 * list. Their filters are kept for the rest of the day.
 */
export default async function PipelinePage({ searchParams }) {
  const sp = await searchParams;
  const filters = readXdateFilters(sp);
  const supabase = await createClient();
  const [me, today, tz, reps, managers] = await Promise.all([getCurrentUser(), getBusinessToday(), getBusinessTimeZone(), getSalesReps(), getPipelineManagers()]);
  // Their projects, and those projects' clients, for the filters.
  const { data: assigned } = await supabase.from("project_assignments")
    .select("project:projects(id, name, company_id, deleted_at, type:project_types(code), company:companies(id, name))")
    .eq("ae_user_id", me.id);
  const projects = (assigned ?? []).map((a) => one(a.project)).filter((p) => p && !p.deleted_at)
    .map((p) => ({ id: p.id, name: p.name, company_id: p.company_id, type: one(p.type)?.code ?? null, company: one(p.company) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const companies = [...new Map(projects.filter((p) => p.company).map((p) => [p.company.id, p.company])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const months = pipelineMonths(filters.months, today);
  const rows = await getPipelineReport({ filters, months, timeZone: tz });

  return (
    <>
      <Topbar title="Pipeline Report" sub={`${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} on your projects`} />
      <KeepFilters storageKey="lighthouse.pipeline-filters" keys={FILTER_KEYS} day={today} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <SectionHeader label="Pipeline Report" icon={Gauge} />
          <XdateFilterBar filters={filters} options={{ companies, projects, reps, managers }} />
          <PipelineReport rows={rows} months={months} today={today} linkTo="work" fileName={`PipelineReport_${today}.csv`} />
        </Card>
      </div>
    </>
  );
}
