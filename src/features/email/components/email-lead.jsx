"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { sendLeadEmail } from "@/features/email/actions";
import { EMAIL_LIMITS } from "@/lib/email";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

const NOT_READY = {
  server: "Email isn't connected yet: the server needs its mail login.",
  from: "There's no address to send from yet.",
};

/**
 * "Email" beside Call now on the lead sheet: write to the name's contact and
 * send it from Lighthouse. It goes out from the company's address under the
 * sender's name, replies come back to the sender, and it is kept on the
 * lead's history. The address on file is filled in and can be changed.
 *
 * `sender` says how it will go out (getEmailSender()); until email is
 * connected the dialog says what is missing and Send stays off.
 */
export default function EmailLead({ leadId, company, to, contact, sender, admin }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(sendLeadEmail, EMPTY);
  // The answer already dealt with: opened again, the dialog keeps a draft that
  // was not sent, but not the errors it was sent back with.
  const [seen, setSeen] = useState(EMPTY);
  const [length, setLength] = useState(null);

  const live = state === seen ? { ...EMPTY, values: state.ok ? null : state.values } : state;
  const { fe, invalid, dv } = formHelpers(live, { to: to ?? "", subject: "", body: "" });
  const problem = live.error && !live.fieldErrors ? live.error : null;
  const count = length ?? String(dv("body")).length;
  const first = String(contact ?? "").trim().split(/\s+/)[0];

  useEffect(() => {
    setLength(null);
    if (state?.ok) {
      toast.success(`Email sent to ${state.data.to}`);
      setSeen(state);
      setOpen(false);
      router.refresh();
    } else if (state?.data?.kept) {
      // Not sent, but kept on the history as not sent: show it there too.
      router.refresh();
    }
  }, [state, router]);

  const onOpenChange = (next) => {
    if (next) setSeen(state);
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-email-lead>
          <Mail /> Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {company}</DialogTitle>
          <DialogDescription>
            {sender.ready
              ? `Sent from ${sender.from} as ${sender.name}. Replies come back to ${sender.replyTo}.`
              : "It goes out from the company's address under your name, and replies come back to you."}
          </DialogDescription>
        </DialogHeader>

        {!sender.ready ? (
          <p role="status" data-email-not-ready className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            {NOT_READY[sender.missing]}{" "}
            {admin ? "Settings › Email says what to add." : "Ask an administrator to set it up."}
          </p>
        ) : null}

        <form action={formAction} noValidate className="flex min-h-0 flex-col gap-4">
          <input type="hidden" name="lead_id" value={leadId} />

          {problem ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {problem}
            </p>
          ) : null}

          <Field label="To" required error={fe("to")} hint={to ? null : "No email on file: type the address the contact gave you."}>
            <Input
              name="to"
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={254}
              defaultValue={dv("to")}
              aria-invalid={invalid("to")}
              autoFocus={!to}
            />
          </Field>

          <Field label="Subject" required error={fe("subject")}>
            <Input
              name="subject"
              maxLength={EMAIL_LIMITS.subject}
              placeholder="Following up on our call"
              defaultValue={dv("subject")}
              aria-invalid={invalid("subject")}
              autoFocus={Boolean(to)}
            />
          </Field>

          <Field label="Message" required error={fe("body")} hint={`${count.toLocaleString()} / ${EMAIL_LIMITS.body.toLocaleString()}`}>
            <Textarea
              name="body"
              rows={9}
              maxLength={EMAIL_LIMITS.body}
              placeholder={first ? `Hi ${first},` : "Hi,"}
              defaultValue={dv("body")}
              onChange={(e) => setLength(e.target.value.length)}
              aria-invalid={invalid("body")}
              className="max-h-[40svh]"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !sender.ready}>
              <Send /> {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
