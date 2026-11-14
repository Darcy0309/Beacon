"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import CallTimesChart from "@/features/dashboard/components/call-times-chart";
import { knownZone, zoneShort } from "@/lib/own-clock";

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
 *
 * On a manager's dashboard (Sean, Nov 2026) it shows their own line to begin
 * with, and the team (account managers only) a click away: `scope` "me" or
 * "team", `scopeLinks` { me, team } the addresses of each, `userId` whose
 * line "me" is. First call: when each person's first call out started, on
 * their own clock (their account's time zone, named when it is not the
 * business's `timeZone`); the total's on the business's.
 */
export default function CallActivityCard({ rows: initial, view, switcher, nav, scope = "all", scopeLinks = null, userId = null, timeZone }) {
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
      fetch(`/api/phone/calls?ck=${view.key}&cd=${view.anchor}&cs=${scope}${userId ? `&cu=${userId}` : ""}`, { cache: "no-store" })
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
  }, [live, view.key, view.anchor, scope, userId]);

  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const avg = (talk, handled) => (handled ? talk / handled : 0);
  const totalHandled = sum("outHandled") + sum("inHandled");
  // The time of day for a day's view; with the day too over a longer one. On `tz`'s clock, its zone
  // named when it is not the business's.
  const clock = (iso, tz = null) => {
    if (!iso) return "—";
    const at = new Date(iso);
    const zone = knownZone(tz, timeZone) || undefined;
    const text = at.toLocaleString("en-US", {
      timeZone: zone, hour: "numeric", minute: "2-digit",
      ...(view.key === "day" ? {} : { month: "short", day: "numeric" }),
    });
    return zone && timeZone && zone !== timeZone && zoneShort(zone, at) !== zoneShort(timeZone, at) ? `${text} ${zoneShort(zone, at)}` : text;
  };
  // Anyone here on another clock: the total's time names the business's.
  const mixed = rows.some((r) => r.firstCall && r.timeZone && clock(r.firstCall, r.timeZone) !== clock(r.firstCall));
  const firsts = rows.map((r) => r.firstCall).filter(Boolean).sort();
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
        <span className="flex flex-wrap items-center gap-2">
          {scopeLinks ? (
            <span className="inline-flex rounded-md border border-[var(--panel-border)] p-0.5 text-xs" role="group" aria-label="Whose calls" data-call-scope={scope}>
              {[["me", "Mine"], ["team", "Team"]].map(([k, label]) => (
                <Link key={k} href={scopeLinks[k]} scroll={false} aria-current={scope === k ? "true" : undefined} data-call-scope-link={k}
                  className={cn("rounded px-2.5 py-1 font-medium transition-colors", scope === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </Link>
              ))}
            </span>
          ) : null}
          {nav}
          {/* A day's calls added up through the day, for everyone here or one person (Sean, Nov 2026). */}
          {view.key === "day" ? (
            <CallTimesChart day={view.anchor} today={view.today} scope={scope} userId={userId} timeZone={timeZone}
              people={rows.filter((r) => r.userId).map((r) => ({ id: r.userId, name: r.name, timeZone: r.timeZone }))} />
          ) : null}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">First call</TableHead>
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
                <TableCell className={cn("text-right tabular-nums", !r.firstCall && "text-muted-foreground")} data-col="first">{r.userId ? clock(r.firstCall, r.timeZone) : ""}</TableCell>
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
                <TableCell className="text-right tabular-nums" data-col="first">{firsts.length ? `${clock(firsts[0])}${mixed && timeZone ? ` ${zoneShort(timeZone, new Date(firsts[0])) ?? ""}` : ""}`.trim() : "—"}</TableCell>
                {COLUMNS.map(([k]) => <TableCell key={k} className="text-right tabular-nums" data-col={k}>{sum(k)}</TableCell>)}
                <TableCell className="text-right tabular-nums" data-col="avg">{talkClock(avg(sum("talk"), totalHandled))}</TableCell>
                <TableCell className="text-right tabular-nums" data-col="talk">{talkClock(sum("talk"))}</TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={COLUMNS.length + 4} className="py-6 text-center text-sm text-muted-foreground">No calls yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
