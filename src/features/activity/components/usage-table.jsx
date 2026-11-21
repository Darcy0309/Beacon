"use client";

import { useMemo, useState } from "react";
import ToneBadge from "@/components/shared/tone-badge";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const roleTone = { Administrator: "amber", Manager: "cyan", Agent: "violet", Client: "violet", "Agent (staff)": "emerald" };
// The kinds of account, in this order (Sean, Nov 2026: "select Client, Agent, or Manager"). A client's agents are
// its logins kept to some of its projects (its producers); Lighthouse's own Agents are staff.
const KINDS = [
  ["client", "Clients"],
  ["client_agent", "Agents"],
  ["manager", "Managers"],
  ["agent", "Agents (old staff role)"],
  ["admin", "Administrators"],
];

/** How busy an account is, relative to the busiest one shown, as a bar width. */
function Bar({ value, max, color }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Usage by Account (Nov 2026): each account's sign-ins and changes, shown for a kind of account (Clients, their
 * agents, Managers…) and, for clients' logins, one client; the bars against the busiest shown.
 */
export default function UsageTable({ rows }) {
  const [kind, setKind] = useState("");
  const [client, setClient] = useState("");
  const kinds = KINDS.filter(([k]) => rows.some((r) => r.kind === k));
  const clientKinds = kind === "" || kind === "client" || kind === "client_agent";
  const clients = useMemo(() => [...new Set(rows.filter((r) => r.client && r.kind.startsWith("client")).map((r) => r.client))].sort((a, b) => a.localeCompare(b)), [rows]);
  const picked = rows.filter((r) => (!kind || r.kind === kind) && (!client || !clientKinds || r.client === client));
  // One client: its own login first, its agents under it.
  const nested = Boolean(client && clientKinds);
  const shown = nested ? [...picked].sort((a, b) => (a.kind === "client_agent") - (b.kind === "client_agent")) : picked;
  const maxLogins = Math.max(1, ...shown.map((u) => u.loginsMonth));
  const maxActions = Math.max(1, ...shown.map((u) => u.actions30d));
  const chip = (on) => cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    on ? "border-primary bg-primary/15 text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-primary");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--panel-border)] px-5 py-3" data-usage-filters>
        <button type="button" onClick={() => setKind("")} aria-pressed={!kind} className={chip(!kind)} data-usage-kind="">All · {rows.length}</button>
        {kinds.map(([k, label]) => {
          const n = rows.filter((r) => r.kind === k).length;
          return (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={chip(kind === k)} data-usage-kind={k}>
              {label} · {n}
            </button>
          );
        })}
        {clients.length && clientKinds ? (
          <label className="ml-auto flex items-center gap-2 text-xs font-semibold">
            Client
            <Select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Filter by client" className="w-56" data-usage-client>
              <option value="">Every client</option>
              {clients.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </label>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm" data-usage-table>
          <thead className="[&_tr]:border-b [&_tr]:border-[var(--panel-border)]">
            <tr>
              {["User", "Role", "Sign-ins this month", "Last 30 days", "Changes (30d)", "Last active"].map((h) => (
                <th key={h} className="h-10 whitespace-nowrap px-4 text-left align-middle text-[0.66rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {/* A client's own login first, then its agents (Sean, Nov 2026: "Jeff's usage … and any of his agents below him"). */}
            {shown.map((u) => {
              // A client's agent is an Agent (Sean, Nov 2026); the old staff role says so.
              const role = u.kind === "client_agent" ? "Agent" : u.kind === "agent" ? "Agent (staff)" : u.role;
              return (
                <tr key={u.id} className="border-b border-[var(--panel-border)]" data-usage-row={u.id} data-kind={u.kind}>
                  <td className="px-4 py-3.5 align-middle">
                    <div className={cn("flex items-center gap-3", nested && u.kind === "client_agent" && "pl-8")} data-nested={nested && u.kind === "client_agent" ? "" : undefined}>
                      <span className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: u.color }}>{u.initials}</span>
                      <div>
                        {/* Their own activity, below (Nov 2026). */}
                        <a href={`/activity?user=${encodeURIComponent(u.email)}#everything`} className="font-medium hover:text-primary hover:underline" data-usage-person>{u.name}</a>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 align-middle">
                    <ToneBadge tone={roleTone[role] ?? "slate"}>{role}</ToneBadge>
                    {u.client && u.kind.startsWith("client") ? <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={u.client}>{u.client}</div> : null}
                  </td>
                  <td className="px-4 py-3.5 align-middle"><Bar value={u.loginsMonth} max={maxLogins} color="var(--neon-cyan)" /></td>
                  <td className="px-4 py-3.5 align-middle tabular-nums text-muted-foreground">{u.logins30d}</td>
                  <td className="px-4 py-3.5 align-middle"><Bar value={u.actions30d} max={maxActions} color="var(--neon-violet)" /></td>
                  <td className={`px-4 py-3.5 align-middle ${u.lastActive === "Never" ? "text-muted-foreground" : ""}`}>{u.lastActive}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">{rows.length ? "No accounts of this kind." : "Nothing recorded yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
