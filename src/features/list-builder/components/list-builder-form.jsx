"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Building2, Factory, MapPin, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select } from "@/components/ui/field";
import SectionHeader from "@/components/shared/section-header";
import SicTree from "@/features/list-builder/components/sic-tree";
import TagInput from "@/features/list-builder/components/tag-input";
import { countyZips, radiusPreview, saveListRequest, submitProspectRequest, territorySuggest } from "@/features/list-builder/actions";
import { MAX_RADIUS_MILES, buildTree, criteriaSummary, groupOf } from "@/lib/list-builder";
import { US_STATES } from "@/lib/project-info";
import { cn } from "@/lib/utils";

// A ZIP tag: its five digits (a ZIP+4 loses the four), or not taken.
const zipTag = (t) => (/^\d{5}(-\d{4})?$/.test(t.trim()) ? t.trim().slice(0, 5) : null);

/** The states as boxes to tick, two letters each. */
function StatePicker({ value, onChange, label }) {
  const on = new Set(value);
  const flip = (s) => onChange(on.has(s) ? value.filter((x) => x !== s) : [...value, s].sort());
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label} data-state-picker={label}>
      {US_STATES.map((s) => (
        <button key={s} type="button" aria-pressed={on.has(s)} onClick={() => flip(s)}
          className={cn("w-10 rounded-md border py-1 text-xs font-semibold tabular-nums transition-colors",
            on.has(s) ? "border-primary bg-primary text-primary-foreground" : "border-[var(--panel-border)] text-muted-foreground hover:border-primary/40 hover:text-foreground")}>
          {s}
        </button>
      ))}
    </div>
  );
}

/**
 * A list request (Sean, Oct 2026): who it is for, the industries (the SIC
 * tree), the employee size for each 2-digit group picked (from and to), the
 * territory (states, counties, cities, ZIP codes, a radius around a ZIP) and
 * what to leave out of it, and notes. Staff keep it for any client; a client
 * for themselves; a prospect, from a link, says who they are and sends it.
 *
 *   mode     "staff" | "client" | "prospect"
 *   rows     the SIC tree's rows
 *   initial  a request to change ({ id, companyId, title, criteria, notes }), or none
 *   clients  [{ value, label }] for staff
 *   before   { code: when } the client asked for before
 *   token    the prospect's link
 */
export default function ListBuilderForm({ mode, rows, initial = null, clients = [], before = {}, token = null }) {
  const router = useRouter();
  const tree = useMemo(() => buildTree(rows), [rows]);
  const c0 = initial?.criteria ?? {};
  const [companyId, setCompanyId] = useState(initial?.companyId ? String(initial.companyId) : "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [picked, setPicked] = useState(() => new Set(c0.sic ?? []));
  const [employees, setEmployees] = useState(c0.employees ?? {});
  const [inc, setInc] = useState({ states: c0.include?.states ?? [], counties: c0.include?.counties ?? [], cities: c0.include?.cities ?? [], zips: c0.include?.zips ?? [] });
  const [exc, setExc] = useState({ states: c0.exclude?.states ?? [], counties: c0.exclude?.counties ?? [], cities: c0.exclude?.cities ?? [], zips: c0.exclude?.zips ?? [] });
  const [radius, setRadius] = useState({ zip: c0.include?.radius?.zip ?? "", miles: c0.include?.radius?.miles ? String(c0.include.radius.miles) : "" });
  const [found, setFound] = useState(null); // { count, zips } for the radius
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [who, setWho] = useState({ name: "", company: "", email: "", phone: "" });
  const [sent, setSent] = useState(false);
  // The ZIP codes in each county chosen (the Census's), to leave some out.
  const [countyLists, setCountyLists] = useState([]);
  useEffect(() => {
    let live = true;
    if (!inc.counties.length) { setCountyLists([]); return undefined; }
    countyZips(inc.counties, inc.states).then((lists) => { if (live) setCountyLists(lists); }).catch(() => {});
    return () => { live = false; };
  }, [inc.counties, inc.states]);
  const toggleZip = (z) => setExc((e) => ({ ...e, zips: e.zips.includes(z) ? e.zips.filter((x) => x !== z) : [...e.zips, z] }));
  // Counties and cities suggested from the states picked (every state when none are).
  const suggestFrom = (kind) => (q) => territorySuggest(kind, inc.states, q);
  const [pending, start] = useTransition();
  const [finding, startFinding] = useTransition();

  // The 2-digit groups the picked codes fall in, for their employee sizes.
  const groups = useMemo(() => {
    const out = [...new Set([...picked].map(groupOf))].sort();
    return out.map((g) => ({ code: g, name: tree.byCode.get(g)?.name ?? tree.byCode.get(g === "99" ? "99" : g)?.name ?? "" }));
  }, [picked, tree]);
  const setEmp = (g, end, v) => setEmployees((e) => ({ ...e, [g]: { ...(e[g] ?? {}), [end]: v.replace(/[^\d]/g, "") } }));

  const criteria = () => ({
    sic: [...picked].sort(),
    employees: Object.fromEntries(groups.map((g) => [g.code, employees[g.code] ?? {}])),
    include: {
      states: inc.states, counties: inc.counties, cities: inc.cities, zips: inc.zips,
      radius: radius.zip && Number(radius.miles) > 0 ? { zip: radius.zip.trim(), miles: Number(radius.miles) } : null,
    },
    exclude: { states: exc.states, counties: exc.counties, cities: exc.cities, zips: exc.zips },
  });

  const findRadius = () => startFinding(async () => {
    const r = await radiusPreview(radius.zip.trim(), radius.miles);
    if (r.ok) setFound(r.data);
    else { setFound(null); toast.error(r.error); }
  });

  const save = () => start(async () => {
    if (!picked.size) { toast.error("Pick at least one industry"); return; }
    if (mode === "prospect") {
      if (!who.name.trim() || !who.email.trim()) { toast.error("Give your name and email, so we can reach you"); return; }
      const r = await submitProspectRequest({ token, prospect: who, criteria: criteria(), notes });
      if (r.ok) setSent(true);
      else toast.error(r.error);
      return;
    }
    const r = await saveListRequest({ id: initial?.id ?? null, companyId: companyId || null, title, criteria: criteria(), notes });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(initial?.id ? "Request saved" : "Request kept");
    router.push(`/list-builder/${r.data.id}`);
  });

  if (sent) {
    return (
      <Card className="p-8 text-center" data-request-sent>
        <h2 className="text-lg font-semibold">Thank you, your request is in</h2>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll look at the businesses you picked and be in touch at {who.email}.</p>
      </Card>
    );
  }

  const out = new Set(exc.zips);
  const summary = criteriaSummary({ ...criteria(), zips: [...new Set([...inc.zips, ...(found?.zips ?? []).map((z) => z.zip), ...countyLists.flatMap((c) => c.zips)])].filter((z) => !out.has(z)) });

  return (
    <div className="space-y-4" data-list-builder={mode}>
      <Card>
        <SectionHeader label={mode === "prospect" ? "About you" : "The request"} icon={Building2} />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {mode === "prospect" ? (
            <>
              <Field label="Your name" required><Input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} maxLength={120} data-prospect="name" /></Field>
              <Field label="Agency / company"><Input value={who.company} onChange={(e) => setWho({ ...who, company: e.target.value })} maxLength={160} data-prospect="company" /></Field>
              <Field label="Email" required><Input type="email" value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} maxLength={254} data-prospect="email" /></Field>
              <Field label="Phone"><Input value={who.phone} onChange={(e) => setWho({ ...who, phone: e.target.value })} maxLength={40} data-prospect="phone" /></Field>
            </>
          ) : (
            <>
              {mode === "staff" ? (
                <Field label="Client" hint="Leave blank for a prospect or a list of our own">
                  <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Client" data-request-client>
                    <option value="">— None —</option>
                    {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                </Field>
              ) : null}
              <Field label="Name for this request" hint="e.g. Contractors, Maricopa County, 2027">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} data-request-title />
              </Field>
            </>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader label="Industries" icon={Factory} action={<span className="text-xs text-muted-foreground">Open a sector with +, tick what you want</span>} />
        <div className="p-5">
          <SicTree tree={tree} picked={picked} onChange={setPicked} before={before} />
          {Object.keys(before).length ? <p className="mt-2 text-xs text-muted-foreground">Marked <strong>before</strong>: asked for in an earlier request.</p> : null}
        </div>
      </Card>

      {groups.length ? (
        <Card data-employee-sizes>
          <SectionHeader label="Employee size, by industry group" icon={Users} action={<span className="text-xs text-muted-foreground">Leave blank for any size</span>} />
          <div className="divide-y divide-[var(--panel-border)]">
            {groups.map((g) => (
              <div key={g.code} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-3 px-5 py-2" data-employee-group={g.code}>
                <span className="min-w-0 text-sm"><span className="tabular-nums text-muted-foreground">{g.code}</span> · {g.name}</span>
                <Input inputMode="numeric" placeholder="From" value={employees[g.code]?.min ?? ""} onChange={(e) => setEmp(g.code, "min", e.target.value)} aria-label={`${g.code} employees from`} data-employees-min={g.code} />
                <Input inputMode="numeric" placeholder="To" value={employees[g.code]?.max ?? ""} onChange={(e) => setEmp(g.code, "max", e.target.value)} aria-label={`${g.code} employees to`} data-employees-max={g.code} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card data-territory="include">
          <SectionHeader label="Territory" icon={MapPin} />
          <div className="space-y-4 p-5">
            <Field label="States"><StatePicker label="States" value={inc.states} onChange={(v) => setInc({ ...inc, states: v })} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Counties" hint="Type to find one, or type it and a comma"><TagInput label="Counties" suggest={suggestFrom("counties")} value={inc.counties} onChange={(v) => setInc({ ...inc, counties: v })} placeholder="e.g. Maricopa, Pinal" data-tag-input="include-counties" /></Field>
              <Field label="Cities" hint="Type to find one, or type it and a comma"><TagInput label="Cities" suggest={suggestFrom("cities")} value={inc.cities} onChange={(v) => setInc({ ...inc, cities: v })} placeholder="e.g. Mesa, Tempe" data-tag-input="include-cities" /></Field>
            </div>
            {countyLists.length ? (
              <div className="space-y-2" data-county-zips>
                {countyLists.map((c) => {
                  const left = c.zips.filter((z) => out.has(z)).length;
                  return (
                    <details key={c.county} className="rounded-lg border border-[var(--panel-border)] p-3" data-county-zip-list={c.county}>
                      <summary className="cursor-pointer text-sm">
                        <strong>{c.county}</strong>
                        <span className="text-muted-foreground"> · {c.zips.length ? `${c.zips.length} ZIP codes${left ? `, ${left} left out` : ""}` : "not found: pick it from the suggestions to see its ZIP codes"}</span>
                      </summary>
                      {c.zips.length ? (
                        <>
                          <p className="mt-2 text-xs text-muted-foreground">Click a ZIP to leave it out (click again to keep it).</p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {c.zips.map((z) => (
                              <button key={z} type="button" aria-pressed={out.has(z)} onClick={() => toggleZip(z)} data-county-zip={z}
                                className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors",
                                  out.has(z) ? "border-destructive/40 bg-destructive/10 text-destructive line-through" : "border-[var(--panel-border)] text-foreground/80 hover:border-primary/40")}>
                                {z}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </details>
                  );
                })}
              </div>
            ) : null}
            <Field label="ZIP codes" hint="Type or paste them, a comma between">
              <TagInput label="ZIP codes" value={inc.zips} onChange={(v) => setInc({ ...inc, zips: v })} normalize={zipTag} placeholder="e.g. 85201, 85202" data-tag-input="include-zips" />
            </Field>
            <div className="rounded-lg border border-[var(--panel-border)] p-3" data-radius>
              <div className="text-sm font-medium">A radius around a ZIP</div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Field label="Miles" className="w-24"><Input inputMode="decimal" value={radius.miles} onChange={(e) => { setRadius({ ...radius, miles: e.target.value }); setFound(null); }} data-radius-miles /></Field>
                <span className="pb-2 text-sm text-muted-foreground">of</span>
                <Field label="ZIP" className="w-28"><Input inputMode="numeric" maxLength={5} value={radius.zip} onChange={(e) => { setRadius({ ...radius, zip: e.target.value.replace(/\D/g, "") }); setFound(null); }} data-radius-zip /></Field>
                <Button type="button" variant="outline" size="sm" onClick={findRadius} disabled={finding || radius.zip.length !== 5 || !(Number(radius.miles) > 0)} data-radius-find>
                  {finding ? "Finding…" : "Find the ZIPs"}
                </Button>
              </div>
              {found ? (
                <details className="mt-2 text-xs text-muted-foreground" data-radius-found={found.count}>
                  <summary className="cursor-pointer"><strong className="text-foreground">{found.count.toLocaleString()} ZIP codes</strong> within {radius.miles} miles of {radius.zip}</summary>
                  <p className="mt-1 break-words tabular-nums">{found.zips.map((z) => z.zip).join(", ")}{found.count > found.zips.length ? " …" : ""}</p>
                </details>
              ) : <p className="mt-2 text-xs text-muted-foreground">Up to {MAX_RADIUS_MILES} miles, from the Census Bureau&apos;s ZIP code points.</p>}
            </div>
          </div>
        </Card>

        <Card data-territory="exclude">
          <SectionHeader label="Leave out" icon={Ban} />
          <div className="space-y-4 p-5">
            <Field label="States"><StatePicker label="Leave out states" value={exc.states} onChange={(v) => setExc({ ...exc, states: v })} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Counties"><TagInput label="Leave out counties" suggest={suggestFrom("counties")} value={exc.counties} onChange={(v) => setExc({ ...exc, counties: v })} placeholder="e.g. Pinal" data-tag-input="exclude-counties" /></Field>
              <Field label="Cities"><TagInput label="Leave out cities" suggest={suggestFrom("cities")} value={exc.cities} onChange={(v) => setExc({ ...exc, cities: v })} placeholder="e.g. Apache Junction" data-tag-input="exclude-cities" /></Field>
            </div>
            <Field label="ZIP codes" hint="Taken out of the radius and the ZIPs above">
              <TagInput label="Leave out ZIP codes" value={exc.zips} onChange={(v) => setExc({ ...exc, zips: v })} normalize={zipTag} placeholder="e.g. 85203" data-tag-input="exclude-zips" />
            </Field>
          </div>
        </Card>
      </div>

      <Card>
        <div className="space-y-3 p-5">
          <Field label="Notes" hint="Anything else about the businesses you want">
            <Textarea rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} data-request-notes />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground" data-request-summary>{summary}</span>
            <Button type="button" onClick={save} disabled={pending} data-request-save>
              <Send /> {pending ? "Saving…" : mode === "prospect" ? "Send my request" : initial?.id ? "Save changes" : "Save request"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
