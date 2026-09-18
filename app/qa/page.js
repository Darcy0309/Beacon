import { ClipboardCheck, Gauge, CheckCheck, AlertTriangle } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/filter-table";
import { getQaCalls } from "@/lib/queries";

export const dynamic = "force-dynamic";

const resultTone = { Passed: "emerald", Review: "amber", Failed: "rose" };
const scoreColor = (s) => (s >= 85 ? "var(--neon-emerald)" : s >= 70 ? "var(--neon-amber)" : "var(--neon-rose)");

export default async function QaPage() {
  const calls = await getQaCalls({ limit: 40 });
  const avg = calls.length ? Math.round(calls.reduce((s, c) => s + c.score, 0) / calls.length) : 0;
  const passed = calls.filter((c) => c.result === "Passed").length;
  const review = calls.filter((c) => c.result === "Review").length;
  const failed = calls.filter((c) => c.result === "Failed").length;
  const scores = calls.map((c) => c.score).reverse();

  const tiles = [
    { label: "Calls Scored", value: String(calls.length), note: "recent reviews",
      icon: ClipboardCheck, accent: "var(--neon-cyan)", series: scores, bars: true },
    { label: "Average Score", value: String(avg), note: "out of 100",
      icon: Gauge, accent: "var(--neon-amber)", series: scores },
    { label: "Passed", value: String(passed), note: `${calls.length ? Math.round((passed / calls.length) * 100) : 0}% pass rate`,
      icon: CheckCheck, accent: "var(--neon-emerald)", series: calls.map((c) => (c.result === "Passed" ? 1 : 0)).reverse(), bars: true },
    { label: "Needs Attention", value: String(review + failed), note: `${review} review · ${failed} failed`,
      icon: AlertTriangle, accent: "var(--neon-rose)", series: calls.map((c) => (c.result !== "Passed" ? 1 : 0)).reverse(), bars: true },
  ];

  return (
    <>
      <Topbar title="Quality QA" sub={`${calls.length} scored call reviews · avg ${avg}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Recent Scored Calls" icon={ClipboardCheck} />
          <FilterTable
            columns={["Rep", "Client", { label: "Score", className: "w-56" }, "Result", "Date"]}
            filters={[
              { key: "result", label: "Result" },
              { key: "rep", label: "Rep", kind: "select" },
              { key: "client", label: "Client", kind: "select" },
            ]}
            placeholder="Search scored calls…"
            empty="No scored calls yet."
            rows={calls.map((q) => ({
              id: q.id,
              search: `${q.rep} ${q.client} ${q.result} ${q.score}`,
              facets: { result: q.result, rep: q.rep, client: q.client },
              node: (
                <TableRow>
                  <TableCell className="font-medium">{q.rep}</TableCell>
                  <TableCell>{q.client}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${q.score}%`, background: scoreColor(q.score), boxShadow: `0 0 10px -2px ${scoreColor(q.score)}` }} />
                      </div>
                      <span className="font-semibold tabular-nums" style={{ color: scoreColor(q.score) }}>{q.score}</span>
                    </div>
                  </TableCell>
                  <TableCell><ToneBadge tone={resultTone[q.result] ?? "slate"}>{q.result}</ToneBadge></TableCell>
                  <TableCell className="text-muted-foreground">{q.date}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
