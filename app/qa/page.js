import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getQaCalls } from "@/lib/queries";
import { fullName, longDate } from "@/lib/display";

export const dynamic = "force-dynamic";

const resultTone = { Passed: "emerald", Review: "amber", Failed: "rose" };

function scoreColor(s) {
  if (s >= 85) return "bg-emerald-500";
  if (s >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export default async function QaPage() {
  const calls = await getQaCalls({ limit: 40 });
  const avg = calls.length
    ? Math.round(calls.reduce((s, c) => s + (c.qa_score ?? 0), 0) / calls.length)
    : 0;
  const passed = calls.filter((c) => c.qa_result === "Passed").length;

  return (
    <>
      <Topbar
        title="Quality QA"
        sub={`${calls.length} scored call reviews · avg ${avg} · ${passed} passed`}
      />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent scored calls</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead className="w-48">Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Call result</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{fullName(q.user)}</TableCell>
                    <TableCell>{q.lead?.company_name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${scoreColor(q.qa_score ?? 0)}`}
                            style={{ width: `${q.qa_score ?? 0}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{q.qa_score ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {q.qa_result ? (
                        <ToneBadge tone={resultTone[q.qa_result] ?? "slate"}>{q.qa_result}</ToneBadge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{q.call_result ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{longDate(q.call_date)}</TableCell>
                  </TableRow>
                ))}
                {calls.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No scored calls yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
