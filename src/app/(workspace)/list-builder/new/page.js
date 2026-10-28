import Topbar from "@/components/layout/topbar";
import ListBuilderForm from "@/features/list-builder/components/list-builder-form";
import { getSicRows, targetedBefore } from "@/features/list-builder/queries";
import { getClientNames } from "@/features/clients/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** A new list request: staff for any client (?client= to begin with one), a client for themselves. */
export default async function NewListRequest({ searchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const client = me?.role === "client";
  const companyId = client ? me?.company_id ?? null : /^[1-9]\d{0,17}$/.test(sp?.client ?? "") ? Number(sp.client) : null;
  const [rows, clients, before] = await Promise.all([getSicRows(), client ? [] : getClientNames(), targetedBefore(companyId)]);
  return (
    <>
      <Topbar title="New list request" sub="Industries, employee size and territory to target" />
      <div className="flex-1 p-4 sm:p-6">
        <ListBuilderForm mode={client ? "client" : "staff"} rows={rows} before={before}
          initial={companyId && !client ? { companyId } : null}
          clients={clients.map((c) => ({ value: String(c.id), label: c.name }))} />
      </div>
    </>
  );
}
