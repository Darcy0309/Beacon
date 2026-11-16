"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PhoneForwarded, Trash2 } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEFAULT_ATTENDANT_GREETING, LINE_KINDS, lineNumberLabel } from "@/lib/phone-lines";
import { addPhoneLine, removePhoneLine, savePhoneLineSettings, updatePhoneLine } from "@/features/settings/phone-lines-actions";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const SELECT = "h-9 rounded-md border border-[var(--panel-border)] bg-transparent px-2 text-sm";
const name = (u) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email;

/** People to tick: whom a line rings, or whom the general voicemail goes to. */
function People({ staff, field, chosen = [], label }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs text-muted-foreground">{label}</legend>
      <div className="flex max-h-32 flex-wrap gap-x-4 gap-y-1 overflow-y-auto text-sm">
        {staff.map((u) => (
          <label key={u.id} className="flex items-center gap-1.5">
            <input type="checkbox" name={field} value={u.id} defaultChecked={chosen.includes(u.id)} className="size-4 accent-[var(--primary)]" />
            {name(u)}{u.phone_ext ? <span className="text-muted-foreground">x{u.phone_ext}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One line: what it is for, its label, whom it rings; saved on its own, or taken off. */
function LineRow({ line, staff }) {
  const [state, action, pending] = useActionState(updatePhoneLine, EMPTY);
  const [kind, setKind] = useState(line.kind);
  const [removing, startRemove] = useTransition();
  useEffect(() => {
    if (state.ok) toast.success(`${lineNumberLabel(line.number)} saved`);
    else if (state.error) toast.error(state.error);
  }, [state, line.number]);
  return (
    <form action={action} className="grid gap-3 border-b border-[var(--panel-border)] px-5 py-4 last:border-0 lg:grid-cols-[11rem_12rem_1fr_auto]" data-phone-line={line.number}>
      <input type="hidden" name="id" value={line.id} />
      <div className="font-semibold tabular-nums">{lineNumberLabel(line.number)}<div className="text-xs font-normal text-muted-foreground">Area code {line.area_code}</div></div>
      <div className="space-y-2">
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${SELECT} w-full`} aria-label="What the line is for">
          {LINE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <Input name="label" defaultValue={line.label ?? ""} maxLength={80} placeholder={kind === "local" ? "Eau Claire, WI" : "Signature Marketing"} aria-label="Label" />
      </div>
      <div className="min-w-0 text-xs text-muted-foreground">
        {kind === "main" ? <People staff={staff} field="ring" chosen={line.ring_user_ids ?? []} label="Rings (then their voicemail)" /> : LINE_KINDS.find(([k]) => k === kind)?.[2]}
      </div>
      <div className="flex items-start gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" disabled={removing} aria-label={`Take ${lineNumberLabel(line.number)} off`} title="Take off the list"
          onClick={() => startRemove(async () => {
            const res = await removePhoneLine(line.id);
            if (res?.ok) toast.success(`${lineNumberLabel(line.number)} taken off`);
            else toast.error(res?.error ?? "It could not be taken off.");
          })}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </form>
  );
}

/**
 * Phone Lines (Sean, Nov 2026): the account's Twilio numbers and what each is for: the managers' line (the
 * "insurance office" greeting and extensions), a line that rings chosen people (Signature Marketing: Sean and
 * Mike), and local numbers managers' calls go out from by area code. Then the managers' line's greeting and who
 * gets its general voicemail. Extensions are set on each user (Users → Edit).
 */
export default function PhoneLinesSettings({ lines = [], staff = [], value = {} }) {
  const [added, addAction, adding] = useActionState(addPhoneLine, EMPTY);
  const [saved, saveAction, saving] = useActionState(savePhoneLineSettings, EMPTY);
  const [addKind, setAddKind] = useState("local");
  useEffect(() => {
    if (added.ok) toast.success(`${lineNumberLabel(added.data.number)} added`);
    else if (added.error) toast.error(added.error);
  }, [added]);
  useEffect(() => {
    if (saved.ok) toast.success("Managers' line saved");
    else if (saved.error) toast.error(saved.error);
  }, [saved]);
  const counts = Object.fromEntries(LINE_KINDS.map(([k]) => [k, lines.filter((l) => l.kind === k).length]));
  return (
    <Card data-phone-lines-settings>
      <SectionHeader label="Phone Lines" icon={PhoneForwarded} />
      <p className="px-5 pt-3 text-sm text-muted-foreground">
        The Twilio numbers Lighthouse answers and calls from. Buy or port a number in Twilio first; listed here, Lighthouse
        knows what it is for. {counts.local ? `${counts.local} local caller ID${counts.local === 1 ? "" : "s"}` : "No local caller IDs yet"}
        {" "}· managers&apos; extensions are set on each user.
      </p>

      <div className="mt-3 border-t border-[var(--panel-border)]">
        {lines.length ? lines.map((l) => <LineRow key={`${l.id}|${l.kind}|${l.label}|${(l.ring_user_ids ?? []).join(",")}`} line={l} staff={staff} />)
          : <p className="px-5 py-4 text-sm text-muted-foreground" data-no-phone-lines>No lines yet: calls go out from, and come in to, the one Twilio number.</p>}
      </div>

      <form action={addAction} className="grid gap-3 border-t border-[var(--panel-border)] bg-muted/20 px-5 py-4 lg:grid-cols-[11rem_12rem_1fr_auto]" data-add-phone-line>
        <Input name="number" inputMode="tel" placeholder="(715) 555-0100" aria-label="Number" aria-invalid={Boolean(added.fieldErrors?.number)} />
        <div className="space-y-2">
          <select name="kind" value={addKind} onChange={(e) => setAddKind(e.target.value)} className={`${SELECT} w-full`} aria-label="What the line is for">
            {LINE_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Input name="label" maxLength={80} placeholder={addKind === "local" ? "Eau Claire, WI" : "Signature Marketing"} aria-label="Label" />
        </div>
        <div className="min-w-0 text-xs text-muted-foreground">
          {addKind === "main" ? <People staff={staff} field="ring" label="Rings (then their voicemail)" /> : LINE_KINDS.find(([k]) => k === addKind)?.[2]}
        </div>
        <div><Button type="submit" size="sm" disabled={adding}>{adding ? "Adding…" : "Add line"}</Button></div>
      </form>

      <form action={saveAction} className="space-y-3 border-t border-[var(--panel-border)] px-5 py-4" data-attendant-settings>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">The managers&apos; line says, in the AI voice (blank: the usual greeting)</span>
          <textarea name="attendant_greeting" rows={3} maxLength={600} defaultValue={value.attendant_greeting ?? ""} placeholder={DEFAULT_ATTENDANT_GREETING}
            className="w-full rounded-md border border-[var(--panel-border)] bg-transparent px-3 py-2 text-sm" />
        </label>
        <People staff={staff} field="general" chosen={(value.general_voicemail_users ?? []).map(Number)}
          label="No extension dialed: the general voicemail goes to (none ticked: the administrators)" />
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </form>
    </Card>
  );
}
