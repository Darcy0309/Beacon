"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { FileLink } from "@/components/shared/file-viewer";
import { fileHref } from "@/lib/files";
import { createClient } from "@/lib/supabase/client";
import { recordLeadFile } from "@/features/leads/actions";
import { deleteDocument } from "@/features/documents/actions";

const BUCKET = "lead-files";
const MAX_MB = 25;
const ACCEPT = ".pdf,image/*,.doc,.docx,.xls,.xlsx,.txt,.csv,.eml,.msg";

const when = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric" });
// A file's kind, size, when it was added and by whom.
const about = (f) => [f.type, f.size, when(f.at), f.by ? `by ${f.by}${f.byClient ? " (client)" : ""}` : null].filter(Boolean).join(" · ");
// A stored name with nothing in it that a path cannot hold.
const safe = (name) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "file";

/**
 * Policy Files (Sean, Oct 2026): the files a prospect sends (policies, dec
 * pages, photos) kept with the lead, for the lead page and an appointment.
 * Anyone who can see the lead adds them: straight from the browser to the
 * lead's own folder in storage, then a row to say so. Its name opens it in
 * Lighthouse's viewer (a PDF, a picture), its button downloads it; either
 * asks the server for a short-lived link. They go to the client with the
 * lead sheet.
 *
 *   initial    listLeadFiles(); without it, the list is read when shown
 *   canDelete  administrators, managers and agents (a delete only hides it)
 */
export default function LeadFiles({ leadId, initial = null, canDelete = false, className }) {
  const router = useRouter();
  const input = useRef(null);
  const [files, setFiles] = useState(initial);
  const [busy, setBusy] = useState(null); // what is uploading, in words
  const [asking, setAsking] = useState(null);
  const [removing, startRemove] = useTransition();

  const load = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/files`, { cache: "no-store" });
      if (res.ok) setFiles((await res.json()).files ?? []);
    } catch {
      setFiles((f) => f ?? []);
    }
  };
  useEffect(() => {
    if (initial === null) load();
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initial !== null) setFiles(initial);
  }, [initial]);

  const upload = async (list) => {
    const chosen = [...list];
    if (!chosen.length) return;
    const tooBig = chosen.filter((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")}: files must be ${MAX_MB} MB or smaller.`);
    const sb = createClient();
    let added = 0;
    for (const [i, file] of chosen.filter((f) => f.size <= MAX_MB * 1024 * 1024).entries()) {
      setBusy(`Adding ${file.name}${chosen.length > 1 ? ` (${i + 1} of ${chosen.length})` : ""}…`);
      // In a folder of its own, under its own name: what the browser's PDF viewer shows, and saves it as.
      const path = `lead/${leadId}/${crypto.randomUUID()}/${safe(file.name)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) {
        toast.error(`${file.name}: ${/mime|type/i.test(error.message) ? "that kind of file can't be added" : error.message}`);
        continue;
      }
      const saved = await recordLeadFile({ leadId, path, name: file.name, size: file.size });
      if (!saved.ok) toast.error(`${file.name}: ${saved.error}`);
      else added += 1;
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    if (added) {
      toast.success(added === 1 ? "File added to the lead" : `${added} files added to the lead`);
      await load();
      router.refresh();
    }
  };

  const remove = (f) =>
    startRemove(async () => {
      const form = new FormData();
      form.set("id", String(f.id));
      const result = await deleteDocument(form);
      if (result.ok) {
        toast.success("File taken off the lead");
        setAsking(null);
        await load();
        router.refresh();
      } else toast.error(result.error);
    });

  return (
    <div className={className} data-lead-files={leadId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--panel-border)] px-4 py-2">
        <p className="text-xs text-muted-foreground">Policies, dec pages, photos: kept with the lead and sent to the client with it. Up to {MAX_MB} MB each.</p>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} data-file-input />
        <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => input.current?.click()} data-add-file>
          {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Add files
        </Button>
      </div>
      {busy ? <p className="px-4 py-2 text-xs text-muted-foreground" aria-live="polite">{busy}</p> : null}
      {files === null ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Reading the files…</p>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <FileText className="size-6 opacity-50" aria-hidden />
          No files yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--panel-border)]">
          {files.map((f) => (
            <li key={f.id} data-file={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <FileLink file={{ id: f.id, name: f.name, type: f.type, about: about(f) }} className="block truncate font-medium hover:text-primary hover:underline" title={f.name} data-file-open>
                  {f.name}
                </FileLink>
                <div className="truncate text-xs text-muted-foreground">{about(f)}</div>
              </div>
              <a href={fileHref(f.id, { download: true })} aria-label={`Download ${f.name}`} title="Download" className="rounded p-1 text-muted-foreground transition-colors hover:text-primary" data-file-download><Download className="size-4" /></a>
              {canDelete ? (
                <button type="button" onClick={() => setAsking(f)} aria-label={`Take ${f.name} off the lead`} className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive" data-remove-file>
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} pending={removing}
        title={asking ? `Take ${asking.name} off the lead?` : ""}
        description="It no longer shows on the lead or goes to the client with it. Nothing is erased: an administrator can restore it under Settings › Deleted records."
        confirm="Take it off" onConfirm={() => remove(asking)} />
    </div>
  );
}
