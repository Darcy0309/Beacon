"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field, formHelpers } from "@/components/ui/field";
import { postBulletin } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const MAX = 100;

export default function BulletinComposer() {
  const [state, formAction, pending] = useActionState(postBulletin, EMPTY);
  const [length, setLength] = useState(0);
  const formRef = useRef(null);
  const router = useRouter();
  const { fe, invalid, dv } = formHelpers(state, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Announcement posted");
      formRef.current?.reset();
      setLength(0);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Card>
      <div className="space-y-3 p-5">
        <form ref={formRef} action={formAction} noValidate className="space-y-3">
          <Field label="Announcement" error={fe("message")} hint={`${length}/${MAX}`}>
            <Textarea
              name="message"
              required
              minLength={3}
              maxLength={MAX}
              defaultValue={dv("message")}
              onChange={(e) => setLength(e.target.value.length)}
              placeholder="Share an announcement with the team…"
              aria-invalid={invalid("message")}
            />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={pending}>
              {pending ? "Posting…" : "Post announcement"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
