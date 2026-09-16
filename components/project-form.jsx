"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveProject } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

export default function ProjectForm({ project, options, trigger }) {
  const isEdit = Boolean(project?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveProject, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Project updated" : "Project created");
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { companies = [], projectTypes = [], projectStatuses = [] } = options ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            {isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New project"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${project.name}` : "New project"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={project.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project name" className="sm:col-span-2">
              <Input name="name" defaultValue={project?.name ?? ""} required />
            </Field>

            <Field label="Client">
              <Select name="company_id" defaultValue={project?.company?.id ?? ""}>
                <option value="">—</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="project_type_id" defaultValue={project?.type?.id ?? ""}>
                <option value="">—</option>
                {projectTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.description}</option>
                ))}
              </Select>
            </Field>

            <Field label="Status">
              <Select name="status_id" defaultValue={project?.status?.id ?? ""}>
                <option value="">—</option>
                {projectStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Contract value">
              <Input name="amount_paid" type="number" step="0.01" defaultValue={project?.amount_paid ?? ""} />
            </Field>

            <Field label="Start date">
              <Input name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
            </Field>
            <Field label="End date">
              <Input name="end_date" type="date" defaultValue={project?.end_date ?? ""} />
            </Field>

            <Field label="Description" className="sm:col-span-2">
              <Textarea name="description" rows={3} defaultValue={project?.description ?? ""} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
