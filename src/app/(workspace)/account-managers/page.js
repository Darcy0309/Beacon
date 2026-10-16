import { UserCog, Building2, CalendarCheck, CalendarX2, PhoneCall, Target, UserX } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import Link from "@/components/shared/intent-link";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import MetricBar from "@/components/shared/metric-bar";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Card } from "@/components/ui/card";
import PeriodSwitch from "@/features/dashboard/components/period-switch";
import ViewNav from "@/features/dashboard/components/view-nav";
import { otherParams, readView } from "@/features/dashboard/views";
import { getPayRules } from "@/features/pay/queries";
import { getAccountManagers, getManagerPeriod } from "@/features/users/queries";
import { addDays, daysBetween, formatRange, isIsoDate } from "@/lib/dates";
import { VIEW_PERIODS } from "@/lib/pay";
import { getBusinessToday } from "@/lib/server/business-day";

export const dynamic = "force-dynamic";

const ACCENTS = ["var(--neon-cyan)", "var(--neon-emerald)", "var(--neon-amber)", "var(--neon-violet)"];
const BASE = "/account-managers";
// The pay period to begin with (Sean, Oct 2026), or a day, a week or a month.
const KEYS = ["period", "day", "week", "month"];

/** One figure on a manager's card: its number and what it is. */
function Figure({ value, label, color, title, name }) {
  return (
    <div title={title} data-manager-figure={name}>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>{Number(value).toLocaleString()}</div>
      <div className="eyebrow mt-0.5">{label}</div>
    </div>
  );
}

/**
 * The account managers, in one place for administrators (Sean, Oct 2026):
 * what each holds now (clients, leads) and what each did over days chosen,
 * the current pay period to begin with (or a day, a week, a month, or days
 * of one's own): leads developed, leads called, appointments set, and the
 * appointments and leads of theirs marked invalid. The tiles total the team
 * over those days, their lines a day at a time.
 */
export default async function AccountManagersPage({ searchParams }) {
  const sp = await searchParams;
  const [today, rules] = await Promise.all([getBusinessToday(), getPayRules()]);
  let view;
  if (sp?.p === "custom" && isIsoDate(sp?.pf) && isIsoDate(sp?.pt)) {
    const to = sp.pt <= today ? sp.pt : today;
    const from = sp.pf > to ? to : daysBetween(sp.pf, to) > 366 ? addDays(to, -366) : sp.pf;
    view = { key: "custom", anchor: to, range: { key: "custom", from, to }, label: formatRange(from, to), today };
  } else {
    view = readView(sp, { keyParam: "p", dateParam: "d", keys: KEYS, today, time: rules.time });
  }
  const custom = view.key === "custom";
  const [managers, period] = await Promise.all([getAccountManagers(), getManagerPeriod({ from: view.range.from, to: view.range.to, today })]);
  const did = (m) => period.byUser.get(m.id) ?? { developed: 0, appts: 0, called: 0, invalidAppts: 0, invalidLeads: 0 };
  const sum = (key) => managers.reduce((s, m) => s + did(m)[key], 0);
  const totalLeads = managers.reduce((s, m) => s + m.leads, 0);
  const totalClients = managers.reduce((s, m) => s + m.clients, 0);
  const maxLeads = Math.max(1, ...managers.map((m) => m.leads));
  const maxAppts = Math.max(1, ...managers.map((m) => did(m).appts));
  const span = custom ? "in these days" : view.key === "day" ? (view.anchor === today ? "today" : "that day") : `this ${view.key === "period" ? "pay period" : view.key}`;

  const tiles = [
    { label: "Account Managers", value: String(managers.length), note: "on the team",
      icon: UserCog, accent: "var(--neon-cyan)", series: managers.map((m) => m.leads), bars: true },
    { label: "Clients Covered", value: String(totalClients), note: "assignments",
      icon: Building2, accent: "var(--neon-emerald)", series: managers.map((m) => m.clients), bars: true },
    { label: "Appointments Set", value: sum("appts").toLocaleString(), note: `by the team ${span}`,
      icon: CalendarCheck, accent: "var(--neon-amber)", series: period.series.appts },
    // Leads they hold now, and the leads at appointment setting they called over the days (each once).
    { label: "Leads Called", value: sum("called").toLocaleString(), note: `${totalLeads.toLocaleString()} leads held now`,
      icon: PhoneCall, accent: "var(--neon-violet)", series: period.series.called },
    { label: "Invalid Appointments", value: sum("invalidAppts").toLocaleString(), note: `marked invalid ${span}`,
      icon: CalendarX2, accent: "var(--neon-rose)", series: period.series.invalidAppts },
    { label: "Invalid Leads", value: sum("invalidLeads").toLocaleString(), note: `marked invalid ${span}`,
      icon: UserX, accent: "var(--neon-magenta)", series: period.series.invalidLeads },
  ];

  return (
    <>
      <Topbar title="Account Managers" sub="Team performance and book of business" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {/* The days the figures count: the pay period to begin with. */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--panel-border)] bg-card/60 px-4 py-2.5" data-manager-period>
          <span className="mr-auto text-xs text-muted-foreground">Clients and leads held are as they stand now; the rest count the days chosen.</span>
          <PeriodSwitch param="p" current={view.key} params={otherParams(sp, "p", "pf", "pt")} options={VIEW_PERIODS} base={BASE} />
          {/* Days of one's own: the picker submits these with the rest of the address. */}
          <form method="get" action={BASE} className="inline-flex" data-manager-custom>
            {Object.entries(otherParams(sp, "p", "pf", "pt", "d")).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="hidden" name="p" value="custom" />
            <DateRangePicker fromName="pf" toName="pt" defaultFrom={custom ? view.range.from : undefined}
              defaultTo={custom ? view.range.to : undefined} max={today} maxDays={366} active={custom} />
          </form>
          {custom ? (
            <span className="text-xs tabular-nums text-muted-foreground" data-manager-range>{view.label}</span>
          ) : (
            <ViewNav params={otherParams(sp, "d")} dateParam="d" anchor={view.anchor} label={view.label} prev={view.prev} next={view.next}
              today={view.today} showsToday={view.showsToday} name={view.key === "period" ? "pay period" : view.key} base={BASE} />
          )}
        </div>

        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Team" icon={UserCog} />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {managers.map((m, i) => {
              const accent = ACCENTS[i % ACCENTS.length];
              const d = did(m);
              return (
                <Card key={m.name} accent={accent} data-manager-card={m.id}>
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-full border text-sm font-bold"
                        style={{
                          borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
                          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                          color: accent,
                        }}>
                        {m.initials}
                      </span>
                      <div className="min-w-0">
                        {m.active ? (
                          <Link href={`/?view=${m.id}`} className="block truncate font-semibold transition-colors hover:text-primary hover:underline" data-manager-link>{m.name}</Link>
                        ) : (
                          <div className="truncate font-semibold">{m.name}</div>
                        )}
                        <div className="text-xs text-muted-foreground">{m.region} region</div>
                      </div>
                    </div>
                    {/* Now: what they hold. */}
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--panel-border)] pt-4 text-center">
                      <Figure value={m.clients} label="Clients" color={accent} name="clients" />
                      <Figure value={m.leads} label="Leads held" color={accent} name="leads" title="Leads at appointment setting assigned to them now" />
                    </div>
                    {/* Over the days chosen. */}
                    <div className="mt-3 border-t border-[var(--panel-border)] pt-3">
                      <div className="eyebrow mb-2 text-center">{custom ? view.label : view.label.replace(/^Today · /, "Today, ")}</div>
                      <div className="grid grid-cols-3 gap-y-3 text-center">
                        <Figure value={d.developed} label="Developed" color={accent} name="developed" title="Leads they developed (DB dev)" />
                        <Figure value={d.called} label="Leads called" color={accent} name="called" title="Leads at appointment setting they called, each once" />
                        <Figure value={d.appts} label="Appts" color={accent} name="appts" title="Appointments they set" />
                        <Figure value={d.invalidLeads} label="Inv. leads" color="var(--neon-magenta)" name="invalid-leads" title="Leads they developed that were marked invalid" />
                        <Figure value={d.invalidAppts} label="Inv. appts" color="var(--neon-rose)" name="invalid-appts" title="Appointments they set that were marked invalid" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 border-t border-[var(--panel-border)] pt-3">
                      <MetricBar label="Leads held" value={m.leads} max={maxLeads} color={accent} />
                      <MetricBar label="Appointments" value={d.appts} max={maxAppts} color="var(--neon-emerald)" />
                    </div>
                  </div>
                </Card>
              );
            })}
            {managers.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No account managers yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
