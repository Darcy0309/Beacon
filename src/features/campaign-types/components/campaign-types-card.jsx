"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, FileUp, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteCampaignType, saveCampaignType } from "@/features/campaign-types/actions";
import { BUILTIN_FIELDS, CUSTOM_TYPES, LIST_TYPES, MAX_CHOICES, choicesFrom } from "@/lib/campaign-types";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const SECTIONS = [["tabs", "Tabs"], ["business", "Business tab"], ["coverage", "Coverage tab"], ["info", "Project Info (the project profile)"]];

/**
 * Settings › Campaign Types (Sean, Nov 2026): the lead sheet layouts for industries other than insurance. Each
 * renames or turns off the insurance fields and adds its own; a client is given one on its Edit. Insurance, the
 * built-in layout, is what a client without one has.
 */
export default function CampaignTypesCard({ types }) {
  return (
    <Card data-campaign-types>
      <SectionHeader label="Campaign Types" icon={LayoutTemplate} action={<TypeDialog />} />
      <div className="px-5 py-3 text-xs text-muted-foreground">
        A lead sheet laid out for another industry: rename or turn off the insurance fields, and add your own. Give a client its campaign type on the client&apos;s Edit; clients without one stay on Insurance.
      </div>
      <ul className="divide-y divide-[var(--panel-border)] border-t border-[var(--panel-border)] text-sm">
        <li className="flex items-center gap-3 px-5 py-2.5 text-muted-foreground" data-campaign-type="insurance">
          <span className="font-medium text-foreground">Insurance</span> <span className="text-xs">built in · every client without a campaign type</span>
        </li>
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5" data-campaign-type={t.id}>
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">
              {(t.fields?.custom ?? []).length} own field{(t.fields?.custom ?? []).length === 1 ? "" : "s"} · {t.clients} client{t.clients === 1 ? "" : "s"}
            </span>
            <span className="ml-auto flex items-center gap-1.5"><TypeDialog type={t} /><DeleteType type={t} /></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DeleteType({ type }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!window.confirm(`Delete ${type.name}?${type.clients ? ` Its ${type.clients} client${type.clients === 1 ? "" : "s"} go back to Insurance.` : ""}`)) return;
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(type.id));
      const result = await reach(() => deleteCampaignType(fd));
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${type.name} deleted`);
      router.refresh();
    });
  };
  return (
    <Button type="button" size="sm" variant="outline" onClick={remove} disabled={pending} aria-label={`Delete ${type.name}`} data-delete-campaign-type={type.id}>
      <Trash2 />
    </Button>
  );
}

/** A type's layout from what it has saved: each built-in part's label and whether it shows, and its own fields. */
const startFrom = (type) => ({
  builtin: Object.fromEntries(Object.values(BUILTIN_FIELDS).flat().map((f) => [f.key, {
    label: type?.fields?.builtin?.[f.key]?.label ?? "", hidden: Boolean(type?.fields?.builtin?.[f.key]?.hidden),
  }])),
  custom: (type?.fields?.custom ?? []).map((c) => ({ ...c, options: (c.options ?? []).join("\n") })),
  info_custom: (type?.fields?.info_custom ?? []).map((c) => ({ ...c, options: (c.options ?? []).join("\n") })),
});

function TypeDialog({ type = null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCampaignType, EMPTY);
  const { fe, invalid } = formHelpers(state, {});
  const [f, setF] = useState(() => startFrom(type));
  useEffect(() => { if (open) setF(startFrom(type)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state?.ok) {
      toast.success(type ? "Campaign type saved" : `${state.data?.name} added`);
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBuiltin = (key, patch) => setF((x) => ({ ...x, builtin: { ...x.builtin, [key]: { ...x.builtin[key], ...patch } } }));
  // Its own fields: the Business tab's (`custom`) and Project Info's (`info_custom`).
  const setCustom = (list, i, patch) => setF((x) => ({ ...x, [list]: x[list].map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const move = (listKey, i, by) => setF((x) => {
    const list = [...x[listKey]];
    const [c] = list.splice(i, 1);
    list.splice(Math.max(0, Math.min(list.length, i + by)), 0, c);
    return { ...x, [listKey]: list };
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {type ? <Button size="sm" variant="outline" data-edit-campaign-type={type.id}><Pencil /> Edit</Button>
          : <Button size="sm" data-new-campaign-type><Plus /> New campaign type</Button>}
      </DialogTrigger>
      <DialogContent className="flex max-h-[92svh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{type ? `Edit ${type.name}` : "New campaign type"}</DialogTitle>
          <DialogDescription>Start from the insurance fields: rename them, turn off what doesn&apos;t apply, and add your own questions.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4" data-campaign-type-form>
          {type ? <input type="hidden" name="id" value={type.id} /> : null}
          <input type="hidden" name="fields" value={JSON.stringify(f)} />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <Field label="Name" required error={fe("name")} hint="e.g. IT / MSP">
              <Input name="name" defaultValue={type?.name ?? ""} maxLength={60} aria-invalid={invalid("name")} data-campaign-type-name />
            </Field>

            {SECTIONS.map(([section, title]) => (
              <fieldset key={section} className="rounded-lg border border-[var(--panel-border)] p-3" data-campaign-section={section}>
                <legend className="px-1 text-xs font-semibold">{title}</legend>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {BUILTIN_FIELDS[section].map((b) => {
                    const v = f.builtin[b.key];
                    // Project Info: a section heads its rows (turning it off turns them off).
                    const off = v.hidden || (b.in && f.builtin[`info_sec_${b.in}`]?.hidden);
                    return (
                      <div key={b.key} className={cn("flex items-center gap-2", off && "opacity-50", b.section && "font-semibold sm:col-span-2", b.in && "sm:pl-6")} data-builtin={b.key}>
                        <input type="checkbox" checked={!v.hidden} disabled={b.fixed} onChange={(e) => setBuiltin(b.key, { hidden: !e.target.checked })}
                          aria-label={`Show ${b.label}`} className="size-4 shrink-0 accent-[var(--primary)]" data-builtin-show={b.key} />
                        <Input value={v.label} placeholder={b.label} maxLength={40} onChange={(e) => setBuiltin(b.key, { label: e.target.value })}
                          aria-label={`${b.label}: its name`} className="h-8" data-builtin-label={b.key} />
                      </div>
                    );
                  })}
                </div>
                {section === "coverage" ? (
                  <p className="mt-2 text-[0.7rem] text-muted-foreground">
                    Rename Ultimate XDate to your key date (e.g. Contract renewal) to keep X-Dates by Month, the Match Tool and conversion working for this campaign type.
                  </p>
                ) : null}
              </fieldset>
            ))}

            <OwnFields title="Your own fields (on the Business tab)" listKey="custom" f={f} setF={setF} setCustom={setCustom} move={move} />
            <OwnFields title="Your own Project Info questions" listKey="info_custom" f={f} setF={setF} setCustom={setCustom} move={move} />
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A type's own fields, to add, name, give a kind (and a list its choices), order and remove. */
function OwnFields({ title, listKey, f, setF, setCustom, move }) {
  const list = f[listKey];
  return (
    <fieldset className="rounded-lg border border-[var(--panel-border)] p-3" data-campaign-section={listKey}>
      <legend className="px-1 text-xs font-semibold">{title}</legend>
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={c.id ?? i} className="grid grid-cols-[1fr_12rem_auto] items-start gap-2" data-custom-field={i}>
            <div className="space-y-1.5">
              <Input value={c.label} maxLength={40} onChange={(e) => setCustom(listKey, i, { label: e.target.value })}
                placeholder="Field name" aria-label="Field name" className="h-8" data-custom-label />
              {LIST_TYPES.has(c.type) ? <Choices value={c.options ?? ""} onChange={(options) => setCustom(listKey, i, { options })} /> : null}
            </div>
            <Select value={c.type} onChange={(e) => setCustom(listKey, i, { type: e.target.value })} aria-label="Kind of field" className="h-8" data-custom-type>
              {CUSTOM_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
            <span className="flex items-center gap-0.5">
              <Button type="button" size="sm" variant="outline" onClick={() => move(listKey, i, -1)} disabled={i === 0} aria-label="Up"><ArrowUp /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => move(listKey, i, 1)} disabled={i === list.length - 1} aria-label="Down"><ArrowDown /></Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setF((x) => ({ ...x, [listKey]: x[listKey].filter((_, j) => j !== i) }))} aria-label="Remove field" data-custom-remove>
                <Trash2 />
              </Button>
            </span>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setF((x) => ({ ...x, [listKey]: [...x[listKey], { label: "", type: "text" }] }))} data-custom-add>
          <Plus /> Add a field
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * A list's choices: one a line, typed or loaded from a file (Sean, Nov 2026: "where I can import a list of
 * categories"), a text file or a CSV's first column, added to those there (once each).
 */
function Choices({ value, onChange }) {
  const fileRef = useRef(null);
  const count = choicesFrom(value).length;
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch {
      return void toast.error("That file couldn't be read. Save it again as a CSV or text file and try again.");
    }
    const loaded = choicesFrom(text, { file: true });
    if (!loaded.length) return void toast.error("No choices found in that file: put one on each line, or in a spreadsheet's first column.");
    const next = choicesFrom([...choicesFrom(value), ...loaded]);
    onChange(next.join("\n"));
    toast.success(`${(next.length - count).toLocaleString()} choice${next.length - count === 1 ? "" : "s"} added from the file`);
  };
  return (
    <div className="space-y-1">
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={Math.min(6, Math.max(2, count + 1))}
        placeholder="One choice on each line" aria-label="Choices" className="min-h-0 text-sm" data-custom-options />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} data-custom-options-file />
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => fileRef.current?.click()} data-custom-options-load>
          <FileUp /> Load from a file
        </Button>
        <span data-custom-options-count>{count.toLocaleString()} choice{count === 1 ? "" : "s"} · a text file or a spreadsheet&apos;s first column · up to {MAX_CHOICES}</span>
      </div>
    </div>
  );
}
