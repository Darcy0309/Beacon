import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { accountManagers } from "@/lib/data";

export default function AccountManagersPage() {
  return (
    <>
      <Topbar title="Account Managers" sub="Team performance and book of business" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {accountManagers.map((m) => (
            <Card key={m.name}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: m.color }}>{m.initials}</span>
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.region} region</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
                  <div><div className="text-lg font-semibold tabular-nums">{m.clients}</div><div className="text-xs text-muted-foreground">Clients</div></div>
                  <div><div className="text-lg font-semibold tabular-nums">{m.appts}</div><div className="text-xs text-muted-foreground">Appts/mo</div></div>
                  <div><div className="text-lg font-semibold tabular-nums">{m.leads}</div><div className="text-xs text-muted-foreground">Leads</div></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
