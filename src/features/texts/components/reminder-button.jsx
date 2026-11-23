"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sendApptReminder } from "@/features/texts/actions";
import { formatDial } from "@/lib/phone";
import { reach } from "@/lib/reach";

const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * An appointment's reminder text (Sean, Nov 2026): the latest sent (when, to which number, by whom by hand or at its
 * time) and, for one still to come, Send reminder: the same text, now, as well as at its scheduled time. A lead with
 * several mobiles asks which (Sean: "if we hit the reminder text, can it ask which contact we want to send it to?");
 * `numbers`: the lead's mobiles, [{ digits, label }].
 */
export default function ReminderButton({ appointmentId, reminder, upcoming, numbers = [] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const send = (to) => start(async () => {
    const fd = new FormData();
    fd.set("appointment_id", String(appointmentId));
    if (to) fd.set("to", to);
    const result = await reach(() => sendApptReminder(fd));
    if (!result.ok) return void toast.error(result.error);
    toast.success(`Reminder text sent to ${formatDial(result.data?.to) ?? "their mobile"}`);
    router.refresh();
  });
  const label = reminder ? "Send again" : "Send reminder";
  const icon = pending ? <Loader2 className="animate-spin" /> : <MessageSquare />;

  return (
    <div className="flex flex-col items-start gap-1" data-appt-reminder={appointmentId}>
      {reminder ? (
        <span className="text-xs text-muted-foreground" data-reminder-last>
          {reminder.status === "failed" ? "Not sent" : "Sent"} {when(reminder.at)}
          {reminder.to ? ` to ${formatDial(reminder.to) ?? reminder.to}` : ""}{reminder.by ? ` by ${reminder.by}` : " (scheduled)"}
        </span>
      ) : upcoming ? <span className="text-xs text-muted-foreground">Not sent yet</span> : <span className="text-xs text-muted-foreground">—</span>}
      {!upcoming ? null : !numbers.length ? (
        <span className="text-xs text-amber-600 dark:text-amber-400" data-reminder-no-mobile>No mobile number on the lead to text</span>
      ) : numbers.length === 1 ? (
        <Button type="button" size="sm" variant="outline" onClick={() => send(numbers[0].digits)} disabled={pending} data-send-reminder={appointmentId}
          title={`To ${numbers[0].label}, ${formatDial(numbers[0].digits)}`}>
          {icon} {label}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" disabled={pending} data-send-reminder={appointmentId}>
              {icon} {label} <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Text the reminder to</DropdownMenuLabel>
            {numbers.map((n) => (
              <DropdownMenuItem key={n.digits} onSelect={() => send(n.digits)} data-reminder-to={n.digits}>
                <span className="flex flex-col">
                  <span className="font-medium">{n.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatDial(n.digits)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
