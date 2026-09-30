"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, formHelpers } from "@/components/ui/field";
import { sendNotification } from "@/features/notifications/actions";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const ROLES = [
  { value: "admin", label: "Administrators" },
  { value: "manager", label: "Account managers" },
  { value: "agent", label: "Agents" },
  { value: "client", label: "Clients" },
];
const MAX_BODY = 1000;

/**
 * Send a notification to whole roles and/or particular people. It lands in
 * their bell straight away, and the Sent list shows who has read it.
 */
export default function NotificationComposer({ people }) {
  const [state, formAction, pending] = useActionState(sendNotification, EMPTY);
  const [roles, setRoles] = useState([]);
  const [picked, setPicked] = useState([]);
  const [filter, setFilter] = useState("");
  const [length, setLength] = useState(0);
  const formRef = useRef(null);
  const router = useRouter();
  const { fe, invalid, dv } = formHelpers(state, null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(`Sent to ${state.data.sent} ${state.data.sent === 1 ? "person" : "people"}`);
      formRef.current?.reset();
      setRoles([]);
      setPicked([]);
      setFilter("");
      setLength(0);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors?.title && !state?.fieldErrors?.link) {
      toast.error(state.error);
    }
  }, [state, router]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const matches = filter
    ? people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) && !picked.includes(p.id)).slice(0, 8)
    : [];

  // Everyone who will receive it: the chosen roles plus the chosen people.
  const audience = new Set([
    ...people.filter((p) => roles.includes(p.role)).map((p) => p.id),
    ...picked,
  ]).size;

  const toggleRole = (r) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4 p-5">
      <div>
        <span className="eyebrow mb-2 block">Send to</span>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const on = roles.includes(r.value);
            const n = people.filter((p) => p.role === r.value).length;
            return (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                )}
              >
                <input type="checkbox" name="roles" value={r.value} checked={on} onChange={() => toggleRole(r.value)} className="sr-only" />
                All {r.label.toLowerCase()}
                <span className="tabular-nums opacity-60">{n}</span>
              </label>
            );
          })}
        </div>

        <div className="relative mt-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="…or add particular people by name"
            aria-label="Add a person"
            className="h-8 text-xs"
          />
          {matches.length > 0 ? (
            <div className="absolute left-0 z-30 mt-1 w-full overflow-hidden rounded-lg border bg-card p-1 shadow-xl">
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setPicked((xs) => [...xs, p.id]); setFilter(""); }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{ROLES.find((r) => r.value === p.role)?.label.replace(/s$/, "") ?? p.role}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {picked.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picked.map((id) => (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-2.5 pr-1 text-xs text-primary">
                {byId.get(id)?.name}
                <input type="hidden" name="user_ids" value={id} />
                <button type="button" onClick={() => setPicked((xs) => xs.filter((x) => x !== id))} aria-label={`Remove ${byId.get(id)?.name}`} className="flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-primary/20">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {state?.fieldErrors?.recipients ? (
          <p role="alert" className="mt-1.5 text-[0.7rem] font-medium text-destructive">{state.fieldErrors.recipients}</p>
        ) : null}
      </div>

      <Field label="Title" required error={fe("title")}>
        <Input name="title" maxLength={120} placeholder="Please work the Capital account today" defaultValue={dv("title")} aria-invalid={invalid("title")} />
      </Field>

      <Field label="Message" error={fe("body")} hint={`${length}/${MAX_BODY}`}>
        <Textarea
          name="body"
          rows={3}
          maxLength={MAX_BODY}
          placeholder="Anything they need to know"
          defaultValue={dv("body")}
          onChange={(e) => setLength(e.target.value.length)}
          aria-invalid={invalid("body")}
        />
      </Field>

      <Field label="Link (optional)" error={fe("link")} hint="A page inside Lighthouse they should open, e.g. /clients/garry-insurance">
        <Input name="link" maxLength={300} placeholder="/leads/123" defaultValue={dv("link")} aria-invalid={invalid("link")} />
      </Field>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {audience ? `Goes to ${audience} ${audience === 1 ? "person" : "people"} (not including you)` : "Nobody chosen yet"}
        </span>
        <Button type="submit" size="sm" disabled={pending || audience === 0}>
          <Send /> {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
