import { Star } from "lucide-react";
import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { feedback, feedbackSummary } from "@/lib/data";

function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-4", i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <>
      <Topbar title="Client Feedback" sub="Satisfaction across active accounts" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card><CardContent className="p-5"><div className="text-sm font-medium text-muted-foreground">Average rating</div><div className="mt-2 flex items-end gap-2"><span className="text-3xl font-semibold tabular-nums">{feedbackSummary.avg}</span><Stars n={Math.round(feedbackSummary.avg)} /></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm font-medium text-muted-foreground">Responses</div><div className="mt-2 text-3xl font-semibold tabular-nums">{feedbackSummary.total}</div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="text-sm font-medium text-muted-foreground">Promoters</div><div className="mt-2 text-3xl font-semibold tabular-nums">{feedbackSummary.promoters}%</div></CardContent></Card>
        </div>

        <div className="space-y-3">
          {feedback.map((f) => (
            <Card key={f.client}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.client}</div>
                    <div className="text-xs text-muted-foreground">{f.contact} · {f.date}</div>
                  </div>
                  <Stars n={f.rating} />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{f.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
