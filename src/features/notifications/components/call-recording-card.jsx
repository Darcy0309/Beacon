"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, CircleDot, Loader2, Pause, PhoneIncoming, Play } from "lucide-react";
import Link from "@/components/shared/intent-link";
import LocalTime from "@/components/shared/local-time";
import { callClock } from "@/lib/phone";
import { cn } from "@/lib/utils";

/**
 * A voicemail on the phone's Twilio number, or a call recorded with the
 * phone's Record button, as its notification shows it (Nov 2026): who left it
 * (or who the call was with) and how long, when, a player for the recording
 * (fetched through the server only when played: app/api/phone/recordings),
 * the lead whose number it is, and Twilio's transcript, opened on request.
 * `voicemail`: recordingOf() (its `kind`, "voicemail" or "recording"); `at`: when; `leadHref`: the lead's page.
 */
export default function CallRecordingCard({ voicemail: v, at, leadHref = null }) {
  const [open, setOpen] = useState(false);
  const recorded = v.kind === "recording";
  const Icon = recorded ? CircleDot : PhoneIncoming;
  return (
    <div className="rounded-xl border border-[var(--panel-border)] bg-background/40 p-4" data-call-recording={v.recordingSid} data-recording-kind={recorded ? "recording" : "voicemail"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2 text-sm">
          <Icon className={cn("size-4", recorded ? "text-rose-500" : "text-primary")} aria-hidden />
          <span className="font-semibold">{recorded ? "Call recording" : "Voicemail"}</span>
          {v.seconds ? <span className="text-muted-foreground">· {callClock(v.seconds * 1000)}</span> : null}
          <span className="text-muted-foreground">· {recorded ? "Recorded" : "Left"}</span>
        </div>
        {at ? <span className="text-xs text-muted-foreground"><LocalTime iso={at} /></span> : null}
      </div>
      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
        {recorded ? `With ${v.from}` : `${v.from} → Lighthouse`}
        {v.lead ? (
          <>
            {" · "}
            {leadHref ? <Link href={leadHref} className="font-medium text-primary hover:underline" data-call-recording-lead>{v.lead}</Link> : v.lead}
          </>
        ) : null}
      </div>

      <RecordingPlayer src={`/api/phone/recordings/${v.recordingSid}`} seconds={v.seconds} />

      {v.transcript ? (
        <div className="mt-3" data-call-recording-transcript>
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Transcript</div>
          <p className={cn("mt-1 whitespace-pre-line text-sm leading-relaxed", !open && "line-clamp-2")}>{v.transcript}</p>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-call-recording-more
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            {open ? "Hide transcript" : "Show transcript"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** A recording: play or pause, how far along (pressed anywhere on the track to go there), and how long. */
function RecordingPlayer({ src, seconds = 0 }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(Number(seconds) || 0);
  useEffect(() => () => audio.current?.pause(), []);

  const get = () => {
    if (audio.current) return audio.current;
    const a = new Audio();
    a.preload = "none";
    a.src = src;
    a.onloadedmetadata = () => Number.isFinite(a.duration) && a.duration > 0 && setTotal(a.duration);
    a.ontimeupdate = () => setAt(a.currentTime);
    a.onplaying = () => { setLoading(false); setPlaying(true); };
    a.onpause = () => setPlaying(false);
    a.onended = () => { setPlaying(false); setAt(0); };
    a.onerror = () => {
      setLoading(false);
      setPlaying(false);
      toast.error("That recording couldn't be loaded. Try again.");
      audio.current = null;
    };
    audio.current = a;
    return a;
  };
  const toggle = () => {
    const a = get();
    if (playing) return a.pause();
    setLoading(true);
    a.play().catch((err) => {
      setLoading(false);
      // Not loaded or not playable says so once (onerror); a pause pressed meanwhile or the browser's own refusal does not.
      if (err?.name === "NotSupportedError" && audio.current === a) toast.error("That recording couldn't be loaded. Try again.");
    });
  };
  const seek = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const a = get();
    if (!total) return;
    a.currentTime = Math.min(total, Math.max(0, ((e.clientX - r.left) / r.width) * total));
    setAt(a.currentTime);
  };

  const pct = total ? Math.min(100, (at / total) * 100) : 0;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--panel-border)] bg-background/60 px-3 py-2" data-recording-player>
      <button type="button" onClick={toggle} aria-label={playing ? "Pause the recording" : "Play the recording"} data-recording-play
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95">
        {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>
      <div role="slider" aria-label="Where in the recording" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(at)}
        tabIndex={0} onClick={seek} data-recording-track
        onKeyDown={(e) => {
          const a = audio.current;
          if (!a || !total || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
          e.preventDefault();
          a.currentTime = Math.min(total, Math.max(0, a.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
          setAt(a.currentTime);
        }}
        className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-muted">
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-recording-time>
        {callClock(at * 1000)} / {callClock(total * 1000)}
      </span>
    </div>
  );
}
