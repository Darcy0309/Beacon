import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, ChevronLeft, ArrowUpRight, MessageSquare } from "lucide-react";
import Topbar from "@/components/topbar";
import SectionHeader from "@/components/section-header";
import LocalTime from "@/components/local-time";
import MarkThreadRead from "@/components/mark-thread-read";
import NotificationThread from "@/components/notification-thread";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getNotificationThread } from "@/lib/queries";
import { KIND_ICONS, KIND_LABELS, ROLE_LABELS, linkLabel } from "@/lib/notification-kinds";
import { colorFor } from "@/lib/display";

export const dynamic = "force-dynamic";

/**
 * One notification in full: what it says, who sent it and when, and where it
 * points. When a person sent it, the conversation with them sits beside it
 * with a reply box.
 */
export default async function NotificationPage({ params }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) notFound();
  const thread = await getNotificationThread(Number(id));
  if (!thread) notFound();

  const { notification: n, person, messages } = thread;
  const Icon = KIND_ICONS[n.kind] ?? Bell;

  return (
    <>
      <Topbar title="Notification" sub={KIND_LABELS[n.kind] ?? "Notification"} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href="/notifications"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronLeft className="size-3.5" /> All notifications
        </Link>

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-5">
          <Card className={person ? "xl:col-span-2" : "xl:col-span-5 xl:max-w-3xl"}>
            <SectionHeader label={KIND_LABELS[n.kind] ?? "Notification"} icon={Icon} />
            <div className="space-y-5 p-5">
              <h2 className="text-lg font-semibold leading-snug">{n.title}</h2>

              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
                <dt className="eyebrow">From</dt>
                <dd className="flex min-w-0 items-center gap-2">
                  {person ? (
                    <>
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold text-white"
                        style={{ background: colorFor(person.name) }}
                      >
                        {person.initials}
                      </span>
                      <span className="min-w-0 break-words">
                        {person.name}
                        <span className="text-muted-foreground"> · {ROLE_LABELS[person.role] ?? person.role}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Lighthouse (automatic)</span>
                  )}
                </dd>
                <dt className="eyebrow">Received</dt>
                <dd><LocalTime iso={n.created_at} /></dd>
              </dl>

              {n.body ? (
                <p className="whitespace-pre-line break-words rounded-lg border border-[var(--panel-border)] bg-muted/30 px-4 py-3 text-sm leading-relaxed">
                  {n.body}
                </p>
              ) : null}

              {n.link ? (
                <Button asChild>
                  <Link href={n.link}>
                    {linkLabel(n.link)} <ArrowUpRight />
                  </Link>
                </Button>
              ) : null}
            </div>
          </Card>

          {person ? (
            <Card className="xl:col-span-3">
              <SectionHeader label={`Conversation with ${person.name}`} icon={MessageSquare} />
              <NotificationThread
                anchorId={n.id}
                anchorUnread={!n.read_at}
                person={person}
                messages={messages}
              />
            </Card>
          ) : !n.read_at ? (
            <MarkThreadRead id={n.id} />
          ) : null}
        </div>
      </div>
    </>
  );
}
