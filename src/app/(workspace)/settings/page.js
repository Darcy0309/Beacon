import Link from "@/components/shared/intent-link";
import { ChevronRight } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import SettingsIcon from "@/features/settings/components/settings-icon";
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
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary" data-area-icon>
                    <SettingsIcon name={a.icon} className="size-5" />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden data-area-arrow />
                </div>
                <h2 className="text-base font-semibold tracking-tight transition-colors" data-area-title>{a.title}</h2>
                <ul className="mt-auto flex flex-wrap gap-1.5">
                  {a.items.map((i) => (
                    <li key={i} className="rounded-full border border-[var(--panel-border)] px-2 py-0.5 text-[0.7rem] text-muted-foreground">{i}</li>
                  ))}
                </ul>
                {/* Pointed at (client, Nov 2026): more of what it holds, sliding in from the right edge on a contrasting ground. */}
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
