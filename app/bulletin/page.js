import Topbar from "@/components/topbar";
import BulletinComposer from "@/components/bulletin-composer";
import { Card, CardContent } from "@/components/ui/card";
import { getBulletin } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  const bulletin = await getBulletin();
  return (
    <>
      <Topbar title="Bulletin Board" sub="Team announcements" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <BulletinComposer />

        <div className="space-y-3">
          {bulletin.map((b, i) => (
            <Card key={i}>
              <CardContent className="flex gap-3 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: b.color }}>{b.initials}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">{b.author}</span>
                    <span className="text-xs text-muted-foreground">{b.time}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
