import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { getAccountManagers } from "@/lib/queries";
import { colorFor, initials, fullName, cityState } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function AccountManagersPage() {
  const managers = await getAccountManagers();

  return (
    <>
      <Topbar title="Account Managers" sub="Team performance and book of business" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {managers.map((m) => {
            const name = fullName(m);
            return (
              <Card key={m.id}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white"
                      style={{ background: colorFor(name) }}
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {cityState(m) !== "—" ? cityState(m) : m.email}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{m.clientCount}</div>
                      <div className="text-xs text-muted-foreground">Clients</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{m.apptCount}</div>
                      <div className="text-xs text-muted-foreground">Appts</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{m.leadCount}</div>
                      <div className="text-xs text-muted-foreground">Leads</div>
                    </div>
                  </div>
                  {m.projects.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="text-xs text-muted-foreground">
                        {m.projects.map((p) => p.name).join(" · ")}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {managers.length === 0 && (
            <p className="text-sm text-muted-foreground">No account managers yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
