"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Plus, Upload, X } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addCargoTypes, removeCargoType } from "@/features/cargo/actions";
import { cargoNamesFromText } from "@/lib/business";
import { reach } from "@/lib/reach";

/**
 * The cargo list: what the Business tab's Cargo field offers to pick from.
 * Load a file (one name a line, or a CSV's first column), add one by name,
 * or take one off; a lead keeps the cargo it has.
 */
export default function CargoTypesCard({ types }) {
  const fileRef = useRef(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");

  const add = (names, done) =>
    start(async () => {
      const result = await reach(() => addCargoTypes(names));
      if (!result.ok) return void toast.error(result.error);
      const { added, already } = result.data;
      toast.success(added ? `${added} cargo type${added === 1 ? "" : "s"} added${already ? `, ${already} already on the list` : ""}` : "Already on the list");
      done?.();
      router.refresh();
    });

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
    const names = cargoNamesFromText(text);
    if (!names.length) return void toast.error("No cargo names found in that file: put one on each line.");
    add(names);
  };

  const remove = (t) =>
    start(async () => {
      const result = await reach(() => removeCargoType(t.id));
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${t.name} taken off the list`);
      router.refresh();
    });

  return (
    <Card data-cargo-types>
      <SectionHeader label="Cargo Types" icon={Package} />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            <strong className="text-foreground tabular-nums" data-cargo-count>{types.length}</strong> to pick from in a lead&apos;s Cargo field (Business tab).
            Load a list (a text or CSV file, one on each line) or add them one at a time. A lead keeps its cargo when it comes off the list.
          </p>
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} data-cargo-import />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            <Upload /> {pending ? "Saving…" : "Load list (CSV or text)"}
          </Button>
        </div>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add([name], () => setName(""));
          }}
          data-cargo-add
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Building materials" aria-label="Cargo type" />
          <Button type="submit" size="sm" disabled={pending || !name.trim()}><Plus /> Add</Button>
        </form>
        {types.length ? (
          <ul className="flex flex-wrap gap-2" data-cargo-list>
            {types.map((t) => (
              <li key={t.id} className="flex items-center gap-1 rounded-md border border-[var(--panel-border)] bg-muted/40 py-0.5 pl-2.5 pr-1 text-sm" data-cargo-type={t.name}>
                {t.name}
                <button type="button" disabled={pending} onClick={() => remove(t)} aria-label={`Take ${t.name} off the list`}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">The list is empty, so the Cargo field has nothing to pick from yet.</p>
        )}
      </div>
    </Card>
  );
}
