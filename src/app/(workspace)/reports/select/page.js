import { notFound } from "next/navigation";
import { CalendarClock, CalendarRange, Crown, ListChecks, Users, Wallet } from "lucide-react";
import Link from "@/components/shared/intent-link";
import Topbar from "@/components/layout/topbar";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import CsvButton from "@/components/shared/csv-button";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import ToneBadge from "@/components/shared/tone-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSelectReport } from "@/features/clients/select-queries";
import { clientSlug, mediumDate } from "@/lib/format";
import { formatRange, isIsoDate } from "@/lib/dates";
import { currentTerm, dollars, termStatus } from "@/lib/signature-select";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EARLIEST = "2000-01-01";
const csvCell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));

/**
 * Signature Select (Sean, Nov 2026: "track how much we take in for all subscriptions through an admin report
 * (filter for total, by client, time period"). What its terms charged in a time (each month of a monthly term,
 * on its start day; an annual term on its start), in total, monthly and annual, by client and charge by charge;
 * who is on it now, and whose term ends soon. Administrators only.
 */
export default async function SelectReport({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (me?.role !== "admin") notFound();
  const today = await getBusinessToday();
  const all = sp?.all === "1";
  const chosen = !all && isIsoDate(sp?.from) && isIsoDate(sp?.to) && sp.from <= sp.to;
  // This year so far unless a time is chosen.
  const from = all ? EARLIEST : chosen ? sp.from : `${today.slice(0, 4)}-01-01`;
  const to = all ? today : chosen ? sp.to : today;
  const companyId = /^\d+$/.test(sp?.client ?? "") ? Number(sp.client) : null;

  const { charges, terms } = await getSelectReport(from, to, companyId);
  const clients = [...new Map(terms.map((t) => [t.company_id, t.client])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sum = (list) => list.reduce((n, c) => n + c.amount, 0);
  const total = sum(charges);
  const monthly = sum(charges.filter((c) => c.plan === "monthly"));
  const annual = sum(charges.filter((c) => c.plan === "annual"));

  // Who is on it now, and whose term ends in the next 30 days without a later one.
  const byClient = new Map();
  for (const t of terms) {
    if (companyId && t.company_id !== companyId) continue;
    if (!byClient.has(t.company_id)) byClient.set(t.company_id, { id: t.company_id, client: t.client, terms: [] });
    byClient.get(t.company_id).terms.push(t);
  }
  const soon = (() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const rows = [...byClient.values()].map((c) => {
    const now = currentTerm(c.terms, today);
    const status = now ? termStatus(now, today) : null;
    const mine = charges.filter((x) => x.company_id === c.id);
    const later = c.terms.some((t) => now && t.starts_on > now.starts_on);
    return { ...c, now, status, count: mine.length, total: sum(mine), endingSoon: status === "on" && now.ends_on && now.ends_on <= soon && !later };
  }).sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));
  const active = rows.filter((r) => r.status === "on").length;
  const ending = rows.filter((r) => r.endingSoon);
  // A monthly run-rate: what the terms on now bring in a month (an annual one a twelfth).
  const runRate = rows.filter((r) => r.status === "on").reduce((n, r) => n + (r.now.plan === "monthly" ? r.now.amount : r.now.amount / 12), 0);

  const href = (p) => {
    const q = new URLSearchParams();
    const next = { client: companyId, from: chosen ? from : null, to: chosen ? to : null, all: all ? "1" : null, ...p };
    for (const [k, v] of Object.entries(next)) if (v != null && v !== "") q.set(k, String(v));
    return `/reports/select${q.size ? `?${q}` : ""}`;
  };
  const period = all ? "All time" : formatRange(from, to);
  const csv = [["Date", "Client", "Plan", "Amount"].join(","),
    ...charges.map((c) => [c.charged_on, csvCell(c.client), c.plan, c.amount.toFixed(2)].join(","))].join("\r\n");

  return (
    <>
      <Topbar title="Signature Select" sub={`What subscriptions brought in · ${period}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6" data-select-report>
        <Card>
          <div className="flex flex-wrap items-center gap-2 p-3">
            <form action="/reports/select" className="flex items-center gap-2">
              {companyId ? <input type="hidden" name="client" value={String(companyId)} /> : null}
              <DateRangePicker key={`${from}:${to}:${all}`} defaultFrom={all ? `${today.slice(0, 4)}-01-01` : from} defaultTo={to} max="today" maxDays={3700} active={chosen} />
            </form>
            {[["This year", { from: null, to: null, all: null }], ["All time", { from: null, to: null, all: "1" }]].map(([label, p]) => {
              const on = label === "All time" ? all : !all && !chosen;
              return (
                <Link key={label} href={href(p)} aria-current={on ? "true" : undefined} data-select-period={label}
                  className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    on ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                  {label}
                </Link>
              );
            })}
            <div className="ml-auto">
              <ParamSelect name="client" label="Client" placeholder="All clients" value={companyId ? String(companyId) : ""}
                options={clients.map(([id, name]) => ({ value: String(id), label: name }))} />
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-select-tiles>
          <StatTile label="Total brought in" value={dollars(total)} note={`${charges.length} charge${charges.length === 1 ? "" : "s"} · ${period}`} icon={Wallet} accent="var(--neon-cyan)" />
          <StatTile label="Monthly" value={dollars(monthly)} note="Monthly subscriptions" icon={CalendarClock} accent="var(--neon-violet)" />
          <StatTile label="Annual" value={dollars(annual)} note="Annual subscriptions" icon={CalendarRange} accent="var(--neon-amber)" />
          <StatTile label="On Select now" value={String(active)} note={`About ${dollars(Math.round(runRate))} a month`} icon={Users} accent="var(--neon-emerald)" />
        </div>

        {ending.length ? (
          <Card data-select-ending>
            <SectionHeader label={`Ending in the next 30 days · ${ending.length}`} icon={CalendarClock} />
            <ul className="divide-y divide-[var(--panel-border)] text-sm">
              {ending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-5 py-2">
                  <Link href={`/clients/${clientSlug(r.client)}`} className="font-medium hover:text-primary">{r.client}</Link>
                  <span className="text-muted-foreground">{r.now.plan === "annual" ? "Annual" : "Monthly"} · {dollars(r.now.amount)}</span>
                  <span className="ml-auto tabular-nums">ends {mediumDate(r.now.ends_on)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card data-select-by-client>
          <SectionHeader label="By client" icon={Crown} />
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan now</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead className="text-right">Charges</TableHead>
                  <TableHead className="text-right">Brought in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-select-client={r.id}>
                    <TableCell className="font-medium"><Link href={href({ client: r.id })} className="hover:text-primary">{r.client}</Link></TableCell>
                    <TableCell className="whitespace-nowrap">{r.now ? `${r.now.plan === "annual" ? "Annual" : "Monthly"} · ${dollars(r.now.amount)}` : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <ToneBadge tone={r.status === "on" ? "emerald" : r.status === "upcoming" ? "sky" : "slate"}>
                        {r.status === "on" ? (r.now.ends_on ? `Until ${mediumDate(r.now.ends_on)}` : "Ongoing") : r.status === "upcoming" ? `Starts ${mediumDate(r.now.starts_on)}` : `Ended ${mediumDate(r.now.ends_on)}`}
                      </ToneBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums" data-select-client-total>{dollars(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No client is on Signature Select yet. Add it on a client&apos;s Edit.</p> : null}
          </div>
        </Card>

        <Card data-select-charges>
          <SectionHeader label={`Charges · ${charges.length}`} icon={ListChecks}
            action={<CsvButton csv={csv} fileName={`signature_select_${from}_${to}.csv`} disabled={!charges.length} />} />
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...charges].reverse().map((c) => (
                  <TableRow key={`${c.term_id}-${c.charged_on}`} data-select-charge>
                    <TableCell className="whitespace-nowrap tabular-nums">{mediumDate(c.charged_on)}</TableCell>
                    <TableCell>{c.client}</TableCell>
                    <TableCell>{c.plan === "annual" ? "Annual" : "Monthly"}</TableCell>
                    <TableCell className="text-right tabular-nums">{dollars(c.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {charges.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Nothing charged in this time.</p> : null}
          </div>
          {charges.length ? <p className="border-t border-[var(--panel-border)] px-5 py-2.5 text-sm">Total: <strong className="tabular-nums">{dollars(total)}</strong></p> : null}
        </Card>
      </div>
    </>
  );
}
