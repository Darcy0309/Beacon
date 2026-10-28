import { Link2, ListFilter, Plus } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import ToneBadge from "@/components/shared/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProspectLinks, SicSheetUpload } from "@/features/list-builder/components/request-tools";
import { listLinks, listRequests } from "@/features/list-builder/queries";
import { getClientNames } from "@/features/clients/queries";
import { getSalesReps } from "@/features/users/queries";
import { requestOrigin } from "@/lib/server/action-helpers";
import { getCurrentUser } from "@/lib/server/session";
import { STATUSES, criteriaSummary, statusLabel } from "@/lib/list-builder";

export const dynamic = "force-dynamic";

const TONE = { new: "amber", in_progress: "sky", pulled: "emerald", closed: "slate" };
const idParam = (v) => (/^[1-9]\d{0,17}$/.test(v ?? "") ? Number(v) : null);

/**
 * List Builder (Sean, Oct 2026): the requests for businesses to target, each
 * a client's or a prospect's, newest first, by client, Sales Rep and where it
 * stands; the links prospects fill one in from; and, for an administrator,
 * the SIC sheet to load. A client sees and makes their own.
 */
export default async function ListBuilderPage({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const client = me?.role === "client";
  const staff = !client;
  const status = STATUSES.some(([k]) => k === sp?.status) ? sp.status : null;
  const [requests, clients, reps, links, origin] = await Promise.all([
    listRequests({ companyId: staff ? idParam(sp?.client) : null, salesRepId: staff ? idParam(sp?.rep) : null, status }),
    staff ? getClientNames() : [],
    staff ? getSalesReps() : [],
    staff ? listLinks() : [],
    staff ? requestOrigin() : "",
  ]);
  const clientOptions = clients.map((c) => ({ value: String(c.id), label: c.name }));

  return (
    <>
      <Topbar title="List Builder" sub={`${requests.length.toLocaleString()} request${requests.length === 1 ? "" : "s"} · industries, size and territory to target`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <SectionHeader wrap label={client ? "Your list requests" : "List requests"} icon={ListFilter}
            action={
              <div className="flex flex-wrap items-center gap-2">
                {me?.role === "admin" ? <SicSheetUpload /> : null}
                <Button asChild size="sm"><Link href="/list-builder/new" data-new-request><Plus /> New request</Link></Button>
              </div>
            } />
          {staff ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--panel-border)] px-5 py-3">
              <ParamSelect name="client" label="Client" placeholder="All clients" value={sp?.client ?? ""} options={clientOptions} />
              <ParamSelect name="rep" label="Sales Rep" placeholder="All" value={sp?.rep ?? ""} options={reps.map((r) => ({ value: String(r.id), label: r.name }))} />
              <ParamSelect name="status" label="Status" placeholder="Any" value={status ?? ""} options={STATUSES.map(([value, label]) => ({ value, label }))} />
            </div>
          ) : null}
          {requests.length ? (
            <div className="overflow-x-auto">
              <Table data-requests>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asked</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead>Request</TableHead>
                    {staff ? <TableHead>Sales Rep</TableHead> : null}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id} data-request={r.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{new Date(r.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.client ?? r.prospect?.company ?? r.prospect?.name ?? "Our own list"}</div>
                        <div className="text-xs text-muted-foreground">{r.source === "prospect" ? `Prospect · ${r.prospect?.name ?? ""}` : r.source === "client" ? "From the client" : r.by ? `By ${r.by}` : null}</div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/list-builder/${r.id}`} className="font-medium hover:text-primary hover:underline">{r.title || "List request"}</Link>
                        <div className="text-xs text-muted-foreground">{criteriaSummary(r.criteria)}</div>
                      </TableCell>
                      {staff ? <TableCell className="whitespace-nowrap">{r.salesRep ?? "—"}</TableCell> : null}
                      <TableCell><ToneBadge tone={TONE[r.status] ?? "slate"}>{statusLabel(r.status)}</ToneBadge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="p-10 text-center text-sm text-muted-foreground">No list requests {status || sp?.client || sp?.rep ? "match these filters" : "yet"}. Start one with New request.</p>
          )}
        </Card>

        {staff ? (
          <Card>
            <SectionHeader label="Links for prospects" icon={Link2}
              action={<span className="text-xs text-muted-foreground">They fill in a request without signing in; it comes to the link&apos;s Sales Rep</span>} />
            <ProspectLinks links={links} reps={reps} clients={clientOptions} origin={origin} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
