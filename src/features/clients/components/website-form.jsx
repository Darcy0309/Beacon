"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { saveCompanyWebsite } from "@/features/clients/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/** A client's website (Branding): theirs, or (with companyId) a client's an administrator is looking at. */
export default function WebsiteForm({ website, companyId = null }) {
  const [state, action, pending] = useActionState(saveCompanyWebsite, EMPTY);
  const router = useRouter();
  const { fe, invalid, dv } = formHelpers(state, { website: website ?? "" });
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success(state.data?.website ? "Website saved" : "Website taken off");
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router]);

  return (
    <form action={action} noValidate className="flex flex-wrap items-end gap-3" data-website-form>
      {companyId ? <input type="hidden" name="company_id" value={companyId} /> : null}
      <Field label="Website" error={fe("website")} className="min-w-64 flex-1">
        <Input name="website" maxLength={200} placeholder="www.yourcompany.com" defaultValue={dv("website")} aria-invalid={invalid("website")} />
      </Field>
      <Button type="submit" size="sm" disabled={pending}><Save /> {pending ? "Saving…" : "Save website"}</Button>
    </form>
  );
}
