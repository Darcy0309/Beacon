"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Link2Off, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { makeInfoLink, resetInfoLink, sendInfoLink } from "@/features/project-info/actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

/**
 * Send the client the private link to fill in their Project Info as they
 * come on board (Sean, Oct 2026): emailed from here, or copied to send
 * yourself. It works without signing in for its 30 days and saves straight
 * to the project. Stop earlier links makes a new link: every one sent
 * before stops working. `defaultTo`: the agent's or the client's address;
 * `defaultName`: who the email says Hi to (the agent's name).
 */
export default function InfoLinkDialog({ projectId, defaultTo = "", defaultName = "", trigger }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(null); // { url, days }
  const [loading, startLoading] = useTransition();
  const [resetting, startResetting] = useTransition();
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(sendInfoLink, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, { to: defaultTo, name: defaultName });
  const input = useRef(null);
  const handled = useRef(null);

  const form = () => {
    const f = new FormData();
    f.set("project_id", String(projectId));
    return f;
  };
  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      const result = await makeInfoLink(form());
      if (result.ok) setLink(result.data);
      else toast.error(result.error);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      toast.success(`Project Info link sent to ${state.data.to}`);
      setOpen(false);
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success("Link copied");
    } catch {
      // No clipboard (an older browser, or not over HTTPS): select it to copy by hand.
      input.current?.select();
      toast("Press Ctrl+C to copy the link");
    }
  };
  const reset = () =>
    startResetting(async () => {
      const result = await resetInfoLink(form());
      if (result.ok) {
        setLink(result.data);
        setAsking(false);
        toast.success("A new link is ready. Links sent before no longer work.");
      } else toast.error(result.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg" data-info-link-dialog>
        <DialogHeader>
          <DialogTitle>Send Project Info to the client</DialogTitle>
          <DialogDescription>
            They fill it in from this link without signing in, for {link?.days ?? 30} days, and it saves straight to this project.
            Later they can change it from their own Lighthouse sign-in, under Project Info.
          </DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Their name" error={fe("name")} hint="The email starts Hi and this name.">
              <Input name="name" defaultValue={dv("name")} maxLength={120} aria-invalid={invalid("name")} placeholder="Josh" autoComplete="off" />
            </Field>
            <Field label="Email it to" required error={fe("to")}>
              <Input name="to" type="email" defaultValue={dv("to")} maxLength={254} aria-invalid={invalid("to")} placeholder="agent@agency.com" autoFocus />
            </Field>
          </div>
          <Field label="Or copy the link to send yourself">
            <div className="flex gap-2">
              <Input ref={input} readOnly value={link?.url ?? (loading ? "Making the link…" : "")} onFocus={(e) => e.target.select()}
                data-info-link className="font-mono text-xs" aria-label="The private link" />
              <Button type="button" variant="outline" onClick={copy} disabled={!link} data-copy-info-link><Copy /> Copy</Button>
            </div>
          </Field>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setAsking(true)} disabled={!link || resetting} data-reset-info-link>
              <Link2Off /> Stop earlier links
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending || !link} data-send-info-link><Send /> {pending ? "Sending…" : "Send email"}</Button>
            </div>
          </DialogFooter>
        </form>
        <ConfirmDialog open={asking} onOpenChange={setAsking} pending={resetting} destructive={false} icon={<Link2Off />}
          title="Stop the links sent before?"
          description="Every link to this Project Info sent so far stops working, and a new one is made to send. What the client already saved stays."
          confirm="Stop them" onConfirm={reset} />
      </DialogContent>
    </Dialog>
  );
}
