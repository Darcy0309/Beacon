import Link from "@/components/shared/intent-link";
import { ChevronRight } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import SettingsIcon from "@/features/settings/components/settings-icon";
import { SETTINGS_AREAS } from "@/features/settings/areas";

export const dynamic = "force-dynamic";

/**
 * Settings, by area (client, Nov 2026: "categorize them by area … view these categories and click on them to access
 * more detailed settings"): a tile for each, naming what it holds; each opens its own page (/settings/<area>).
 */
export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" sub="Choose an area to change its settings" />
      <div className="flex-1 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-settings-areas>
          {SETTINGS_AREAS.map((a) => (
            <Link key={a.key} href={`/settings/${a.key}`} data-settings-area={a.key}
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="flex h-full flex-col gap-4 p-5 transition-colors group-hover:border-primary/50 group-hover:bg-primary/[0.04]">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <SettingsIcon name={a.icon} className="size-5" />
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold tracking-tight">{a.title}</h2>
                  <p className="text-sm text-muted-foreground">{a.summary}</p>
                </div>
                <ul className="mt-auto flex flex-wrap gap-1.5">
                  {a.items.map((i) => (
                    <li key={i} className="rounded-full border border-[var(--panel-border)] px-2 py-0.5 text-[0.7rem] text-muted-foreground">{i}</li>
                  ))}
                </ul>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
