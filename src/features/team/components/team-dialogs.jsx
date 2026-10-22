"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, Heart, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { messageTeamMember, sendKudos } from "@/features/team/actions";
import { GIFTS } from "@/lib/team";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const first = (name) => String(name ?? "").split(/\s+/)[0] || "them";

/** Says how a form went, once per answer: `done` on success. */
function useOutcome(state, done) {
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) done(state.data);
    else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, done]);
}

/** A note to a member of the team: it lands in their notifications, where they can answer it. */
export function MessageDialog({ member, open, onOpenChange }) {
  const [state, action, pending] = useActionState(messageTeamMember, EMPTY);
  const { fe, invalid } = formHelpers(state, null);
  useOutcome(state, () => {
    toast.success(`Message sent to ${first(member.name)}`);
    onOpenChange(false);
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-message-dialog={member.id}>
        <DialogHeader>
          <DialogTitle>Message {member.name}</DialogTitle>
          <DialogDescription>It goes to their notifications, and their answer comes back to yours.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="to" value={member.id} />
          <Field label="Message" required error={fe("body")}>
            <Textarea name="body" rows={4} maxLength={1000} autoFocus aria-invalid={invalid("body")} data-message-body />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} data-send-message><Send /> {pending ? "Sending…" : "Send"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A thank-you, with a note if they like: the member is told, and it counts on their card. */
export function ThanksDialog({ member, open, onOpenChange }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(sendKudos, EMPTY);
  useOutcome(state, () => {
    toast.success(`${first(member.name)} will hear your thank-you`);
    onOpenChange(false);
    router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-thanks-dialog={member.id}>
        <DialogHeader>
          <DialogTitle>Thank {member.name}</DialogTitle>
          <DialogDescription>For a great appointment, a quick answer, a job well done. They will see it right away.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="to" value={member.id} />
          <input type="hidden" name="kind" value="thanks" />
          <Field label="Note" hint="Optional: what you are thanking them for">
            <Textarea name="note" rows={3} maxLength={300} autoFocus data-thanks-note />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending} data-send-thanks><Heart /> {pending ? "Sending…" : "Say thank you"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** On their birthday: a gift to pick (each one moving), and a note. */
export function GiftDialog({ member, open, onOpenChange }) {
  const router = useRouter();
  const [gift, setGift] = useState("");
  const [state, action, pending] = useActionState(sendKudos, EMPTY);
  const { fe } = formHelpers(state, null);
  useEffect(() => {
    if (open) setGift("");
  }, [open]);
  useOutcome(state, () => {
    toast.success(`Your gift is on its way to ${first(member.name)} 🎉`);
    onOpenChange(false);
    router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-gift-dialog={member.id}>
        <DialogHeader>
          <DialogTitle>🎂 A birthday gift for {member.name}</DialogTitle>
          <DialogDescription>Pick one and add a few words. It pops up in their notifications with your name.</DialogDescription>
        </DialogHeader>
        <form action={action} noValidate className="flex flex-col gap-4">
          <input type="hidden" name="to" value={member.id} />
          <input type="hidden" name="kind" value="birthday" />
          <input type="hidden" name="gift" value={gift} />
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Gift">
            {GIFTS.map(([key, emoji, label], i) => (
              <button key={key} type="button" role="radio" aria-checked={gift === key} onClick={() => setGift(key)} data-gift={key}
                className={cn("gift-option flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors",
                  gift === key ? "border-primary bg-primary/12 text-foreground" : "border-[var(--panel-border)] text-muted-foreground hover:bg-muted")}>
                <span aria-hidden className="gift-emoji text-3xl" style={{ animationDelay: `${(i % 3) * 0.25}s` }}>{emoji}</span>
                {label}
              </button>
            ))}
          </div>
          {fe("gift") ? <p className="-mt-2 text-xs text-destructive">{fe("gift")}</p> : null}
          <Field label="Note" hint="e.g. Happy birthday! Thanks for all the great appointments this year.">
            <Textarea name="note" rows={3} maxLength={300} data-gift-note />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !gift} data-send-gift><Gift /> {pending ? "Sending…" : "Send gift"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
