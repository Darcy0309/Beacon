import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import BestTimesBoard from "@/features/best-times/components/best-times-board";
import { getBestTimes } from "@/features/best-times/queries";
import { getAssignableStaff } from "@/features/users/queries";
import { addDays, formatRange, isIsoDate } from "@/lib/dates";
import { US_STATES } from "@/lib/project-info";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BY = [["sic", "Industry (SIC)"], ["state", "State"], ["type", "Project type"], ["manager", "Manager"]];
const id = (v) => (typeof v === "string" && /^[1-9]\d{0,17}$/.test(v) ? Number(v) : null);

/**
 * Best Times to Call (Sean and Darcy, Nov 2026): when calls turn into leads and appointments, by day and hour in the
 * business's local time, from every call recorded. The last 90 days to begin with; by client, project, manager,
 * industry (SIC) and state; broken down by industry, state, project type or manager. Administrators only.
 */
export default async function BestTimesPage({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (me?.role !== "admin") notFound();
  const today = await getBusinessToday();
  const chosen = isIsoDate(sp?.from) && isIsoDate(sp?.to) && sp.from <= sp.to;
  const from = chosen ? sp.from : addDays(today, -89);
  const to = chosen ? sp.to : today;
  const filters = {
    client: id(sp?.client), project: id(sp?.project), manager: id(sp?.manager),
    sic: typeof sp?.sic === "string" && /^[0-9-]{2,8}$/.test(sp.sic.trim()) ? sp.sic.trim() : null,
    state: typeof sp?.state === "string" && US_STATES.includes(sp.state.toUpperCase()) ? sp.state.toUpperCase() : null,
  };
  const by = BY.some(([k]) => k === sp?.by) ? sp.by : "sic";

  const supabase = await createClient();
  const [{ all, byRows }, staff, { data: clients }, { data: projects }] = await Promise.all([
    getBestTimes({ from, to, ...filters, by }),
    getAssignableStaff(),
    supabase.from("companies").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("projects").select("id, name, company_id").is("deleted_at", null).order("name"),
  ]);
  const projectList = (projects ?? []).filter((p) => !filters.client || p.company_id === filters.client);
  const kept = Object.entries({ ...filters, by, from: chosen ? from : null, to: chosen ? to : null }).filter(([, v]) => v != null && v !== "");

  return (
    <>
      <Topbar title="Best Times to Call" sub={`${formatRange(from, to)} · in each business's local time`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3" data-best-filters>
            <form action="/reports/best-times" className="flex items-center gap-2">
              {kept.filter(([k]) => !["from", "to"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
              <DateRangePicker key={`${from}:${to}`} defaultFrom={from} defaultTo={to} max="today" maxDays={730} active={chosen} />
            </form>
            <ParamSelect name="client" label="Client" placeholder="All clients" value={filters.client ? String(filters.client) : ""} clears={["project"]}
              options={(clients ?? []).map((c) => ({ value: String(c.id), label: c.name }))} />
            <ParamSelect name="project" label="Project" placeholder="All projects" value={filters.project ? String(filters.project) : ""} clears={[]}
              options={projectList.map((p) => ({ value: String(p.id), label: p.name }))} />
            <ParamSelect name="manager" label="Manager" placeholder="Everyone" value={filters.manager ? String(filters.manager) : ""} clears={[]}
              options={staff.map((u) => ({ value: String(u.id), label: u.name }))} />
            <ParamSelect name="state" label="State" placeholder="All states" value={filters.state ?? ""} clears={[]}
              options={US_STATES.map((s) => ({ value: s, label: s }))} />
            {/* An industry: its SIC code, or the first digits for the whole group (17 is construction). */}
            <form action="/reports/best-times" className="flex items-center gap-2" data-best-sic>
              {kept.filter(([k]) => k !== "sic").map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
              <span className="eyebrow">SIC</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input name="sic" defaultValue={filters.sic ?? ""} inputMode="numeric" maxLength={8} placeholder="Code or first digits" aria-label="SIC code" className="h-8 w-44 pl-7" />
              </div>
              <Button type="submit" size="sm" variant="outline">Apply</Button>
            </form>
            <div className="ml-auto">
              <ParamSelect name="by" label="Break down by" placeholder={null} value={by} clears={[]} options={BY.map(([value, label]) => ({ value, label }))} />
            </div>
          </div>
        </Card>
        <BestTimesBoard rows={all} byRows={byRows} by={by} />
      </div>
    </>
  );
}
