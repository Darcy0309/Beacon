import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import ProjectForm from "@/components/project-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getProjects, getLookups } from "@/lib/queries";
import { deleteProject } from "@/lib/actions";
import { colorFor, initials, shortName } from "@/lib/display";
import { PROJECT_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

const typeTone = { DBDV: "sky", APPT: "teal" };

export default async function ProjectsPage() {
  const [projects, options] = await Promise.all([getProjects(), getLookups()]);
  const active = projects.filter((p) => p.status?.name === "Active").length;

  return (
    <>
      <Topbar
        title="Projects"
        sub={`${active} active lead-generation and appointment campaigns`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>All projects</CardTitle>
            <ProjectForm options={options} />
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
                        <span
                          className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                          style={{ background: colorFor(p.name) }}
                        >
                          {initials(p.name)}
                        </span>
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>{p.company?.name ?? p.client_name ?? "—"}</TableCell>
                    <TableCell>
                      {p.type ? (
                        <ToneBadge tone={typeTone[p.type.code] ?? "slate"}>{p.type.code}</ToneBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.leadCount}</TableCell>
                    <TableCell>
                      {p.status ? (
                        <ToneBadge tone={PROJECT_TONE[p.status.name] ?? "slate"}>
                          {p.status.name}
                        </ToneBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{shortName(p.manager)}</TableCell>
                    <TableCell className="text-right">
                      <RowActions name={p.name} href={`/projects/${p.id}`} id={p.id} onDelete={deleteProject} />
                    </TableCell>
                  </TableRow>
                ))}
                {projects.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No projects yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
