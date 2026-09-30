"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/role-provider";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/actions";
import { KIND_ICONS } from "@/lib/notification-kinds";
import { isActiveChat, NOTIFICATIONS_CHANGED } from "@/lib/active-chat";
import { cn } from "@/lib/utils";

const SHOWN = 8;
const POLL_MS = 60_000;
const COLUMNS = "id, kind, sender_id, title, body, link, read_at, created_at";

function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** One pop-up per notification, so reading it anywhere can take its pop-up away. */
const toastId = (id) => `notification-${id}`;

const formOf = (id) => {
  const f = new FormData();
  f.set("id", String(id));
  return f;
};

/**
 * The bell in the top bar. Loads the latest notifications straight from
 * Supabase (Row Level Security keeps it to the user's own inbox), listens on
 * Realtime so new ones arrive — and pop up — without a page load, and falls
 * back to refreshing on focus and every minute if the live connection drops.
 *
 * Reading a notification anywhere — here, the inbox, its own page, another
 * tab — clears it from the count and takes down its pop-up: the database
 * change arrives over Realtime, and same-tab readers also announce it.
 */
export default function NotificationBell() {
  const router = useRouter();
  const { user } = useRole();
  const me = user?.id ?? null;
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const popups = useRef(new Set()); // notification ids with a pop-up on screen
  const known = useRef(new Set()); // ids already counted, so a late live event is not counted twice
  const announced = useRef(new Set()); // ids that have had their pop-up
  const reloadTimer = useRef(null);

  const dismissPopup = useCallback((id) => {
    toast.dismiss(toastId(id));
    popups.current.delete(id);
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    const [list, count] = await Promise.all([
      supabase.from("notifications").select(COLUMNS).eq("user_id", me)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(SHOWN),
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", me).is("read_at", null),
    ]);
    if (!list.error) {
      setItems(list.data ?? []);
      for (const x of list.data ?? []) known.current.add(x.id);
      for (const x of list.data ?? []) if (x.read_at) dismissPopup(x.id);
    }
    if (!count.error) {
      setUnread(count.count ?? 0);
      if (!count.count) [...popups.current].forEach(dismissPopup);
    }
  }, [me, supabase, dismissPopup]);

  // "Mark all read" changes many rows at once; count again once they settle.
  const reloadSoon = useCallback(() => {
    clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(load, 300);
  }, [load]);

  // Every notification opens on its own page: the full text, who sent it,
  // where it points, and the conversation with the sender.
  const openItem = useCallback(
    async (n) => {
      setOpen(false);
      dismissPopup(n.id);
      if (!n.read_at) {
        setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
        setUnread((u) => Math.max(0, u - 1));
        markNotificationRead(formOf(n.id));
      }
      router.push(`/notifications/${n.id}`);
    },
    [router, dismissPopup]
  );

  // First load, the live subscription, and the fallbacks.
  useEffect(() => {
    if (!me) return;
    let channel;
    let cancelled = false;

    (async () => {
      await load();
      const { data: { session } = {} } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`notifications:${me}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
          ({ new: n }) => {
            setItems((xs) => [n, ...xs.filter((x) => x.id !== n.id)].slice(0, SHOWN));
            // Already reading the conversation it belongs to: the conversation marks
            // it read and tells the bell, so no pop-up and no count in between.
            if (n.kind === "message" && isActiveChat(n.sender_id)) return;
            // The database has the true count; the live event only makes it show sooner.
            reloadSoon();
            // Count it, unless a load that ran moments before this event already did.
            if (!known.current.has(n.id)) {
              known.current.add(n.id);
              setUnread((u) => u + 1);
            }
            // One pop-up per notification, however many times its event arrives.
            if (announced.current.has(n.id)) return;
            announced.current.add(n.id);
            popups.current.add(n.id);
            toast(n.title, {
              id: toastId(n.id),
              description: n.body || undefined,
              icon: (() => {
                const Icon = KIND_ICONS[n.kind] ?? Bell;
                return <Icon className="size-4 text-primary" />;
              })(),
              action: { label: n.kind === "message" ? "Reply" : "View", onClick: () => openItem(n) },
              duration: 8000,
              onDismiss: () => popups.current.delete(n.id),
              onAutoClose: () => popups.current.delete(n.id),
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
          ({ new: n }) => {
            if (!n.read_at) return;
            dismissPopup(n.id);
            setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: n.read_at } : x)));
            reloadSoon();
          }
        )
        .subscribe();
    })();

    const onFocus = () => load();
    const timerRef = reloadTimer;
    window.addEventListener("focus", onFocus);
    window.addEventListener(NOTIFICATIONS_CHANGED, onFocus);
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onFocus);
      clearInterval(timer);
      clearTimeout(timerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [me, supabase, load, reloadSoon, openItem, dismissPopup]);

  const markAll = async () => {
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
    [...popups.current].forEach(dismissPopup);
    await markAllNotificationsRead();
    router.refresh(); // the inbox page, if it is open, shows them read too
  };

  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex size-9 cursor-pointer items-center justify-center rounded-md border border-[var(--panel-border)] bg-card/80 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-primary active:scale-95"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-bold tabular-nums text-accent-foreground shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-[var(--panel-border)] px-4 py-2.5">
          <span className="eyebrow">Notifications{unread ? ` · ${unread} new` : ""}</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={markAll}
              className="flex cursor-pointer items-center gap-1 text-[0.66rem] font-bold uppercase tracking-[0.1em] text-primary transition-opacity hover:opacity-75"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          ) : null}
        </div>

        <div className="max-h-[26rem] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <BellOff className="size-5" />
              You&apos;re all caught up.
            </div>
          ) : (
            items.map((n) => {
              const Icon = KIND_ICONS[n.kind] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60",
                    !n.read_at && "bg-primary/5"
                  )}
                >
                  <span className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                    n.read_at ? "border-[var(--panel-border)] text-muted-foreground" : "border-primary/40 text-primary"
                  )}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm", n.read_at ? "text-foreground/80" : "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="mt-0.5 block text-[0.66rem] text-muted-foreground">{ago(n.created_at)}</span>
                  </span>
                  {!n.read_at ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                </button>
              );
            })
          )}
        </div>

        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t border-[var(--panel-border)] px-4 py-2.5 text-center text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
