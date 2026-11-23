"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendApptReminder } from "@/features/texts/actions";
import { formatDial } from "@/lib/phone";
import { reach } from "@/lib/reach";

const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * An appointment's reminder text (Sean, Nov 2026): the latest sent (at its time, or by whom by hand) and, for one
 * still to come, Send reminder: the same text, now, as well as at its scheduled time.
 */
export default function ReminderButton({ appointmentId, reminder, upcoming }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const send = () => start(async () => {
    const fd = new FormData();
    fd.set("appointment_id", String(appointmentId));
    const result = await reach(() => sendApptReminder(fd));
    if (!result.ok) return void toast.error(result.error);
    toast.success(`Reminder text sent to ${formatDial(result.data?.to) ?? "their mobile"}`);
    router.refresh();
  });
  return (
    <div className="flex flex-col items-start gap-1" data-appt-reminder={appointmentId}>
      {reminder ? (
        <span className="text-xs text-muted-foreground" data-reminder-last>
          {reminder.status === "failed" ? "Not sent" : "Sent"} {when(reminder.at)}{reminder.by ? ` by ${reminder.by}` : " (scheduled)"}
        </span>
      ) : upcoming ? <span className="text-xs text-muted-foreground">Not sent yet</span> : <span className="text-xs text-muted-foreground">—</span>}
      {upcoming ? (
        <Button type="button" size="sm" variant="outline" onClick={send} disabled={pending} data-send-reminder={appointmentId}>
          {pending ? <Loader2 className="animate-spin" /> : <MessageSquare />} {reminder ? "Send again" : "Send reminder"}
        </Button>
      ) : null}
    </div>
  );
}
