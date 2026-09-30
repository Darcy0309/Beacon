"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2, MessageSquare, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMounted } from "@/components/shared/local-time";
import { useRole } from "@/components/layout/role-provider";
import { createClient } from "@/lib/supabase/client";
import { replyToNotification, markThreadRead } from "@/features/notifications/actions";
import { setActiveChat, announceNotificationsChanged } from "@/features/notifications/active-chat";
import { cn } from "@/lib/utils";

const MAX = 1000;

// Postgres and the browser write timestamps differently ("+00:00" vs "Z"), so compare as dates.
const byTime = (a, b) =>
  new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/**
 * The conversation between the signed-in user and whoever sent a
 * notification, with a reply box. New messages from them and read receipts
 * for yours arrive live; the page also refreshes on focus in case the live
 * connection dropped.
 */
export default function NotificationThread({ anchorId, anchorUnread, person, messages: initial }) {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useRole();
  const me = user?.id ?? null;
  const [extra, setExtra] = useState([]); // sent or received since the page loaded
  const [seen, setSeen] = useState({}); // read receipts that arrived live: id -> read_at
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const listRef = useRef(null);
  const marked = useRef(new Set());
  const first = person.name.split(" ")[0];

  // The server's copy wins for anything it already has; live additions fill in the rest.
  const messages = useMemo(() => {
    const byId = new Map();
    for (const m of [...extra, ...initial]) byId.set(m.id, m);
    return [...byId.values()]
      .map((m) => (seen[m.id] && !m.read_at ? { ...m, read_at: seen[m.id] } : m))
      .sort(byTime);
  }, [initial, extra, seen]);

  // Reply to their latest message, so the subject follows the conversation.
  const target = [...messages].reverse().find((m) => !m.mine && typeof m.id === "number")?.id ?? anchorId;

  // While this is open, the bell stays quiet about their messages.
  useEffect(() => {
    setActiveChat(person.id);
    return () => setActiveChat(null);
  }, [person.id]);

  // Reading the page reads their messages: on open, and as new ones arrive.
  useEffect(() => {
    const fresh = messages.filter((m) => !m.mine && !m.read_at && typeof m.id === "number" && !marked.current.has(m.id));
    const openAnchor = anchorUnread && !marked.current.has("anchor");
    if (!fresh.length && !openAnchor) return;
    fresh.forEach((m) => marked.current.add(m.id));
    marked.current.add("anchor");
    const f = new FormData();
    f.set("id", String(anchorId));
    markThreadRead(f).then(announceNotificationsChanged);
  }, [messages, anchorId, anchorUnread]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Live: their new messages, and receipts for yours.
  useEffect(() => {
    if (!me) return;
    const supabase = createClient();
    let channel;
    let cancelled = false;
    (async () => {
      const { data: { session } = {} } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`thread:${me}:${person.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${me}` },
          ({ new: n }) => {
            if (n.kind !== "message" || n.sender_id !== person.id) return;
            setExtra((xs) => [...xs, {
              id: n.id, mine: false, title: n.title, body: n.body,
              reply_to: n.reply_to, read_at: n.read_at, created_at: n.created_at,
            }]);
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `sender_id=eq.${me}` },
          ({ new: n }) => {
            if (n.user_id === person.id && n.read_at) setSeen((s) => ({ ...s, [n.id]: n.read_at }));
          }
        )
        .subscribe();
    })();
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) supabase.removeChannel(channel);
    };
  }, [me, person.id, router]);

  const send = (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    const tempId = `pending-${Date.now()}`;
    setExtra((xs) => [...xs, { id: tempId, mine: true, pending: true, body, reply_to: target, read_at: null, created_at: new Date().toISOString() }]);
    setText("");
    const f = new FormData();
    f.set("id", String(target));
    f.set("body", body);
    startTransition(async () => {
      const result = await replyToNotification(f);
      if (result?.ok) {
        setExtra((xs) => xs.map((m) => (m.id === tempId ? result.data.message : m)));
      } else {
        setExtra((xs) => xs.filter((m) => m.id !== tempId));
        setText((t) => t || body);
        toast.error(result?.error ?? "Your reply wasn't sent. Try again.");
      }
    });
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  let lastDay = null;

  return (
    <div className="flex flex-col">
      <div
        ref={listRef}
        role="log"
        aria-label={`Conversation with ${person.name}`}
        aria-live="polite"
        className="max-h-[min(60svh,36rem)] min-h-40 space-y-3 overflow-y-auto px-4 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-5" />
            No messages with {first} yet.{person.active ? " Write below to reply about this notification." : ""}
          </div>
        ) : (
          messages.map((m) => {
            const day = mounted ? dayLabel(m.created_at) : null;
            const divider = day && day !== lastDay ? day : null;
            lastDay = day;
            // A reply's title is only "Re: …"; show a subject on the messages that started something.
            const subject = !m.reply_to && m.title ? m.title : null;
            return (
              <div key={m.id}>
                {divider ? (
                  <div className="my-2 flex items-center gap-3 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-px flex-1 bg-[var(--panel-border)]" />
                    {divider}
                    <span className="h-px flex-1 bg-[var(--panel-border)]" />
                  </div>
                ) : null}
                <div className={cn("flex", m.mine ? "justify-end" : "justify-start")} data-message={m.mine ? "mine" : "theirs"}>
                  <div className="max-w-[85%] sm:max-w-[75%]">
                    <div
                      className={cn(
                        "whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm",
                        m.mine
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border border-[var(--panel-border)] bg-muted/50",
                        m.id === anchorId && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
                        m.pending && "opacity-70"
                      )}
                    >
                      {subject ? <div className={cn("font-semibold", m.body && "mb-0.5")}>{subject}</div> : null}
                      {m.body || (subject ? null : m.title)}
                    </div>
                    <div className={cn("mt-1 px-1 text-[0.66rem] text-muted-foreground", m.mine && "text-right")}>
                      {mounted ? new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : " "}
                      {m.mine ? (m.pending ? " · Sending…" : m.read_at ? " · Seen" : " · Sent") : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {person.active ? (
        <form onSubmit={send} className="border-t border-[var(--panel-border)] p-3 sm:px-5">
          <input type="hidden" name="id" value={target} />
          <div className="flex items-end gap-2">
            <Textarea
              name="body"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={MAX}
              placeholder={`Reply to ${first}…`}
              aria-label={`Reply to ${person.name}`}
              className="max-h-40 min-h-11 resize-none"
            />
            <Button type="submit" disabled={pending || !text.trim()} aria-label="Send reply" className="h-11">
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
          <p className="mt-1.5 text-[0.66rem] text-muted-foreground">
            Enter to send · Shift+Enter for a new line
            {text.length > MAX - 200 ? ` · ${MAX - text.length} characters left` : ""}
          </p>
        </form>
      ) : (
        <p className="flex items-center gap-2 border-t border-[var(--panel-border)] px-5 py-3 text-sm text-muted-foreground">
          <UserX className="size-4 shrink-0" />
          {person.name}&apos;s account is no longer active, so they can&apos;t receive replies.
        </p>
      )}
    </div>
  );
}
