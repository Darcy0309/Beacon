"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, ChevronDown, CircleDot, Loader2, MessageSquare, PhoneIncoming, PhoneOutgoing, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/field";
import { RecordingPlayer } from "@/features/notifications/components/call-recording-card";
import { sendLeadText } from "@/features/texts/actions";
import { formatDial } from "@/lib/phone";
import { TEXT_LIMIT, TEXT_STATUS, textParts } from "@/lib/texts";
import { atClock } from "@/lib/call-transcript";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
// How often an open Conversation asks for replies.
const POLL_MS = 15_000;

const dial = (n) => (n ? formatDial(n) : "Lighthouse");
const length = (s) => {
  const n = Math.max(0, Number(s) || 0);
  return n >= 60 ? `${Math.floor(n / 60)}m ${n % 60}s` : `${n}s`;
};
const callStatus = (c) =>
  c.dir === "out"
    ? c.answered ? "Completed" : c.ended ? "No answer" : "Calling"
    : c.answered ? "Answered" : c.ended ? "Missed" : "Ringing";

/**
 * A lead's Conversation (Nov 2026): its calls on the phone's Twilio line, with their recordings, and
 * the texts sent and received, oldest first, as one thread; a date filter above it, and a box to text
 * the contact below it (Cmd/Ctrl+Enter sends). Asks for replies every so often while it is open.
 *
 * `initial`: getLeadConversation()'s items; `numbers`: the lead's numbers a text can go to;
 * `canText`: may work the name; `ready`: Twilio is connected; `tz`: the business's clock.
 */
export default function LeadConversation({ leadId, initial = [], numbers = [], canText = false, ready = false, tz }) {
  const [items, setItems] = useState(initial);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [state, formAction, pending] = useActionState(sendLeadText, EMPTY);
  const [seen, setSeen] = useState(EMPTY);
  const [problem, setProblem] = useState(null);
  const box = useRef(null);
  const list = useRef(null);
  const form = useRef(null);
  const atEnd = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/conversation`, { cache: "no-store" });
      if (res.ok) setItems((await res.json()).items ?? []);
    } catch {
      // Offline for a moment: the next turn asks again.
    }
  }, [leadId]);

  // New replies while it is open (on screen, the tab chosen).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && box.current?.offsetParent) refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // A text sent, or not: said so, and the thread as it now is.
  useEffect(() => {
    if (state === seen) return;
    setSeen(state);
    setProblem(state.ok ? null : (state.fieldErrors ? Object.values(state.fieldErrors)[0] : null) || state.error);
    if (state.ok) {
      setBody("");
      toast.success(`Text sent to ${formatDial(state.data.to)}`);
    }
    atEnd.current = true;
    refresh();
  }, [state, seen, refresh]);

  const day = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }), [tz]);
  const thisYear = day.format(new Date()).slice(0, 4);
  const when = (iso) => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      ...(day.format(d).slice(0, 4) !== thisYear ? { year: "numeric" } : {}),
    }).format(d);
  };
  const shown = items.filter((i) => {
    const d = day.format(new Date(i.at));
    return (!from || d >= from) && (!to || d <= to);
  });

  // Kept at the newest unless they have scrolled back to read.
  useEffect(() => {
    const el = list.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const parts = textParts(body);
  const why = !ready
    ? "Texting isn't connected yet: the server needs its Twilio keys."
    : !canText
      ? "Only someone working this name can text it."
      : !numbers.length
        ? "There's no number on this lead to text."
        : null;

  return (
    <div ref={box} data-lead-conversation className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-4 py-2.5 text-xs text-muted-foreground">
        <span>Filter by date:</span>
        <label className="flex items-center gap-1.5">From
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" data-conversation-from aria-label="From date" />
        </label>
        <label className="flex items-center gap-1.5">To
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 w-[9.5rem] text-xs" data-conversation-to aria-label="To date" />
        </label>
        {from || to ? (
          <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:text-foreground" data-conversation-clear>
            <X className="size-3.5" /> Clear
          </button>
        ) : null}
        <span className="ml-auto tabular-nums">{shown.length} of {items.length}</span>
      </div>

      <div ref={list} onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="flex max-h-[34rem] min-h-44 flex-col gap-3 overflow-y-auto px-4 py-4" data-conversation-thread aria-live="polite">
        {shown.length ? shown.map((i) => (i.kind === "call" ? <CallCard key={i.key} c={i} when={when} /> : <TextBubble key={i.key} t={i} when={when} />)) : (
          <div className="m-auto flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-6 opacity-60" />
            {items.length ? "Nothing between those dates." : "No calls or texts with this lead on the Lighthouse phone yet."}
          </div>
        )}
      </div>

      <form ref={form} action={formAction} className="border-t border-[var(--panel-border)] p-3" data-conversation-reply>
        <input type="hidden" name="lead_id" value={leadId} />
        {why ? (
          <p className="flex items-center gap-2 rounded-md border border-[var(--panel-border)] bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-conversation-off>
            <AlertCircle className="size-3.5 shrink-0" /> {why}
          </p>
        ) : (
          <>
            {problem ? <p role="alert" className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive" data-conversation-error>{problem}</p> : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {numbers.length > 1 ? (
                  <Select name="to" defaultValue={numbers[0].digits} aria-label="Text to" className="h-8 text-xs sm:max-w-80" data-conversation-to-number>
                    {numbers.map((n) => <option key={n.digits} value={n.digits}>{formatDial(n.digits)} · {n.label}</option>)}
                  </Select>
                ) : (
                  <input type="hidden" name="to" value={numbers[0].digits} />
                )}
                <Textarea
                  name="body"
                  rows={2}
                  maxLength={TEXT_LIMIT}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !pending) {
                      e.preventDefault();
                      form.current?.requestSubmit();
                    }
                  }}
                  placeholder={`Text ${numbers.length === 1 ? formatDial(numbers[0].digits) : "the contact"}… (Cmd/Ctrl+Enter to send)`}
                  className="max-h-40 min-h-[2.75rem] resize-y"
                  data-conversation-body
                />
              </div>
              <Button type="submit" disabled={pending || !body.trim()} className="sm:self-end" data-conversation-send>
                <Send /> {pending ? "Sending…" : "Send"}
              </Button>
            </div>
            <p className="mt-1 text-[0.7rem] tabular-nums text-muted-foreground">
              {body.length.toLocaleString()} / {TEXT_LIMIT.toLocaleString()}{parts > 1 ? ` · goes as ${parts} texts` : ""} · from Lighthouse&apos;s number; replies come back here.
            </p>
          </>
        )}
      </form>
    </div>
  );
}

/** A call on the Lighthouse phone: which way, how long, how it went, the numbers, and its recording. */
function CallCard({ c, when }) {
  const Icon = c.dir === "out" ? PhoneOutgoing : PhoneIncoming;
  return (
    <div className="w-full max-w-xl rounded-xl border border-[var(--panel-border)] bg-background/40 p-3" data-conversation-call={c.dir}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <Icon className={cn("size-3.5 shrink-0 self-center", c.answered ? "text-foreground" : "text-amber-500")} aria-hidden />
          <span className="font-medium">{c.dir === "out" ? "Outgoing call" : "Incoming call"}</span>
          {c.answered ? <span className="text-muted-foreground">· {length(c.seconds)}</span> : null}
          <span className={cn(c.answered ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>· {callStatus(c)}</span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when(c.at)}</span>
      </div>
      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {dial(c.from)} → {dial(c.to)}{c.by ? ` · ${c.by}` : ""}
      </p>
      {c.recording ? (
        c.recording.canPlay ? (
          <div data-conversation-recording>
            <RecordingPlayer src={`/api/phone/recordings/${c.recording.sid}`} seconds={c.recording.seconds} />
            {c.recording.transcript ? <CallTranscript transcript={c.recording.transcript} ours={c.by} theirs={c.them} /> : null}
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-conversation-recording="private">
            <CircleDot className="size-3.5 text-rose-500" /> Recorded: {c.by ?? "whoever recorded it"} and administrators can play it.
          </p>
        )
      ) : null}
    </div>
  );
}

/** A recorded call's transcript, opened on request (Nov 2026); while it is on its way, says so (the Conversation asks again every so often). */
function CallTranscript({ transcript: t, ours, theirs }) {
  const [open, setOpen] = useState(false);
  if (t.status === "transcribing") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-call-transcript-status="transcribing">
        <Loader2 className="size-3.5 animate-spin" /> Transcribing the call…
      </p>
    );
  }
  const lines = t.lines ?? [];
  if (t.status === "failed" || !lines.length) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-call-transcript-status={t.status}>
        <AlertCircle className="size-3.5" /> {t.error || "This call couldn't be transcribed."}
      </p>
    );
  }
  return (
    <div className="mt-2" data-call-transcript-status="done">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-call-transcript-toggle
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide transcript" : "Show transcript"}
      </button>
      {open ? (
        <ol className="mt-1.5 max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--panel-border)] bg-background/60 p-2.5 text-xs" data-call-transcript>
          {lines.map((l, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <span className="tabular-nums text-muted-foreground">{atClock(l.at)}</span>
              <span>
                <span className={cn("font-semibold", l.side === 2 ? "text-foreground" : "text-primary")}>{l.side === 2 ? theirs || "Contact" : ours || "Caller"}: </span>
                {l.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** A text: ours along the left in the brand colour, theirs along the right (as the client's mock-up has it). */
function TextBubble({ t, when }) {
  const out = t.dir === "out";
  const bad = ["failed", "undelivered"].includes(t.status);
  return (
    <div className={cn("w-fit max-w-[min(42rem,85%)] rounded-xl px-3.5 py-2.5", out ? "bg-primary text-primary-foreground" : "ml-auto bg-muted text-foreground")}
      data-conversation-text={t.dir} data-text-status={t.status}>
      <div className={cn("flex items-center gap-1.5 text-[0.7rem]", out ? "text-primary-foreground/75" : "text-muted-foreground")}>
        <MessageSquare className="size-3" aria-hidden />
        <span>{out ? "Outgoing text" : "Incoming text"}</span>
        <span>· {when(t.at)}</span>
      </div>
      <p className="mt-1 whitespace-pre-line break-words text-sm">{t.body || (t.media ? "" : "(empty text)")}</p>
      {t.media ? <p className={cn("mt-1 text-xs", out ? "text-primary-foreground/75" : "text-muted-foreground")}>{t.media} photo{t.media === 1 ? "" : "s"} sent with it (not shown here)</p> : null}
      <p className={cn("mt-1 text-[0.7rem] tabular-nums", out ? "text-primary-foreground/75" : "text-muted-foreground")}>
        {dial(t.from)} → {dial(t.to)}{t.by ? ` · ${t.by}` : ""}{out ? ` · ${TEXT_STATUS[t.status] ?? t.status}` : ""}
      </p>
      {bad && t.error ? (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs text-destructive" data-text-error>
          <AlertCircle className="mt-px size-3.5 shrink-0" /> {t.error}
        </p>
      ) : null}
    </div>
  );
}
