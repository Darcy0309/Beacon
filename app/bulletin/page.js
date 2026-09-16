import { Megaphone } from "lucide-react";
import Topbar from "@/components/topbar";
import BulletinComposer from "@/components/bulletin-composer";
import SectionHeader from "@/components/section-header";
import { Card } from "@/components/ui/card";
import { getBulletin } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  const bulletin = await getBulletin();

  return (
    <>
      <Topbar title="Bulletin Board" sub={`${bulletin.length} active announcements`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <BulletinComposer />

        <Card>
          <SectionHeader label="Announcements" icon={Megaphone} />
          <div className="divide-y divide-[var(--panel-border)]">
            {bulletin.map((b) => (
              <div key={b.id} data-list-row className="flex gap-3 px-5 py-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: b.color }}>
                  {b.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold">{b.author}</span>
                    <span className="text-[0.66rem] font-semibold tracking-[0.1em] text-muted-foreground">{b.time}</span>
                    {b.project ? (
                      <span className="rounded-full border border-primary/40 bg-primary/8 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-primary">
                        {b.project}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                </div>
              </div>
            ))}
            {bulletin.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">No announcements yet — post the first one above.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
