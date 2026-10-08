"use client";

import { useState, useTransition } from "react";
import Link from "@/components/shared/intent-link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewAppointmentQa } from "@/features/qa/actions";

/**
 * Appointments waiting for QA. Pass tells the client; Fail needs a reason,
 * which goes to whoever set it. Nobody reviews their own (the database
 * refuses it; the buttons are not offered).
 */
export default function QaQueue({ items, me }) {
  const router = useRouter();
  const [failing, setFailing] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null);
  const [, startTransition] = useTransition();

  const review = (id, passed) => {
    const f = new FormData();
    f.set("id", String(id));
    f.set("passed", String(passed));
    if (!passed) f.set("note", note);
    setBusy(id);
    startTransition(async () => {
      const result = await reviewAppointmentQa(f);
      setBusy(null);
      if (result?.ok) {
        toast.success(passed ? "Passed: the client has been told" : "Failed: whoever set it has been told why");
        setFailing(null);
        setNote("");
        router.refresh();
      } else {
        toast.error(result?.error ?? "That didn't work. Try again.");
      }
    });
  };

  if (!items.length) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing waiting for QA.</p>;
  }

  return (
    <ul className="divide-y divide-[var(--panel-border)]">
      {items.map((a) => {
        const own = a.setterId === me?.id && me?.role !== "admin";
        return (
          <li key={a.id} data-list-row className="space-y-2 px-5 py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/leads/${a.leadId}`} className="font-medium transition-colors hover:text-primary">{a.company}</Link>
                <p className="text-xs text-muted-foreground">
                  {a.result} · {a.when}{a.with ? ` with ${a.with}` : ""} · {a.project}
                </p>
                <p className="text-xs text-muted-foreground">
                  {a.contact} · <span className="tabular-nums">{a.phone}</span> · set by {a.setBy} on {a.set}
                </p>
                {a.notes ? (
                  <p className="mt-1 whitespace-pre-line text-xs"><span className="font-semibold text-muted-foreground">Client notes: </span>{a.notes}</p>
                ) : null}
              </div>
              {own ? (
                <span className="text-xs text-muted-foreground">Someone else reviews your appointments</span>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy === a.id} onClick={() => review(a.id, true)}>
                    {busy === a.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Pass
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === a.id} onClick={() => setFailing(failing === a.id ? null : a.id)}>
                    <XCircle /> Fail
                  </Button>
                </div>
              )}
            </div>
            {failing === a.id ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  review(a.id, false);
                }}
              >
                <Input
                  autoFocus
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Why it failed, e.g. no decision maker on the call"
                  aria-label="Why it failed"
                  className="min-w-0 flex-1"
                />
                <Button size="sm" variant="destructive" type="submit" disabled={!note.trim() || busy === a.id}>Fail it</Button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
