import Link from "next/link";
import { FolderKanban, PhoneCall, CalendarCheck, ListChecks, ArrowRight } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import FilterTable from "@/components/shared/filter-table";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { getWorkProjects, getFollowUps } from "@/features/work/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "cyan", APPT: "violet" };

/**
 * My Projects: where an account manager starts the day. Their projects, with
 * how many names they have left and when they last worked each one, filtered
 * by state, time zone, type or last worked; then into a call list.
 */
export default async function WorkPage() {
  const [me, projects, followUps] = await Promise.all([getCurrentUser(), getWorkProjects(), getFollowUps()]);
  const admin = me?.role === "admin";
  const namesLeft = projects.reduce((s, p) => s + (admin ? p.namesLeftAll : p.namesLeft), 0);
  const workedToday = projects.filter((p) => p.worked === "Today").length;

  const tiles = [
    { label: admin ? "Projects" : "My Projects", value: String(projects.length), note: admin ? "every project" : "assigned to you",
      icon: FolderKanban, accent: "var(--neon-cyan)", series: projects.map((p) => p.namesLeft), bars: true },
    { label: "Names Left", value: namesLeft.toLocaleString(), note: admin ? "still to call, all reps" : "still to call on your lists",
      icon: ListChecks, accent: "var(--neon-emerald)", series: projects.map((p) => (admin ? p.namesLeftAll : p.namesLeft)), bars: true },
    { label: "To Confirm", value: String(followUps.length), note: "appointments you set",
      icon: CalendarCheck, accent: "var(--neon-amber)", series: followUps.map((_, i) => i + 1) },
    { label: "Worked Today", value: String(workedToday), note: `of ${projects.length} projects`,
      icon: PhoneCall, accent: "var(--neon-violet)", series: projects.map((p) => (p.worked === "Today" ? 1 : 0)), bars: true },
  ];

  // Projects with names to call first; within those, the one worked longest ago.
  const ordered = [...projects].sort((a, b) =>
    Number(b.namesLeft > 0) - Number(a.namesLeft > 0)
    || String(a.lastWorkedAt ?? "").localeCompare(String(b.lastWorkedAt ?? ""))
    || a.name.localeCompare(b.name));

  return (
    <>
      <Topbar title="My Projects" sub={admin ? "Every project, and the lists being worked" : "Pick a project to start calling"} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {followUps.length ? (
          <Card>
            <SectionHeader label="Appointments to Confirm" icon={CalendarCheck} />
            <ul className="divide-y divide-[var(--panel-border)]">
              {followUps.map((f) => (
                <li key={f.id} data-list-row>
                  <Link href={`/leads/${f.leadId}?project=${f.projectId}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 transition-colors hover:bg-muted/40">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{f.company}</span>
                      <span className="text-xs text-muted-foreground">{f.contact} · <span className="tabular-nums">{f.phone}</span></span>
                    </span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="tabular-nums">{f.when}</span>
                      {f.qa === "pending" ? <ToneBadge tone="amber">QA pending</ToneBadge> : f.qa === "failed" ? <ToneBadge tone="rose">QA failed</ToneBadge> : <ToneBadge tone="emerald">QA passed</ToneBadge>}
                      <ArrowRight className="size-3.5 text-muted-foreground" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <SectionHeader label="Projects" icon={FolderKanban} />
          <FilterTable
            columns={["Project", "Client", "Type", "Time zone", "State", "Last worked", { label: admin ? "Left (all reps)" : "Names left", className: "text-right" }, { label: "", className: "text-right" }]}
            filters={[
              { key: "state", label: "State" },
              { key: "timezone", label: "Time zone" },
              { key: "type", label: "Type" },
              { key: "worked", label: "Last worked" },
            ]}
            placeholder="Search projects or clients…"
            empty={admin ? "No projects yet." : "You are not assigned to any projects yet. An administrator assigns them."}
            rows={ordered.map((p) => ({
              id: p.id,
              search: `${p.name} ${p.client}`,
              facets: { state: p.state, timezone: p.timezone, type: p.typeLabel, worked: p.worked },
              node: (
                <TableRow>
                  <TableCell>
                    <Link href={`/work/${p.id}`} className="font-medium transition-colors hover:text-primary">{p.name}</Link>
                    {p.followUps ? <span className="ml-2 text-[0.66rem] font-semibold text-amber-300">{p.followUps} to confirm</span> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.client}</TableCell>
                  <TableCell><ToneBadge tone={typeTone[p.type] ?? "slate"}>{p.type === "DBDV" ? "DBDev" : p.type === "APPT" ? "Appt" : "—"}</ToneBadge></TableCell>
                  <TableCell className="text-muted-foreground">{p.timezone}</TableCell>
                  <TableCell className="text-muted-foreground">{p.state}</TableCell>
                  <TableCell className={p.lastWorkedAt ? "" : "text-muted-foreground"}>{p.lastWorked}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {(admin ? p.namesLeftAll : p.namesLeft).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/work/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--panel-border)] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary transition-colors hover:border-primary/40"
                    >
                      Call list <ArrowRight className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
