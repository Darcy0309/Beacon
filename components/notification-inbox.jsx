"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck, ArrowUpRight, ChevronRight } from "lucide-react";
import { KIND_ICONS, linkLabel } from "@/lib/notification-kinds";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * The inbox on /notifications. Opening an item shows it in full, with the
 * conversation when a person sent it; the small link beside it jumps straight
 * to what it points at.
 */
export default function NotificationInbox({ rows, unread, empty }) {
  const router = useRouter();
  const [readIds, setReadIds] = useState(() => new Set());
  const [allRead, setAllRead] = useState(false);
  const [, startTransition] = useTransition();

  const isRead = (n) => allRead || n.read || readIds.has(n.id);

  const markOne = (n) => {
    if (isRead(n)) return;
    setReadIds((s) => new Set(s).add(n.id));
    const f = new FormData();
    f.set("id", String(n.id));
    startTransition(async () => {
      await markNotificationRead(f);
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
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  const remaining = allRead ? 0 : Math.max(0, unread - [...readIds].length);

  return (
    <div>
      {remaining > 0 ? (
        <div className="flex justify-end border-b border-[var(--panel-border)] px-5 py-2">
          <button
            type="button"
            onClick={markAll}
            className="flex cursor-pointer items-center gap-1.5 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-primary transition-opacity hover:opacity-75"
          >
            <CheckCheck className="size-3.5" /> Mark all {remaining} read
          </button>
        </div>
      ) : null}

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
              <li key={n.id} data-list-row className={cn("flex items-start gap-4 border-b border-[var(--panel-border)] px-5 py-3.5 last:border-0", !read && "bg-primary/5")}>
                <span className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  read ? "border-[var(--panel-border)] text-muted-foreground" : "border-primary/40 text-primary"
                )}>
                  <Icon className="size-4" />
                </span>
                <button type="button" onClick={() => open(n)} className="group min-w-0 flex-1 cursor-pointer text-left">
                  <span className={cn("flex items-center gap-1 text-sm", read ? "text-foreground/85" : "font-semibold")}>
                    <span className="truncate">{n.title}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                  {n.body ? <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{n.body}</span> : null}
                  <span className="mt-1 block text-[0.7rem] text-muted-foreground">
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
                  {read ? null : (
                    <button
                      type="button"
                      onClick={() => markOne(n)}
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
