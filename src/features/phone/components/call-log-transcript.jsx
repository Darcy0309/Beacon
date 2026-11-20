"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileText, Loader2, Sparkles, X } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RecordingPlayer } from "@/features/notifications/components/call-recording-card";
import { SummaryPanel, TranscriptLines, useCallTranscript } from "@/features/texts/components/call-transcript";
import { cn } from "@/lib/utils";

/**
 * A call on the Call Log (Nov 2026): its cells (`children`), then its recording with two round buttons beside
 * the player, the transcription and the AI summary; each opens in a panel above its button, closed by a
 * second press, Escape, its X or a click elsewhere. A call not recorded, or one the viewer may not play, is the row alone.
 */
export default function CallLogRow({ children, rowProps, recording, ours, theirs, colSpan }) {
  if (!recording) {
    return (
      <TableRow {...rowProps}>
        {children}
        <TableCell className="min-w-44"><span className="text-xs text-muted-foreground">—</span></TableCell>
      </TableRow>
    );
  }
  if (!recording.transcript) {
    return (
      <TableRow {...rowProps}>
        {children}
        <TableCell className="min-w-44"><RecordingPlayer src={`/api/phone/recordings/${recording.sid}`} seconds={recording.seconds} /></TableCell>
      </TableRow>
    );
  }
  return <WithTranscript rowProps={rowProps} recording={recording} ours={ours} theirs={theirs} colSpan={colSpan}>{children}</WithTranscript>;
}

function WithTranscript({ children, rowProps, recording, ours, theirs, colSpan }) {
  const router = useRouter();
  const sid = recording.sid;
  // What is open beneath the call: "transcript", "summary" or nothing.
  const [view, setView] = useState(null);
  const c = useCallTranscript({ sid, transcript: recording.transcript, ours, theirs, onChanged: () => router.refresh() });
  const { t, lines, asking, summary, summarizing, summaryError, wantSummary } = c;

  // One still being transcribed: looked at again every so often.
  const waiting = t.status === "transcribing";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const showTranscript = () => {
    if (view === "transcript") return setView(null);
    setView("transcript");
    if (t.status === "none") c.ask();
  };
  const showSummary = () => {
    if (view === "summary") return setView(null);
    setView("summary");
    c.requestSummary();
  };

  const round = (on) => cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
    on ? "border-primary bg-primary text-primary-foreground" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/50 hover:text-primary");
  const busy = asking || (view === "summary" && (summarizing || wantSummary));

  let panel = null;
  if (view === "transcript") {
    panel = asking ? <Waiting>Asking for the transcription…</Waiting>
      : t.status === "transcribing" ? <Waiting>Transcribing the call… usually a minute or two.</Waiting>
      : t.status === "failed" || (t.status === "done" && !lines.length) ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" data-call-transcript-status={t.status}>
          <span className="flex items-center gap-1.5"><AlertCircle className="size-3.5 shrink-0" /> {t.error || "This call couldn't be transcribed."}</span>
          {t.status === "failed" ? <button type="button" onClick={c.ask} className="font-medium text-primary hover:underline" data-call-transcript-retry>Try again</button> : null}
        </p>
      )
      : t.status === "done" ? <TranscriptLines lines={lines} ours={ours} theirs={theirs} /> : null;
  } else if (view === "summary") {
    panel = (
      <div className="space-y-1.5">
        {summarizing ? <Waiting>Writing the AI summary…</Waiting>
          : wantSummary ? <Waiting>Transcribing the call first… the AI summary follows.</Waiting> : null}
        <SummaryPanel summary={summary} summaryError={summaryError} summarizing={summarizing} summarize={c.summarize} />
      </div>
    );
  }

  const pop = (key, title, icon, trigger) => (
    <Popover open={view === key} onOpenChange={(o) => { if (!o) setView(null); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[min(36rem,calc(100vw-2rem))] p-0" data-call-panel={key}
        onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--panel-border)] px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">{icon} {title}</p>
          <button type="button" onClick={() => setView(null)} aria-label="Close" className="rounded p-0.5 text-muted-foreground hover:text-foreground" data-call-panel-close>
            <X className="size-3.5" />
          </button>
        </div>
        <div className="p-3">{view === key ? panel : null}</div>
      </PopoverContent>
    </Popover>
  );

  return (
    <TableRow {...rowProps}>
      {children}
      <TableCell className="min-w-44">
        <div className="flex items-center gap-2" data-call-recording={sid}>
          <RecordingPlayer src={`/api/phone/recordings/${sid}`} seconds={recording.seconds} />
          {pop("transcript", "Transcription", <FileText className="size-3.5 text-primary" aria-hidden />, (
            <button type="button" onClick={showTranscript} disabled={asking} aria-expanded={view === "transcript"} data-call-transcript-toggle
              title={view === "transcript" ? "Hide transcription" : "Show transcription"} aria-label={view === "transcript" ? "Hide transcription" : "Show transcription"}
              className={round(view === "transcript")}>
              {asking ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            </button>
          ))}
          {pop("summary", "AI summary", <Sparkles className="size-3.5 text-primary" aria-hidden />, (
            <button type="button" onClick={showSummary} disabled={view !== "summary" && busy} aria-expanded={view === "summary"} data-call-summary-toggle
              title={view === "summary" ? "Hide AI summary" : "AI summary"} aria-label={view === "summary" ? "Hide AI summary" : "AI summary"}
              className={round(view === "summary")}>
              {view === "summary" && (summarizing || wantSummary) ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            </button>
          ))}
        </div>
      </TableCell>
    </TableRow>
  );
}

function Waiting({ children }) {
  return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {children}</p>;
}
