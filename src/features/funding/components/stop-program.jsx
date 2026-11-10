"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CirclePause, CirclePlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { reach } from "@/lib/reach";
import { stopProgram } from "@/features/funding/actions";

/**
 * The client stopped their program (client, Nov 2026): every payment not yet paid removed at
 * once, and nothing more billed. Stopped, Start billing again undoes the billing (the payments
 * removed stay so, each put back by hand).
 *   projectId; stopped  whether it is stopped now; unpaid  how many would be removed
 */
export default function StopProgram({ projectId, stopped, unpaid }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const run = (stop) => start(async () => {
    const r = await reach(() => stopProgram(projectId, stop));
    setAsking(false);
    if (r.ok) {
      toast.success(stop ? `Program stopped${r.data.removed ? `: ${r.data.removed} payment${r.data.removed === 1 ? "" : "s"} removed` : ""}` : "Billing started again");
      router.refresh();
    } else toast.error(r.error);
  });
  if (stopped) {
    return (
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(false)} data-program-restart>
        <CirclePlay /> Start billing again
      </Button>
    );
  }
  return (
    <>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(true)} className="text-muted-foreground hover:text-destructive" data-program-stop>
        <CirclePause /> Stop program
      </Button>
      <ConfirmDialog open={asking} onOpenChange={setAsking} pending={pending} confirm="Stop program" icon={<CirclePause />}
        title="The client stopped their program?"
        description={`${unpaid ? `The ${unpaid} payment${unpaid === 1 ? "" : "s"} not yet paid will be removed, out of what's still owed and the reminders (each can be put back), and nothing` : "Nothing"} more is billed. Paid ones stay as they are.`}
        onConfirm={() => run(true)} />
    </>
  );
}
