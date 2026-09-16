"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/field";
import { logCall } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

const RESULTS = [
  "Appointment set",
  "Callback requested",
  "X-date captured",
  "Left voicemail",
  "Gatekeeper",
  "Not interested",
  "Wrong number",
  "Do not call",
];

export default function CallLogger({ leadId, projectId }) {
  const [state, formAction, pending] = useActionState(logCall, EMPTY);
  const formRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Call logged");
      formRef.current?.reset();
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a call</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="space-y-3">
          <input type="hidden" name="lead_id" value={leadId} />
          {projectId ? <input type="hidden" name="project_id" value={projectId} /> : null}

          <Select name="call_result" defaultValue={RESULTS[0]}>
            {RESULTS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
          <Textarea name="notes" rows={3} placeholder="What happened on the call?" />
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={pending}>
              <PhoneCall /> {pending ? "Saving…" : "Log call"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
