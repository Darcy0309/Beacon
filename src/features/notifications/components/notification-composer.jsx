"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderKanban, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import ConfirmDialog from "@/components/shared/confirm-dialog";
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
 * Send a notification to whole projects, particular people and (an
 * administrator only) everyone in a role. It lands in their bell straight
 * away, and the Sent list shows who has read it. Sean, Oct 2026: sending to
 * everyone in a role asks "are you sure?" first; an account manager sends to
 * their own projects and the people on them (administrators get a copy of
 * what goes to clients or agents); no Link box: a web address or a page
 * (/leads/123) in the message is a link itself.
 *
 *   people     who can be picked; projects: [{ id, label, people }] to send to whole
 *   everyone   whether "All clients" and the like are offered (administrators)
 */
export default function NotificationComposer({ people, projects = [], everyone = false }) {
  const [state, formAction, pending] = useActionState(sendNotification, EMPTY);
  const [roles, setRoles] = useState([]);
  const [picked, setPicked] = useState([]);
  const [groups, setGroups] = useState([]); // projects picked
  const [asking, setAsking] = useState(false);
  const sure = useRef(false);
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
      setGroups([]);
      setFilter("");
      setLength(0);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors?.title) {
      toast.error(state.error);
    }
  }, [state, router]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const matches = filter
    ? people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()) && !picked.includes(p.id)).slice(0, 8)
    : [];

  // Everyone who will receive it: the chosen roles, projects and people.
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const audience = new Set([
    ...people.filter((p) => roles.includes(p.role)).map((p) => p.id),
    ...groups.flatMap((id) => projectById.get(id)?.people ?? []),
    ...picked,
  ]).size;
  const roleCount = (r) => people.filter((p) => p.role === r).length;
  // Everyone in a role is asked about first: one slip would reach every client or agent.
  const onSubmit = (e) => {
    if (roles.length && !sure.current) {
      e.preventDefault();
      setAsking(true);
      return;
    }
    sure.current = false;
  };

  const toggleRole = (r) => setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4 p-5" data-composer>
      <div>
        <span className="eyebrow mb-2 block">Send to</span>
        {everyone ? <div className="flex flex-wrap gap-2" data-role-groups>
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
        </div> : null}

        {projects.length ? (
          <div className={cn(everyone && "mt-3")}>
            <Select value="" onChange={(e) => { const id = Number(e.target.value); if (id && !groups.includes(id)) setGroups((g) => [...g, id]); }}
              aria-label="Send to everyone on a project" className="h-8 text-xs" data-project-pick>
              <option value="">{everyone ? "…or everyone on a project" : "Everyone on one of your projects…"}</option>
              {projects.filter((p) => !groups.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.label} ({p.people.length})</option>)}
            </Select>
            {groups.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {groups.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-2.5 pr-1 text-xs text-primary" data-project-chip={id}>
                    <FolderKanban className="size-3" /> {projectById.get(id)?.label} <span className="tabular-nums opacity-70">{projectById.get(id)?.people.length}</span>
                    <input type="hidden" name="project_ids" value={id} />
                    <button type="button" onClick={() => setGroups((g) => g.filter((x) => x !== id))} aria-label={`Remove ${projectById.get(id)?.label}`} className="flex size-4 cursor-pointer items-center justify-center rounded-full hover:bg-primary/20">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="relative mt-3">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={everyone || projects.length ? "…or add particular people by name" : "Add people by name"}
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
          placeholder="Anything they need to know. A web address or a Lighthouse page (/leads/123) becomes a link."
          defaultValue={dv("body")}
          onChange={(e) => setLength(e.target.value.length)}
          aria-invalid={invalid("body")}
        />
      </Field>


      {!everyone ? (
        <p className="text-[0.7rem] text-muted-foreground" data-copy-note>Administrators get a copy of what you send to clients or agents.</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground" data-audience={audience}>
          {audience ? `Goes to ${audience} ${audience === 1 ? "person" : "people"} (not including you)` : "Nobody chosen yet"}
        </span>
        <Button type="submit" size="sm" disabled={pending || audience === 0} data-composer-send>
          <Send /> {pending ? "Sending…" : "Send"}
        </Button>
      </div>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Send this to everyone?"
        description={`It goes to ${roles.map((r) => `all ${roleCount(r)} ${ROLES.find((x) => x.value === r)?.label.toLowerCase()}`).join(" and ")}: ${audience} ${audience === 1 ? "person" : "people"} in all. Make sure it's meant for every one of them.`}
        confirm="Yes, send to everyone"
        icon={<Users />}
        destructive={false}
        onConfirm={() => { sure.current = true; setAsking(false); formRef.current?.requestSubmit(); }}
      />
    </form>
  );
}
