import Link from "next/link";
import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { getCompanies } from "@/lib/queries";
import { colorFor, initials, cityState, shortName } from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await getCompanies();
  const active = clients.filter((c) => c.status === "active").length;

  return (
    <>
      <Topbar title="Clients" sub={`${active} active agency accounts`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Active client accounts</h2>
          <p className="text-sm text-muted-foreground">
            {clients.length} agenc{clients.length === 1 ? "y" : "ies"} · lead delivery and appointment setting
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="block">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                      style={{ background: colorFor(c.name) }}
                    >
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{cityState(c)}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{c.leadCount}</div>
                      <div className="text-xs text-muted-foreground">Active leads</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{c.apptCount}</div>
                      <div className="text-xs text-muted-foreground">Appointments</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-semibold">{shortName(c.manager)}</div>
                      <div className="text-xs text-muted-foreground">Manager</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {clients.length === 0 && (
            <p className="text-sm text-muted-foreground">No client accounts yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
