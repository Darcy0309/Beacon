"use client";

import { useState, useTransition } from "react";
import Link from "@/components/shared/intent-link";
import { useNavigationRouter } from "@/components/layout/navigation-progress";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck, ArrowUpRight, ChevronRight, Eraser } from "lucide-react";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { KIND_ICONS, linkLabel } from "@/features/notifications/kinds";
import { clearNotificationHistory, markNotificationRead, markNotificationUnread, markAllNotificationsRead } from "@/features/notifications/actions";
import { announceNotificationsChanged } from "@/features/notifications/active-chat";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";
import { notificationText } from "@/features/notifications/voicemail";

/**
 * The inbox on /notifications. Opening an item shows it in full, with the
 * conversation when a person sent it; the small link beside it jumps straight
 * to what it points at. Unread ones stand out (client, Nov 2026: a bar down
 * the side, a tint and "New"); a read one can be marked unread again to keep
 * it for later; Clear history takes the read ones out (`read`: how many).
 */
export default function NotificationInbox({ rows, unread, read: readTotal = 0, empty }) {
  const router = useNavigationRouter();
  const [readIds, setReadIds] = useState(() => new Set());
  const [unreadIds, setUnreadIds] = useState(() => new Set()); // marked unread here
  const [allRead, setAllRead] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, startTransition] = useTransition();

  const isRead = (n) => !unreadIds.has(n.id) && (allRead || n.read || readIds.has(n.id));
  const drop = (id) => (s) => {
    const next = new Set(s);
    next.delete(id);
    return next;
  };

  const markUnread = (n) => {
    setUnreadIds((s) => new Set(s).add(n.id));
    setReadIds(drop(n.id));
    const f = new FormData();
    f.set("id", String(n.id));
    startTransition(async () => {
      const r = await reach(() => markNotificationUnread(f));
      if (!r.ok) {
        setUnreadIds(drop(n.id));
        toast.error(r.error);
        return;
      }
      announceNotificationsChanged();
      router.refresh();
    });
  };

  const clearHistory = () => startTransition(async () => {
    const r = await reach(() => clearNotificationHistory());
    setClearing(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(r.data.cleared ? `Cleared ${r.data.cleared} read notification${r.data.cleared === 1 ? "" : "s"}` : "Nothing to clear");
    router.refresh();
  });

  const markOne = (n) => {
    if (isRead(n)) return;
    setUnreadIds(drop(n.id));
    setReadIds((s) => new Set(s).add(n.id));
    const f = new FormData();
    f.set("id", String(n.id));
    startTransition(async () => {
      const r = await reach(() => markNotificationRead(f));
      if (!r.ok) {
        // Not marked after all: show it unread again, and say so.
        setReadIds((s) => {
          const next = new Set(s);
          next.delete(n.id);
          return next;
        });
        toast.error(r.error);
        return;
      }
      announceNotificationsChanged();
      router.refresh();
    });
  };

  // The detail page marks it read on the server; just show it read here.
  const open = (n) => {
    if (!isRead(n)) setReadIds((s) => new Set(s).add(n.id));
    router.push(`/notifications/${n.id}`);
  };

  const markAll = () => {
    setAllRead(true);
    startTransition(async () => {
      const r = await reach(() => markAllNotificationsRead());
      if (!r.ok) {
        setAllRead(false);
        toast.error(r.error);
        return;
      }
      announceNotificationsChanged();
      router.refresh();
    });
  };

  // `unread` is the server's count. Adjust for what was marked here and the
  // server does not know yet: once the page refreshes, those rows come back as marked.
  const markedRead = rows.filter((r) => !r.read && isRead(r)).length;
  const markedUnread = rows.filter((r) => r.read && !isRead(r)).length;
  const remaining = allRead ? rows.filter((r) => !isRead(r)).length : Math.max(0, unread - markedRead + markedUnread);
  const clearable = Math.max(0, readTotal + markedRead - markedUnread);

  return (
    <div>
      {remaining > 0 || clearable > 0 ? (
        <div className="flex justify-end gap-5 border-b border-[var(--panel-border)] px-5 py-2">
          {clearable > 0 ? (
            <button
              type="button"
              onClick={() => setClearing(true)}
              disabled={busy}
              data-clear-history
              className="flex cursor-pointer items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-destructive"
            >
              <Eraser className="size-3.5" /> Clear history
            </button>
          ) : null}
          {remaining > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="flex cursor-pointer items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-primary transition-opacity hover:opacity-75"
            >
              <CheckCheck className="size-3.5" /> Mark all {remaining} read
            </button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog open={clearing} onOpenChange={setClearing} pending={busy} confirm="Clear history" icon={<Eraser />}
        title="Clear your notification history?"
        description={`The ${clearable} notification${clearable === 1 ? "" : "s"} you've read come out of your inbox. Unread ones stay. This can't be undone.`}
        onConfirm={clearHistory} />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center text-sm text-muted-foreground">
          <BellOff className="size-6" />
          {empty}
        </div>
      ) : (
        <ul>
          {rows.map((n) => {
            const Icon = KIND_ICONS[n.kind] ?? Bell;
            const read = isRead(n);
            return (
              <li key={n.id} data-list-row data-notification={n.id} data-unread={read ? undefined : ""}
                className={cn("flex items-start gap-4 border-b border-l-4 border-[var(--panel-border)] px-5 py-3.5 last:border-b-0",
                  read ? "border-l-transparent" : "border-l-primary bg-primary/10")}>
                <span className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  read ? "border-[var(--panel-border)] text-muted-foreground" : "border-primary/40 text-primary"
                )}>
                  <Icon className="size-4" />
                </span>
                <button type="button" onClick={() => open(n)} className="group min-w-0 flex-1 cursor-pointer text-left">
                  <span className={cn("flex items-center gap-1.5 text-sm", read ? "text-muted-foreground" : "font-semibold text-foreground")}>
                    {read ? null : <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-wider text-primary-foreground" data-new>New</span>}
                    <span className="truncate">{notificationText(n).title}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                  {notificationText(n).body ? <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{notificationText(n).body}</span> : null}
                  <span className="mt-1 block text-[0.7rem] text-muted-foreground">
                    {n.from ? `From ${n.from} · ` : ""}
                    {n.when}
                    {n.kind === "message" ? " · Open to reply" : ""}
                  </span>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                  {n.link ? (
                    <Link
                      href={n.link}
                      onClick={() => markOne(n)}
                      className="flex items-center gap-1 rounded-md border border-[var(--panel-border)] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-primary transition-colors hover:border-primary/40"
                    >
                      {linkLabel(n.link)} <ArrowUpRight className="size-3" />
                    </Link>
                  ) : null}
                  {read ? (
                    <button
                      type="button"
                      onClick={() => markUnread(n)}
                      data-mark-unread={n.id}
                      title="Keep it for later: it shows as new again"
                      className="cursor-pointer rounded-md border border-[var(--panel-border)] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      Mark unread
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => markOne(n)}
                      data-mark-read={n.id}
                      className="cursor-pointer rounded-md border border-[var(--panel-border)] px-2 py-1 text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
