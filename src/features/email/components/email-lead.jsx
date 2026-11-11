"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Mail, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import MicButton from "@/components/shared/mic-button";
import { sendLeadEmail } from "@/features/email/actions";
import { EMAIL_LIMITS, emailDraft } from "@/lib/email";
import { EMAIL_ATTACH_MB, fileSize, templateDraft } from "@/lib/email-templates";
import { useDictation } from "@/lib/use-dictation";

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
 * A template (client, Nov 2026: kept by administrators in Settings) fills in
 * the subject and the message for this lead, and brings its files, each of
 * which can be left off this email. The message can be spoken (talk to type).
 *
 * `sender` says how it will go out, with the templates (getEmailSender()); until
 * email is connected the dialog says what is missing and Send stays off.
 *
 * `compact`: a round icon button, for beside an address on the sheet;
 * `primary`: the contact's own, the sheet's main Email button.
 */
export default function EmailLead({ leadId, company, to, contact, sender, admin, signature = "", fields = {}, compact = false, primary = false }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(sendLeadEmail, EMPTY);
  // The answer already dealt with: opened again, the dialog keeps a draft that
  // was not sent, but not the errors it was sent back with.
  const [seen, setSeen] = useState(EMPTY);
  const [length, setLength] = useState(null);
  const templates = sender.templates ?? [];
  const [templateId, setTemplateId] = useState("");
  const [files, setFiles] = useState([]); // the template's files still going with this email
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);
  const talk = useDictation({ onError: (message) => toast.error(message) });

  const live = state === seen ? { ...EMPTY, values: state.ok ? null : state.values } : state;
  const first = String(contact ?? "").trim().split(/\s+/)[0];
  // Begun for them: the greeting, and their signature for the client they call for (Sean, Oct 2026).
  const { fe, invalid, dv } = formHelpers(live, { to: to ?? "", subject: "", body: emailDraft(first, signature) });
  const problem = live.error && !live.fieldErrors ? live.error : null;
  const count = length ?? String(dv("body")).length;
  const total = files.reduce((n, f) => n + f.size, 0);

  useEffect(() => {
    setLength(null);
    if (state?.ok) {
      toast.success(`Email sent to ${state.data.to}`);
      setSeen(state);
      setOpen(false);
      setTemplateId("");
      setFiles([]);
      router.refresh();
    } else if (state?.data?.kept) {
      // Not sent, but kept on the history as not sent: show it there too.
      router.refresh();
    }
  }, [state, router]);

  const onOpenChange = (next) => {
    if (next) setSeen(state);
    else talk.stop();
    setOpen(next);
  };

  // A template picked: the subject and message filled in for this lead, its files with them.
  const pick = (id) => {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (!t) {
      setFiles([]);
      return;
    }
    const draft = templateDraft(t, { ...fields, first_name: first, company, my_name: sender.name, signature });
    if (subjectRef.current) subjectRef.current.value = draft.subject;
    if (bodyRef.current) {
      bodyRef.current.value = draft.body.slice(0, EMAIL_LIMITS.body);
      setLength(bodyRef.current.value.length);
    }
    setFiles(t.attachments);
  };

  // Talking to type into the message, at the cursor: what is said so far replacing what was heard before.
  const toggleTalk = () => {
    const box = bodyRef.current;
    if (!box) return;
    if (talk.listening) return talk.stop();
    if (document.activeElement !== box) box.focus();
    const before = box.value.slice(0, box.selectionStart);
    const after = box.value.slice(box.selectionEnd);
    const gap = before && !/\s$/.test(before) ? " " : "";
    talk.start((text) => {
      const head = `${before}${gap}${text}`.slice(0, EMAIL_LIMITS.body);
      box.value = `${head}${after}`.slice(0, EMAIL_LIMITS.body);
      box.setSelectionRange(head.length, head.length);
      setLength(box.value.length);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {compact ? (
          <button
            type="button"
            data-email-to={to ?? ""}
            data-email-lead={primary ? "" : undefined}
            aria-label={to ? `Email ${to}` : "Email the contact"}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_14px_-6px_var(--primary)] transition-all hover:brightness-110 active:scale-95"
          >
            <Mail className="size-4" />
          </button>
        ) : (
          <Button size="sm" variant="outline" data-email-lead>
            <Mail /> Email
          </Button>
        )}
      </DialogTrigger>
      {/* One scroll bar: the fields scroll, the title and the buttons stay put. */}
      <DialogContent className="max-w-xl overflow-y-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Email {company}</DialogTitle>
          <DialogDescription>
            {sender.ready
              ? `Sent from ${sender.from} as ${sender.name}. Replies come back to ${sender.replyTo}.`
              : "It goes out from the company's address under your name, and replies come back to you."}
          </DialogDescription>
        </DialogHeader>

        {!sender.ready ? (
          <p role="status" data-email-not-ready className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            {NOT_READY[sender.missing]}{" "}
            {admin ? "Settings › Email says what to add." : "Ask an administrator to set it up."}
          </p>
        ) : null}

        {/* On a short screen the fields scroll and the buttons stay in view. */}
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="template_id" value={templateId} />
          {files.map((f) => <input key={f.path} type="hidden" name="attach" value={f.path} />)}
          <div data-email-fields className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-1">
            {problem ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {problem}
              </p>
            ) : null}

            {templates.length ? (
              <Field label="Template" hint={templateId ? "Fills in the subject and message for this lead: change anything before sending." : "Optional: start from one of the company's emails."}>
                <Select value={templateId} onChange={(e) => pick(e.target.value)} data-email-template>
                  <option value="">None: write my own</option>
                  {templates.map((t) => <option key={t.id} value={String(t.id)}>{t.name}{t.attachments.length ? ` · ${t.attachments.length} file${t.attachments.length === 1 ? "" : "s"}` : ""}</option>)}
                </Select>
              </Field>
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
                ref={subjectRef}
                name="subject"
                maxLength={EMAIL_LIMITS.subject}
                placeholder="Following up on our call"
                defaultValue={dv("subject")}
                aria-invalid={invalid("subject")}
                autoFocus={Boolean(to)}
              />
            </Field>

            <Field label="Message" required error={fe("body")} hint={`${count.toLocaleString()} / ${EMAIL_LIMITS.body.toLocaleString()}`}>
              <div className="relative">
                <Textarea
                  ref={bodyRef}
                  name="body"
                  rows={9}
                  maxLength={EMAIL_LIMITS.body}
                  placeholder={first ? `Hi ${first},` : "Hi,"}
                  defaultValue={dv("body")}
                  onChange={(e) => setLength(e.target.value.length)}
                  aria-invalid={invalid("body")}
                  className="max-h-[40svh] pr-10"
                />
                {/* Talk to type (Nov 2026): the browser's own, where it has it. */}
                {talk.supported ? <MicButton listening={talk.listening} onToggle={toggleTalk} className="absolute bottom-2 right-2" /> : null}
              </div>
            </Field>

            {files.length ? (
              <div data-email-attachments>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Paperclip className="size-3.5" /> Attached · {fileSize(total)}
                  {total > EMAIL_ATTACH_MB * 1024 * 1024 ? <span className="text-destructive"> · over {EMAIL_ATTACH_MB} MB: take one off</span> : null}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <li key={f.path} data-email-attachment={f.name} className="flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] bg-muted/40 py-1 pl-2 pr-1 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="max-w-48 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{fileSize(f.size)}</span>
                      <button type="button" onClick={() => setFiles((list) => list.filter((x) => x.path !== f.path))}
                        aria-label={`Don't attach ${f.name}`} title="Leave it off this email"
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !sender.ready}>
              <Send /> {pending ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
