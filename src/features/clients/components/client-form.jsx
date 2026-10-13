"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveCompany } from "@/features/clients/actions";
import { clientSlug } from "@/lib/format";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Add a client (an agency account) or change one: its name, primary
 * contact, phone, email, address and website, and whether it is active.
 * Its projects and its users are added after it, on Projects and on Users &
 * Access. `client`: the companies row to edit; none for a new one.
 * `groups`: the insurance companies ([{ id, name }]) its Agency Group is
 * chosen from: the national carrier group it belongs to, for reports.
 */
export default function ClientForm({ client, groups = [] }) {
  const isEdit = Boolean(client?.id);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveCompany, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, client ?? { status: "active" });
  const problem = state?.error && !state?.fieldErrors ? state.error : null;

  useEffect(() => {
    if (!state?.ok) return;
    toast.success(isEdit ? "Client updated" : "Client added: now add its projects and users");
    setOpen(false);
    // A client's page lives at its name: follow a new name there.
    const name = state.data?.name;
    if (isEdit && name && name !== client.name) router.replace(`/clients/${clientSlug(name)}`);
    else router.refresh();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? <Button size="sm" variant="outline" data-edit-client><Pencil /> Edit</Button>
          : <Button size="sm" data-new-client><Plus /> New client</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${client.name}` : "New client"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "The agency account's details." : "The agency account. Add its projects on Projects, and its people on Users & Access, once it is here."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex flex-col gap-4" data-client-form>
          {isEdit ? <input type="hidden" name="id" value={client.id} /> : null}
          {problem ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{problem}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Client name" required error={fe("name")} className="sm:col-span-2">
              <Input name="name" defaultValue={dv("name")} maxLength={120} autoFocus aria-invalid={invalid("name")} placeholder="e.g. Capital Insurance Services" />
            </Field>
            <Field label="Primary contact" error={fe("contact_name")}>
              <Input name="contact_name" defaultValue={dv("contact_name")} maxLength={80} aria-invalid={invalid("contact_name")} />
            </Field>
            <Field label="Title" error={fe("contact_title")}>
              <Input name="contact_title" defaultValue={dv("contact_title")} maxLength={60} aria-invalid={invalid("contact_title")} />
            </Field>
            <Field label="Agency Group" error={fe("agency_group_id")} className="sm:col-span-2"
              hint={groups.length ? "The national carrier group this client is part of, from Insurance Cos. Reports can be filtered by it." : "Add insurance companies under Insurance Cos. to choose one here."}>
              <Select name="agency_group_id" defaultValue={dv("agency_group_id", "") ?? ""} aria-invalid={invalid("agency_group_id")} data-agency-group>
                <option value="">None</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <Field label="Phone" error={fe("phone")}>
              <Input name="phone" type="tel" defaultValue={dv("phone")} aria-invalid={invalid("phone")} placeholder="(602) 555-0100" />
            </Field>
            <Field label="Email" error={fe("email")}>
              <Input name="email" type="email" defaultValue={dv("email")} maxLength={120} aria-invalid={invalid("email")} />
            </Field>
            <Field label="Address" error={fe("address")} className="sm:col-span-2">
              <Input name="address" defaultValue={dv("address")} maxLength={120} aria-invalid={invalid("address")} />
            </Field>
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-3 sm:col-span-2">
              <Field label="City" error={fe("city")}>
                <Input name="city" defaultValue={dv("city")} maxLength={60} aria-invalid={invalid("city")} />
              </Field>
              <Field label="State" error={fe("state")}>
                <Input name="state" defaultValue={dv("state")} maxLength={2} placeholder="AZ" aria-invalid={invalid("state")} />
              </Field>
              <Field label="ZIP" error={fe("zip")}>
                <Input name="zip" defaultValue={dv("zip")} maxLength={10} aria-invalid={invalid("zip")} />
              </Field>
            </div>
            <Field label="Website" error={fe("website")}>
              <Input name="website" defaultValue={dv("website")} maxLength={120} aria-invalid={invalid("website")} />
            </Field>
            <Field label="Status" error={fe("status")}>
              <Select name="status" defaultValue={dv("status", "active")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Add client"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
