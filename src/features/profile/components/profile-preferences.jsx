"use client";

import { useState } from "react";
import { Monitor, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppearanceDialog from "@/components/layout/appearance-dialog";
import DesktopSwitch from "@/features/notifications/components/desktop-switch";
import { useOwnTimeZone } from "@/components/shared/own-time-zone";

/**
 * My Profile's preferences (Nov 2026): the look of Lighthouse (theme, wallpaper, brightness), desktop notifications,
 * and the time zone times are shown in. All of this computer's own: each person sets them where they work.
 */
export default function ProfilePreferences() {
  const [appearance, setAppearance] = useState(false);
  const { tz, short } = useOwnTimeZone();
  const row = "flex flex-wrap items-center justify-between gap-3 px-5 py-3.5";
  return (
    <div className="divide-y divide-[var(--panel-border)]" data-profile-preferences>
      <div className={row}>
        <div className="min-w-0">
          <p className="text-sm font-medium">Appearance</p>
          <p className="text-xs text-muted-foreground">Light or dark, a wallpaper behind your workspace, and how bright it is.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAppearance(true)} data-open-appearance><Palette /> Change</Button>
      </div>
      <div className="space-y-2.5 px-5 py-3.5" data-profile-desktop>
        <div>
          <p className="text-sm font-medium">Desktop notifications</p>
          <p className="text-xs text-muted-foreground">Call-back reminders and new notifications pop up even when you&apos;re in another window.</p>
        </div>
        <DesktopSwitch />
      </div>
      <div className={row}>
        <div className="min-w-0">
          <p className="text-sm font-medium">Your time zone</p>
          <p className="text-xs text-muted-foreground">Reminders and times you set are on this clock: your computer&apos;s.</p>
        </div>
        <span className="flex items-center gap-1.5 text-sm tabular-nums" data-profile-tz><Monitor className="size-4 text-muted-foreground" aria-hidden />{tz ? `${tz.replace(/_/g, " ")}${short ? ` (${short})` : ""}` : "—"}</span>
      </div>
      <p className="px-5 py-2.5 text-xs text-muted-foreground">These are kept on this computer: set them again on another one.</p>
      <AppearanceDialog open={appearance} onOpenChange={setAppearance} />
    </div>
  );
}
