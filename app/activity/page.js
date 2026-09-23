import { History, LogIn, Users, Activity as ActivityIcon } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import FilterTable from "@/components/filter-table";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { listActivity, getActivitySummary, getActivityActions } from "@/lib/queries";
import { readListParams, pageInfo } from "@/lib/paging";

export const dynamic = "force-dynamic";

const roleTone = { Administrator: "amber", Manager: "cyan", Agent: "emerald", Client: "violet" };

/** How busy an account is, relative to the busiest one, as a bar width. */
function Bar({ value, max, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

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
  const maxLogins = Math.max(1, ...summary.map((u) => u.loginsMonth));
  const maxActions = Math.max(1, ...summary.map((u) => u.actions30d));

  const tiles = [
    { label: "Sign-Ins This Month", value: String(loginsMonth), note: "across every account",
      icon: LogIn, accent: "var(--neon-cyan)", series: summary.map((u) => u.loginsMonth), bars: true },
    { label: "Active Accounts", value: String(activeUsers), note: `of ${summary.length} in the last 30 days`,
      icon: Users, accent: "var(--neon-emerald)", series: summary.map((u) => u.logins30d), bars: true },
    { label: "Recorded Actions", value: String(actions30d), note: "changes in the last 30 days",
      icon: ActivityIcon, accent: "var(--neon-violet)", series: summary.map((u) => u.actions30d), bars: true },
    { label: "Never Signed In", value: String(quietest), note: "no activity in 30 days",
      icon: History, accent: "var(--neon-amber)", series: summary.map((u) => (u.logins30d === 0 ? 1 : 0)), bars: true },
  ];

  return (
    <>
      <Topbar title="Activity Log" sub={`${loginsMonth} sign-ins this month · ${activeUsers} of ${summary.length} accounts active`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Usage by Account" icon={Users} />
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b [&_tr]:border-[var(--panel-border)]">
                <tr>
                  {["User", "Role", "Sign-ins this month", "Last 30 days", "Changes (30d)", "Last active"].map((h) => (
                    <th key={h} className="h-10 whitespace-nowrap px-4 text-left align-middle text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {summary.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--panel-border)]">
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: u.color }}>{u.initials}</span>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-middle"><ToneBadge tone={roleTone[u.role] ?? "slate"}>{u.role}</ToneBadge></td>
                    <td className="px-4 py-3.5 align-middle"><Bar value={u.loginsMonth} max={maxLogins} color="var(--neon-cyan)" /></td>
                    <td className="px-4 py-3.5 align-middle tabular-nums text-muted-foreground">{u.logins30d}</td>
                    <td className="px-4 py-3.5 align-middle"><Bar value={u.actions30d} max={maxActions} color="var(--neon-violet)" /></td>
                    <td className={`px-4 py-3.5 align-middle ${u.lastActive === "Never" ? "text-muted-foreground" : ""}`}>{u.lastActive}</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Nothing recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
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
                  <TableCell className="text-muted-foreground">{r.detail || "—"}</TableCell>
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
