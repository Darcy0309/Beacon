"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/lib/actions";
import { announceNotificationsChanged } from "@/lib/active-chat";

/** Opening a notification reads it. Renders nothing. */
export default function MarkThreadRead({ id }) {
  useEffect(() => {
    const f = new FormData();
    f.set("id", String(id));
    markThreadRead(f).then(announceNotificationsChanged);
  }, [id]);
  return null;
}
