"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, Link2, Power, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import { createListLink, loadSicSheet, setListLinkActive, setListRequestStatus } from "@/features/list-builder/actions";
import { STATUSES, codesCsv, territoryCsv } from "@/lib/list-builder";

const download = (name, text) => {
  const url = URL.createObjectURL(new Blob([`﻿${text}\r\n`], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const fileName = (s) => String(s || "ListRequest").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "ListRequest";

/** A request's two exports: its codes one to a line (to paste into the vendor's site), and its territory. */
export function RequestExports({ request, names }) {
  const base = `${fileName(request.title || request.client || request.prospect?.company)}_${request.id}`;
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => download(`${base}_SIC.csv`, codesCsv(request.criteria, names))} data-export-codes>
        <Download /> SIC codes (CSV)
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => download(`${base}_Territory.csv`, territoryCsv(request.criteria))} data-export-territory>
        <Download /> Territory (CSV)
      </Button>
    </div>
  );
}

/** Where a request stands, for staff to move on. */
export function RequestStatus({ id, status }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select value={status} disabled={pending} aria-label="Where it stands" className="h-8 w-auto text-xs" data-request-status
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          const r = await setListRequestStatus(id, next);
          if (r.ok) { toast.success("Updated"); router.refresh(); } else toast.error(r.error);
        });
      }}>
      {STATUSES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </Select>
  );
}

/** Links for prospects: make one (a label, its Sales Rep, a client if any, how many days open), copy it, turn it off. */
export function ProspectLinks({ links, reps, clients, origin }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [rep, setRep] = useState("");
  const [client, setClient] = useState("");
  const [days, setDays] = useState("30");
  const [pending, start] = useTransition();
  const copy = async (token) => {
    const url = `${origin}/request/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.message(url);
    }
  };
  const make = () => start(async () => {
    const r = await createListLink({ label, salesRepId: rep || null, companyId: client || null, days });
    if (!r.ok) { toast.error(r.error); return; }
    setLabel("");
    await copy(r.data.token);
    router.refresh();
  });
  const flip = (l) => start(async () => {
    const r = await setListLinkActive(l.id, !l.active);
    if (r.ok) router.refresh(); else toast.error(r.error);
  });
  return (
    <div className="space-y-4 p-5" data-prospect-links>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_auto]">
        <Field label="For"><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Farmers agent, Tempe" maxLength={120} data-link-label /></Field>
        <Field label="Sales Rep"><Select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="Sales Rep">
          <option value="">Me</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label="Client"><Select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client for the link">
          <option value="">A prospect</option>{clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
        <Field label="Days open"><Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} data-link-days /></Field>
        <Button type="button" onClick={make} disabled={pending} data-link-make><Link2 /> Make a link</Button>
      </div>
      {links.length ? (
        <ul className="divide-y divide-[var(--panel-border)] rounded-lg border border-[var(--panel-border)]">
          {links.map((l) => {
            const over = l.expires && new Date(l.expires) < new Date();
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm" data-link={l.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{l.label || "Prospect link"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[l.salesRep ? `Sales Rep ${l.salesRep}` : null, l.client, !l.active ? "Turned off" : over ? "Expired" : l.expires ? `Open until ${new Date(l.expires).toLocaleDateString()}` : "Open"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <Button type="button" size="sm" variant="outline" onClick={() => copy(l.token)} disabled={!l.active} data-link-copy={l.id}><Copy /> Copy link</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => flip(l)} disabled={pending} data-link-toggle={l.id}><Power /> {l.active ? "Turn off" : "Turn on"}</Button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No links yet. Make one, and it is copied, ready to send.</p>}
    </div>
  );
}

/** An administrator loads the SIC sheet (saved from Excel as CSV): names set, new codes added. */
export function SicSheetUpload() {
  const router = useRouter();
  const ref = useRef(null);
  const [pending, start] = useTransition();
  const send = (file) => {
    if (!file) return;
    const f = new FormData();
    f.set("file", file);
    start(async () => {
      const r = await loadSicSheet(f);
      if (r.ok) { toast.success(`${r.data.count.toLocaleString()} codes loaded`); router.refresh(); } else toast.error(r.error);
      if (ref.current) ref.current.value = "";
    });
  };
  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => send(e.target.files?.[0])} data-sic-upload />
      <Button type="button" size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={pending}><Upload /> {pending ? "Loading…" : "Load the SIC sheet"}</Button>
    </>
  );
}
