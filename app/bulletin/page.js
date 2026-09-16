import Topbar from "@/components/topbar";
import BulletinComposer from "@/components/bulletin-composer";
import ToneBadge from "@/components/tone-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getBulletin, getLookups } from "@/lib/queries";
import { colorFor, initials, fullName, timeAgo } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function BulletinPage() {
  const [posts, options] = await Promise.all([getBulletin(), getLookups()]);
  const active = posts.filter((p) => p.status === "active");
  const archived = posts.filter((p) => p.status !== "active");

  return (
    <>
      <Topbar title="Bulletin Board" sub={`${active.length} active announcements`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <BulletinComposer projects={options.projects} />

        <div className="space-y-3">
          {active.map((b) => {
            const author = fullName(b.user);
            return (
              <Card key={b.id}>
                <CardContent className="flex gap-3 p-5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ background: colorFor(author) }}
                  >
                    {initials(author)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{author}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(b.created_at)}</span>
                      {b.message_type === "AL" ? (
                        <ToneBadge tone="amber">Alert</ToneBadge>
                      ) : null}
                      {b.project ? (
                        <span className="text-xs text-muted-foreground">· {b.project.name}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{b.message}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {active.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No announcements yet — post the first one above.
              </CardContent>
            </Card>
          )}

          {archived.length > 0 && (
            <>
              <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Archived
              </div>
              {archived.map((b) => (
                <Card key={b.id} className="opacity-60">
                  <CardContent className="flex gap-3 p-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {initials(fullName(b.user))}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold">{fullName(b.user)}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(b.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{b.message}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
