import { UserPlus } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToastButton from "@/components/toast-button";
import ToggleSwitch from "@/components/toggle-switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { users } from "@/lib/data";

const roleTone = { admin: "primary", manager: "violet", agent: "sky", client: "slate" };
const statusTone = { Active: "emerald", Invited: "amber" };

export default function UsersPage() {
  return (
    <>
      <Topbar title="Users & Access" sub="Accounts, roles, and IP lockdown" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <ToastButton size="sm" message="Invite sent"><UserPlus /> Invite user</ToastButton>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>IP Lock</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: u.color }}>{u.initials}</span>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><ToneBadge tone={roleTone[u.roleTone]}>{u.role}</ToneBadge></TableCell>
                    <TableCell><ToggleSwitch defaultChecked={u.iplock} name={`IP lock for ${u.name}`} /></TableCell>
                    <TableCell className="text-muted-foreground">{u.last}</TableCell>
                    <TableCell><ToneBadge tone={statusTone[u.status]}>{u.status}</ToneBadge></TableCell>
                    <TableCell className="text-right"><RowActions name={u.name} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
