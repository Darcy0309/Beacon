"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/features/notifications/actions";
import { announceNotificationsChanged } from "@/features/notifications/active-chat";
import { reach } from "@/lib/reach";

/** Opening a notification reads it. Renders nothing. */
export default function MarkThreadRead({ id }) {
  useEffect(() => {
    const f = new FormData();
    f.set("id", String(id));
    // Quiet when it fails: the notification only stays unread, and the next visit reads it.
    reach(() => markThreadRead(f)).then(announceNotificationsChanged);
  }, [id]);
  return null;
}
