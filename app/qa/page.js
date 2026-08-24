import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { qaCalls } from "@/lib/data";

const resultTone = { Passed: "emerald", Review: "amber", Failed: "rose" };
function scoreColor(s) {
  if (s >= 85) return "bg-emerald-500";
  if (s >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export default function QaPage() {
  return (
    <>
      <Topbar title="Quality QA" sub="Scored call reviews across the team" />
      <div className="flex-1 p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle>Recent scored calls</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="w-48">Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {qaCalls.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{q.rep}</TableCell>
                    <TableCell>{q.client}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${scoreColor(q.score)}`} style={{ width: `${q.score}%` }} />
                        </div>
                        <span className="tabular-nums text-muted-foreground">{q.score}</span>
                      </div>
                    </TableCell>
                    <TableCell><ToneBadge tone={resultTone[q.result]}>{q.result}</ToneBadge></TableCell>
                    <TableCell className="text-muted-foreground">{q.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
