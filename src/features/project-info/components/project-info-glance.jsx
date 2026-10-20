"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProjectInfoView from "@/features/project-info/components/project-info-view";
import { glanceProjectInfo } from "@/features/project-info/actions";

/**
 * A quick look at a project's Project Info from My Projects (Sean, Oct 2026):
 * what the client wants (the fewest employees, the industries, the days to
 * avoid) before filtering the list to call. Read when opened.
 */
export default function ProjectInfoGlance({ projectId, name }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const show = () => {
    setOpen(true);
    if (info || loading) return;
    setLoading(true);
    const f = new FormData();
    f.set("project_id", String(projectId));
    glanceProjectInfo(f)
      .then((result) => {
        if (result?.ok) setInfo(result.data);
        else {
          toast.error(result?.error ?? "The Project Info could not be opened.");
          setOpen(false);
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <>
      <button type="button" onClick={show} data-project-info-glance={projectId} title={`Project Info for ${name}`}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--panel-border)] px-2 py-1 text-xs font-medium text-primary transition-colors hover:border-primary/40">
        <BookOpen className="size-3.5" /> View
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl" data-project-info-glance-dialog>
          <DialogHeader>
            <DialogTitle>Project Info · {name}</DialogTitle>
            <DialogDescription>What the client wants, at a glance before you filter your list.</DialogDescription>
          </DialogHeader>
          {info ? (
            <div className="-mx-5 border-t border-[var(--panel-border)]">
              <ProjectInfoView info={info} wide emptyHint="An administrator or the client fills it in." />
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Opening the Project Info…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
