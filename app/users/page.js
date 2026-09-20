import { UserPlus, ShieldCheck, Users, Lock, Mail } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToggleSwitch from "@/components/toggle-switch";
import UserForm from "@/components/user-form";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/filter-table";
import { listUsers, getUserStats, getLookups, USER_ROLE_OPTIONS, USER_STATUS_OPTIONS } from "@/lib/queries";
import { readListParams, pageInfo } from "@/lib/paging";
import { setUserIpLock, deleteUser } from "@/lib/actions";

export const dynamic = "force-dynamic";

const roleTone = { admin: "amber", manager: "cyan", agent: "emerald", client: "violet" };
const statusTone = { Active: "emerald", Invited: "amber", Disabled: "slate" };

export default async function UsersPage({ searchParams }) {
  const params = readListParams(await searchParams, ["role", "status", "iplock"]);
  const [{ rows, total }, users, options] = await Promise.all([listUsers(params), getUserStats(), getLookups()]);

  // Tiles describe every account; the table shows one page of them.
  const active = users.filter((u) => u.status === "active").length;
  const invited = users.filter((u) => u.status === "invited").length;
  const locked = users.filter((u) => u.ip_locked).length;
  const byRole = {};
  for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;

  const tiles = [
    { label: "Accounts", value: String(users.length), note: `${byRole.admin ?? 0} admin · ${byRole.manager ?? 0} managers`,
      icon: Users, accent: "var(--neon-cyan)", series: Object.values(byRole), bars: true },
    { label: "Active", value: String(active), note: "can sign in",
      icon: ShieldCheck, accent: "var(--neon-emerald)", series: users.map((u) => (u.status === "active" ? 1 : 0)), bars: true },
    { label: "Pending Invites", value: String(invited), note: "awaiting first sign-in",
      icon: Mail, accent: "var(--neon-amber)", series: users.map((u) => (u.status === "invited" ? 1 : 0)), bars: true },
    { label: "IP Locked", value: String(locked), note: "restricted to approved addresses",
      icon: Lock, accent: "var(--neon-violet)", series: users.map((u) => (u.ip_locked ? 1 : 0)), bars: true },
  ];

  return (
    <>
      <Topbar title="Users & Access" sub={`${active} active accounts · roles and IP lockdown`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader
            label="Users"
            icon={Users}
            action={<UserForm options={options} trigger={<Button size="sm"><UserPlus /> Invite user</Button>} />}
          />
          <FilterTable
            columns={["User", "Role", "IP Lock", "Last login", "Status", { label: "Action", className: "text-right" }]}
            filters={[
              { key: "role", label: "Role", options: USER_ROLE_OPTIONS },
              { key: "status", label: "Status", options: USER_STATUS_OPTIONS },
              { key: "iplock", label: "IP Lock", options: [{ value: "true", label: "Locked" }, { value: "false", label: "Open" }] },
            ]}
            placeholder="Search users…"
            empty="No users yet."
            query={params.q}
            selected={params.filters}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((u) => ({
              id: u.id,
              node: (
                <TableRow>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: u.color }}>{u.initials}</span>
                      <div>
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><ToneBadge tone={roleTone[u.roleTone] ?? "slate"}>{u.role}</ToneBadge></TableCell>
                  <TableCell><ToggleSwitch id={u.id} defaultChecked={u.iplock} name={`IP lock for ${u.name}`} action={setUserIpLock} field="ip_locked" /></TableCell>
                  <TableCell className="text-muted-foreground">{u.last}</TableCell>
                  <TableCell><ToneBadge tone={statusTone[u.status] ?? "slate"}>{u.status}</ToneBadge></TableCell>
                  <TableCell className="text-right"><RowActions name={u.name} id={u.id} onDelete={deleteUser} /></TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
