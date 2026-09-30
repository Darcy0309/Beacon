"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/features/notifications/actions";
import { announceNotificationsChanged } from "@/features/notifications/active-chat";

/** Opening a notification reads it. Renders nothing. */
export default function MarkThreadRead({ id }) {
  useEffect(() => {
    const f = new FormData();
    f.set("id", String(id));
    markThreadRead(f).then(announceNotificationsChanged);
  }, [id]);
  return null;
}
