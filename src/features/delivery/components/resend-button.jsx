"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendDelivery } from "@/features/delivery/actions";

/** "Send to client again": the lead's sheet to its project's delivery addresses, now. */
export default function ResendButton({ leadId }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const f = new FormData();
      f.set("lead_id", String(leadId));
      const r = await resendDelivery(f);
      if (!r.ok) toast.error(r.error);
      else if (r.data.failed) toast.error(`Sent to ${r.data.sent} of ${r.data.addresses}; see why below.`);
      else toast.success(`Sent to the client (${r.data.sent} ${r.data.sent === 1 ? "address" : "addresses"})`);
      router.refresh();
    });
  return (
    <Button size="sm" variant="outline" onClick={send} disabled={pending} data-resend-delivery>
      <Send /> {pending ? "Sending…" : "Send to client again"}
    </Button>
  );
}
