"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LineChart, Pencil, Target } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import ParamSelect from "@/components/shared/param-select";
import { formatIso } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setClientGoal } from "@/features/dashboard/actions";

const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const short = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : money(n));

/**
 * The Sale Pipeline (Sean, Oct 2026): what the client records from our
 * appointments, like a ticker. Twelve months from the month their campaign
 * started (the project's start date), the line the premium written so far,
 * month by month; the dashed one, where the year's goal would have them by
 * then. Under it: premium written (Sold Account totals), in the pipe
 * (potential premium on those Valid-Quoting), the goal (theirs to set, or an
 * administrator's on their page), and the close ratio (sold of the valid
 * appointments). All their projects together, or one, from the list.
 *
 *   sales      getClientSales()
 *   companyId  set on an administrator's view of a client
 *   thisMonth  1 to 12, the month we are in among the twelve (sales.current when given): the line runs to here
 */
export default function SalePipeline({ sales, companyId = null, thisMonth: monthOfYear, canSetGoal = true }) {
  const thisMonth = sales.current ?? monthOfYear;
  const [hover, setHover] = useState(null);
  const months = sales.months.length ? sales.months : Array.from({ length: 12 }, (_, i) => ({ month: i + 1, label: "", written: 0 }));
  // Running total: the ticker climbs as premium is written.
  let run = 0;
  const points = months.map((m) => ({ ...m, total: (run += m.written) }));
  const shown = points.filter((p) => p.month <= thisMonth);
  const pace = (m) => (sales.goal ? (sales.goal * m) / 12 : null);
  const top = Math.max(1, ...points.map((p) => p.total), sales.goal ?? 0);

  // The chart in a 600 x 220 box, months across, money up.
  const W = 600, H = 220, PAD = 10;
  const x = (m) => PAD + ((m - 1) / 11) * (W - PAD * 2);
  const y = (v) => H - PAD - (v / top) * (H - PAD * 2);
  const line = shown.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  const area = shown.length ? `${line} L${x(shown.at(-1).month).toFixed(1)},${H - PAD} L${x(1).toFixed(1)},${H - PAD} Z` : "";
  const up = shown.length > 1 && shown.at(-1).total >= shown.at(-2).total;
  const color = sales.written > 0 ? (up ? "var(--neon-emerald)" : "var(--neon-rose)") : "var(--neon-cyan)";
  const at = hover ? points.find((p) => p.month === hover) : null;

  const stats = [
    ["Premium written", money(sales.written), sales.start ? `since ${formatIso(sales.start, "month")}` : `this year (${sales.year})`, "var(--neon-emerald)", "written"],
    ["In the pipe", money(sales.pipe), "potential, still quoting", "var(--neon-blue)", "pipe"],
    ["My goal", sales.goal == null ? "Not set" : money(sales.goal),
      sales.goal ? `${Math.round((sales.written / sales.goal) * 100)}% of it written` : "for the year", "var(--neon-amber)", "goal"],
    ["Close ratio", `${sales.closeRatio}%`, `${sales.sold} sold of ${sales.considered}`, "var(--neon-violet)", "close"],
  ];

  return (
    <Card className="flex flex-col" data-sale-pipeline data-sale-start={sales.start ?? undefined}>
      <SectionHeader wrap label="Sale Pipeline" icon={LineChart}
        action={
          <span className="flex flex-wrap items-center gap-2">
            {/* Every project of theirs together, or one (Sean, Oct 2026). */}
            {sales.projects?.length > 1 ? (
              <ParamSelect name="sp" label="Project" placeholder="All projects" value={sales.projectId ? String(sales.projectId) : ""}
                options={sales.projects.map((p) => ({ value: String(p.id), label: p.name }))} clears={[]} />
            ) : null}
            {canSetGoal ? <GoalButton year={sales.year} goal={sales.goal} companyId={companyId} /> : null}
          </span>
        } />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="relative min-h-48 flex-1" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full min-h-48 w-full overflow-visible" role="img"
            aria-label={`Premium written in ${sales.year}: ${money(sales.written)}${sales.goal ? ` of a ${money(sales.goal)} goal` : ""}`}>
            <defs>
              <linearGradient id="sale-pipeline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity="0.35" />
                <stop offset="1" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={PAD} x2={W - PAD} y1={y(top * f)} y2={y(top * f)} stroke="var(--grid-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {sales.goal ? (
              <line x1={x(1)} y1={y(pace(1))} x2={x(12)} y2={y(pace(12))} stroke="var(--neon-amber)" strokeWidth="1.5" strokeDasharray="5 5"
                vectorEffect="non-scaling-stroke" data-goal-pace />
            ) : null}
            {area ? <path d={area} fill="url(#sale-pipeline-fill)" /> : null}
            {line ? <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-ticker /> : null}
            {points.map((p) => (
              <rect key={p.month} x={x(p.month) - (W - PAD * 2) / 22} y="0" width={(W - PAD * 2) / 11} height={H} fill="transparent"
                onMouseEnter={() => setHover(p.month)} />
            ))}
            {at && at.month <= thisMonth ? <circle cx={x(at.month)} cy={y(at.total)} r="4" fill={color} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {at ? (
            <div className="pointer-events-none absolute top-1 rounded-md border border-[var(--panel-border)] bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{ left: `clamp(0px, calc(${((at.month - 1) / 11) * 100}% - 4rem), calc(100% - 9rem))` }} data-sale-tip>
              <div className="font-semibold">{at.key ? formatIso(`${at.key}-01`, "month") : `${at.label} ${sales.year}`}</div>
              <div className="tabular-nums">{money(at.written)} written · {money(at.total)} so far</div>
              {sales.goal ? <div className="tabular-nums text-muted-foreground">Goal pace {money(pace(at.month))}</div> : null}
            </div>
          ) : null}
          <div className="mt-1 flex justify-between text-[0.66rem] text-muted-foreground">
            {points.map((p) => <span key={p.month} className={p.month === thisMonth ? "font-semibold text-foreground" : ""}>{p.label}</span>)}
          </div>
          {sales.written === 0 ? (
            <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-xs text-muted-foreground">
              Premium written from our appointments shows here as you record your sales.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(([label, value, note, accent, key]) => (
            <div key={key} data-sale-stat={key} className="rounded-lg border border-[var(--panel-border)] px-3 py-2">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{value}</div>
              <div className="truncate text-[0.7rem] text-muted-foreground">{note}</div>
            </div>
          ))}
        </div>
        {sales.goal ? (
          <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
            <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--neon-amber)" }} />
            On pace for the goal: {short(sales.goal)} by {points.at(-1)?.label || "December"}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

/** Set the year's premium goal: the client's own, or (with companyId) a client's. */
function GoalButton({ year, goal, companyId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(goal == null ? "" : String(goal));
  const [pending, start] = useTransition();
  const save = (e) => {
    e.preventDefault();
    start(async () => {
      const f = new FormData();
      f.set("year", String(year));
      f.set("goal", value);
      if (companyId) f.set("company_id", String(companyId));
      const result = await setClientGoal(f);
      if (result.ok) {
        toast.success(`Goal for ${year} set to ${money(result.data.goal)}`);
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  };
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setValue(goal == null ? "" : String(goal)); setOpen(true); }} data-set-goal>
        {goal == null ? <Target /> : <Pencil />} {goal == null ? "Set goal" : "Change goal"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Premium goal for {year}</DialogTitle>
            <DialogDescription>The premium you aim to write from our appointments in the twelve months from {year}&apos;s campaign start.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Goal ($)</span>
              <Input name="goal" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 250,000" data-goal-input />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending} data-save-goal>{pending ? "Saving…" : "Save goal"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
