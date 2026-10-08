"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import StampedTextarea from "@/components/shared/stamped-textarea";
import { saveLeadNote } from "@/features/leads/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

const KINDS = {
  client: { label: "Client notes", icon: Eye, say: "The client sees these: in the lead sheet email and on the calendar.", max: 2000 },
  internal: { label: "Internal notes", icon: Lock, say: "Staff only: never shown to the client.", max: 5000 },
};

/** One note on the Notes tab: read, or (for staff) edited where it is. */
function Note({ leadId, kind, text, canEdit }) {
  const k = KINDS[kind];
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(saveLeadNote, EMPTY);
  const router = useRouter();
  const box = useRef(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`${k.label} saved`);
      setEditing(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, k.label, router]);

  useEffect(() => {
    if (!editing) return;
    const el = box.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const Icon = k.icon;
  return (
    <section data-note={kind} className="px-4 py-3 odd:bg-muted/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {k.label}
          </h3>
          <p className="text-xs text-muted-foreground">{k.say}</p>
        </div>
        {canEdit && !editing ? (
          <Button type="button" size="sm" variant="ghost" className="shrink-0 px-2" onClick={() => setEditing(true)} aria-label={`Edit ${k.label.toLowerCase()}`}>
            <Pencil /> {text ? "Edit" : "Add"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <form action={action} className="mt-2 space-y-2">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="kind" value={kind} />
          <StampedTextarea
            ref={box}
            name="text"
            // Tall enough for what is there (about 70 characters a line), within reason.
            rows={Math.min(14, Math.max(4, Math.ceil(String(text ?? "").length / 70) + String(text ?? "").split("\n").length))}
            maxLength={k.max}
            defaultValue={state?.values?.text ?? text ?? ""}
            aria-label={k.label}
            aria-invalid={Boolean(state?.fieldErrors?.text)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
            }}
          />
          {state?.fieldErrors?.text ? <p role="alert" className="text-xs font-medium text-destructive">{state.fieldErrors.text}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      ) : (
        <p className={text ? "mt-2 whitespace-pre-line break-words text-sm" : "mt-2 text-sm text-muted-foreground"}>{text || "None yet."}</p>
      )}
    </section>
  );
}

/**
 * The lead's Notes tab: its client notes (which the client sees) and its
 * internal notes (staff only), each edited in place, then its description.
 */
export default function LeadNotes({ leadId, clientNote, internalNotes, description, canEdit }) {
  return (
    <div className="divide-y divide-[var(--panel-border)]">
      <Note leadId={leadId} kind="client" text={clientNote} canEdit={canEdit} />
      <Note leadId={leadId} kind="internal" text={internalNotes} canEdit={canEdit} />
      {description ? (
        <section className="px-4 py-3">
          <h3 className="text-sm font-semibold">Description</h3>
          <p className="mt-1 whitespace-pre-line break-words text-sm">{description}</p>
        </section>
      ) : null}
    </div>
  );
}
