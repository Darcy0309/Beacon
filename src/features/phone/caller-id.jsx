"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lineNumberLabel } from "@/lib/phone-lines";

const KEY = "lighthouse.phone.callerId";
const AUTO = "";

/** The caller ID chosen in this browser ("" for Auto), kept between calls and visits. */
export function useCallerId() {
  const [value, setValue] = useState(AUTO);
  useEffect(() => {
    try {
      setValue(localStorage.getItem(KEY) ?? AUTO);
    } catch {
      // No storage (a private window): Auto.
    }
  }, []);
  const choose = (v) => {
    setValue(v);
    try {
      if (v) localStorage.setItem(KEY, v);
      else localStorage.removeItem(KEY);
    } catch {
      // Kept for this visit only.
    }
  };
  return [value, choose];
}

/**
 * Which number a call goes out from (Sean, Nov 2026: managers call all over the country from a local caller ID,
 * "changing it 2-3x per hour"): Auto, the local line in the area code of the lead's project (its office phone,
 * as Project Info shows), or any of the lines, picked here and kept until changed back. Typing an area code in
 * the list jumps to it. Nothing shows until the account has a line.
 */
export default function CallerIdPicker({ value, onChange, disabled = false }) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    let gone = false;
    createClient().from("phone_lines").select("number, kind, label, area_code").order("number").then(({ data }) => {
      if (!gone) setLines(data ?? []);
    }, () => {});
    return () => {
      gone = true;
    };
  }, []);
  if (!lines.length) return null;
  // A pick that is no longer one of the lines reads as Auto.
  const current = lines.some((l) => l.number === value) ? value : AUTO;
  const local = lines.filter((l) => l.kind === "local");
  const others = lines.filter((l) => l.kind !== "local");
  const option = (l) => (
    <option key={l.number} value={l.number}>{`${l.area_code} · ${l.label ? `${l.label} · ` : ""}${lineNumberLabel(l.number)}`}</option>
  );
  return (
    <label className="mt-2 flex items-center justify-center gap-1.5 text-[0.7rem] text-muted-foreground" data-caller-id>
      <span className="shrink-0">Call from</span>
      <select value={current} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label="Caller ID for calls out"
        title="Auto: the local number for the project's area code. Type an area code to jump to it."
        className="min-w-0 max-w-[13rem] truncate rounded-md border border-[var(--panel-border)] bg-transparent px-1.5 py-0.5 text-[0.7rem] font-medium text-foreground disabled:opacity-60"
        data-caller-id-select>
        <option value={AUTO}>Auto · the project&apos;s area code</option>
        {local.length ? <optgroup label="Local numbers">{local.map(option)}</optgroup> : null}
        {others.length ? <optgroup label="Company lines">{others.map(option)}</optgroup> : null}
      </select>
    </label>
  );
}
