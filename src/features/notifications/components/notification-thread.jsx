"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2, MessageSquare, UserX, Reply, SmilePlus, Smile, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMounted } from "@/components/shared/local-time";
import { useRole } from "@/components/layout/role-provider";
import { createClient } from "@/lib/supabase/client";
import { replyToNotification, markThreadRead, toggleReaction } from "@/features/notifications/actions";
import { setActiveChat, announceNotificationsChanged } from "@/features/notifications/active-chat";
import EmojiPicker from "@/features/notifications/components/emoji-picker";
import GifPicker from "@/features/notifications/components/gif-picker";
import { VoicePlayer, VoiceRecorder } from "@/features/notifications/components/voice-message";
import { QUICK_REACTIONS, onlyEmoji } from "@/lib/emoji";
import LinkedText from "@/components/shared/linked-text";
import Link from "@/components/shared/intent-link";
import { linkLabel } from "@/features/notifications/kinds";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

const MAX = 1000;
// What a message with no text says it is (reply_to_notification() writes these, for the bell).
const STAND_IN = { voice: "🎤 Voice message", gif: "GIF" };

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

/** A line saying what a message is, for a quote of it. */
function snippet(m) {
  const kind = m?.attachment?.kind ?? m?.kind;
  if (kind && (!m.body || m.body === STAND_IN[kind])) return STAND_IN[kind] ?? "Attachment";
  const t = String(m?.body || m?.title || "").replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

/**
 * The conversation between the signed-in user and whoever sent a
 * notification, with a reply box. New messages from them, read receipts for
 * yours and reactions arrive live; the page also refreshes on focus in case
 * the live connection dropped. As other chat apps have it (Oct 2026): a
 * reaction on any message, replying to one message (quoted above the reply),
 * emoji, GIFs (GIPHY) and voice messages.
 */
/**
 * A message's link worth a button in the chat: a page inside Lighthouse for
 * one record (/leads/123, /calendar?a=45), not a page in general (/team).
 */
const recordLink = (link) => typeof link === "string" && /^\/(?![/\\])/.test(link) && /\/\d+(?=$|[/?#])|[?&][a-z_]+=\d+(?=$|&|#)/i.test(link);

export default function NotificationThread({ anchorId, anchorUnread, person, messages: initial }) {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useRole();
  const me = user?.id ?? null;
  const [extra, setExtra] = useState([]); // sent or received since the page loaded
  const [seen, setSeen] = useState({}); // read receipts that arrived live: id -> read_at
  const [rx, setRx] = useState({}); // reactions changed since the page loaded: id -> [{ emoji, user_id }]
  const [text, setText] = useState("");
  const [quote, setQuote] = useState(null); // the message being replied to
  const [recording, setRecording] = useState(false);
  const [flash, setFlash] = useState(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef(null);
  const boxRef = useRef(null);
  const marked = useRef(new Set());
  const first = person.name.split(" ")[0];

  // The server's copy wins for anything it already has; live additions fill in the rest.
  const messages = useMemo(() => {
    const byId = new Map();
    for (const m of [...extra, ...initial]) byId.set(m.id, m);
    return [...byId.values()]
      .map((m) => (seen[m.id] && !m.read_at ? { ...m, read_at: seen[m.id] } : m))
      .map((m) => (rx[m.id] ? { ...m, reactions: rx[m.id] } : m))
      .sort(byTime);
  }, [initial, extra, seen, rx]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const ids = useRef(new Set());
  ids.current = new Set(messages.map((m) => m.id));
  const reactionsOf = useRef({});
  reactionsOf.current = Object.fromEntries(messages.map((m) => [m.id, m.reactions ?? []]));

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
    // Quiet when it fails: they only stay unread until the next visit.
    reach(() => markThreadRead(f)).then(announceNotificationsChanged);
  }, [messages, anchorId, anchorUnread]);

  // Always at the newest message (Oct 2026): on opening, as messages come, and as what is in them loads (a picture
  // or a GIF arriving after the page pushed the newest out of view). Unless they've scrolled up to read back:
  // then it stays where they are, until they come back to the bottom.
  const contentRef = useRef(null);
  const atEnd = useRef(true);
  const toEndRef = useRef(null);
  useEffect(() => {
    const el = listRef.current;
    const inner = contentRef.current;
    if (!el || !inner) return undefined;
    // Where it was last put at the end. A scroll event comes a frame later, by when a picture may have made the list
    // taller: so only scrolling up from there is reading back, and coming back to the bottom follows the end again.
    let placed = 0;
    const toEnd = () => { el.scrollTop = el.scrollHeight; placed = el.scrollTop; };
    const onScroll = () => {
      if (el.scrollTop < placed - 4) atEnd.current = false;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) { atEnd.current = true; placed = el.scrollTop; }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // The messages growing (a picture loading), or the list itself changing size as the page settles.
    const grown = new ResizeObserver(() => { if (atEnd.current) toEnd(); });
    grown.observe(inner);
    grown.observe(el);
    toEndRef.current = toEnd;
    toEnd();
    return () => {
      el.removeEventListener("scroll", onScroll);
      grown.disconnect();
    };
  }, []);
  // A new message (theirs or one sent here) brings the view back to the end.
  useEffect(() => {
    atEnd.current = true;
    toEndRef.current?.();
  }, [messages.length]);

  // Live: their new messages, receipts for yours, and reactions either way.
  useEffect(() => {
    if (!me) return;
    const supabase = createClient();
    let channel;
    let cancelled = false;
    const react = (row, on) => {
      if (!row?.message_id || !ids.current.has(row.message_id)) return;
      setRx((r) => {
        const list = r[row.message_id] ?? reactionsOf.current[row.message_id] ?? [];
        const has = list.some((x) => x.emoji === row.emoji && x.user_id === row.user_id);
        if (on === has) return r;
        return { ...r, [row.message_id]: on ? [...list, { emoji: row.emoji, user_id: row.user_id }]
          : list.filter((x) => !(x.emoji === row.emoji && x.user_id === row.user_id)) };
      });
    };
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
              id: n.id, mine: false, title: n.title, body: n.body, link: n.link,
              reply_to: n.reply_to, read_at: n.read_at, created_at: n.created_at,
              quote_id: n.quote_id, attachment: n.attachment, reactions: [],
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
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, ({ new: r }) => react(r, true))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, ({ old: r }) => react(r, false))
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

  /** Send a message (text, or a voice message or GIF); whether it went. */
  const deliver = ({ body = "", attachment = null }) => new Promise((resolve) => {
    const tempId = `pending-${Date.now()}`;
    const quoted = quote;
    setExtra((xs) => [...xs, {
      id: tempId, mine: true, pending: true, body: body || (attachment ? STAND_IN[attachment.kind] : ""), reply_to: target,
      quote_id: quoted?.id ?? null, attachment, reactions: [], read_at: null, created_at: new Date().toISOString(),
    }]);
    setQuote(null);
    const f = new FormData();
    f.set("id", String(target));
    f.set("body", body);
    if (quoted) f.set("quote", String(quoted.id));
    if (attachment) f.set("attachment", JSON.stringify(attachment));
    startTransition(async () => {
      const result = await reach(() => replyToNotification(f));
      if (result?.ok) {
        setExtra((xs) => xs.map((m) => (m.id === tempId ? result.data.message : m)));
        resolve(true);
      } else {
        setExtra((xs) => xs.filter((m) => m.id !== tempId));
        setQuote((q) => q ?? quoted);
        toast.error(result?.error ?? "Your reply wasn't sent. Try again.");
        resolve(false);
      }
    });
  });

  const send = (event) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setText("");
    deliver({ body }).then((ok) => { if (!ok) setText((t) => t || body); });
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
    if (event.key === "Escape" && quote) setQuote(null);
  };

  // An emoji goes in where the cursor is.
  const insertEmoji = (e) => {
    const box = boxRef.current;
    const at = box ? box.selectionStart ?? text.length : text.length;
    const end = box ? box.selectionEnd ?? at : at;
    const next = `${text.slice(0, at)}${e}${text.slice(end)}`.slice(0, MAX);
    setText(next);
    requestAnimationFrame(() => { box?.focus(); box?.setSelectionRange(at + e.length, at + e.length); });
  };

  const react = (m, emoji) => {
    if (typeof m.id !== "number" || !me) return;
    const list = m.reactions ?? [];
    const has = list.some((x) => x.emoji === emoji && x.user_id === me);
    const next = has ? list.filter((x) => !(x.emoji === emoji && x.user_id === me)) : [...list, { emoji, user_id: me }];
    setRx((r) => ({ ...r, [m.id]: next }));
    reach(() => toggleReaction(m.id, emoji)).then((res) => {
      if (res.ok) setRx((r) => ({ ...r, [m.id]: res.data.reactions }));
      else { setRx((r) => ({ ...r, [m.id]: list })); toast.error(res.error); }
    });
  };

  const replyTo = (m) => {
    setQuote({ id: m.id, mine: m.mine, text: snippet(m) });
    requestAnimationFrame(() => boxRef.current?.focus());
  };
  const jumpTo = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  let lastDay = null;

  return (
    <div className="flex flex-col">
      <div
        ref={listRef}
        role="log"
        aria-label={`Conversation with ${person.name}`}
        aria-live="polite"
        className="h-[min(68svh,46rem)] min-h-[22rem] overflow-y-auto px-4 py-5 sm:px-6 lg:h-[calc(100svh-23.5rem)]"
      >
        {/* The messages, in one box whose height the list watches (below): it grows as pictures and GIFs load. */}
        <div ref={contentRef} className="space-y-3.5">
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
            const att = m.attachment?.kind ? m.attachment : null;
            const text = att && m.body === STAND_IN[att.kind] ? "" : m.body || (subject || att ? "" : m.title);
            const big = !att && !subject && onlyEmoji(text);
            const q = m.quote_id ? (byId.get(m.quote_id) ? { ...byId.get(m.quote_id), text: snippet(byId.get(m.quote_id)) } : m.quote ? { ...m.quote, text: snippet(m.quote) } : null) : null;
            const groups = Object.entries((m.reactions ?? []).reduce((acc, r) => { (acc[r.emoji] ??= []).push(r.user_id); return acc; }, {}));
            const live = typeof m.id === "number" && person.active;
            return (
              <div key={m.id} id={typeof m.id === "number" ? `msg-${m.id}` : undefined}>
                {divider ? (
                  <div className="my-2 flex items-center gap-3 text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-px flex-1 bg-[var(--panel-border)]" />
                    {divider}
                    <span className="h-px flex-1 bg-[var(--panel-border)]" />
                  </div>
                ) : null}
                <div className={cn("group flex items-center gap-1.5", m.mine ? "flex-row-reverse" : "flex-row")} data-message={m.mine ? "mine" : "theirs"} data-message-id={m.id}>
                  <div className="max-w-[85%] outline-none sm:max-w-[75%]" tabIndex={live ? 0 : undefined}>
                    <div
                      className={cn(
                        "whitespace-pre-line break-words rounded-2xl text-[0.9375rem] leading-relaxed transition-shadow",
                        att?.kind === "gif" && !text && !q ? "overflow-hidden p-1" : "px-3.5 py-2",
                        big ? "bg-transparent px-1 py-0 text-4xl leading-tight" : m.mine
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md border border-[var(--panel-border)] bg-muted/50",
                        m.id === anchorId && "ring-2 ring-primary/40 ring-offset-2 ring-offset-card",
                        flash === m.id && "ring-2 ring-amber-400 ring-offset-2 ring-offset-card",
                        m.pending && "opacity-70"
                      )}
                    >
                      {q ? (
                        <button type="button" onClick={() => jumpTo(q.id)} data-quote={q.id}
                          className={cn("mb-1.5 block w-full rounded-lg border-l-[3px] px-2 py-1 text-left text-xs",
                            m.mine ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary/60 bg-background/70")}>
                          <span className="block font-semibold">{q.mine ? "You" : first}</span>
                          <span className="line-clamp-2 opacity-85">{q.text}</span>
                        </button>
                      ) : null}
                      {subject ? <div className={cn("font-semibold", (text || att) && "mb-0.5")}>{subject}</div> : null}
                      {att?.kind === "voice" ? <VoicePlayer path={att.path} seconds={att.seconds} mine={m.mine} /> : null}
                      {att?.kind === "gif" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={att.url} alt={att.title || "GIF"} width={att.width} height={att.height} loading="lazy" data-gif-message
                          className="block h-auto max-h-80 w-auto max-w-full rounded-xl" />
                      ) : null}
                      {text ? <div className={cn(att && "mt-1")}><LinkedText text={text} /></div> : null}
                      {/* What it was sent about (Oct 2026: a question about an appointment links to its lead): on the other
                          person's messages only, and only a link to one record, not a page in general (a thank-you's Team page). */}
                      {!m.mine && recordLink(m.link) ? (
                        <Link href={m.link} data-message-link
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10">
                          {linkLabel(m.link)} <ArrowUpRight className="size-3" />
                        </Link>
                      ) : null}
                    </div>
                    {groups.length ? (
                      <div className={cn("mt-1 flex flex-wrap gap-1", m.mine && "justify-end")} data-reactions>
                        {groups.map(([emoji, who]) => {
                          const mineToo = who.includes(me);
                          const names = who.map((u) => (u === me ? "You" : first)).join(" and ");
                          return (
                            <button key={emoji} type="button" disabled={!live} onClick={() => react(m, emoji)} title={`${names} reacted ${emoji}`}
                              aria-label={`${emoji} ${who.length}: ${names}${mineToo ? ". Click to take yours off" : ""}`} data-reaction={emoji}
                              className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
                                mineToo ? "border-primary/50 bg-primary/10 text-foreground" : "border-[var(--panel-border)] bg-card hover:border-primary/40")}>
                              <span className="text-sm leading-none">{emoji}</span>
                              {who.length > 1 ? <span className="tabular-nums">{who.length}</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className={cn("mt-1 px-1 text-[0.66rem] text-muted-foreground", m.mine && "text-right")}>
                      {mounted ? new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : " "}
                      {m.mine ? (m.pending ? " · Sending…" : m.read_at ? " · Seen" : " · Sent") : null}
                    </div>
                  </div>
                  {live ? (
                    // On hover (or a tap, on a phone): react, or reply to this one.
                    <div className="flex items-center gap-0.5 rounded-full border border-[var(--panel-border)] bg-card px-1 py-0.5 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100" data-message-actions>
                      {QUICK_REACTIONS.map((e) => (
                        <button key={e} type="button" onClick={() => react(m, e)} aria-label={`React ${e}`} data-quick-react={e}
                          className="flex size-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125 hover:bg-muted">{e}</button>
                      ))}
                      <EmojiPicker onPick={(e) => react(m, e)} side="top" align={m.mine ? "end" : "start"} label="React with an emoji">
                        <button type="button" aria-label="React with another emoji" className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" data-react-more>
                          <SmilePlus className="size-4" />
                        </button>
                      </EmojiPicker>
                      <button type="button" onClick={() => replyTo(m)} aria-label="Reply to this message" title="Reply" data-reply-to={m.id}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                        <Reply className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>

      {person.active ? (
        <form onSubmit={send} className="border-t border-[var(--panel-border)] p-3 sm:px-5">
          <input type="hidden" name="id" value={target} />
          {quote ? (
            <div className="mb-2 flex items-start gap-2 rounded-lg border-l-[3px] border-primary/60 bg-muted/50 px-3 py-1.5 text-xs" data-replying-to={quote.id}>
              <Reply className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">Replying to {quote.mine ? "yourself" : first}</span>
                <span className="block truncate text-muted-foreground">{quote.text}</span>
              </div>
              <button type="button" onClick={() => setQuote(null)} aria-label="Don't reply to that message" className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            {!recording ? (
              <div className="flex shrink-0 items-center pb-1">
                <EmojiPicker onPick={insertEmoji}>
                  <Button type="button" variant="ghost" size="icon" aria-label="Add an emoji" title="Emoji" data-emoji-open><Smile /></Button>
                </EmojiPicker>
                <GifPicker onPick={(g) => deliver({ attachment: { kind: "gif", url: g.url, still: g.still, width: g.width, height: g.height, title: g.title } })}>
                  <Button type="button" variant="ghost" size="icon" aria-label="Send a GIF" title="GIF" data-gif-open>
                    <span className="rounded border border-current px-0.5 text-[0.6rem] font-bold leading-tight">GIF</span>
                  </Button>
                </GifPicker>
              </div>
            ) : null}
            {!recording ? (
              <Textarea
                ref={boxRef}
                name="body"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                maxLength={MAX}
                placeholder={`Reply to ${first}…`}
                aria-label={`Reply to ${person.name}`}
                className="max-h-48 min-h-12 resize-none text-[0.9375rem]"
              />
            ) : null}
            {!text.trim() ? (
              <VoiceRecorder me={me} onActive={setRecording} onSend={(attachment) => deliver({ attachment })} />
            ) : null}
            {!recording ? (
              <Button type="submit" disabled={pending || !text.trim()} aria-label="Send reply" className="h-11">
                {pending ? <Loader2 className="animate-spin" /> : <Send />}
                <span className="hidden sm:inline">Send</span>
              </Button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[0.66rem] text-muted-foreground">
            Enter to send · Shift+Enter for a new line · Hover a message to react or reply
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
