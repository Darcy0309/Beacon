"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveUser } from "@/lib/actions";
import { ROLES } from "@/lib/nav";

const EMPTY = { ok: false, data: null, error: null };

export default function UserForm({ user, options, trigger }) {
  const isEdit = Boolean(user?.id);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveUser, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "User updated" : "User invited");
      setOpen(false);
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, isEdit, router]);

  const { companies = [] } = options ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            {isEdit ? <Pencil /> : <UserPlus />} {isEdit ? "Edit" : "Invite user"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Invite user"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={user.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input name="first_name" defaultValue={user?.first_name ?? ""} />
            </Field>
            <Field label="Last name">
              <Input name="last_name" defaultValue={user?.last_name ?? ""} />
            </Field>

            <Field label="Email" className="sm:col-span-2">
              <Input name="email" type="email" required defaultValue={user?.email ?? ""} />
            </Field>

            <Field label="Role">
              <Select name="role" defaultValue={user?.role ?? "agent"}>
                {Object.entries(ROLES).map(([key, r]) => (
                  <option key={key} value={key}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue={user?.status ?? "invited"}>
                <option value="active">Active</option>
                <option value="invited">Invited</option>
                <option value="disabled">Disabled</option>
              </Select>
            </Field>

            <Field label="Username">
              <Input name="username" defaultValue={user?.username ?? ""} />
            </Field>
            <Field label="Phone">
              <Input name="phone" defaultValue={user?.phone ?? ""} />
            </Field>

            <Field
              label="Client (portal users only)"
              className="sm:col-span-2"
              hint="Restricts a client user to that account's projects."
            >
              <Select name="company_id" defaultValue={user?.company?.id ?? ""}>
                <option value="">Internal staff — no client</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
