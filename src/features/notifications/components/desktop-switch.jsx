"use client";

import { Monitor, Volume2, VolumeX } from "lucide-react";
import { useNotificationSound } from "@/features/notifications/sound";
import { toast } from "sonner";
import { testDesktop, useDesktopNotifications } from "@/features/notifications/desktop";
import { cn } from "@/lib/utils";

const SAYS = {
  ask: "Get a desktop pop-up for new notifications, even when Lighthouse is in the background or closed.",
  off: "Desktop notifications are off.",
  blocked: "Your browser is blocking desktop notifications. To allow them, click the icon left of the address bar, then Notifications → Allow.",
};

const link = "cursor-pointer text-[0.66rem] font-bold uppercase tracking-[0.1em] text-primary transition-opacity hover:opacity-75";

/**
 * Turn desktop notifications on or off for this browser, with a test.
 * Nothing at all in a browser that cannot show them.
 */
export default function DesktopSwitch({ className }) {
  const { status, pushing, turnOn, turnOff } = useDesktopNotifications();
  const sound = useNotificationSound();
  const soundRow = (
    <div data-sound-switch={sound.on ? "on" : "off"} className="flex items-start gap-2.5 text-xs text-muted-foreground">
      {sound.on ? <Volume2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> : <VolumeX className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1">{sound.on ? "A sound plays for new notifications." : "No sound for new notifications."}</span>
      <button type="button" onClick={() => sound.set(!sound.on)} className={link}>{sound.on ? "Turn off" : "Turn on"}</button>
    </div>
  );
  if (status === "unsupported") return <div className={className}>{soundRow}</div>;
  const says = status === "on"
    ? pushing ? "Desktop notifications are on, even when Lighthouse is closed." : "Desktop notifications are on while Lighthouse is open."
    : SAYS[status];

  const on = async () => {
    await turnOn();
    if (window.Notification.permission === "granted") testDesktop();
    else if (window.Notification.permission === "denied") toast.error("Your browser blocked desktop notifications.");
  };

  return (
    <div className={cn("space-y-2", className)}>
    <div data-desktop-switch={status} data-push={pushing ? "on" : "off"} className="flex items-start gap-2.5 text-xs text-muted-foreground">
      <Monitor className={cn("mt-0.5 size-3.5 shrink-0", status === "on" && "text-primary")} aria-hidden />
      <span className="min-w-0 flex-1">{says}</span>
      {status === "ask" || status === "off" ? (
        <button type="button" onClick={on} className={link}>Turn on</button>
      ) : status === "on" ? (
        <span className="flex shrink-0 gap-3">
          <button type="button" onClick={() => testDesktop()} className={link}>Test</button>
          <button type="button" onClick={turnOff} className={link}>Turn off</button>
        </span>
      ) : null}
    </div>
    {soundRow}
    </div>
  );
}
