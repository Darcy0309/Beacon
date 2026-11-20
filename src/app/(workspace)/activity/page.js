import { History, LogIn, Users, Activity as ActivityIcon } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import Link from "@/components/shared/intent-link";
import ToneBadge from "@/components/shared/tone-badge";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import FilterTable from "@/components/shared/filter-table";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { listActivity, getActivitySummary, getActivityActions } from "@/features/activity/queries";
import UsageTable from "@/features/activity/components/usage-table";
import { readListParams, pageInfo } from "@/lib/paging";

export const dynamic = "force-dynamic";

const roleTone = { Administrator: "amber", Manager: "cyan", Agent: "emerald", Client: "violet" };
// The pages an entry can open: what it was done to.
const ENTITY_PAGE = { lead: "/leads", project: "/projects" };

export default async function ActivityPage({ searchParams }) {
  const params = readListParams(await searchParams, ["action", "user"]);
  const [{ rows, total }, summary, actions] = await Promise.all([
    listActivity(params),
    getActivitySummary(),
    getActivityActions(),
  ]);

  const loginsMonth = summary.reduce((s, u) => s + u.loginsMonth, 0);
  const activeUsers = summary.filter((u) => u.logins30d > 0).length;
  const actions30d = summary.reduce((s, u) => s + u.actions30d, 0);
  const quietest = summary.filter((u) => u.logins30d === 0).length;

  const tiles = [
    { label: "Sign-Ins This Month", value: String(loginsMonth), note: "across every account",
      icon: LogIn, accent: "var(--neon-cyan)", series: summary.map((u) => u.loginsMonth) },
    { label: "Active Accounts", value: String(activeUsers), note: `of ${summary.length} in the last 30 days`,
      icon: Users, accent: "var(--neon-emerald)", series: summary.map((u) => u.logins30d) },
    { label: "Recorded Actions", value: String(actions30d), note: "changes in the last 30 days",
      icon: ActivityIcon, accent: "var(--neon-violet)", series: summary.map((u) => u.actions30d) },
    { label: "Never Signed In", value: String(quietest), note: "no activity in 30 days",
      icon: History, accent: "var(--neon-amber)", series: summary.map((u) => (u.logins30d === 0 ? 1 : 0)) },
  ];

  return (
    <>
      <Topbar title="Activity Log" sub={`${loginsMonth} sign-ins this month · ${activeUsers} of ${summary.length} accounts active`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Usage by Account" icon={Users} />
          <UsageTable rows={summary} />
        </Card>

        <Card>
          <SectionHeader label="Everything That Happened" icon={History} />
          <FilterTable
            columns={["Who", "Role", "Action", "Detail", "When"]}
            filters={[{ key: "action", label: "Action", kind: "select", options: actions }]}
            placeholder="Search the detail…"
            empty="Nothing recorded yet."
            query={params.q}
            selected={params.filters}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((r) => ({
              id: r.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full text-[0.6rem] font-bold text-white" style={{ background: r.color }}>{r.initials}</span>
                      <span className="font-medium">{r.who}</span>
                    </div>
                  </TableCell>
                  <TableCell><ToneBadge tone={roleTone[r.role] ?? "slate"}>{r.role}</ToneBadge></TableCell>
                  <TableCell>
                    <ToneBadge tone={r.actionKey === "sign_in" ? "cyan" : r.actionKey.startsWith("mfa") ? "emerald" : r.actionKey.endsWith("delete") ? "rose" : "slate"}>
                      {r.action}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {/* What it was done to, when that has a page: the lead or the project. */}
                    {r.entityId && ENTITY_PAGE[r.entity] ? (
                      <Link href={`${ENTITY_PAGE[r.entity]}/${r.entityId}`} className="transition-colors hover:text-primary hover:underline" data-activity-link>{r.detail || "Open"}</Link>
                    ) : r.detail || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground" title={r.when}>{r.ago}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
