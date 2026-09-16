import Topbar from "@/components/topbar";
import RowActions from "@/components/row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgencies } from "@/lib/queries";
import { deleteAgency } from "@/lib/actions";
import { colorFor, initials } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function InsuranceCompaniesPage() {
  const agencies = await getAgencies();
  const totalLeads = agencies.reduce((s, a) => s + a.leadCount, 0);

  return (
    <>
      <Topbar
        title="Insurance Companies"
        sub={`${agencies.length} carriers · ${totalLeads} leads on book`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Carriers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Association</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
                          style={{ background: colorFor(c.name || "") }}
                        >
                          {initials(c.name || "")}
                        </span>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.association ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.territory ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{c.locations ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{c.leadCount}</TableCell>
                    <TableCell className="text-right">
                      <RowActions name={c.name} id={c.id} onDelete={deleteAgency} />
                    </TableCell>
                  </TableRow>
                ))}
                {agencies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No carriers on file.
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
