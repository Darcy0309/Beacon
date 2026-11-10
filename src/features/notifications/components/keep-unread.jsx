"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigationRouter } from "@/components/layout/navigation-progress";
import { markNotificationUnread } from "@/features/notifications/actions";
import { announceNotificationsChanged } from "@/features/notifications/active-chat";
import { reach } from "@/lib/reach";

/** Opened, but kept for later (client, Nov 2026): back to the inbox with it unread again. */
export default function KeepUnread({ id }) {
  const router = useNavigationRouter();
  const [pending, start] = useTransition();
  const keep = () => start(async () => {
    const f = new FormData();
    f.set("id", String(id));
    const r = await reach(() => markNotificationUnread(f));
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    announceNotificationsChanged();
    toast.success("Kept as unread");
    router.push("/notifications");
  });
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={keep} data-keep-unread>
      <MailOpen /> Mark unread
    </Button>
  );
}
