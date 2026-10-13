"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { slotClashes } from "@/lib/project-calendar";

// A day's calendar, kept a moment so changing the time does not ask again.
const cache = new Map();
const TTL_MS = 20_000;

async function dayOf(projectId, date) {
  const key = `${projectId}|${date}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await fetch(`/api/project-calendar?project=${projectId}&from=${date}&to=${date}`);
  if (!res.ok) return null;
  const data = await res.json();
  cache.set(key, { at: Date.now(), data });
  return data;
}

/**
 * For a form with an appointment's date, time and length: `tell({ date })`
 * (or time, or duration) from each field's onChange, and pass `control` to
 * the <SlotWarning> under them. The slot is kept in the warning, so telling
 * it redraws the warning alone, never the form around it.
 */
export function useSlotControl() {
  const control = useRef(null);
  const tell = (patch) => control.current?.(patch);
  return [control, tell];
}

/**
 * Under an appointment's date and time: what the slot runs into on the
 * project's calendar, an appointment already there or time blocked out. A
 * warning only; the appointment can still be set. Nothing when it is clear.
 *
 *   control   from useSlotControl(); `initial` the slot the form starts with
 *   exceptId  the appointment being moved
 */
export default function SlotWarning({ projectId, control, initial, exceptId = null, className }) {
  const [slot, setSlot] = useState({ date: initial?.date ?? "", time: initial?.time ?? "", duration: Number(initial?.duration ?? 30) });
  useEffect(() => {
    if (!control) return;
    control.current = (patch) => setSlot((s) => ({ ...s, ...patch }));
    return () => {
      control.current = null;
    };
  }, [control]);
  const { date, time, duration } = slot;
  const [clashes, setClashes] = useState([]);
  useEffect(() => {
    if (!projectId || !date || !time) return void setClashes([]);
    let live = true;
    dayOf(projectId, date)
      .then((data) => live && setClashes(data ? slotClashes({ date, time, duration, exceptId }, data) : []))
      .catch(() => live && setClashes([]));
    return () => {
      live = false;
    };
  }, [projectId, date, time, duration, exceptId]);

  if (!clashes.length) return null;
  return (
    <div role="alert" data-slot-warning className={`rounded-md border border-amber-400/50 bg-amber-400/8 px-3 py-2 text-xs ${className ?? ""}`}>
      <div className="flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-300">
        <TriangleAlert className="size-3.5" /> That time is taken on this project&apos;s calendar
      </div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {clashes.map((c, i) => <li key={i}>{c.text}</li>)}
      </ul>
      <p className="mt-1 text-muted-foreground">You can still set it, or pick another time.</p>
    </div>
  );
}
