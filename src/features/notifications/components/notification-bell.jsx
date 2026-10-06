"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "@/components/shared/intent-link";
import { toast } from "sonner";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/layout/role-provider";
import { markNotificationRead, markAllNotificationsRead } from "@/features/notifications/actions";
import { KIND_ICONS } from "@/features/notifications/kinds";
import { isActiveChat, NOTIFICATIONS_CHANGED } from "@/features/notifications/active-chat";
import { showDesktop, trackFrontTab } from "@/features/notifications/desktop";
import DesktopSwitch from "@/features/notifications/components/desktop-switch";
import { cn } from "@/lib/utils";

const SHOWN = 8;
const POLL_MS = 60_000;
const COLUMNS = "id, kind, sender_id, sender_name, title, body, link, read_at, created_at";
// Hover intent: a pointer passing over the bell does not open it, and the
// panel stays while the pointer crosses from the bell into it.
const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 300;

// Every page draws its own top bar, so the bell mounts afresh on each
// navigation. The count it last showed lives here, outside the component,
// so the badge shakes when the count goes up, not on every page change.
let lastCount = 0;
// The desktop pop-ups still up, by notification id: kept across pages too,
// so reading one after a page change still takes its pop-up down.
const desktop = { current: new Map() };

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
 * The bell in the top bar. Loads the unread notifications straight from
 * Supabase (Row Level Security keeps it to the user's own inbox), listens on
 * Realtime so new ones arrive — and pop up — without a page load, and falls
 * back to refreshing on focus and every minute if the live connection drops.
 *
 * Reading a notification anywhere — here, the inbox, its own page, another
 * tab — takes it off the bell's list and count and takes down its pop-up:
 * the database change arrives over Realtime, and same-tab readers also
 * announce it. The inbox (/notifications) keeps the read ones.
 *
 * The panel opens on click, or when a mouse rests on the bell; one opened
 * by hovering closes when the pointer leaves, one opened by click stays
 * until clicked again, Escape, a click elsewhere, or a page change.
 */
export default function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useRole();
  const me = user?.id ?? null;
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  // null when shut; "hover" or "click" for how it was opened.
  const [openedBy, setOpenedBy] = useState(null);
  const open = openedBy !== null;
  const [shake, setShake] = useState(0);
  const popups = useRef(new Map()); // notification id -> when its pop-up went up
  const known = useRef(new Set()); // ids already counted, so a late live event is not counted twice
  const announced = useRef(new Set()); // ids that have had their pop-up
  const reloadTimer = useRef(null);
  const loaded = useRef(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const hoverTimer = useRef(null);
  const panelId = useId();

  const setOpen = useCallback((value) => setOpenedBy(value ? "click" : null), []);

  const dismissPopup = useCallback((id) => {
    toast.dismiss(toastId(id));
    popups.current.delete(id);
    desktop.current.get(id)?.close();
    desktop.current.delete(id);
  }, []);

  // Which Lighthouse tab is in front, so only nobody-looking shows a desktop pop-up.
  useEffect(() => trackFrontTab(), []);

  // The bell lists unread notifications only: once read, one leaves the list
  // (the inbox keeps them all).
  const load = useCallback(async () => {
    if (!me) return;
    const started = Date.now();
    const [list, count] = await Promise.all([
      supabase.from("notifications").select(COLUMNS).eq("user_id", me).is("read_at", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(SHOWN),
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", me).is("read_at", null),
    ]);
    // A pop-up whose notification is no longer unread was read somewhere else.
    // Only pop-ups older than this load: a newer one may simply not be in it yet.
    const stale = (keep) => {
      for (const [id, at] of popups.current) if (at < started && !keep.has(id)) dismissPopup(id);
    };
    if (!list.error) {
      setItems(list.data ?? []);
      for (const x of list.data ?? []) known.current.add(x.id);
      stale(new Set((list.data ?? []).map((x) => x.id)));
    }
    if (!count.error) {
      loaded.current = true;
      setUnread(count.count ?? 0);
      if (!count.count) stale(new Set());
    }
  }, [me, supabase, dismissPopup]);

  // Shake the badge when the count goes up: when it first appears, and for
  // each new arrival. Not before the first load, whose 0 is only a placeholder.
  useEffect(() => {
    if (!loaded.current) return;
    if (unread > lastCount) setShake((n) => n + 1);
    lastCount = unread;
  }, [unread]);

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
        setItems((xs) => xs.filter((x) => x.id !== n.id));
        setUnread((u) => Math.max(0, u - 1));
        markNotificationRead(formOf(n.id));
      }
      router.push(`/notifications/${n.id}`);
    },
    [router, dismissPopup, setOpen]
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
            // Already reading the conversation it belongs to: the conversation marks
            // it read and tells the bell, so it is never listed, popped up or counted.
            if (n.kind === "message" && isActiveChat(n.sender_id)) return;
            setItems((xs) => [n, ...xs.filter((x) => x.id !== n.id)].slice(0, SHOWN));
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
            popups.current.set(n.id, Date.now());
            // Nobody looking at Lighthouse: the system's own pop-up too (desktop.js).
            const shown = showDesktop(n, () => openItem(n));
            if (shown) {
              desktop.current.set(n.id, shown);
              shown.onclose = () => desktop.current.delete(n.id);
            }
            toast(n.title, {
              id: toastId(n.id),
              description:
                n.sender_name || n.body ? (
                  <>
                    {n.sender_name ? <span className="block font-medium">From {n.sender_name}</span> : null}
                    {n.body ? <span className="line-clamp-3">{n.body}</span> : null}
                  </>
                ) : undefined,
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
            setItems((xs) => xs.filter((x) => x.id !== n.id));
            reloadSoon(); // the count, and the next unread one to fill the list
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
    setItems([]);
    setUnread(0);
    [...popups.current.keys()].forEach(dismissPopup);
    await markAllNotificationsRead();
    router.refresh(); // the inbox page, if it is open, shows them read too
  };

  // Fresh items every time the panel opens.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // A new page closes it.
  useEffect(() => {
    setOpenedBy(null);
  }, [pathname]);

  // Escape, or a press anywhere outside the bell and its panel, closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpenedBy(null);
      if (rootRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpenedBy(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  // Hover only for a mouse: on touch the first tap is the click.
  const onPointerEnter = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    if (!open) hoverTimer.current = setTimeout(() => setOpenedBy((o) => o ?? "hover"), HOVER_OPEN_MS);
  };
  const onPointerLeave = (e) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(hoverTimer.current);
    if (openedBy === "hover") {
      hoverTimer.current = setTimeout(() => setOpenedBy((o) => (o === "hover" ? null : o)), HOVER_CLOSE_MS);
    }
  };
  // A click on a panel that hovering opened keeps it open; otherwise it toggles.
  const onButtonClick = () => {
    clearTimeout(hoverTimer.current);
    setOpenedBy((o) => (o === "hover" ? "click" : o ? null : "click"));
  };

  return (
    <div ref={rootRef} className="relative" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onButtonClick}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          "relative flex size-9 cursor-pointer items-center justify-center rounded-md border border-[var(--panel-border)] bg-card/80 text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:text-primary active:scale-95",
          open && "border-primary/40 text-primary"
        )}
      >
        <Bell key={`bell-${shake}`} className={cn("size-4", shake > 0 && "animate-bell-ring")} />
        {unread > 0 ? (
          <span
            key={`badge-${shake}`}
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.6rem] font-bold tabular-nums text-accent-foreground shadow",
              shake > 0 && "animate-badge-shake"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        // The top padding bridges the gap to the bell, so the pointer never leaves.
        <div className="absolute right-0 top-full z-50 pt-1.5">
          <div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            data-notification-panel=""
            className="animate-popover-in w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
          >
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
                      className="flex w-full cursor-pointer items-start gap-3 rounded-lg bg-primary/5 px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/40 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{n.title}</span>
                        {n.body ? <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span> : null}
                        <span className="mt-0.5 block truncate text-[0.66rem] text-muted-foreground">
                          {n.sender_name ? `From ${n.sender_name} · ` : ""}
                          {ago(n.created_at)}
                        </span>
                      </span>
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    </button>
                  );
                })
              )}
            </div>

            <DesktopSwitch className="border-t border-[var(--panel-border)] px-4 py-2.5" />

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t border-[var(--panel-border)] px-4 py-2.5 text-center text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-primary"
            >
              {unread > items.length ? `View all · ${unread - items.length} more unread` : "View all notifications"}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
