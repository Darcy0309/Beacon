"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StampedTextarea from "@/components/shared/stamped-textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { createLead, updateLead } from "@/features/leads/actions";
import { fullName } from "@/lib/format";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import { useRole } from "@/components/layout/role-provider";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Create/edit form for a lead. `lead` omitted => create mode.
 * `options` carries the lookup rows (statuses, projects, managers, agencies).
 */
export default function LeadForm({ lead, options, trigger }) {
  // The internal notes: administrators and managers only.
  const { role } = useRole();
  const seesInternal = role === "admin" || role === "manager";
  const isEdit = Boolean(lead?.id);
  // Inside a row's action menu the menu owns the open state and there is no trigger.
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
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
  }, [state, isEdit, router, setOpen]);

  const { statuses = [], projects = [], managers: staff = [], agencies = [] } = options ?? {};
  // Whoever holds the lead now is always an option (an administrator who set an
  // appointment holds it, and is not in the list), so saving never unassigns it.
  const holder = lead?.assigned;
  const managers = holder?.id && !staff.some((m) => m.id === holder.id) ? [holder, ...staff] : staff;

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
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              {isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New lead"}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl" onCloseAutoFocus={onCloseAutoFocus}>
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

            <Field label="Business phone" error={fe("phone")} hint="Add an extension as x203">
              <Input name="phone" type="tel" inputMode="tel" defaultValue={dv("phone")} aria-invalid={invalid("phone")} />
            </Field>
            <Field label="Mobile" error={fe("contact_mobile")}>
              <Input name="contact_mobile" type="tel" inputMode="tel" defaultValue={dv("contact_mobile")} aria-invalid={invalid("contact_mobile")} />
            </Field>
            <Field label="Email" error={fe("email")} className="sm:col-span-2">
              <Input name="email" type="email" inputMode="email" defaultValue={dv("email")} maxLength={120} aria-invalid={invalid("email")} />
            </Field>

            <Field label="Decision maker" error={fe("decision_maker")}>
              <Input name="decision_maker" defaultValue={dv("decision_maker")} maxLength={80} aria-invalid={invalid("decision_maker")} />
            </Field>
            <Field label="Decision maker's title" error={fe("dm_title")}>
              <Input name="dm_title" defaultValue={dv("dm_title")} maxLength={60} aria-invalid={invalid("dm_title")} />
            </Field>
            <Field label="Decision maker's business phone" error={fe("dm_phone")}>
              <Input name="dm_phone" type="tel" inputMode="tel" defaultValue={dv("dm_phone")} aria-invalid={invalid("dm_phone")} />
            </Field>
            <Field label="Decision maker's mobile" error={fe("dm_mobile")}>
              <Input name="dm_mobile" type="tel" inputMode="tel" defaultValue={dv("dm_mobile")} aria-invalid={invalid("dm_mobile")} />
            </Field>
            <Field label="Decision maker's email" error={fe("dm_email")} className="sm:col-span-2">
              <Input name="dm_email" type="email" inputMode="email" defaultValue={dv("dm_email")} maxLength={120} aria-invalid={invalid("dm_email")} />
            </Field>

            <Field label="Secondary contact" error={fe("contact2_name")}>
              <Input name="contact2_name" defaultValue={dv("contact2_name")} maxLength={80} aria-invalid={invalid("contact2_name")} />
            </Field>
            <Field label="Secondary contact's title" error={fe("contact2_title")}>
              <Input name="contact2_title" defaultValue={dv("contact2_title")} maxLength={60} aria-invalid={invalid("contact2_title")} />
            </Field>
            <Field label="Secondary contact's business phone" error={fe("contact2_phone")}>
              <Input name="contact2_phone" type="tel" inputMode="tel" defaultValue={dv("contact2_phone")} aria-invalid={invalid("contact2_phone")} />
            </Field>
            <Field label="Secondary contact's mobile" error={fe("contact2_mobile")}>
              <Input name="contact2_mobile" type="tel" inputMode="tel" defaultValue={dv("contact2_mobile")} aria-invalid={invalid("contact2_mobile")} />
            </Field>
            <Field label="Secondary contact's email" error={fe("contact2_email")} className="sm:col-span-2">
              <Input name="contact2_email" type="email" inputMode="email" defaultValue={dv("contact2_email")} maxLength={120} aria-invalid={invalid("contact2_email")} />
            </Field>

            <Field label="Producer" error={fe("producer_name")} className="sm:col-span-2" hint="The client's producer this name is for">
              <Input name="producer_name" defaultValue={dv("producer_name")} maxLength={80} aria-invalid={invalid("producer_name")} />
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

            <Field label="Locations" error={fe("location")}>
              <Input name="location" defaultValue={dv("location")} maxLength={60} aria-invalid={invalid("location")} />
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

            <Field label="EIN" error={fe("ein")} hint="Federal employer ID, 9 digits">
              <Input name="ein" inputMode="numeric" placeholder="12-3456789" defaultValue={dv("ein")} maxLength={12} aria-invalid={invalid("ein")} />
            </Field>
            <Field label="Years in business" error={fe("years_in_business")}>
              <Input name="years_in_business" inputMode="numeric" defaultValue={dv("years_in_business")} maxLength={3} aria-invalid={invalid("years_in_business")} />
            </Field>

            <Field label="Est. annual premium" error={fe("estimated_annual_premium")}>
              <Input name="estimated_annual_premium" defaultValue={dv("estimated_annual_premium")} maxLength={30} aria-invalid={invalid("estimated_annual_premium")} />
            </Field>
            <Field label="List source" error={fe("list_source")}>
              <Input name="list_source" defaultValue={dv("list_source")} maxLength={80} aria-invalid={invalid("list_source")} />
            </Field>

            <Field label="Description" error={fe("description")} className="sm:col-span-2">
              <Input name="description" defaultValue={dv("description")} maxLength={255} aria-invalid={invalid("description")} />
            </Field>

            <Field label="Client notes" error={fe("client_note")} className="sm:col-span-2" hint="The client sees these: in the lead sheet email and on the calendar">
              <StampedTextarea name="client_note" rows={3} defaultValue={dv("client_note")} maxLength={2000} aria-invalid={invalid("client_note")} />
            </Field>

            {seesInternal ? (
              <Field label="Internal notes" error={fe("internal_notes")} className="sm:col-span-2" hint="Administrators and managers only: never shown to agents or the client">
                <StampedTextarea name="internal_notes" rows={4} defaultValue={dv("internal_notes")} maxLength={5000} aria-invalid={invalid("internal_notes")} />
              </Field>
            ) : null}
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
