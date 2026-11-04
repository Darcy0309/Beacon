import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks, Users } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import CsvButton from "@/components/shared/csv-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCarrier, getCarrierClientLeads, getCarrierClients, statesOf } from "@/features/insurance/queries";
import { LINE_LABELS, carrierLeadsCsv } from "@/lib/carrier-report";
import { formatIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

// A client's X-dates listed here at most; the export has every one.
const SHOWN = 500;
const day = (iso) => (iso ? formatIso(iso, "medium") : "—");

/**
 * A carrier's report (Sean, Nov 2026), opened from its name on the list: the clients with it among
 * their Top Carriers (Project Info), each with its leads (X-dates) naming the carrier; a client's
 * opens its list (the business, where it is, its project, renewals and carriers, when created), to
 * export. The states picked on the list carry through. Administrators only.
 */
export default async function CarrierReport({ params, searchParams }) {
  const [{ id: raw }, sp, me] = await Promise.all([params, searchParams, getCurrentUser()]);
  if (me?.role !== "admin" || !/^\d+$/.test(raw)) notFound();
  const id = Number(raw);
  const states = statesOf(sp?.states);
  const clientId = /^\d+$/.test(sp?.client ?? "") ? Number(sp.client) : null;
  const [carrier, clients] = await Promise.all([getCarrier(id), getCarrierClients(id, states)]);
  if (!carrier) notFound();
  const client = clientId ? clients.find((c) => Number(c.company_id) === clientId) : null;
  const leads = client ? await getCarrierClientLeads(id, clientId, states) : [];

  const qs = (extra = {}) => {
    const q = new URLSearchParams({ ...(states.length ? { states: states.join(",") } : {}), ...extra });
    return q.toString() ? `?${q}` : "";
  };
  const xdates = clients.reduce((n, c) => n + c.xdates, 0);
  const where = states.length ? ` in ${states.join(", ")}` : "";

  return (
    <>
      <Topbar title={carrier.name} sub={`${clients.length} client${clients.length === 1 ? "" : "s"} list it as a top carrier · ${xdates.toLocaleString()} X-dates${where}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href={`/insurance-companies${qs()}`} className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to Insurance Companies
        </Link>

        <Card data-carrier-clients-card>
          <SectionHeader label={`Clients with ${carrier.name} as a top carrier`} icon={Users} />
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Listed on</TableHead>
                <TableHead>States</TableHead>
                <TableHead className="text-right">X-Dates{where}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.company_id} data-carrier-client={c.company_id} className={cn(Number(c.company_id) === clientId && "bg-primary/5")}>
                  <TableCell className="font-medium">{c.client}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.projects.join(", ")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.states.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.xdates ? (
                      <Link href={`/insurance-companies/${id}${qs({ client: c.company_id })}#xdates`} scroll={false} data-carrier-client-xdates
                        className="rounded px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/10">{c.xdates.toLocaleString()}</Link>
                    ) : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {clients.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">No client lists {carrier.name} among the Top Carriers on its Project Info.</p>
          ) : null}
        </Card>

        {client ? (
          <Card id="xdates" className="scroll-mt-24" data-carrier-xdates-card={clientId}>
            <SectionHeader label={`${client.client} · ${leads.length.toLocaleString()} X-dates with ${carrier.name}${where}`} icon={ListChecks}
              action={<CsvButton csv={carrierLeadsCsv(leads)} fileName={`${carrier.name}_${client.client}`.replace(/[^\w-]+/g, "_") + ".csv"} disabled={!leads.length} data-export-carrier-xdates />} />
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>City, ST ZIP</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Renewal</TableHead>
                    <TableHead>{carrier.name} on</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.slice(0, SHOWN).map((l) => (
                    <TableRow key={l.lead_id} data-carrier-lead={l.lead_id}>
                      <TableCell className="font-medium"><Link href={`/leads/${l.lead_id}`} className="hover:text-primary">{l.company}</Link></TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{[l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{l.phone || "—"}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground" title={l.project}>{l.project}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{day(l.ultimate_xdate)}</TableCell>
                      <TableCell className="text-xs">
                        {(l.lines ?? []).filter((x) => x.mine).map((x) => `${LINE_LABELS[x.key] ?? x.key}${x.xdate ? ` · ${day(x.xdate)}` : ""}`).join("; ") || "Its agency"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{day(l.created)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {leads.length === 0 ? <p className="p-5 text-sm text-muted-foreground">None{where}.</p> : null}
              {leads.length > SHOWN ? (
                <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">The first {SHOWN.toLocaleString()} shown; the export has all {leads.length.toLocaleString()}.</p>
              ) : null}
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
