"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { extensionOf, fileHref, fileKind } from "@/lib/files";

/**
 * A kept file shown in Lighthouse itself, rather than downloaded (Oct 2026):
 * a PDF in the browser's own viewer (its pages, zoom, print and save), a
 * picture or plain text as it is, in a large dialog over the page, with Open
 * in new tab and Download. A kind the browser cannot show (Word, Excel, an
 * email) says so, with Download.
 *
 *   file          { id, name, type, about }: `type` the kept file type
 *                 ("PDF"), `about` a line under its name
 *   open          with onOpenChange, its open state; without, a row menu's
 *                 (RowActions' forms)
 */
export default function FileViewer({ file, open: shown, onOpenChange }) {
  const [rowOpen, setRowOpen, , returnFocus] = useDialogOpen();
  const own = shown !== undefined;
  const open = own ? shown : rowOpen;
  const setOpen = own ? onOpenChange : setRowOpen;
  const kind = fileKind(file.name, file.type);
  const href = fileHref(file.id);
  const download = fileHref(file.id, { download: true });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (open) setLoaded(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-[88svh] max-w-5xl overflow-y-hidden" onCloseAutoFocus={own ? undefined : returnFocus} data-file-viewer={file.id}>
        <DialogHeader>
          <DialogTitle className="truncate" title={file.name}>{file.name}</DialogTitle>
          {file.about ? <DialogDescription className="truncate">{file.about}</DialogDescription> : null}
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--panel-border)] bg-muted/30">
          {kind === "pdf" || kind === "text" ? (
            <iframe src={href} title={file.name} onLoad={() => setLoaded(true)} className="size-full bg-white" data-file-frame />
          ) : kind === "image" ? (
            <div className="flex size-full items-center justify-center overflow-auto p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a short-lived link, not an optimizable asset */}
              <img src={href} alt={file.name} onLoad={() => setLoaded(true)} className="max-h-full max-w-full object-contain" data-file-image
                // A picture that won't come (offline, the file gone) would leave the spinner turning (Oct 2026).
                onError={() => {
                  setLoaded(true);
                  toast.error("Couldn't open this picture. Try again, or download it.");
                }} />
            </div>
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground" data-file-unshown>
              <FileText className="size-10 opacity-50" aria-hidden />
              <p>{extensionOf(file.name) ? `A ${extensionOf(file.name)} file` : "This file"} can&apos;t be shown in the browser. Download it to open it on your computer.</p>
              <Button asChild><a href={download} data-file-download><Download /> Download</a></Button>
            </div>
          )}
          {kind && !loaded ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </div>
        {kind ? (
          <DialogFooter>
            <Button asChild variant="outline"><a href={href} target="_blank" rel="noreferrer" data-file-open-tab><ExternalLink /> Open in new tab</a></Button>
            <Button asChild><a href={download} data-file-download><Download /> Download</a></Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A kept file's name that opens it in the viewer; Ctrl-click or the middle
 * button (a link's usual ways) still open it in a tab of its own. `file` as
 * the viewer takes it.
 */
export function FileLink({ file, className, children, ...rest }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href={fileHref(file.id)} target="_blank" rel="noreferrer" className={className} {...rest}
        onClick={(e) => {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setOpen(true);
        }}>
        {children}
      </a>
      <FileViewer file={file} open={open} onOpenChange={setOpen} />
    </>
  );
}
