"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import DatePicker from "@/components/shared/date-picker";
import { callBackLater } from "@/features/leads/actions";
import { addDays, addYears, formatIso } from "@/lib/dates";
import { reach } from "@/lib/reach";

/**
 * Call back later, for a lead whose appointment was found invalid (Sean, Oct
 * 2026: "no time this year, call next year"): the day (a year from today to
 * begin with) and why. It comes back onto its project's call list that day
 * as Lead-Not Shopping, with a reminder; the appointment stays invalid, and
 * counted so, its pay charged back.
 */
export default function CallBackLater({ leadId, company, today }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(() => addYears(today, 1));
  const [note, setNote] = useState("");
  const [saving, start] = useTransition();

  const save = () => start(async () => {
    const r = await reach(() => callBackLater({ leadId, on, note }));
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Back on the call list ${formatIso(on)}`, { description: "Marked Lead-Not Shopping, with a reminder that morning." });
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setOn(addYears(today, 1)); setNote(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" data-call-back-later><CalendarClock /> Call back later</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-call-back-dialog>
        <DialogHeader>
          <DialogTitle>Call back later</DialogTitle>
          <DialogDescription>
            {company}: back on its project&apos;s call list on the day you choose, as Lead-Not Shopping, with a reminder that morning.
            The appointment stays invalid in this year&apos;s figures; one set then counts as new.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <Field label="Call back on">
            <DatePicker name="on" value={on} onChange={setOn} min={addDays(today, 1)} max={addDays(today, 731)} presets={["nextMonth", "nextYear"]} future required aria-label="Call back on" />
          </Field>
          <Field label="Why (optional)">
            <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No time this year, call in the new year" data-call-back-note />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={saving || !on} data-call-back-save>{saving ? <Loader2 className="animate-spin" /> : <CalendarClock />} Put back on the list</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
