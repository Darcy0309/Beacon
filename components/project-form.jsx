"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveProject } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

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
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { companies = [], projectTypes = [], projectStatuses = [] } = options ?? {};
  const record = project
    ? {
        ...project,
        company_id: project.company?.id ?? "",
        project_type_id: project.type?.id ?? "",
        status_id: project.status?.id ?? "",
        amount_paid: project.amount_paid ?? "",
        start_date: project.start_date ?? "",
        end_date: project.end_date ?? "",
      }
    : null;
  const { fe, invalid, dv } = formHelpers(state, record);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">{isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New project"}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${project.name}` : "New project"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={project.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project name" required error={fe("name")} className="sm:col-span-2">
              <Input name="name" defaultValue={dv("name")} maxLength={120} required aria-invalid={invalid("name")} autoFocus />
            </Field>

            <Field label="Client" error={fe("company_id")}>
              <Select name="company_id" defaultValue={dv("company_id")} aria-invalid={invalid("company_id")}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" error={fe("project_type_id")}>
              <Select name="project_type_id" defaultValue={dv("project_type_id")} aria-invalid={invalid("project_type_id")}>
                <option value="">—</option>
                {projectTypes.map((t) => <option key={t.id} value={t.id}>{t.description}</option>)}
              </Select>
            </Field>

            <Field label="Status" error={fe("status_id")}>
              <Select name="status_id" defaultValue={dv("status_id")} aria-invalid={invalid("status_id")}>
                <option value="">—</option>
                {projectStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Contract value" error={fe("amount_paid")} hint="USD">
              <Input name="amount_paid" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={dv("amount_paid")} aria-invalid={invalid("amount_paid")} />
            </Field>

            <Field label="Start date" error={fe("start_date")}>
              <Input name="start_date" type="date" defaultValue={dv("start_date")} aria-invalid={invalid("start_date")} />
            </Field>
            <Field label="End date" error={fe("end_date")}>
              <Input name="end_date" type="date" defaultValue={dv("end_date")} aria-invalid={invalid("end_date")} />
            </Field>

            <Field label="Description" error={fe("description")} className="sm:col-span-2">
              <Textarea name="description" rows={3} maxLength={500} defaultValue={dv("description")} aria-invalid={invalid("description")} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
