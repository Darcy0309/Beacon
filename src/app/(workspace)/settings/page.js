import Link from "@/components/shared/intent-link";
import { ChevronRight } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import SettingsIcon from "@/features/settings/components/settings-icon";
import SettingsArt from "@/features/settings/components/settings-art";
import { SETTINGS_AREAS } from "@/features/settings/areas";

export const dynamic = "force-dynamic";

/**
 * Settings, by area (client, Nov 2026: "categorize them by area … view these categories and click on them to access
 * more detailed settings"): a tile for each, naming what it holds (more of it when pointed at); each opens its own page (/settings/<area>).
 */
export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" sub="Choose an area to change its settings" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-settings-areas>
          {SETTINGS_AREAS.map((a) => (
            <Link key={a.key} href={`/settings/${a.key}`} data-settings-area={a.key}
              className="rounded-xl outline-none">
              <Card className="flex h-full flex-col gap-4 p-5">
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary" data-area-icon>
                  <SettingsIcon name={a.icon} className="size-5" />
                </span>
                <div className="space-y-1" data-area-title>
                  <h2 className="text-base font-semibold tracking-tight transition-colors">{a.title}</h2>
                  <p className="text-sm text-muted-foreground">{a.summary}</p>
                </div>
                <ul className="mt-auto flex flex-wrap gap-1.5" data-area-items>
                  {a.items.map((i) => (
                    <li key={i} className="rounded-full border border-[var(--panel-border)] px-2 py-0.5 text-[0.7rem] text-muted-foreground">{i}</li>
                  ))}
                </ul>
                {/* Pointed at (client, Nov 2026): a picture of what the area is about takes the left… */}
                <div className="settings-art" data-area-art>
                  <SettingsArt name={a.icon} className="size-full" />
                </div>
                {/* …and more of what it holds slides in from the right edge on a contrasting ground. */}
                <div className="settings-reveal" data-area-reveal aria-hidden>
                  <div className="settings-reveal-body">
                    <p className="text-[0.66rem] font-bold uppercase tracking-[0.14em] opacity-80">{a.title}</p>
                    <p className="text-sm leading-snug">{a.details}</p>
                    <p className="flex items-center gap-1 text-xs font-semibold">Open <ChevronRight className="size-3.5" aria-hidden /></p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
