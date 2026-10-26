"use client";

import { useActionState, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, ChevronDown, Target } from "lucide-react";
import Link from "@/components/shared/intent-link";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import DateRangePicker from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { addDays, addMonths, formatRange } from "@/lib/dates";
import { CHART_RANGES, DAY_AXIS, axisMax, chartPoints, chartStats, goalFrom, workdaysBetween } from "@/lib/production-chart";
import { cn } from "@/lib/utils";
import { saveProductionGoal } from "@/features/dashboard/actions";
import { dashboardHref } from "@/features/dashboard/components/period-switch";

// The two lines in the theme's own pair of colours (globals.css: --series-leads, --series-appts), well apart.
const LEADS = "var(--series-leads)";
const APPTS = "var(--series-appts)";
const HEIGHT = 240;
const PAD = { left: 40, right: 16, top: 14, bottom: 28 };
const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const fmt = (n, digits = 0) => (n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));

/** A month's goals: leads and appointments, worked out from the team if wanted. */
function GoalsDialog({ goals, month: start }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(start.slice(0, 7));
  const g = goals[`${month}-01`] ?? {};
  const days = workdaysBetween(`${month}-01`, addDays(addMonths(`${month}-01`, 1), -1));
  const [form, setForm] = useState({});
  const [calc, setCalc] = useState({ leadPeople: "", leadHours: "", apptPeople: "", apptHours: "" });
  const [state, action, pending] = useActionState(saveProductionGoal, EMPTY);
  useEffect(() => {
    setForm({ leads_goal: g.leads ?? "", appts_goal: g.appts ?? "", leads_per_hour: g.leadsPerHour ?? 3, appts_per_hour: g.apptsPerHour ?? 2 });
  }, [month, open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state?.ok) {
      toast.success("Goals saved");
      setOpen(false);
      router.refresh();
    } else if (state?.error) toast.error(state.error);
  }, [state, router]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const leadsCalc = goalFrom({ people: calc.leadPeople, hoursPerDay: calc.leadHours, days, perHour: form.leads_per_hour });
  const apptsCalc = goalFrom({ people: calc.apptPeople, hoursPerDay: calc.apptHours, days, perHour: form.appts_per_hour });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-production-goals><Target /> Goals</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Monthly production goals</DialogTitle>
          <DialogDescription>The chart spreads a month&apos;s goal over its working days (Monday to Friday) and shows the % reached.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4" data-goals-form>
          <input type="hidden" name="month" value={`${month}-01`} />
          <Field label="Month">
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
          </Field>
          {[
            ["leads", "Leads", "Lead managers", "leadPeople", "leadHours", leadsCalc],
            ["appts", "Appointments", "Appointment managers", "apptPeople", "apptHours", apptsCalc],
          ].map(([k, label, who, people, hours, worked]) => (
            <fieldset key={k} className="rounded-lg border border-[var(--panel-border)] p-3">
              <legend className="px-1 text-xs font-semibold">{label}</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`${label} goal for the month`}>
                  <Input name={`${k}_goal`} type="number" min="0" value={form[`${k}_goal`] ?? ""} onChange={set(`${k}_goal`)} />
                </Field>
                <Field label="Aim per hour">
                  <Input name={`${k}_per_hour`} type="number" min="0" step="0.1" value={form[`${k}_per_hour`] ?? ""} onChange={set(`${k}_per_hour`)} />
                </Field>
              </div>
              {/* From the team: managers × hours a day × working days × per hour. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-goal-calc={k}>
                <Input aria-label={`${who}`} type="number" min="0" placeholder="0" className="h-7 w-14" value={calc[people]} onChange={(e) => setCalc((c) => ({ ...c, [people]: e.target.value }))} />
                {who.toLowerCase()} ×
                <Input aria-label="Hours a day each" type="number" min="0" step="0.5" placeholder="0" className="h-7 w-14" value={calc[hours]} onChange={(e) => setCalc((c) => ({ ...c, [hours]: e.target.value }))} />
                hrs/day × {days} days × {form[`${k}_per_hour`] || 0}/hr = <strong className="text-foreground">{fmt(worked)}</strong>
                <button type="button" disabled={!worked} onClick={() => setForm((f) => ({ ...f, [`${k}_goal`]: worked }))}
                  className="ml-1 font-semibold text-primary hover:underline disabled:opacity-40" data-use-calc={k}>Use</button>
              </div>
            </fieldset>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save goals"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One series' figures under the chart. */
function Stats({ label, color, s, per }) {
  const items = [
    // Short enough to read whole in a narrow column.
    ["High", fmt(s.high)], ["Low", fmt(s.low)], [`Avg/${{ hour: "hr", week: "wk" }[per] ?? per}`, fmt(s.average, 1)],
    ["Per hour", s.perHour == null ? "—" : fmt(s.perHour, 2), s.targetPerHour != null ? `aim ${fmt(s.targetPerHour, 1)}` : null,
      s.perHour != null && s.targetPerHour != null ? (s.perHour >= s.targetPerHour ? "ok" : "low") : null],
    ["Of goal", s.ofGoal == null ? "—" : `${s.ofGoal}%`,
      s.goal == null ? "no goal set" : s.goal === 0 ? "no working days" : `goal ${fmt(s.goal)}`, s.ofGoal == null ? null : s.ofGoal >= 100 ? "ok" : null],
  ];
  return (
    <div data-production-stats={label.toLowerCase()}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: color }} /> {label}
        <span className="ml-auto text-sm font-bold normal-case tracking-normal text-foreground tabular-nums">{fmt(s.total)}</span>
      </div>
      <dl className="grid grid-cols-[repeat(3,minmax(0,0.8fr))_repeat(2,minmax(0,1.2fr))] gap-2">
        {items.map(([k, v, sub, tone]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[0.6rem] uppercase tracking-[0.1em] text-muted-foreground" title={k === "Per hour" ? "Per hour worked" : undefined}>{k}</dt>
            <dd className={cn("text-sm font-semibold tabular-nums", tone === "ok" && "text-emerald-500", tone === "low" && "text-amber-500")}>{v}</dd>
            {sub ? <dd className="truncate text-[0.62rem] text-muted-foreground">{sub}</dd> : null}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The administrator's chart of what the team developed (in place of Lead
 * Volume, which counted every lead loaded): leads and appointments, both
 * or one, over a day (by the hour, 5 AM – 6 PM, the day's running total) or
 * a range (by the day, or the week beyond three months), stock-chart
 * style; company-wide, or one manager's or project's. Under it the high,
 * low and average, leads and appointments per hour worked by lead and
 * appointment managers, and the % of the month's goals.
 *
 *   data     getProductionChart(); range  chartRange(); goals  getProductionGoals()
 */
export default function ProductionChart({ data, range, goals, options, selected, params, today }) {
  const [show, setShow] = useState("both");
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const oneDay = range.from === range.to;
  const month = goals[`${range.to.slice(0, 8)}01`] ?? {};
  const rates = { leads: month.leadsPerHour ?? 3, appts: month.apptsPerHour ?? 2 };
  const points = useMemo(() => chartPoints(data, range, goals), [data, range, goals]);
  const stats = useMemo(() => chartStats(data, range, goals, rates), [data, range, goals, rates.leads, rates.appts]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = [
    ...(show !== "appts" ? [{ key: "leads", goal: "goalLeads", color: LEADS, label: "Leads" }] : []),
    ...(show !== "leads" ? [{ key: "appts", goal: "goalAppts", color: APPTS, label: "Appointments" }] : []),
  ];
  const top = Math.max(0, ...points.flatMap((p) => series.flatMap((s) => [p[s.key], p[s.goal] ?? 0])));
  const max = axisMax(top, oneDay ? DAY_AXIS : 4);
  const w = width - PAD.left - PAD.right;
  const h = HEIGHT - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v) => PAD.top + h - (v / max) * h;
  const path = (k) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k] ?? 0).toFixed(1)}`).join("");
  const hasGoal = (k) => points.some((p) => p[k] != null);
  const step = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 70))));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((px - PAD.left) / Math.max(w, 1)) * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, i)));
  };
  const href = (changes) => dashboardHref(params, changes);
  const more = CHART_RANGES.filter((r) => r.more);
  const current = CHART_RANGES.find((r) => r.key === range.key);

  return (
    <Card data-production-chart className="flex flex-col">
      <SectionHeader wrap label="Leads & Appointments Developed" icon={Activity}
        action={
          <nav className="flex items-center rounded-lg border border-[var(--panel-border)] p-0.5" aria-label="Range" data-chart-ranges>
            {CHART_RANGES.filter((r) => !r.more).map((r) => (
              <Link key={r.key} href={href({ pr: r.key })} scroll={false} aria-current={range.key === r.key ? "true" : undefined}
                className={cn("rounded-md px-2 py-0.5 text-[0.66rem] font-bold tracking-[0.06em] transition-colors",
                  range.key === r.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {r.label}
              </Link>
            ))}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button type="button" data-chart-more
                  className={cn("flex items-center gap-0.5 rounded-md px-2 py-0.5 text-[0.66rem] font-bold tracking-[0.06em]",
                    current?.more ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {current?.more && range.key !== "custom" ? current.label : "More"} <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {more.filter((r) => r.key !== "custom").map((r) => (
                  <DropdownMenuItem key={r.key} asChild><Link href={href({ pr: r.key })} scroll={false}>{r.label}</Link></DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        } />

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md border border-[var(--panel-border)] p-px text-[0.66rem] font-semibold" role="group" aria-label="Show" data-chart-series>
            {[["both", "Both"], ["leads", "Leads"], ["appts", "Appointments"]].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}
                className={cn("rounded px-2 leading-6 transition-colors", show === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>{l}</button>
            ))}
          </span>
          {/* A range of one's own: the picker submits these with the rest of the address. */}
          <form method="get" action="/" className="inline-flex" data-chart-custom>
            {Object.entries(params).filter(([k]) => !["pr", "pf", "pt"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="hidden" name="pr" value="custom" />
            <DateRangePicker fromName="pf" toName="pt" defaultFrom={range.key === "custom" ? range.from : undefined}
              defaultTo={range.key === "custom" ? range.to : undefined} max={today} maxDays={731} active={range.key === "custom"} />
          </form>
          <span className="text-xs text-muted-foreground tabular-nums">{oneDay ? `${formatRange(range.from, range.to)} · 5 AM – 6 PM` : formatRange(range.from, range.to)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ParamSelect name="pu" label="Manager" placeholder="Everyone" value={selected.user ?? ""} options={options.people} />
          <ParamSelect name="pp" label="Project" placeholder="All projects" value={selected.project ?? ""} options={options.projects} />
          <GoalsDialog goals={goals} month={range.to} />
        </div>
      </div>

      <div ref={box} className="relative px-2 pt-2" data-chart-box>
        <svg width={width} height={HEIGHT} className="block" role="img"
          aria-label={`Leads ${stats.leads.total}, appointments ${stats.appts.total}, ${formatRange(range.from, range.to)}`}
          onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(max * t)} y2={y(max * t)} stroke="var(--panel-border)" strokeDasharray={t ? "2 4" : undefined} />
              <text x={PAD.left - 6} y={y(max * t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{fmt(max * t)}</text>
            </g>
          ))}
          {points.map((p, i) => ((i % step === 0 && points.length - 1 - i >= step * 0.6) || i === points.length - 1 ? (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">{p.label}</text>
          ) : null))}
          {series.map((s) => (hasGoal(s.goal) ? (
            <path key={`g-${s.key}`} d={path(s.goal)} fill="none" stroke={s.color} strokeOpacity="0.45" strokeWidth="1.25" strokeDasharray="5 4" data-goal-line={s.key} />
          ) : null))}
          {series.length === 1 ? (
            <path d={`${path(series[0].key)}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={series[0].color} fillOpacity="0.12" />
          ) : null}
          {series.map((s) => (
            <path key={s.key} d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" data-line={s.key} />
          ))}
          {series.map((s) => <circle key={`d-${s.key}`} cx={x(points.length - 1)} cy={y(points.at(-1)?.[s.key] ?? 0)} r="3.5" fill={s.color} />)}
          {hover != null ? (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + h} stroke="var(--muted-foreground)" strokeOpacity="0.5" />
              {series.map((s) => <circle key={`h-${s.key}`} cx={x(hover)} cy={y(points[hover][s.key])} r="4" fill="var(--card)" stroke={s.color} strokeWidth="2" />)}
            </g>
          ) : null}
        </svg>
        {hover != null ? (
          <div className="pointer-events-none absolute top-2 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg" data-chart-tip
            style={{ left: Math.min(Math.max(x(hover) - 70, 8), width - 150) }}>
            <div className="font-semibold">{points[hover].title}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
                <span className="size-1.5 rounded-full" style={{ background: s.color }} /> {s.label}: <strong>{fmt(points[hover][s.key])}</strong>
                {points[hover][s.goal] != null ? <span className="text-muted-foreground">/ {fmt(points[hover][s.goal])}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-[var(--panel-border)] px-5 py-4 lg:grid-cols-2">
        {show !== "appts" ? <Stats label="Leads" color={LEADS} s={stats.leads} per={stats.per} /> : null}
        {show !== "leads" ? <Stats label="Appointments" color={APPTS} s={stats.appts} per={stats.per} /> : null}
      </div>
    </Card>
  );
}
