"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { copyProjectInfo, listProjectInfoSources } from "@/features/project-info/actions";
import { reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

/**
 * "Copy from…" on a project's Project Info (Sean, Nov 2026: a client with 15 or 35 projects, every one
 * on the same sheet): pick another project, and its Project Info is copied onto this one, all but the
 * contacts (the agent's mobile and email, the producers and the office stay this project's own). The
 * same client's projects first; a search for the rest.
 */
export default function CopyInfoDialog({ projectId, projectName, trigger }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  const [loading, startLoading] = useTransition();
  const [copying, startCopying] = useTransition();

  const form = (extra = {}) => {
    const f = new FormData();
    f.set("project_id", String(projectId));
    for (const [k, v] of Object.entries(extra)) f.set(k, String(v));
    return f;
  };
  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setQuery("");
    startLoading(async () => {
      const result = await reach(() => listProjectInfoSources(form()));
      if (result.ok) setSources(result.data.sources);
      else toast.error(result.error);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (sources ?? []).filter((s) => words.every((w) => `${s.name} ${s.client ?? ""}`.toLowerCase().includes(w)));
  }, [sources, query]);
  const choice = (sources ?? []).find((s) => s.id === picked) ?? null;

  const copy = () =>
    startCopying(async () => {
      const result = await reach(() => copyProjectInfo(form({ from_id: picked })));
      if (result.ok) {
        toast.success(`Project Info copied from ${result.data.from}. Fill in this project's contacts.`);
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl" data-copy-info-dialog>
        <DialogHeader>
          <DialogTitle>Copy Project Info from another project</DialogTitle>
          <DialogDescription>
            Everything on the sheet is copied onto {projectName}: states, carriers, days to avoid, what qualifies an appointment and
            about the agency. The contacts aren&apos;t: the agent&apos;s mobile and email, the producers (who gets leads by email) and the
            office stay as they are here.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects or clients" className="pl-8"
            aria-label="Search projects or clients" data-copy-info-search autoFocus />
        </div>
        <div className="max-h-80 min-h-32 overflow-y-auto rounded-lg border border-[var(--panel-border)]" role="listbox" aria-label="Projects to copy from" data-copy-info-list>
          {loading || !sources ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Finding projects…</p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {sources.length ? "No project matches that." : "No other project has Project Info filled in yet."}
            </p>
          ) : (
            shown.map((s) => (
              <button key={s.id} type="button" role="option" aria-selected={picked === s.id} onClick={() => setPicked(s.id)} data-copy-info-source={s.id}
                className={cn("flex w-full items-center gap-3 border-b border-[var(--panel-border)] px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60",
                  picked === s.id && "bg-primary/10 hover:bg-primary/15")}>
                <span className="flex size-4 shrink-0 items-center justify-center text-primary">{picked === s.id ? <Check className="size-4" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.client ?? "No client"}
                    {s.states.length ? ` · ${s.states.slice(0, 6).join(", ")}${s.states.length > 6 ? ` +${s.states.length - 6}` : ""}` : ""}
                    {s.carriers ? ` · ${s.carriers} carrier${s.carriers === 1 ? "" : "s"}` : ""}
                  </span>
                </span>
                {s.sameClient ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.66rem] font-semibold text-primary">Same client</span> : null}
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={copy} disabled={!choice || copying} data-copy-info-confirm>
            {copying ? <Loader2 className="animate-spin" /> : null}
            {choice ? `Copy from ${choice.name.length > 28 ? `${choice.name.slice(0, 27)}…` : choice.name}` : "Pick a project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
