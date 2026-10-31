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
import PhoneInput from "@/components/shared/phone-input";
import PlaceFields from "@/features/leads/components/place-fields";
import { SECTION_BOX, SECTION_LEGEND as LEGEND } from "@/features/leads/form-section";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const SECTION = `grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 ${SECTION_BOX}`;

// One person's lines: name and title, then business phone, mobile and email.
const PEOPLE = [
  ["Decision maker", { name: "decision_maker", title: "dm_title", phone: "dm_phone", mobile: "dm_mobile", email: "dm_email" }],
  ["Contact", { name: "contact_name", title: "contact_title", phone: null, mobile: "contact_mobile", email: "email" }],
  ["Secondary contact", { name: "contact2_name", title: "contact2_title", phone: "contact2_phone", mobile: "contact2_mobile", email: "contact2_email" }],
];

/**
 * Edit a lead's Prospect Info (Sean, Oct 2026): the business's name, phone,
 * street address, county and website, and its three people (decision
 * maker, contact, secondary contact), each in its own box. Phone numbers go
 * in as 602-555-0100, and the city, state and county are picked from the
 * state's (a ZIP fills them in). Only these are sent, so nothing else on the
 * lead changes. What the business is (employees, autos, SIC…) is on
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
  const phone = (name, label, hint) => (
    <Field key={name} label={label} error={fe(name)} hint={hint}>
      <PhoneInput name={name} defaultValue={dv(name) ?? ""} invalid={invalid(name)} />
    </Field>
  );
  const text = (name, label, props = {}) => (
    <Field key={name} label={label} error={fe(name)} className={props.wide ? "sm:col-span-2" : undefined} hint={props.hint}>
      <Input name={name} defaultValue={dv(name)} maxLength={props.max ?? 80} type={props.type} inputMode={props.inputMode} placeholder={props.placeholder}
        className={props.className} aria-invalid={invalid(name)} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* One scroll bar: the fields scroll, the title and the buttons stay put. */}
      <DialogContent className="max-w-2xl overflow-y-hidden">
        <DialogHeader>
          <DialogTitle>Edit prospect info</DialogTitle>
          <DialogDescription>{lead.company_name}: where it is and who to reach.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4" data-prospect-form>
          <input type="hidden" name="id" value={lead.id} />
          {errors ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errors === 1 ? "One field needs attention." : `${errors} fields need attention.`}
            </p>
          ) : null}
          <div className="-mr-1 grid min-h-0 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <fieldset className={SECTION} data-section="Business">
              <legend className={LEGEND}>Business</legend>
              <Field label="Company name" required error={fe("company_name")} className="sm:col-span-2">
                <Input name="company_name" defaultValue={dv("company_name")} maxLength={120} required aria-invalid={invalid("company_name")} autoFocus />
              </Field>
              {phone("phone", "Business phone", "Add an extension as x203")}
              {phone("fax", "Fax")}
              {text("website", "Website", { max: 120, wide: true })}
            </fieldset>
            <fieldset className={SECTION} data-section="Location">
              <legend className={LEGEND}>Location</legend>
              {text("address", "Street address", { wide: true, max: 120 })}
              <PlaceFields fe={fe} invalid={invalid} dv={dv} />
            </fieldset>
            {PEOPLE.map(([who, f]) => (
              <fieldset key={who} className={SECTION} data-person={who}>
                <legend className={LEGEND}>{who}</legend>
                {text(f.name, "Name")}
                {text(f.title, "Title", { max: 60 })}
                {f.phone ? phone(f.phone, "Business phone") : null}
                {phone(f.mobile, "Mobile")}
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
