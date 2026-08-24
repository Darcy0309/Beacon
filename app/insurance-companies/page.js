import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import RowActions from "@/components/row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { insuranceCompanies } from "@/lib/data";

const statusTone = { Preferred: "primary", Active: "emerald" };

export default function InsuranceCompaniesPage() {
  return (
    <>
      <Topbar title="Insurance Companies" sub="Carriers and appointment lines" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle>Carriers</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>States</TableHead>
                  <TableHead>Active X-dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insuranceCompanies.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg text-xs font-semibold text-white" style={{ background: c.color }}>{c.initials}</span>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.lines}</TableCell>
                    <TableCell className="tabular-nums">{c.states}</TableCell>
                    <TableCell className="tabular-nums">{c.xdates}</TableCell>
                    <TableCell><ToneBadge tone={statusTone[c.status]}>{c.status}</ToneBadge></TableCell>
                    <TableCell className="text-right"><RowActions name={c.name} /></TableCell>
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
