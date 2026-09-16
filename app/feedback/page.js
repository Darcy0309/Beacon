import { Star } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFeedback } from "@/lib/queries";
import { longDate } from "@/lib/display";
import { FB_TONE } from "@/lib/constants";

export const dynamic = "force-dynamic";

function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-4", i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

export default async function FeedbackPage() {
  const { rows, summary } = await getFeedback();

  return (
    <>
      <Topbar title="Client Feedback" sub="Satisfaction across active accounts" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Average rating</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-3xl font-semibold tabular-nums">{summary.avg || "—"}</span>
                <Stars n={Math.round(summary.avg)} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Responses</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{summary.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm font-medium text-muted-foreground">Promoters</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{summary.promoters}%</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.lead?.company_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[f.submitted_by, f.nature?.name, longDate(f.created_at)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {f.fb_status ? (
                      <ToneBadge tone={FB_TONE[f.fb_status.name] ?? "slate"}>
                        {f.fb_status.name}
                      </ToneBadge>
                    ) : null}
                    <Stars n={f.rating ?? 0} />
                  </div>
                </div>
                {f.content ? <p className="mt-3 text-sm text-muted-foreground">{f.content}</p> : null}
                {f.additional_comment ? (
                  <p className="mt-2 text-xs italic text-muted-foreground">{f.additional_comment}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No feedback submitted yet.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
