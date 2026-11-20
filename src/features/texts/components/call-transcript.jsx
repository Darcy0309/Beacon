"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, RotateCw, Sparkles } from "lucide-react";
import { atClock } from "@/lib/call-transcript";
import { cn } from "@/lib/utils";

/**
 * A recorded call's transcript, hidden until "Show transcript" (Nov 2026). One never transcribed (recorded
 * before transcripts were set up) is asked for on that click, and one that failed can be tried again;
 * while it is on its way it says so, and the Conversation asks again every so often (`onChanged` at once).
 *
 * `noun`: what the toggle calls it ("transcript"; the Call Log, "transcription").
 *
 * Beside it, "AI summary" (client, Nov 2026): Claude's short summary of the transcript, written on the
 * first click and kept. Pressed before the call is transcribed, it asks for the transcript and writes
 * the summary once that is in.
 */
export default function CallTranscript({ sid, transcript, ours, theirs, onChanged, noun = "transcript" }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  // What asking said, until the Conversation itself has moved on from where it was then.
  const [asked, setAsked] = useState(null);
  const t = asked && asked.from === transcript.status ? asked : transcript;
  const lines = t.lines ?? [];

  const [written, setWritten] = useState(null);
  const summary = written ?? transcript.summary ?? null;
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  // "AI summary" pressed before the transcript was in: written as soon as it is.
  const [wantSummary, setWantSummary] = useState(false);

  const ask = async () => {
    setAsking(true);
    try {
      const res = await fetch(`/api/phone/recordings/${sid}/transcript`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setAsked({ from: transcript.status, status: res.ok ? data.status : "failed", lines: [], error: res.ok ? data.error : data.error || "The transcript couldn't be asked for." });
      if (res.ok) {
        setOpen(true);
        onChanged?.();
      }
      return res.ok;
    } catch {
      setAsked({ from: transcript.status, status: "failed", lines: [], error: "Couldn't reach Lighthouse. Try again in a moment." });
      return false;
    } finally {
      setAsking(false);
    }
  };

  const summarize = useCallback(async (again = false) => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const res = await fetch(`/api/phone/recordings/${sid}/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ again, ours, theirs }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.summary) {
        setWritten(data.summary);
        setSummaryOpen(true);
      } else {
        setSummaryError(data.error || "The summary couldn't be written. Try again in a moment.");
      }
    } catch {
      setSummaryError("Couldn't reach Lighthouse. Try again in a moment.");
    } finally {
      setSummarizing(false);
    }
  }, [sid, ours, theirs]);

  const transcribed = t.status === "done" && lines.length > 0;
  useEffect(() => {
    if (wantSummary && transcribed && !summary && !summarizing) {
      setWantSummary(false);
      summarize();
    }
  }, [wantSummary, transcribed, summary, summarizing, summarize]);
  // A transcript that came back empty or failed: nothing to wait for.
  useEffect(() => {
    if (wantSummary && (t.status === "failed" || (t.status === "done" && !lines.length))) setWantSummary(false);
  }, [wantSummary, t.status, lines.length]);

  const pressSummary = async () => {
    if (summary) return setSummaryOpen((o) => !o);
    if (transcribed) return summarize();
    setSummaryError(null);
    setWantSummary(true);
    if (t.status === "none" && !(await ask())) setWantSummary(false);
  };

  const toggle = (label, onClick, extra) => (
    <button type="button" onClick={onClick} disabled={asking} aria-expanded={extra?.expanded} data-call-transcript-toggle
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:opacity-60">
      {asking ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronDown className={cn("size-3.5 transition-transform", extra?.expanded && "rotate-180")} />}
      {label}
    </button>
  );

  const summaryButton = (
    <button type="button" onClick={pressSummary} disabled={summarizing || asking || wantSummary} aria-expanded={summary ? summaryOpen : undefined} data-call-summary-toggle
      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 transition-colors hover:underline disabled:opacity-60">
      {summarizing || wantSummary ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
      {summarizing ? "Writing summary…" : summary && summaryOpen ? "Hide AI summary" : "AI summary"}
    </button>
  );

  const summaryBox = (
    <>
      {summaryError ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-destructive" data-call-summary-error>
          <AlertCircle className="size-3.5 shrink-0" /> {summaryError}
        </p>
      ) : null}
      {summary && summaryOpen ? (
        <div className="mt-1.5 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-xs" data-call-summary>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1 font-semibold text-primary"><Sparkles className="size-3.5" aria-hidden /> AI summary</p>
            <button type="button" onClick={() => summarize(true)} disabled={summarizing} title="Write the summary again"
              className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60" data-call-summary-again>
              <RotateCw className={cn("size-3", summarizing && "animate-spin")} /> Again
            </button>
          </div>
          <p className="mt-1 leading-relaxed">{summary.overview}</p>
          {summary.points?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {summary.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          ) : null}
          {summary.next_step ? <p className="mt-1.5"><span className="font-semibold">Next step:</span> {summary.next_step}</p> : null}
          <p className="mt-1.5 text-[0.65rem] text-muted-foreground">Written by AI from the transcript; check anything important against the recording.</p>
        </div>
      ) : null}
    </>
  );

  if (t.status === "none") {
    return (
      <div className="mt-2" data-call-transcript-status="none">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{toggle(`Show ${noun}`, ask)}{summaryButton}</div>
        {summaryBox}
      </div>
    );
  }
  if (t.status === "transcribing") {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" data-call-transcript-status="transcribing">
        <Loader2 className="size-3.5 animate-spin" /> Transcribing the call… usually a minute or two.{wantSummary ? " The AI summary follows." : ""}
      </p>
    );
  }
  if (t.status === "failed" || !lines.length) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-call-transcript-status={t.status}>
        <span className="flex items-center gap-1.5"><AlertCircle className="size-3.5 shrink-0" /> {t.error || "This call couldn't be transcribed."}</span>
        {t.status === "failed" ? toggle("Try again", ask) : null}
      </div>
    );
  }
  return (
    <div className="mt-2" data-call-transcript-status="done">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {toggle(open ? `Hide ${noun}` : `Show ${noun}`, () => setOpen((o) => !o), { expanded: open })}
        {summaryButton}
      </div>
      {summaryBox}
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
