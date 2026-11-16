"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mic, Square, Upload, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { defaultPersonalGreeting } from "@/lib/phone-lines";
import { encodeWav } from "@/lib/wav";
import { saveMyGreeting, uploadMyGreeting } from "@/features/phone/greeting-actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const MAX_SECONDS = 60;

/** Record from the microphone, as a WAV (Twilio plays WAV and MP3, not the browser's own formats). */
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);
  return async () => {
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate;
    await ctx.close();
    return new Blob([encodeWav(chunks, rate)], { type: "audio/wav" });
  };
}

/**
 * My voicemail greeting (Sean, Nov 2026): what callers hear when you miss them on your extension: your words (or
 * the usual greeting) in the AI voice, or a recording of your own, made here or uploaded. `me`: { first_name,
 * voicemail_greeting, voicemail_use_recording, voicemail_audio_path, phone_ext }.
 */
export default function VoicemailGreeting({ me }) {
  const [state, action, pending] = useActionState(saveMyGreeting, EMPTY);
  const hasRecording = Boolean(me.voicemail_audio_path);
  const [mode, setMode] = useState(me.voicemail_use_recording && hasRecording ? "recording" : "ai");
  const [text, setText] = useState(me.voicemail_greeting ?? "");
  const [recording, setRecording] = useState(null); // the stop function while recording
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState(null); // { blob, url } recorded here, not yet saved
  const [version, setVersion] = useState(0); // the saved recording's player, fetched afresh after an upload
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef(null);
  const usual = defaultPersonalGreeting(me.first_name);

  useEffect(() => {
    if (state.ok) toast.success("Voicemail greeting saved");
    else if (state.error) toast.error(state.error);
  }, [state]);
  useEffect(() => {
    if (!recording) return undefined;
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stop();
  });
  useEffect(() => () => take?.url && URL.revokeObjectURL(take.url), [take]);

  async function record() {
    try {
      setTake(null);
      setSeconds(0);
      setRecording(() => null);
      const stopFn = await startRecording();
      setRecording(() => stopFn);
    } catch {
      setRecording(null);
      toast.error("The microphone could not be used. Allow it for Lighthouse in the browser, or upload a recording.");
    }
  }
  async function stop() {
    const stopFn = recording;
    setRecording(null);
    if (!stopFn) return;
    const blob = await stopFn();
    setTake({ blob, url: URL.createObjectURL(blob) });
  }
  function upload(file, name) {
    startUpload(async () => {
      const form = new FormData();
      form.set("file", file, name);
      const res = await uploadMyGreeting(form);
      if (res?.ok) {
        toast.success("Your recording is your greeting now");
        setTake(null);
        setMode("recording");
        setVersion((v) => v + 1);
      } else toast.error(res?.error ?? "The recording could not be saved.");
    });
  }
  function preview() {
    if (!("speechSynthesis" in window)) return toast.info("This browser can't read it aloud.");
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.trim() || usual));
  }
  const showRecording = hasRecording || version > 0;

  return (
    <form action={action} className="space-y-4 p-5" data-voicemail-greeting>
      <p className="text-sm text-muted-foreground">
        What callers hear when they dial {me.phone_ext ? <>your extension, <strong className="text-foreground">{me.phone_ext}</strong>,</> : "your extension"} and you don&apos;t answer.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Greeting">
        {[["ai", "AI voice"], ["recording", "My own recording"]].map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} data-greeting-mode={k}
            className={`rounded-lg border px-3 py-1.5 text-sm ${mode === k ? "border-primary bg-primary/12 font-semibold" : "border-[var(--panel-border)] hover:bg-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="mode" value={mode} />

      <div className={mode === "ai" ? "space-y-2" : "hidden"}>
        <textarea name="greeting" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={usual}
          className="w-full rounded-md border border-[var(--panel-border)] bg-transparent px-3 py-2 text-sm" aria-label="Your greeting, read in the AI voice" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button type="button" size="sm" variant="outline" onClick={preview}><Volume2 className="size-4" /> Preview</Button>
          Blank: the usual greeting, with your first name. Callers hear a natural AI voice; the preview uses your browser&apos;s.
        </div>
      </div>

      <div className={mode === "recording" ? "space-y-3" : "hidden"} data-greeting-recording>
        {showRecording && !take ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Your greeting:</span>
            <audio key={version} controls preload="none" src={`/api/phone/greeting?v=${version}`} className="h-9" />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {recording ? (
            <Button type="button" size="sm" variant="destructive" onClick={stop} data-greeting-stop><Square className="size-4" /> Stop · {seconds}s</Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={record} data-greeting-record><Mic className="size-4" /> {showRecording || take ? "Record again" : "Record"}</Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}><Upload className="size-4" /> Upload MP3 or WAV</Button>
          <input ref={fileRef} type="file" accept="audio/mpeg,audio/wav,.mp3,.wav" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, f.name); e.target.value = ""; }} />
        </div>
        {take ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" data-greeting-take>
            <audio controls src={take.url} className="h-9" />
            <Button type="button" size="sm" disabled={uploading} onClick={() => upload(take.blob, "greeting.wav")}>{uploading ? "Saving…" : "Use this one"}</Button>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Up to {MAX_SECONDS} seconds. Say your name, and ask for their name, number and a short message.</p>
      </div>

      <Button type="submit" size="sm" disabled={pending || (mode === "recording" && !showRecording)}>{pending ? "Saving…" : "Save greeting"}</Button>
    </form>
  );
}
