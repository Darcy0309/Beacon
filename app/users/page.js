import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToggleSwitch from "@/components/toggle-switch";
import UserForm from "@/components/user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUsers, getLookups } from "@/lib/queries";
import { setUserIpLock, deleteUser } from "@/lib/actions";
import { colorFor, initials, fullName, timeAgo } from "@/lib/display";
import { ROLE_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const statusTone = { active: "emerald", invited: "amber", disabled: "slate" };

export default async function UsersPage() {
  const [users, options] = await Promise.all([getUsers(), getLookups()]);
  const active = users.filter((u) => u.status === "active").length;

  return (
    <>
      <Topbar title="Users & Access" sub={`${active} active accounts · roles and IP lockdown`} />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <UserForm options={options} />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>IP Lock</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => {
                  const name = fullName(u);
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span
                            className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                            style={{ background: colorFor(name) }}
                          >
                            {initials(name)}
                          </span>
                          <div>
                            <div className="font-medium">{name}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={ROLE_TONE[u.role] ?? "slate"}>
                          {u.user_type?.description ?? u.role}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className={u.company ? "" : "text-muted-foreground"}>
                        {u.company?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ToggleSwitch
                          id={u.id}
                          defaultChecked={u.ip_locked}
                          name={`IP lock for ${name}`}
                          action={setUserIpLock}
                          field="ip_locked"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{timeAgo(u.last_login)}</TableCell>
                      <TableCell>
                        <ToneBadge tone={statusTone[u.status] ?? "slate"}>{u.status}</ToneBadge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions name={name} id={u.id} onDelete={deleteUser} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
