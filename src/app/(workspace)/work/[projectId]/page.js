import Link from "@/components/shared/intent-link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks, PhoneCall, CalendarCheck, PartyPopper, Repeat } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import ToneBadge from "@/components/shared/tone-badge";
import FilterTable from "@/components/shared/filter-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { getWorkProject, getCallList, getCallListFilter, getCallListOptions, getFollowUps, getProjectReps } from "@/features/work/queries";
import CallListFilters from "@/features/work/components/call-list-filters";
import { criteriaCount } from "@/lib/call-list-filter";
import { getCurrentUser } from "@/lib/server/session";
import { readListParams, pageInfo } from "@/lib/paging";

export const dynamic = "force-dynamic";

/**
 * One project's call list: the rep's names still to call, least-called
 * first. "Start calling" opens the first; each result saved on a lead sheet
 * moves on to the next. The caller's filter for the project (renewal month,
 * place, industry, carrier, who developed it…) narrows all of it.
 * Administrators and account managers can look at any rep's list; call
 * counts (the weighting) are shown to administrators only.
 */
export default async function CallListPage({ params, searchParams }) {
  const { projectId } = await params;
  if (!/^[1-9]\d{0,17}$/.test(projectId)) notFound();
  const sp = await searchParams;
  const list = readListParams(sp);
  const [me, project] = await Promise.all([getCurrentUser(), getWorkProject(projectId)]);
  if (!project) notFound();

  const admin = me?.role === "admin";
  const canLookAtOthers = admin || me?.role === "manager";
  const reps = canLookAtOthers ? await getProjectReps(projectId) : [];
  const repId = canLookAtOthers && /^\d+$/.test(sp?.rep ?? "") ? Number(sp.rep) : me?.id;
  const mine = repId === me?.id;
  // Call lists are long: 50 a page unless the rep picks another size.
  const perPage = sp?.per ? list.perPage : 50;

  const [{ rows, total }, followUps, criteria, options, everyone] = await Promise.all([
    getCallList(projectId, { page: list.page, perPage, q: list.q, rep: repId }),
    mine ? getFollowUps({ projectId }) : [],
    getCallListFilter(projectId),
    getCallListOptions(projectId, repId),
    // Without the filter, for "37 of 220".
    getCallList(projectId, { page: 1, perPage: 1, rep: repId, filtered: false }),
  ]);
  const filtered = criteriaCount(criteria) > 0;
  const first = rows[0];
  const sheet = (id) => (mine ? `/leads/${id}?project=${project.id}` : `/leads/${id}`);

  return (
    <>
      <Topbar title="Call List" sub={`${project.name} · ${project.client}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/work" className="inline-flex items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary">
            <ArrowLeft className="size-3.5" /> Change project
          </Link>
          {canLookAtOthers && reps.length ? (
            <nav aria-label="Whose list" className="flex flex-wrap gap-1.5">
              {[{ id: me.id, name: "Mine" }, ...reps.filter((r) => r.id !== me.id)].map((r) => (
                <Link
                  key={r.id}
                  href={r.id === me.id ? `/work/${project.id}` : `/work/${project.id}?rep=${r.id}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${r.id === repId ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                >
                  {r.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </div>

        {sp?.done && mine && !total ? (
          <Card className="flex items-center gap-3 p-5 text-sm" data-list-done>
            <PartyPopper className="size-5 text-primary" />
            {filtered
              ? "That was the last name matching your filter. Widen it (the next month, say) to keep calling."
              : "That was the last name on your list for this project."}
          </Card>
        ) : null}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{project.name}</h2>
                <ToneBadge tone={project.type === "DBDV" ? "cyan" : "violet"}>{project.typeLabel}</ToneBadge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[project.client, project.state !== "—" ? project.state : null, project.timezone !== "—" ? project.timezone : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{total.toLocaleString()}</div>
                <div className="eyebrow">
                  {filtered ? `of ${everyone.total.toLocaleString()} match your filter` : mine ? "names left for you" : "names left for this rep"}
                </div>
              </div>
              {mine && first && !list.q ? (
                <Button asChild>
                  <Link href={sheet(first.id)}><PhoneCall /> Start calling</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        {followUps.length ? (
          <Card>
            <SectionHeader label="Appointments to Confirm" icon={CalendarCheck} />
            <ul className="divide-y divide-[var(--panel-border)]">
              {followUps.map((f) => (
                <li key={f.id}>
                  <Link href={`/leads/${f.leadId}?project=${project.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm transition-colors hover:bg-muted/40">
                    <span className="font-medium">{f.company}</span>
                    <span className="flex items-center gap-3 text-xs">
                      <span className="tabular-nums">{f.when}</span>
                      {f.qa === "pending" ? <ToneBadge tone="amber">QA pending</ToneBadge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <CallListFilters projectId={project.id} criteria={criteria} options={options} matching={total} all={everyone.total} />

        <Card>
          <SectionHeader label="Names to Call" icon={ListChecks} action={<span className="flex items-center gap-1 text-[0.66rem] text-muted-foreground"><Repeat className="size-3" /> Least-called first</span>} />
          <FilterTable
            columns={["#", "Company", "Contact", "Phone", "Location", "Renewal", "Result", "Last called", ...(admin ? [{ label: "Calls", className: "text-right" }] : [])]}
            placeholder="Find a name on this list…"
            empty={list.q ? "No names on this list match." : filtered ? "No names left match your filter." : "No names left to call on this project."}
            query={list.q}
            paging={pageInfo(total, list.page, perPage)}
            rows={rows.map((r) => ({
              id: r.id,
              node: (
                <TableRow>
                  <TableCell className="tabular-nums text-muted-foreground">{r.position}</TableCell>
                  <TableCell><Link href={sheet(r.id)} className="font-medium transition-colors hover:text-primary">{r.company}</Link></TableCell>
                  <TableCell>{r.contact}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{r.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{r.place}</TableCell>
                  <TableCell className="tabular-nums">{r.renewal}</TableCell>
                  <TableCell>{r.last ? <ToneBadge tone="slate">{r.result}</ToneBadge> : r.result}</TableCell>
                  <TableCell className="text-muted-foreground">{r.lastCalled}</TableCell>
                  {admin ? <TableCell className="text-right tabular-nums">{r.weight}</TableCell> : null}
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
