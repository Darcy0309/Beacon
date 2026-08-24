import Link from "next/link";
import Topbar from "@/components/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { clients, clientSlug } from "@/lib/data";

export default function ClientsPage() {
  return (
    <>
      <Topbar title="Clients" sub="17 active agency accounts" />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">Active client accounts</h2>
          <p className="text-sm text-muted-foreground">17 agencies · lead delivery and appointment setting</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <Link key={c.name} href={`/clients/${clientSlug(c.name)}`} className="block">
              <Card>
                <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: c.color }}>{c.initials}</span>
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.city}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-4">
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{c.leads}</div>
                    <div className="text-xs text-muted-foreground">Active leads</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold tabular-nums">{c.appts}</div>
                    <div className="text-xs text-muted-foreground">Appts / mo</div>
                  </div>
                  <div>
                    <div className="truncate text-lg font-semibold">{c.manager}</div>
                    <div className="text-xs text-muted-foreground">Manager</div>
                  </div>
                </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
