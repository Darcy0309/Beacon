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
import { createLead, updateLead } from "@/lib/actions";
import { fullName } from "@/lib/display";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Create/edit form for a lead. `lead` omitted => create mode.
 * `options` carries the lookup rows (statuses, projects, managers, agencies).
 */
export default function LeadForm({ lead, options, trigger }) {
  const isEdit = Boolean(lead?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const [state, formAction, pending] = useActionState(isEdit ? updateLead : createLead, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Lead updated" : "Lead created");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      // Field errors are shown inline; only surface non-field failures as a toast.
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { statuses = [], projects = [], managers = [], agencies = [] } = options ?? {};

  // Existing record flattened to the field names the form uses.
  const record = lead
    ? {
        ...lead,
        status_id: lead.status?.id ?? "",
        project_id: lead.project?.id ?? "",
        assigned_user_id: lead.assigned?.id ?? "",
        agency_id: lead.agency?.id ?? "",
      }
    : null;
  const { fe, invalid, dv } = formHelpers(state, record);

  const errorCount = state?.fieldErrors ? Object.keys(state.fieldErrors).length : 0;

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

        <form action={formAction} noValidate className="flex min-h-0 flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={lead.id} />}

          {errorCount > 0 && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errorCount === 1 ? "One field needs attention." : `${errorCount} fields need attention.`}
            </p>
          )}

          <div className="-mr-1 grid max-h-[55svh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <Field label="Company name" required error={fe("company_name")} className="sm:col-span-2">
              <Input name="company_name" defaultValue={dv("company_name")} maxLength={120} required aria-invalid={invalid("company_name")} autoFocus />
            </Field>

            <Field label="Contact" error={fe("contact_name")}>
              <Input name="contact_name" defaultValue={dv("contact_name")} maxLength={80} aria-invalid={invalid("contact_name")} />
            </Field>
            <Field label="Contact title" error={fe("contact_title")}>
              <Input name="contact_title" defaultValue={dv("contact_title")} maxLength={60} aria-invalid={invalid("contact_title")} />
            </Field>

            <Field label="Phone" error={fe("phone")}>
              <Input name="phone" type="tel" inputMode="tel" placeholder="(602) 555-0100" defaultValue={dv("phone")} aria-invalid={invalid("phone")} />
            </Field>
            <Field label="Email" error={fe("email")}>
              <Input name="email" type="email" inputMode="email" defaultValue={dv("email")} maxLength={120} aria-invalid={invalid("email")} />
            </Field>

            <Field label="City" error={fe("city")}>
              <Input name="city" defaultValue={dv("city")} maxLength={60} aria-invalid={invalid("city")} />
            </Field>
            <Field label="State" error={fe("state")} hint="Two-letter code">
              <Input name="state" maxLength={20} placeholder="AZ" defaultValue={dv("state")} aria-invalid={invalid("state")} className="uppercase" />
            </Field>

            <Field label="ZIP" error={fe("zip")}>
              <Input name="zip" inputMode="numeric" placeholder="85016" defaultValue={dv("zip")} maxLength={10} aria-invalid={invalid("zip")} />
            </Field>
            <Field label="SIC code" error={fe("sic_code")}>
              <Input name="sic_code" inputMode="numeric" placeholder="6411" defaultValue={dv("sic_code")} maxLength={4} aria-invalid={invalid("sic_code")} />
            </Field>

            <Field label="Status" error={fe("status_id")}>
              <Select name="status_id" defaultValue={dv("status_id")} aria-invalid={invalid("status_id")}>
                <option value="">—</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Project" error={fe("project_id")}>
              <Select name="project_id" defaultValue={dv("project_id")} aria-invalid={invalid("project_id")}>
                <option value="">—</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>

            <Field label="Assigned to" error={fe("assigned_user_id")}>
              <Select name="assigned_user_id" defaultValue={dv("assigned_user_id")} aria-invalid={invalid("assigned_user_id")}>
                <option value="">Unassigned</option>
                {managers.map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
              </Select>
            </Field>
            <Field label="Current carrier / agency" error={fe("agency_id")}>
              <Select name="agency_id" defaultValue={dv("agency_id")} aria-invalid={invalid("agency_id")}>
                <option value="">—</option>
                {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>

            <Field label="Employees" error={fe("employees")}>
              <Input name="employees" inputMode="numeric" defaultValue={dv("employees")} aria-invalid={invalid("employees")} />
            </Field>
            <Field label="Autos" error={fe("autos")}>
              <Input name="autos" inputMode="numeric" defaultValue={dv("autos")} aria-invalid={invalid("autos")} />
            </Field>

            <Field label="Sales volume" error={fe("sales_volume")} hint="e.g. $12.4M">
              <Input name="sales_volume" defaultValue={dv("sales_volume")} maxLength={30} aria-invalid={invalid("sales_volume")} />
            </Field>
            <Field label="Est. annual premium" error={fe("estimated_annual_premium")}>
              <Input name="estimated_annual_premium" defaultValue={dv("estimated_annual_premium")} maxLength={30} aria-invalid={invalid("estimated_annual_premium")} />
            </Field>

            <Field label="List source" error={fe("list_source")}>
              <Input name="list_source" defaultValue={dv("list_source")} maxLength={80} aria-invalid={invalid("list_source")} />
            </Field>
            <Field label="Years in business" error={fe("years_in_business")}>
              <Input name="years_in_business" inputMode="numeric" defaultValue={dv("years_in_business")} maxLength={3} aria-invalid={invalid("years_in_business")} />
            </Field>

            <Field label="Description" error={fe("description")} className="sm:col-span-2">
              <Input name="description" defaultValue={dv("description")} maxLength={255} aria-invalid={invalid("description")} />
            </Field>

            <Field label="Internal notes" error={fe("notes_dcm")} className="sm:col-span-2">
              <Textarea name="notes_dcm" rows={3} defaultValue={dv("notes_dcm")} maxLength={5000} aria-invalid={invalid("notes_dcm")} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
