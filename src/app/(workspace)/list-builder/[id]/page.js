import { notFound } from "next/navigation";
import { ArrowLeft, Ban, Factory, MapPin, Pencil, StickyNote, Users } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RequestExports, RequestStatus } from "@/features/list-builder/components/request-tools";
import { getRequest, getSicNames, getSicRows } from "@/features/list-builder/queries";
import { getCurrentUser } from "@/lib/server/session";
import { criteriaSummary, groupOf, statusLabel } from "@/lib/list-builder";

export const dynamic = "force-dynamic";

const TONE = { new: "amber", in_progress: "sky", pulled: "emerald", closed: "slate" };
const listOr = (a, none = "—") => (a?.length ? a.join(", ") : none);

/**
 * One list request: who it is for, its industries by group (with the
 * employee size for each), the territory and what is left out, notes; its
 * exports (the codes one to a line, for the vendor's site; the territory);
 * where it stands, for staff to move on; and changing it.
 */
export default async function ListRequestPage({ params }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) notFound();
  const [me, request, rows] = await Promise.all([getCurrentUser(), getRequest(Number(id)), getSicRows()]);
  if (!request) notFound();
  const staff = me?.role !== "client";
  // The tree's names, and its 6-digit codes' from the SIC list.
  const names = { ...Object.fromEntries(rows.map((r) => [r.code, r.name])), ...(await getSicNames(request.criteria?.sic)) };
  const c = request.criteria;
  const byGroup = {};
  for (const code of c.sic ?? []) (byGroup[groupOf(code)] ??= []).push(code);
  const forWhom = request.client ?? request.prospect?.company ?? request.prospect?.name ?? "Our own list";
  const canEdit = staff || request.status === "new";

  return (
    <>
      <Topbar title={request.title || "List request"} sub={`${forWhom} · ${criteriaSummary(c)}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/list-builder" className="back-link inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="size-3.5" /> Back to List Builder
        </Link>

        <Card className="p-5" data-request-head>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1 text-sm">
              <div className="text-lg font-semibold">{forWhom}</div>
              {request.prospect ? (
                <div className="text-muted-foreground" data-request-prospect>
                  Prospect: {[request.prospect.name, request.prospect.email, request.prospect.phone].filter(Boolean).join(" · ")}
                </div>
              ) : null}
              <div className="text-muted-foreground">
                {[`Asked ${new Date(request.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
                  request.by ? `by ${request.by}` : request.source === "prospect" ? "through a prospect link" : null,
                  request.salesRep ? `Sales Rep ${request.salesRep}` : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {staff ? <RequestStatus id={request.id} status={request.status} /> : <ToneBadge tone={TONE[request.status] ?? "slate"}>{statusLabel(request.status)}</ToneBadge>}
              {canEdit ? <Button asChild size="sm" variant="outline"><Link href={`/list-builder/${request.id}/edit`}><Pencil /> Change</Link></Button> : null}
            </div>
          </div>
          <div className="mt-4 border-t border-[var(--panel-border)] pt-4"><RequestExports request={request} names={names} /></div>
        </Card>

        <Card>
          <SectionHeader label={`Industries · ${(c.sic ?? []).length} codes`} icon={Factory} />
          <div className="divide-y divide-[var(--panel-border)]" data-request-industries>
            {Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)).map(([g, codes]) => {
              const e = c.employees?.[g];
              return (
                <div key={g} className="px-5 py-3" data-request-group={g}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium"><span className="tabular-nums text-muted-foreground">{g}</span> · {names[g] ?? ""}</div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" data-request-employees={g}>
                      <Users className="size-3.5" />
                      {e && (e.min != null || e.max != null) ? `${e.min ?? 0}${e.max != null ? `–${e.max}` : "+"} employees` : "Any size"}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{codes.map((code) => `${code} ${names[code] ?? ""}`).join(" · ")}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeader label="Territory" icon={MapPin} />
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 p-5 text-sm" data-request-include>
              <dt className="text-muted-foreground">States</dt><dd>{listOr(c.include?.states)}</dd>
              <dt className="text-muted-foreground">Counties</dt><dd>{listOr(c.include?.counties)}</dd>
              <dt className="text-muted-foreground">Cities</dt><dd>{listOr(c.include?.cities)}</dd>
              <dt className="text-muted-foreground">Radius</dt><dd>{c.include?.radius ? `${c.include.radius.miles} miles of ${c.include.radius.zip}` : "—"}</dd>
              <dt className="text-muted-foreground">ZIP codes</dt><dd className="break-words tabular-nums">{c.zips?.length ? `${c.zips.length.toLocaleString()}: ${c.zips.slice(0, 60).join(", ")}${c.zips.length > 60 ? " …" : ""}` : "—"}</dd>
            </dl>
          </Card>
          <Card>
            <SectionHeader label="Leave out" icon={Ban} />
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 p-5 text-sm" data-request-exclude>
              <dt className="text-muted-foreground">States</dt><dd>{listOr(c.exclude?.states)}</dd>
              <dt className="text-muted-foreground">Counties</dt><dd>{listOr(c.exclude?.counties)}</dd>
              <dt className="text-muted-foreground">Cities</dt><dd>{listOr(c.exclude?.cities)}</dd>
              <dt className="text-muted-foreground">ZIP codes</dt><dd className="break-words tabular-nums">{listOr(c.exclude?.zips)}</dd>
            </dl>
          </Card>
        </div>

        {request.notes ? (
          <Card>
            <SectionHeader label="Notes" icon={StickyNote} />
            <p className="whitespace-pre-line p-5 text-sm">{request.notes}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
