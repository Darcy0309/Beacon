"use client";

import { useEffect, useState } from "react";
import { PhoneCall } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

// How often the numbers are asked for again while the card shows today.
const REFRESH_MS = 20_000;

/** A length of time as the Streams report wrote it: "0:00:17", "1:29:00". */
export function talkClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// The columns, as the Streams call report had them (and the calls taken, which it counted in its total).
const COLUMNS = [
  ["total", "Total calls"],
  ["outHandled", "Outbound handled"],
  ["inHandled", "Inbound handled"],
  ["missed", "Missed"],
  ["outCancelled", "Outbound cancelled"],
];

/**
 * Call Activity (Nov 2026), on the administrators' and account managers'
 * dashboards: each person's calls on the phone's Twilio line over the day
 * (or pay period, week or month) chosen, as the Streams call report had
 * them. Calls answered are handled; a call out not answered (busy, no
 * answer, hung up first) is cancelled; a call in that rang them and nobody
 * took is missed. Talk time counts calls answered, its average over them.
 * While it shows today it asks again every 20 seconds, and a person on a
 * call now is marked so. `rows`: getCallActivity(); `view`: readView().
 */
export default function CallActivityCard({ rows: initial, view, switcher, nav }) {
  const [rows, setRows] = useState(initial);
  const [live, setLive] = useState(view.showsToday);
  // Another period chosen: the server's numbers for it.
  useEffect(() => {
    setRows(initial);
    setLive(view.showsToday);
  }, [initial, view.showsToday]);

  useEffect(() => {
    if (!live) return;
    let gone = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`/api/phone/calls?ck=${view.key}&cd=${view.anchor}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d) => {
          if (gone) return;
          setRows(d.rows);
          setLive(d.live);
        })
        // The numbers already shown stay until the next try.
        .catch(() => {});
    };
    const t = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      gone = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [live, view.key, view.anchor]);

  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const avg = (talk, handled) => (handled ? talk / handled : 0);
  const totalHandled = sum("outHandled") + sum("inHandled");
  return (
    <Card data-call-activity>
      <SectionHeader wrap label="Call Activity" icon={PhoneCall} action={switcher} />
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {live ? (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span data-call-activity-live>Live: calls on the Lighthouse phone, as they happen</span>
            </>
          ) : (
            "Calls on the Lighthouse phone"
          )}
        </span>
        {nav}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              {COLUMNS.map(([k, label]) => <TableHead key={k} className="text-right">{label}</TableHead>)}
              <TableHead className="text-right">Average talk time</TableHead>
              <TableHead className="text-right">Total talk time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId ?? "nobody"} data-call-row={r.userId ?? "nobody"}>
                <TableCell className={cn("font-medium", !r.userId && "text-muted-foreground")}>
                  <span className="flex items-center gap-2">
                    {r.name}
                    {r.onCall ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-500" data-on-call>
                        On a call
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                {COLUMNS.map(([k]) => (
                  <TableCell key={k} data-col={k}
                    className={cn("text-right tabular-nums", !r[k] && "text-muted-foreground", k === "missed" && r[k] > 0 && "font-semibold text-rose-500")}>
                    {r[k]}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums" data-col="avg">{r.userId ? talkClock(avg(r.talk, r.outHandled + r.inHandled)) : ""}</TableCell>
                <TableCell className="text-right tabular-nums" data-col="talk">{r.userId ? talkClock(r.talk) : ""}</TableCell>
              </TableRow>
            ))}
            {rows.length ? (
              <TableRow className="font-semibold" data-call-row="total">
                <TableCell className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{view.key === "day" ? "Day total" : "Total"}</TableCell>
                {COLUMNS.map(([k]) => <TableCell key={k} className="text-right tabular-nums" data-col={k}>{sum(k)}</TableCell>)}
                <TableCell className="text-right tabular-nums" data-col="avg">{talkClock(avg(sum("talk"), totalHandled))}</TableCell>
                <TableCell className="text-right tabular-nums" data-col="talk">{talkClock(sum("talk"))}</TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 3} className="py-6 text-center text-sm text-muted-foreground">No calls yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
