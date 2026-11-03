import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import CsvButton from "@/components/shared/csv-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportItems, getReportNames } from "@/features/reports/admin-queries";
import { itemsCsv } from "@/lib/admin-reports";
import { formatRange, isIsoDate } from "@/lib/dates";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const KINDS = {
  leads: "Leads", invalid_leads: "Invalid leads", appts: "Appointments", confirmed: "Confirmed appointments",
  pending: "Pending appointments", invalid_appts: "Invalid appointments",
};
const usd = (n) => Number(n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * The names behind one figure of the billing listing (Sean, Nov 2026): a project's leads, appointments,
 * confirmed, pending or invalid ones over the range, each with when, its manager, what it cost, and the
 * client's Sales Rep, to open or export. Administrators only.
 */
export default async function BillingItems({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (me?.role !== "admin") notFound();
  const projectId = /^\d+$/.test(sp?.project ?? "") ? Number(sp.project) : null;
  const kind = KINDS[sp?.kind] ? sp.kind : null;
  if (!projectId || !kind || !isIsoDate(sp?.from) || !isIsoDate(sp?.to)) notFound();
  const [items, names] = await Promise.all([getReportItems(sp.from, sp.to, projectId, kind), getReportNames()]);
  const project = names.projects[projectId];
  const appt = !["leads", "invalid_leads"].includes(kind);
  // Back to the listing as it was: its range, and its Sales Rep when one was chosen.
  const back = `/reports?bf=${sp.from}&bt=${sp.to}${/^\d+$/.test(sp?.rep ?? "") ? `&brep=${sp.rep}` : ""}#billing`;
  const cost = items.reduce((n, i) => n + Number(i.cost ?? 0), 0);

  return (
    <>
      <Topbar title={KINDS[kind]} sub={`${project?.name ?? "A project"} · ${formatRange(sp.from, sp.to)}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href={back} className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to Reports
        </Link>
        <Card data-billing-items={kind}>
          <SectionHeader label={`${KINDS[kind]} · ${items.length.toLocaleString()}`} icon={ListChecks}
            action={<CsvButton csv={itemsCsv(items, kind)} fileName={`${(project?.name ?? "project").replace(/[^\w-]+/g, "_")}_${kind}_${sp.from}_${sp.to}.csv`} disabled={!items.length} data-export-items />} />
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>{appt ? "Set" : "Developed"}</TableHead>
                  {appt ? <TableHead>Appointment</TableHead> : null}
                  <TableHead>Status</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Sales Rep</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={`${i.lead_id}-${i.appointment_id ?? ""}`} data-item={i.lead_id}>
                    <TableCell className="font-medium"><Link href={`/leads/${i.lead_id}`} className="hover:text-primary">{i.company}</Link></TableCell>
                    <TableCell className="tabular-nums">{i.at}</TableCell>
                    {appt ? <TableCell className="tabular-nums">{[i.appt_date, i.appt_time].filter(Boolean).join(" ")}</TableCell> : null}
                    <TableCell>{i.status}</TableCell>
                    <TableCell>{i.manager ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{usd(i.cost)}</TableCell>
                    <TableCell>{i.sales_rep ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.length === 0 ? <p className="p-5 text-sm text-muted-foreground">None in this range.</p> : null}
          </div>
          {items.length ? <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-sm">Cost: <strong className="tabular-nums">{usd(cost)}</strong></p> : null}
        </Card>
      </div>
    </>
  );
}
