import Link from "@/components/shared/intent-link";
import { Building2, CalendarCheck, Globe2, Target } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import LinkRow from "@/components/shared/link-row";
import ToneBadge from "@/components/shared/tone-badge";
import { Card } from "@/components/ui/card";
import { TableCell } from "@/components/ui/table";
import { clientSlug } from "@/lib/format";
import { chartRange } from "@/lib/production-chart";
import { getBusinessToday } from "@/lib/server/business-day";
import { getAgencyGroups, getClients, getClientsOverview, getTimeZones } from "@/features/clients/queries";
import ClientForm from "@/features/clients/components/client-form";
import TrendTile from "@/features/clients/components/trend-tile";
import BreakdownTile from "@/features/clients/components/breakdown-tile";

export const dynamic = "force-dynamic";

const statusTone = { Active: "emerald", Paused: "amber", Completed: "sky" };

// Counted by `key`, the most first; those with none last, as `none`.
function countBy(list, key, none) {
  const counts = new Map();
  for (const c of list) counts.set(c[key] ?? "", (counts.get(c[key] ?? "") ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label: label || none, count, none: !label }))
    .sort((a, b) => a.none - b.none || b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Clients: how many are active, the active clients' leads and appointments
 * (each with a chart over a range chosen on its tile), where the active
 * clients are and which agency groups they belong to; then every client in
 * a row, to search and filter. A row opens the client's own page.
 */
export default async function ClientsPage({ searchParams }) {
  const sp = await searchParams;
  const today = await getBusinessToday();
  // ?lr= and ?ar=: the range of the Leads chart and of the Appointments chart (a month to begin with).
  const range = (v) => chartRange(typeof v === "string" && v !== "custom" ? v : "1M", today);
  const ranges = { leads: range(sp?.lr), appts: range(sp?.ar) };
  const [clients, groups, zones, overview] = await Promise.all([getClients(), getAgencyGroups(), getTimeZones(), getClientsOverview(ranges)]);

  const active = clients.filter((c) => c.status === "Active");
  const paused = clients.filter((c) => c.status === "Paused").length;
  const completed = clients.filter((c) => c.status === "Completed").length;
  const params = Object.fromEntries(["lr", "ar"].filter((k) => typeof sp?.[k] === "string").map((k) => [k, sp[k]]));

  return (
    <>
      <Topbar title="Clients" sub={`${active.length} active agency account${active.length === 1 ? "" : "s"}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* One row on a desktop, four tiles of one width; whichever is pointed at takes more of the row while it is (.expand-row). */}
        <div className="expand-row grid grid-cols-1 gap-4 md:grid-cols-2 xl:flex" data-from="xl" data-client-tiles>
          <StatTile label="Active Clients" value={String(active.length)} icon={Building2} accent="var(--neon-cyan)"
            note={`${(clients.length - active.length).toLocaleString()} inactive · ${clients.length.toLocaleString()} in all`}
            className="animate-pop-in" style={{ "--min": "11rem", "--grow": 1.8 }}>
            <dl className="mt-3 space-y-1 text-sm" data-client-statuses>
              {[["Active", active.length, "var(--neon-emerald)"], ["Paused", paused, "var(--neon-amber)"], ["Completed", completed, "var(--neon-blue)"]].map(([name, n, color]) => (
                <div key={name} className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-muted-foreground"><span className="size-1.5 rounded-full" style={{ background: color }} />{name}</dt>
                  <dd className="font-semibold tabular-nums">{n.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
          </StatTile>
          <TrendTile label="Leads" icon={<Target className="size-4" />} accent="var(--neon-emerald)" series="leads" param="lr" params={params}
            value={(overview.leadsActive + overview.leadsResolved).toLocaleString()}
            note={`${overview.leadsActive.toLocaleString()} active · ${overview.leadsResolved.toLocaleString()} resolved · active clients`}
            data={overview.leads} range={ranges.leads} developed="developed" className="animate-pop-in" style={{ animationDelay: "60ms", "--min": "14.5rem", "--grow": 1.8 }} />
          <TrendTile label="Appointments" icon={<CalendarCheck className="size-4" />} accent="var(--neon-amber)" series="appts" param="ar" params={params}
            value={overview.appointments.toLocaleString()}
            note={`${overview.invalid.toLocaleString()} invalid · active clients`}
            data={overview.appts} range={ranges.appts} developed="set" className="animate-pop-in" style={{ animationDelay: "120ms", "--min": "14.5rem", "--grow": 1.8 }} />
          <BreakdownTile label="Active Clients By" icon={<Globe2 className="size-4" />} accent="var(--neon-violet)"
            groups={[
              { title: "Time zone", rows: countBy(active, "zone", "Not set") },
              { title: "Agency group", rows: countBy(active, "group", "No group") },
            ]}
            className="animate-pop-in" style={{ animationDelay: "180ms", "--min": "11rem", "--grow": 1.8 }} />
        </div>

        <Card>
          <SectionHeader wrap label="Client Accounts" icon={Building2} action={<ClientForm groups={groups} zones={zones} />} />
          <FilterTable
            columns={["Client", "Contact", "State", "Time zone", "Start date", "End date", "Status"]}
            filters={[
              { key: "status", label: "Status", kind: "chips" },
              { key: "state", label: "State", kind: "select" },
              { key: "zone", label: "Time zone", kind: "select" },
              { key: "group", label: "Agency group", kind: "select" },
              { key: "manager", label: "Account manager", kind: "select" },
            ]}
            placeholder="Search clients, contacts, cities…"
            empty="No client accounts yet. Add the first with New client."
            rows={clients.map((c) => ({
              id: c.id,
              search: [c.name, c.contact, c.city, c.state, c.zone, c.group, c.manager, c.email, c.phone].filter((v) => v && v !== "—").join(" "),
              facets: { status: c.status, state: c.state ?? "", zone: c.zone ?? "", group: c.group ?? "", manager: c.manager },
              node: (
                <LinkRow href={`/clients/${clientSlug(c.name)}`} data-client-row={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: c.color }}>{c.initials}</span>
                      <div className="min-w-0">
                        <Link href={`/clients/${clientSlug(c.name)}`} className="font-medium transition-colors hover:text-primary hover:underline" data-client-link>{c.name}</Link>
                        {c.group ? <div className="truncate text-xs text-muted-foreground">{c.group}</div> : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{c.contact}</TableCell>
                  <TableCell>{c.state ?? "—"}</TableCell>
                  <TableCell>{c.zone ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{c.start ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{c.end ?? "—"}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[c.status] ?? "slate"}>{c.status}</ToneBadge></TableCell>
                </LinkRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
