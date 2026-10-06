"use client";

import { Monitor } from "lucide-react";
import { toast } from "sonner";
import { testDesktop, useDesktopNotifications } from "@/features/notifications/desktop";
import { cn } from "@/lib/utils";

const SAYS = {
  ask: "Get a desktop pop-up for new notifications while Lighthouse is in the background.",
  on: "Desktop notifications are on.",
  off: "Desktop notifications are off.",
  blocked: "Your browser is blocking desktop notifications. To allow them, click the icon left of the address bar, then Notifications → Allow.",
};

const link = "cursor-pointer text-[0.66rem] font-bold uppercase tracking-[0.1em] text-primary transition-opacity hover:opacity-75";

/**
 * Turn desktop notifications on or off for this browser, with a test.
 * Nothing at all in a browser that cannot show them.
 */
export default function DesktopSwitch({ className }) {
  const { status, turnOn, turnOff } = useDesktopNotifications();
  if (status === "unsupported") return null;

  const on = async () => {
    await turnOn();
    if (window.Notification.permission === "granted") testDesktop();
    else if (window.Notification.permission === "denied") toast.error("Your browser blocked desktop notifications.");
  };

  return (
    <div data-desktop-switch={status} className={cn("flex items-start gap-2.5 text-xs text-muted-foreground", className)}>
      <Monitor className={cn("mt-0.5 size-3.5 shrink-0", status === "on" && "text-primary")} aria-hidden />
      <span className="min-w-0 flex-1">{SAYS[status]}</span>
      {status === "ask" || status === "off" ? (
        <button type="button" onClick={on} className={link}>Turn on</button>
      ) : status === "on" ? (
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={() => testDesktop()} className={link}>Test</button>
          <button type="button" onClick={turnOff} className={link}>Turn off</button>
        </span>
      ) : null}
    </div>
  );
}
