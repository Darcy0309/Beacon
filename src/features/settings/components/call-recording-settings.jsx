"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleDot } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { savePhoneSettings } from "@/features/settings/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Call Recording (Sean, Nov 2026: "will the phone system record all the calls anyway without the
 * manager having to hit record?"): every call on the Lighthouse phone recorded from the moment it is
 * answered, and with it, "This call may be recorded" said to the other person first (some states,
 * California among them, need everyone on a call to know). `value`: app_settings 'phone'.
 */
export default function CallRecordingSettings({ value = {} }) {
  const [state, action, pending] = useActionState(savePhoneSettings, EMPTY);
  useEffect(() => {
    if (state.ok) toast.success("Call recording saved", { description: "Phones pick it up within a few minutes." });
    else if (state.error) toast.error(state.error);
  }, [state]);
  // Drawn afresh from what is saved: a form is reset once its action succeeds (React), and would
  // otherwise show what it started with rather than what was just saved.
  const saved = state.ok ? state.data : value;
  return (
    <Card data-call-recording-settings>
      <SectionHeader label="Call Recording" icon={CircleDot} />
      <RecordingForm key={`${saved?.record_all === true}|${saved?.record_notice !== false}`} value={saved} action={action} pending={pending} />
    </Card>
  );
}

function RecordingForm({ value, action, pending }) {
  const [all, setAll] = useState(value?.record_all === true);
  return (
    <form action={action} className="space-y-4 p-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Calls on the Lighthouse phone are recorded when someone presses Record. Turn this on to record every call from the moment
        it&apos;s answered. Each recording is on the lead&apos;s Conversation, playable by whoever made the call and by administrators.
      </p>
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" name="record_all" checked={all} onChange={(e) => setAll(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" data-record-all />
        <span>
          <span className="font-medium">Record every call</span>
          <span className="block text-xs text-muted-foreground">Calls out and calls in. Record still stops and starts it during a call.</span>
        </span>
      </label>
      <label className={`flex items-start gap-2.5 pl-6 text-sm ${all ? "cursor-pointer" : "opacity-50"}`}>
        <input type="checkbox" name="record_notice" defaultChecked={value?.record_notice !== false} disabled={!all} className="mt-0.5 size-4 accent-[var(--primary)]" data-record-notice />
        <span>
          <span className="font-medium">Say &ldquo;This call may be recorded&rdquo; first</span>
          <span className="block text-xs text-muted-foreground">
            Said to the person called as they answer, and to callers before it rings. Some states, California among them, require
            everyone on a call to know it&apos;s recorded.
          </span>
        </span>
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
