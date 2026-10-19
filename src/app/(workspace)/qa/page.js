import { ClipboardCheck, CalendarCheck, Inbox, Ban, Send } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import ToneBadge from "@/components/shared/tone-badge";
import StatTile from "@/components/shared/stat-tile";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import FilterTable from "@/components/shared/filter-table";
import { listQaCalls, getQaQueue, QA_RESULT_OPTIONS } from "@/features/qa/queries";
import QaQueue from "@/features/qa/components/qa-queue";
import { getCurrentUser } from "@/lib/server/session";
import { getBusinessTimeZone, getBusinessToday } from "@/lib/server/business-day";
import { appointmentSpan } from "@/lib/appointment-links";
import { hourLabel, nextClearing, ZONES } from "@/lib/delivery-schedule";
import HeldDeliveries from "@/features/delivery/components/held-deliveries";
import { getHeldDeliveries } from "@/features/delivery/hold-queries";
import { readListParams, pageInfo } from "@/lib/paging";

export const dynamic = "force-dynamic";

const resultTone = { Passed: "emerald", Review: "amber", Failed: "rose" };
const scoreColor = (s) => (s >= 85 ? "var(--neon-emerald)" : s >= 70 ? "var(--neon-amber)" : "var(--neon-rose)");

export default async function QaPage({ searchParams }) {
  const params = readListParams(await searchParams, ["result", "rep"]);
  // What waits to go to clients (administrators: they send it), read alongside the rest.
  const meP = getCurrentUser();
  const todayP = getBusinessToday();
  const tzP = getBusinessTimeZone();
  const heldP = Promise.all([meP, todayP, tzP]).then(([me, today, tz]) => (me?.role === "admin"
    ? getHeldDeliveries({ since: appointmentSpan(today, "12:00 AM", 0, tz).start.toISOString() })
    : null));
  const [{ rows, total, reps }, queue, me, today, tz, held] = await Promise.all([listQaCalls(params), getQaQueue(), meP, todayP, tzP, heldP]);
  const admin = me?.role === "admin";
  const waiting = held?.rows.filter((r) => r.status !== "failed") ?? [];
  const heldBack = held?.rows.filter((r) => r.status === "failed") ?? [];

  // How each kind goes out, and when the schedule next clears what is held.
  const st = held?.settings;
  const mode = (m) => (m === "hold" ? "held for QA" : "sent immediately");
  const summary = st
    ? `Leads: ${mode(st.leads)} · Appointments: ${mode(st.appointments)} · ${st.every
      ? `held ones go every ${st.every === 1 ? "hour" : `${st.every} hours`}, ${hourLabel(st.from)}–${hourLabel(st.to)} ${ZONES.find(([z]) => z === st.zone)?.[1] ?? ""}; next ${nextClearing(st)}.`
      : "held ones go only when sent from here."}`
    : "";

  const tiles = admin
    ? [
        { label: "Waiting to Send", value: String(waiting.length), note: "held for QA", icon: Inbox, accent: "var(--neon-cyan)" },
        { label: "Held Back", value: String(heldBack.length), note: "waiting for the manager", icon: Ban, accent: "var(--neon-rose)" },
        { label: "Sent Today", value: String(held.sentToday), note: "leads & appointments to clients", icon: Send, accent: "var(--neon-emerald)" },
        { label: "Appointments in QA", value: String(queue.length), note: "waiting for pass or fail", icon: CalendarCheck, accent: "var(--neon-amber)" },
      ]
    : [{ label: "Appointments in QA", value: String(queue.length), note: "waiting for pass or fail", icon: CalendarCheck, accent: "var(--neon-amber)" }];

  return (
    <>
      <Topbar title="Quality QA" sub={admin ? `${waiting.length} waiting to go to clients · ${queue.length} appointments in QA` : `${queue.length} appointments in QA`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="expand-row grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex" data-from="xl">
          {tiles.map((t, i) => (
            <StatTile key={t.label} {...t} className="animate-pop-in" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>

        {held ? (
          <Card id="waiting-to-send">
            <SectionHeader label="Waiting to Send to Clients" icon={Inbox}
              action={held.rows.length ? <span className="text-[0.66rem] font-semibold text-amber-300">{held.rows.length} held</span> : null} />
            {held.missing ? (
              <p className="px-5 py-6 text-sm text-amber-500" data-held-missing>
                Holding leads and appointments for QA isn&apos;t set up on the database yet (migration 20261118100000_delivery_holds.sql).
                Until it is, everything goes to clients straight away.
              </p>
            ) : (
              <HeldDeliveries rows={held.rows} summary={summary} />
            )}
          </Card>
        ) : null}

        <Card>
          <SectionHeader
            label="Appointments Waiting for QA"
            icon={CalendarCheck}
            action={queue.length ? <span className="text-[0.66rem] font-semibold text-amber-300">{queue.length} waiting</span> : null}
          />
          <QaQueue items={queue} me={me ? { id: me.id, role: me.role } : null} />
        </Card>

        <Card>
          <SectionHeader label="Recent Scored Calls" icon={ClipboardCheck} />
          <FilterTable
            columns={["Rep", "Client", { label: "Score", className: "w-56" }, "Result", "Date"]}
            filters={[
              { key: "result", label: "Result", options: QA_RESULT_OPTIONS },
              { key: "rep", label: "Rep", kind: "select", options: reps },
            ]}
            placeholder="Search by client…"
            empty="No scored calls yet."
            query={params.q}
            selected={params.filters}
            paging={pageInfo(total, params.page, params.perPage)}
            rows={rows.map((q) => ({
              id: q.id,
              node: (
                <TableRow>
                  <TableCell className="font-medium">{q.rep}</TableCell>
                  <TableCell>{q.client}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${q.score}%`, background: scoreColor(q.score), boxShadow: `0 0 10px -2px ${scoreColor(q.score)}` }} />
                      </div>
                      <span className="font-semibold tabular-nums" style={{ color: scoreColor(q.score) }}>{q.score}</span>
                    </div>
                  </TableCell>
                  <TableCell><ToneBadge tone={resultTone[q.result] ?? "slate"}>{q.result}</ToneBadge></TableCell>
                  <TableCell className="text-muted-foreground">{q.date}</TableCell>
                </TableRow>
              ),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
