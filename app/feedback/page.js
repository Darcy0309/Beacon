import { Star, MessageSquareText, ThumbsUp, Inbox } from "lucide-react";
import Topbar from "@/components/topbar";
import ToneBadge from "@/components/tone-badge";
import StatTile from "@/components/stat-tile";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getFeedback } from "@/lib/queries";

export const dynamic = "force-dynamic";

const statusTone = { Open: "amber", "In review": "cyan", Resolved: "emerald", Closed: "slate" };

function Stars({ n }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3.5", i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
      ))}
    </div>
  );
}

export default async function FeedbackPage() {
  const { feedback, summary } = await getFeedback();
  const ratings = feedback.map((f) => f.rating);
  const open = feedback.filter((f) => f.status === "Open" || f.status === "In review").length;

  const tiles = [
    { label: "Average Rating", value: summary.avg ? String(summary.avg) : "—", note: "out of 5",
      icon: Star, accent: "var(--neon-amber)", series: ratings.slice().reverse(), bars: true },
    { label: "Responses", value: String(summary.total), note: "from client contacts",
      icon: MessageSquareText, accent: "var(--neon-cyan)", series: ratings.map((_, i) => i + 1) },
    { label: "Promoters", value: `${summary.promoters}%`, note: "rated 4 or 5",
      icon: ThumbsUp, accent: "var(--neon-emerald)", series: ratings.slice().reverse().map((r) => (r >= 4 ? 1 : 0)), bars: true },
    { label: "Awaiting Action", value: String(open), note: "open or in review",
      icon: Inbox, accent: "var(--neon-violet)", series: feedback.map((f) => (f.status === "Resolved" ? 0 : 1)).reverse(), bars: true },
  ];

  return (
    <>
      <Topbar title="Client Feedback" sub="Satisfaction across active accounts" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        <Card>
          <SectionHeader label="Recent Feedback" icon={MessageSquareText} />
          <div className="divide-y divide-[var(--panel-border)]">
            {feedback.map((f) => (
              <div key={f.id} data-list-row className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{f.client}</div>
                    <div className="text-xs text-muted-foreground">
                      {[f.contact, f.nature, f.date].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ToneBadge tone={statusTone[f.status] ?? "slate"}>{f.status}</ToneBadge>
                    <Stars n={f.rating} />
                  </div>
                </div>
                {f.text ? <p className="mt-2.5 text-sm text-muted-foreground">{f.text}</p> : null}
              </div>
            ))}
            {feedback.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No feedback submitted yet.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
