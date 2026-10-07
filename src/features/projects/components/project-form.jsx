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
import { saveProject } from "@/features/projects/actions";
import DatePicker from "@/components/shared/date-picker";
import { useDialogOpen } from "@/components/shared/row-edit-context";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

export default function ProjectForm({ project, options, trigger }) {
  const isEdit = Boolean(project?.id);
  // Inside a row's action menu the menu owns the open state and there is no trigger.
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
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
  }, [state, isEdit, router, setOpen]);

  const { companies = [], projectTypes = [], projectStatuses = [], projects = [] } = options ?? {};
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
  // A DBDev project promotes its leads to one of the same client's Appt projects.
  const [companyId, setCompanyId] = useState(String(dv("company_id") ?? ""));
  const [typeId, setTypeId] = useState(String(dv("project_type_id") ?? ""));
  const isDbdev = projectTypes.find((t) => String(t.id) === typeId)?.code === "DBDV";
  const apptProjects = projects.filter((p) => p.type === "APPT" && String(p.company_id ?? "") === companyId && p.id !== project?.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">{isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New project"}</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
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
              <Select name="company_id" defaultValue={dv("company_id")} onChange={(e) => setCompanyId(e.target.value)} aria-invalid={invalid("company_id")}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" error={fe("project_type_id")}>
              <Select name="project_type_id" defaultValue={dv("project_type_id")} onChange={(e) => setTypeId(e.target.value)} aria-invalid={invalid("project_type_id")}>
                <option value="">—</option>
                {projectTypes.map((t) => <option key={t.id} value={t.id}>{t.description}</option>)}
              </Select>
            </Field>

            {isDbdev ? (
              <Field
                label="Promotes leads to"
                className="sm:col-span-2"
                error={fe("appt_project_id")}
                hint={apptProjects.length ? "The appointment project a Lead result moves names to" : "This client has no appointment project yet"}
              >
                <Select name="appt_project_id" defaultValue={dv("appt_project_id")} aria-invalid={invalid("appt_project_id")}>
                  <option value="">—</option>
                  {apptProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="appt_project_id" value="" />
            )}

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
              <DatePicker name="start_date" defaultValue={dv("start_date")} invalid={invalid("start_date")} aria-label="Start date" presets={["today"]} />
            </Field>
            <Field label="End date" error={fe("end_date")}>
              <DatePicker name="end_date" defaultValue={dv("end_date")} invalid={invalid("end_date")} aria-label="End date" presets={["nextMonth", "nextYear"]} />
            </Field>

            <Field label="Description" error={fe("description")} className="sm:col-span-2">
              <Textarea name="description" rows={3} maxLength={500} defaultValue={dv("description")} aria-invalid={invalid("description")} />
            </Field>

            {/* Where its leads go: a lead's sheet is emailed here when a call makes it a lead or an appointment. */}
            <Field label="Lead delivery emails" error={fe("email")} className="sm:col-span-2"
              hint="Each lead and appointment's sheet is emailed here. Separate several with commas.">
              <Input name="email" maxLength={500} placeholder="leads@client.com, producer@client.com" defaultValue={dv("email")} aria-invalid={invalid("email")} />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
              <input type="hidden" name="delivery_link_only" value="off" />
              <input type="checkbox" name="delivery_link_only" value="on" defaultChecked={Boolean(record?.delivery_link_only)} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Send a link to the lead sheet instead of the sheet itself<span className="block text-xs text-muted-foreground">The link opens the sheet without signing in, for 90 days.</span></span>
            </label>
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
