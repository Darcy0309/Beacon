import { Plus } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ToastButton from "@/components/toast-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { projects } from "@/lib/data";

const typeTone = { DBDV: "sky", APPT: "violet" };
const statusTone = { Active: "emerald", Paused: "amber", Draft: "slate" };

export default function ProjectsPage() {
  return (
    <>
      <Topbar title="Projects" sub="Active lead-generation and appointment campaigns" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>All projects</CardTitle>
            <ToastButton size="sm" message="New project form opened"><Plus /> New project</ToastButton>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: p.color }}>{p.name.slice(0, 2).toUpperCase()}</span>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{p.client}</TableCell>
                    <TableCell><ToneBadge tone={typeTone[p.type]}>{p.type}</ToneBadge></TableCell>
                    <TableCell className="tabular-nums">{p.leads}</TableCell>
                    <TableCell><ToneBadge tone={statusTone[p.status]}>{p.status}</ToneBadge></TableCell>
                    <TableCell>{p.manager}</TableCell>
                    <TableCell className="text-right"><RowActions name={p.name} href={`/projects/${p.id}`} /></TableCell>
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
