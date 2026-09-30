import Link from "next/link";
import { Bell, Send, MailCheck, ChevronLeft, ChevronRight, Check } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import NotificationInbox from "@/features/notifications/components/notification-inbox";
import NotificationComposer from "@/features/notifications/components/notification-composer";
import { Card } from "@/components/ui/card";
import { getInbox, getSentNotifications, getMessageRecipients } from "@/features/notifications/queries";
import { getCurrentUser } from "@/lib/server/session";
import { readListParams, pageInfo } from "@/lib/paging";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;
const ROLE_LABEL = { admin: "Admin", manager: "Manager", agent: "Agent", client: "Client" };

function Tab({ href, active, children }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </Link>
  );
}

/** Read receipts for one message: "Read by 3 of 5", expandable to who. */
function SentItem({ b }) {
  const all = b.read === b.total;
  return (
    <details data-list-row className="group border-b border-[var(--panel-border)] px-5 py-3 last:border-0">
      <summary className="flex cursor-pointer list-none items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border", all ? "border-emerald-400/40 text-emerald-400" : "border-[var(--panel-border)] text-muted-foreground")}>
          <MailCheck className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{b.title}</span>
          <span className="text-xs text-muted-foreground">{b.when}</span>
        </span>
        <span className={cn("shrink-0 text-xs font-semibold tabular-nums", all ? "text-emerald-400" : "text-amber-400")}>
          Read by {b.read} of {b.total}
        </span>
      </summary>
      <div className="mt-3 space-y-1 pl-11">
        {b.body ? <p className="mb-2 whitespace-pre-line text-sm text-muted-foreground">{b.body}</p> : null}
        {b.recipients.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <span>{r.name} <span className="text-muted-foreground">· {ROLE_LABEL[r.role] ?? r.role}</span></span>
            {r.read_at ? (
              <span className="flex items-center gap-1 text-emerald-400"><Check className="size-3" /> Read {r.readWhen}</span>
            ) : (
              <span className="text-muted-foreground">Not yet read</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function NotificationsPage({ searchParams }) {
  const sp = await searchParams;
  const unreadOnly = sp?.show === "unread";
  const { page } = readListParams(sp);
  const me = await getCurrentUser();
  const canSend = me?.role === "admin" || me?.role === "manager";

  const [inbox, sent, people] = await Promise.all([
    getInbox({ page, perPage: PER_PAGE, unreadOnly }),
    canSend ? getSentNotifications(15) : [],
    canSend ? getMessageRecipients() : [],
  ]);
  const info = pageInfo(inbox.total, page, PER_PAGE);
  const href = (params) => {
    const q = new URLSearchParams();
    if (params.show) q.set("show", params.show);
    if (params.page > 1) q.set("page", String(params.page));
    const s = q.toString();
    return s ? `/notifications?${s}` : "/notifications";
  };
  const show = unreadOnly ? "unread" : undefined;

  return (
    <>
      <Topbar title="Notifications" sub={inbox.unread ? `${inbox.unread} unread` : "You're all caught up"} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className={cn("grid grid-cols-1 gap-4", canSend && "xl:grid-cols-5")}>
          <Card className={cn(canSend && "xl:col-span-3")}>
            <SectionHeader
              label="Inbox"
              icon={Bell}
              action={
                <div className="flex gap-2">
                  <Tab href={href({})} active={!unreadOnly}>All</Tab>
                  <Tab href={href({ show: "unread" })} active={unreadOnly}>Unread{inbox.unread ? ` ${inbox.unread}` : ""}</Tab>
                </div>
              }
            />
            <NotificationInbox
              key={`${unreadOnly}-${info.page}`}
              rows={inbox.rows}
              unread={inbox.unread}
              empty={unreadOnly ? "Nothing unread." : "No notifications yet. They'll appear here and in the bell."}
            />
            {info.pages > 1 ? (
              <nav aria-label="Pagination" className="flex items-center justify-between border-t border-[var(--panel-border)] px-5 py-3 text-xs text-muted-foreground">
                <span className="tabular-nums">{info.from}–{info.to} of {info.total}</span>
                <div className="flex gap-1">
                  {info.page > 1 ? (
                    <Link href={href({ show, page: info.page - 1 })} aria-label="Previous page" className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] hover:border-primary/40 hover:text-primary"><ChevronLeft className="size-3.5" /></Link>
                  ) : null}
                  {info.page < info.pages ? (
                    <Link href={href({ show, page: info.page + 1 })} aria-label="Next page" className="flex size-7 items-center justify-center rounded-md border border-[var(--panel-border)] hover:border-primary/40 hover:text-primary"><ChevronRight className="size-3.5" /></Link>
                  ) : null}
                </div>
              </nav>
            ) : null}
          </Card>

          {canSend ? (
            <div className="space-y-4 xl:col-span-2">
              <Card className="overflow-visible">
                <SectionHeader label="Send a notification" icon={Send} />
                <NotificationComposer people={people.filter((p) => p.id !== me.id)} />
              </Card>
              <Card>
                <SectionHeader label="Sent" icon={MailCheck} />
                {sent.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">Messages you send appear here, with who has read them.</p>
                ) : (
                  sent.map((b) => <SentItem key={b.batch} b={b} />)
                )}
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
