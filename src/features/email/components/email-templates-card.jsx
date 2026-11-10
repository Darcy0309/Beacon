"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, MailPlus, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { deleteEmailTemplate, discardTemplateFiles, saveEmailTemplate } from "@/features/email/template-actions";
import { EMAIL_LIMITS } from "@/lib/email";
import { TEMPLATE_FIELDS, TEMPLATE_FILE_MB, fileSize } from "@/lib/email-templates";
import { REACH_ERROR, isNetworkError, reach } from "@/lib/reach";
import { cn } from "@/lib/utils";

const BUCKET = "email-templates";
const ACCEPT = ".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
// A stored name with nothing in it that a path cannot hold.
const safe = (name) => name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "file";
const BLANK = { id: null, name: "", subject: "", body: "", attachments: [], active: true };

/**
 * Email templates (client, Nov 2026): what managers pick from in a lead's Email box, kept here by
 * administrators: a name, a subject and a message (with the contact's first name, the company, the
 * sender's name and signature filled in when picked), and files to go with it, up to
 * TEMPLATE_FILE_MB each. One can be paused (off the list) without losing it.
 */
export default function EmailTemplatesCard({ templates }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null); // the template in the dialog, or null
  const [asking, setAsking] = useState(null); // the one about to be deleted
  const [pending, start] = useTransition();

  const remove = (t) => start(async () => {
    const r = await reach(() => deleteEmailTemplate(t.id));
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${t.name} deleted`);
    setAsking(null);
    router.refresh();
  });
  const toggle = (t) => start(async () => {
    const r = await reach(() => saveEmailTemplate({ ...t, active: !t.active }));
    if (!r.ok) return void toast.error(r.error);
    toast.success(t.active ? `${t.name} paused: off the managers' list` : `${t.name} back on the managers' list`);
    router.refresh();
  });

  return (
    <Card data-email-templates>
      <SectionHeader label="Email templates" icon={MailPlus}
        action={<Button size="sm" onClick={() => setEditing(BLANK)} data-new-template><Plus /> New template</Button>} />
      <p className="border-b border-[var(--panel-border)] px-5 py-2.5 text-xs text-muted-foreground">
        What managers pick from when they email a lead: it fills in the subject and the message for that lead, and its files go with it.
      </p>
      {templates.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No templates yet. Add one, and it&apos;s in every lead&apos;s Email box.</p>
      ) : (
        <ul className="divide-y divide-[var(--panel-border)]">
          {templates.map((t) => (
            <li key={t.id} data-template={t.name} className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3", !t.active && "opacity-60")}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}{t.active ? null : <span className="ml-2 text-xs font-normal text-muted-foreground">Paused</span>}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.subject}{t.attachments.length ? ` · ${t.attachments.length} file${t.attachments.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(t)} data-template-toggle>{t.active ? "Pause" : "Turn on"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} data-template-edit><Pencil /> Edit</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(t)} aria-label={`Delete ${t.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 /></Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing ? <TemplateDialog key={editing.id ?? "new"} template={editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} pending={pending}
        title={asking ? `Delete ${asking.name}?` : ""}
        description="It comes off the managers' list, with its files. Emails already sent keep what they said."
        onConfirm={() => remove(asking)} />
    </Card>
  );
}

/** A template's editor: its name, subject, message and files. */
function TemplateDialog({ template, onClose }) {
  const router = useRouter();
  const [form, setForm] = useState(template);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // what is uploading, in words
  const [saving, start] = useTransition();
  const uploaded = useRef([]); // files added here, to drop if it's never saved
  const fileInput = useRef(null);
  const bodyRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Files uploaded here that the template doesn't keep (`keep`: the paths it does): out of storage.
  const drop = (keep) => {
    const loose = uploaded.current.filter((p) => !keep.has(p));
    uploaded.current = [];
    if (loose.length) reach(() => discardTemplateFiles(loose));
  };
  const close = () => {
    drop(new Set(template.attachments.map((a) => a.path)));
    onClose();
  };

  // A field put in at the cursor, in the message.
  const insert = (key) => {
    const box = bodyRef.current;
    if (!box) return;
    const at = box.selectionStart ?? box.value.length;
    const next = `${box.value.slice(0, at)}{${key}}${box.value.slice(box.selectionEnd ?? at)}`;
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(at + key.length + 2, at + key.length + 2);
    });
  };

  const upload = async (list) => {
    const chosen = [...list];
    if (fileInput.current) fileInput.current.value = "";
    const tooBig = chosen.filter((f) => f.size > TEMPLATE_FILE_MB * 1024 * 1024);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")}: files must be ${TEMPLATE_FILE_MB} MB or smaller.`);
    const sb = createClient();
    for (const file of chosen.filter((f) => f.size <= TEMPLATE_FILE_MB * 1024 * 1024)) {
      setBusy(`Adding ${file.name}…`);
      const path = `template/${crypto.randomUUID()}/${safe(file.name)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }).catch((e) => ({ error: e }));
      if (error) {
        toast.error(`${file.name}: ${/mime|type/i.test(error.message) ? "that kind of file can't be attached" : isNetworkError(error) ? REACH_ERROR : error.message}`);
        continue;
      }
      uploaded.current.push(path);
      setForm((f) => ({ ...f, attachments: [...f.attachments, { path, name: file.name, size: file.size, type: file.type || null }] }));
    }
    setBusy(null);
  };

  const save = (e) => {
    e.preventDefault();
    start(async () => {
      const r = await reach(() => saveEmailTemplate(form));
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(template.id ? "Template saved" : "Template added: it's in every lead's Email box");
      drop(new Set(form.attachments.map((a) => a.path)));
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl overflow-y-hidden" data-template-dialog>
        <DialogHeader className="shrink-0">
          <DialogTitle>{template.id ? `Edit ${template.name}` : "New email template"}</DialogTitle>
          <DialogDescription>Managers pick it in a lead&apos;s Email box: it fills in the subject and message, and its files go with it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-1">
            <Field label="Name" required error={errors.name} hint="What managers see in the list, e.g. Renewal follow-up">
              <Input value={form.name} onChange={set("name")} maxLength={80} aria-invalid={Boolean(errors.name)} autoFocus data-template-name />
            </Field>
            <Field label="Subject" required error={errors.subject}>
              <Input value={form.subject} onChange={set("subject")} maxLength={EMAIL_LIMITS.subject} placeholder="Your renewal, {company}" aria-invalid={Boolean(errors.subject)} data-template-subject />
            </Field>
            <Field label="Message" required error={errors.body}
              hint="Without {signature}, the sender's signature goes at the end, as on any email they write.">
              <Textarea ref={bodyRef} value={form.body} onChange={set("body")} rows={10} maxLength={EMAIL_LIMITS.body}
                placeholder={"Hi {first_name},\n\nThanks for your time today…"} aria-invalid={Boolean(errors.body)} className="max-h-[38svh]" data-template-body />
            </Field>
            <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Fill in for each lead:
              {TEMPLATE_FIELDS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => insert(key)} title={`Put ${label.toLowerCase()} here`}
                  className="rounded-md border border-[var(--panel-border)] px-1.5 py-0.5 font-mono text-[0.7rem] transition-colors hover:border-primary/40 hover:text-primary">
                  {`{${key}}`}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Attachments</span>
                <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => upload(e.target.files)} data-template-file-input />
                <Button type="button" size="sm" variant="outline" disabled={Boolean(busy) || form.attachments.length >= 10} onClick={() => fileInput.current?.click()} data-template-add-file>
                  {busy ? <Loader2 className="animate-spin" /> : <Paperclip />} Add files
                </Button>
              </div>
              {busy ? <p className="mb-1 text-xs text-muted-foreground" aria-live="polite">{busy}</p> : null}
              {form.attachments.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {form.attachments.map((a) => (
                    <li key={a.path} data-template-file={a.name} className="flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] bg-muted/40 py-1 pl-2 pr-1 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="max-w-56 truncate">{a.name}</span>
                      <span className="text-muted-foreground">{fileSize(a.size)}</span>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, attachments: f.attachments.filter((x) => x.path !== a.path) }))}
                        aria-label={`Take ${a.name} off`} className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive">
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None. PDFs, Word, Excel, PowerPoint or pictures, up to {TEMPLATE_FILE_MB} MB each.</p>
              )}
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving || Boolean(busy)} data-template-save>{saving ? "Saving…" : "Save template"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
