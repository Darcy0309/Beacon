"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Voice messages (Oct 2026): recorded in the browser, two minutes at most,
 * heard before sending; kept private in storage ('chat-voice', under
 * voice/<sender>/), played by the two people in the conversation from a
 * short-lived link.
 */
export const MAX_VOICE_SECONDS = 120;
const BUCKET = "chat-voice";
const TYPES = [["audio/webm;codecs=opus", "webm"], ["audio/webm", "webm"], ["audio/mp4", "m4a"], ["audio/ogg;codecs=opus", "ogg"]];

const clock = (s) => {
  const t = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** A voice message to play: from `src` (one just recorded), or its stored `path`, fetched when first played. */
export function VoicePlayer({ path, src = null, seconds = 0, mine = false }) {
  const audio = useRef(null);
  const [url, setUrl] = useState(src);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const total = Number(seconds) || 0;

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = async () => {
    if (playing) { audio.current?.pause(); return; }
    let u = url;
    if (!u) {
      setLoading(true);
      const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(path, 3600);
      setLoading(false);
      if (error || !data?.signedUrl) { toast.error("That voice message couldn't be loaded. Try again."); return; }
      u = data.signedUrl;
      setUrl(u);
    }
    if (!audio.current || audio.current.dataset.src !== u) {
      audio.current?.pause();
      const a = new Audio(u);
      a.dataset.src = u;
      a.ontimeupdate = () => setAt(a.currentTime);
      a.onended = () => { setPlaying(false); setAt(0); };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      a.onerror = () => { setPlaying(false); toast.error("This browser can't play that voice message."); };
      audio.current = a;
    }
    audio.current.play().catch(() => toast.error("That voice message couldn't be played."));
  };
  const seek = (e) => {
    const a = audio.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(total, Math.max(0, ((e.clientX - r.left) / r.width) * total));
    setAt(a.currentTime);
  };
  const pct = total ? Math.min(100, (at / total) * 100) : 0;

  return (
    <div className="flex min-w-48 items-center gap-2.5 py-0.5" data-voice-message>
      <button type="button" onClick={toggle} aria-label={playing ? "Pause voice message" : "Play voice message"} data-voice-play
        className={cn("flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
          mine ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" : "bg-primary/12 text-primary hover:bg-primary/20")}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <div className="flex-1">
        <div role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(at)} tabIndex={-1} onClick={seek}
          className={cn("h-1.5 cursor-pointer overflow-hidden rounded-full", mine ? "bg-primary-foreground/25" : "bg-primary/15")}>
          <div className={cn("h-full rounded-full", mine ? "bg-primary-foreground" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="shrink-0 text-[0.7rem] tabular-nums opacity-80">{clock(playing || at ? at : total)}</span>
    </div>
  );
}

/**
 * The microphone button, and once pressed, the recording: its time, Stop and
 * Cancel; then the recording to hear, Discard or Send. `onSend({ path,
 * seconds })` sends it once uploaded; `onActive(bool)` says when it takes the
 * place of the reply box.
 */
export function VoiceRecorder({ me, onSend, onActive, disabled = false }) {
  const [state, setState] = useState("idle"); // idle | recording | ready | sending
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState(null); // { blob, url, seconds, type, ext }
  const rec = useRef(null);
  const started = useRef(0);
  const timer = useRef(null);
  const discard = useRef(false);

  useEffect(() => { onActive?.(state !== "idle"); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream?.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("This browser can't record voice messages.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast.error(e?.name === "NotAllowedError" ? "Allow the microphone for Lighthouse to record a voice message." : "No microphone was found to record with.");
      return;
    }
    const [type, ext] = TYPES.find(([t]) => MediaRecorder.isTypeSupported?.(t)) ?? ["", "webm"];
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    r.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    r.onstop = () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.min(MAX_VOICE_SECONDS, (Date.now() - started.current) / 1000);
      if (discard.current || !chunks.length || seconds < 0.5) {
        const dropped = discard.current;
        discard.current = false;
        setState("idle");
        if (!dropped && seconds < 0.5) toast.message("Hold on a little longer to record.");
        return;
      }
      const base = (r.mimeType || type || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: base });
      setTake({ blob, url: URL.createObjectURL(blob), seconds, type: base, ext: base.includes("mp4") ? "m4a" : base.includes("ogg") ? "ogg" : ext });
      setState("ready");
    };
    rec.current = r;
    started.current = Date.now();
    setElapsed(0);
    r.start(250);
    setState("recording");
    timer.current = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setElapsed(s);
      if (s >= MAX_VOICE_SECONDS) { r.state === "recording" && r.stop(); toast.message("Two minutes is the longest a voice message can be."); }
    }, 200);
  };
  const stop = () => rec.current?.state === "recording" && rec.current.stop();
  const cancel = () => {
    if (rec.current?.state === "recording") { discard.current = true; rec.current.stop(); }
    if (take?.url) URL.revokeObjectURL(take.url);
    setTake(null);
    setState("idle");
  };
  const send = async () => {
    if (!take || !me) return;
    setState("sending");
    const supabase = createClient();
    const path = `voice/${me}/${crypto.randomUUID()}.${take.ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, take.blob, { contentType: take.type, upsert: false });
    if (error) {
      setState("ready");
      toast.error("The voice message didn't upload. Try again.");
      return;
    }
    const sent = await onSend({ kind: "voice", path, seconds: Math.round(take.seconds * 10) / 10 });
    if (sent) {
      URL.revokeObjectURL(take.url);
      setTake(null);
      setState("idle");
    } else {
      // Not sent: the recording stays to try again; the upload goes.
      supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      setState("ready");
    }
  };

  if (state === "idle") {
    return (
      <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={start} aria-label="Record a voice message" title="Voice message" data-voice-record>
        <Mic />
      </Button>
    );
  }
  return (
    <div className="flex min-h-11 flex-1 items-center gap-2 rounded-md border border-input bg-background/60 px-2 py-1.5" data-voice-recorder={state}>
      <Button type="button" variant="ghost" size="icon" onClick={cancel} aria-label="Discard the voice message" data-voice-cancel disabled={state === "sending"}><Trash2 /></Button>
      {state === "recording" ? (
        <>
          <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          <span className="flex-1 text-sm tabular-nums" aria-live="polite">Recording {clock(elapsed)} <span className="text-muted-foreground">/ {clock(MAX_VOICE_SECONDS)}</span></span>
          <Button type="button" size="sm" variant="outline" onClick={stop} data-voice-stop><Square className="fill-current" /> Stop</Button>
        </>
      ) : (
        <>
          <div className="flex-1"><VoicePlayer src={take?.url} seconds={take?.seconds} /></div>
          <Button type="button" size="sm" onClick={send} disabled={state === "sending"} data-voice-send>
            {state === "sending" ? <Loader2 className="animate-spin" /> : <Send />} Send
          </Button>
        </>
      )}
    </div>
  );
}
