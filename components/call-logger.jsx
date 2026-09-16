"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/section-header";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { logCall } from "@/lib/actions";
import { CALL_RESULTS } from "@/lib/validate";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

export default function CallLogger({ leadId, projectId }) {
  const [state, formAction, pending] = useActionState(logCall, EMPTY);
  const formRef = useRef(null);
  const router = useRouter();
  const { fe, invalid, dv } = formHelpers(state, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Call logged");
      formRef.current?.reset();
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Card>
      <SectionHeader label="Log a Call" icon={PhoneCall} />
      <div className="p-4">
        <form ref={formRef} action={formAction} noValidate className="space-y-3">
          <input type="hidden" name="lead_id" value={leadId} />
          {projectId ? <input type="hidden" name="project_id" value={projectId} /> : null}

          <Field label="Result" required error={fe("call_result")}>
            <Select name="call_result" required defaultValue={dv("call_result", CALL_RESULTS[0])} aria-invalid={invalid("call_result")}>
              {CALL_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Notes" error={fe("notes")}>
            <Textarea name="notes" rows={3} maxLength={1000} defaultValue={dv("notes")} placeholder="What happened on the call?" aria-invalid={invalid("notes")} />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={pending}>
              <PhoneCall /> {pending ? "Saving…" : "Log call"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
