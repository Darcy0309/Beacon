"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateLead } from "@/features/leads/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

// One person's lines: name and title, then business phone, mobile and email.
const PEOPLE = [
  ["Decision maker", { name: "decision_maker", title: "dm_title", phone: "dm_phone", mobile: "dm_mobile", email: "dm_email" }],
  ["Contact", { name: "contact_name", title: "contact_title", phone: null, mobile: "contact_mobile", email: "email" }],
  ["Secondary contact", { name: "contact2_name", title: "contact2_title", phone: "contact2_phone", mobile: "contact2_mobile", email: "contact2_email" }],
];

/**
 * Edit a lead's Prospect Info (Sean, Oct 2026): the business's name, phone,
 * street address, county and website, and its three people (decision
 * maker, contact, secondary contact). Only these are sent, so nothing else
 * on the lead changes. What the business is (employees, autos, SIC…) is on
 * the Business tab; notes are on the Notes tab; where it stands is its call
 * result.
 */
export default function ProspectForm({ lead, trigger }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateLead, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, lead);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Prospect info saved");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router]);
  const errors = state?.fieldErrors ? Object.keys(state.fieldErrors).length : 0;
  const text = (name, label, props = {}) => (
    <Field key={name} label={label} error={fe(name)} className={props.wide ? "sm:col-span-2" : undefined} hint={props.hint}>
      <Input name={name} defaultValue={dv(name)} maxLength={props.max ?? 80} type={props.type} inputMode={props.inputMode} placeholder={props.placeholder}
        className={props.className} aria-invalid={invalid(name)} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit prospect info</DialogTitle>
          <DialogDescription>{lead.company_name}: where it is and who to reach.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex min-h-0 flex-col gap-4" data-prospect-form>
          <input type="hidden" name="id" value={lead.id} />
          {errors ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errors === 1 ? "One field needs attention." : `${errors} fields need attention.`}
            </p>
          ) : null}
          <div className="-mr-1 grid max-h-[60svh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <Field label="Company name" required error={fe("company_name")} className="sm:col-span-2">
              <Input name="company_name" defaultValue={dv("company_name")} maxLength={120} required aria-invalid={invalid("company_name")} autoFocus />
            </Field>
            {text("phone", "Business phone", { type: "tel", inputMode: "tel", hint: "Add an extension as x203" })}
            {text("fax", "Fax", { type: "tel", inputMode: "tel" })}
            {text("address", "Street address", { wide: true, max: 120 })}
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-3 sm:col-span-2">
              {text("city", "City", { max: 60 })}
              {text("state", "State", { max: 20, placeholder: "AZ", className: "uppercase" })}
              {text("zip", "ZIP", { max: 10, inputMode: "numeric" })}
            </div>
            {text("county", "County", { max: 60 })}
            {text("website", "Website", { max: 120 })}
            {PEOPLE.map(([who, f]) => (
              <fieldset key={who} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2 sm:grid-cols-2" data-person={who}>
                <legend className="px-1 text-xs font-semibold">{who}</legend>
                {text(f.name, "Name")}
                {text(f.title, "Title", { max: 60 })}
                {f.phone ? text(f.phone, "Business phone", { type: "tel", inputMode: "tel" }) : null}
                {text(f.mobile, "Mobile", { type: "tel", inputMode: "tel" })}
                {text(f.email, "Email", { type: "email", inputMode: "email", max: 120, wide: !f.phone })}
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
