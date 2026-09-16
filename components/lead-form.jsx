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
import { createLead, updateLead } from "@/lib/actions";
import { fullName } from "@/lib/display";

const EMPTY = { ok: false, data: null, error: null };

/**
 * Create/edit form for a lead. `lead` omitted => create mode.
 * `options` carries the lookup rows (statuses, projects, managers, agencies).
 */
export default function LeadForm({ lead, options, trigger }) {
  const isEdit = Boolean(lead?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    isEdit ? updateLead : createLead,
    EMPTY
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Lead updated" : "Lead created");
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { statuses = [], projects = [], managers = [], agencies = [] } = options ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            {isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New lead"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${lead.company_name}` : "New lead"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex min-h-0 flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={lead.id} />}

          <div className="-mr-1 grid max-h-[55svh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <Field label="Company name" className="sm:col-span-2">
              <Input name="company_name" defaultValue={lead?.company_name ?? ""} required />
            </Field>

            <Field label="Contact">
              <Input name="contact_name" defaultValue={lead?.contact_name ?? ""} />
            </Field>
            <Field label="Contact title">
              <Input name="contact_title" defaultValue={lead?.contact_title ?? ""} />
            </Field>

            <Field label="Phone">
              <Input name="phone" defaultValue={lead?.phone ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={lead?.email ?? ""} />
            </Field>

            <Field label="City">
              <Input name="city" defaultValue={lead?.city ?? ""} />
            </Field>
            <Field label="State">
              <Input name="state" maxLength={2} defaultValue={lead?.state ?? ""} />
            </Field>

            <Field label="Status">
              <Select name="status_id" defaultValue={lead?.status?.id ?? ""}>
                <option value="">—</option>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Project">
              <Select name="project_id" defaultValue={lead?.project?.id ?? ""}>
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Assigned to">
              <Select name="assigned_user_id" defaultValue={lead?.assigned?.id ?? ""}>
                <option value="">Unassigned</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{fullName(m)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Current carrier / agency">
              <Select name="agency_id" defaultValue={lead?.agency?.id ?? ""}>
                <option value="">—</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Employees">
              <Input name="employees" defaultValue={lead?.employees ?? ""} />
            </Field>
            <Field label="Autos">
              <Input name="autos" defaultValue={lead?.autos ?? ""} />
            </Field>

            <Field label="Sales volume">
              <Input name="sales_volume" defaultValue={lead?.sales_volume ?? ""} />
            </Field>
            <Field label="Est. annual premium">
              <Input name="estimated_annual_premium" defaultValue={lead?.estimated_annual_premium ?? ""} />
            </Field>

            <Field label="List source">
              <Input name="list_source" defaultValue={lead?.list_source ?? ""} />
            </Field>
            <Field label="Years in business">
              <Input name="years_in_business" defaultValue={lead?.years_in_business ?? ""} />
            </Field>

            <Field label="Description" className="sm:col-span-2">
              <Input name="description" defaultValue={lead?.description ?? ""} />
            </Field>

            <Field label="Internal notes" className="sm:col-span-2">
              <Textarea name="notes_dcm" rows={3} defaultValue={lead?.notes_dcm ?? ""} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
