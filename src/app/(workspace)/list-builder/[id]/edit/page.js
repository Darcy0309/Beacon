import { notFound, redirect } from "next/navigation";
import Topbar from "@/components/layout/topbar";
import ListBuilderForm from "@/features/list-builder/components/list-builder-form";
import { getRequest, getSicRows, targetedBefore } from "@/features/list-builder/queries";
import { getClientNames } from "@/features/clients/queries";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Change a list request: staff any time, a client while it is still new. */
export default async function EditListRequest({ params }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) notFound();
  const [me, request] = await Promise.all([getCurrentUser(), getRequest(Number(id))]);
  if (!request) notFound();
  const client = me?.role === "client";
  if (client && request.status !== "new") redirect(`/list-builder/${request.id}`);
  const [rows, clients, before] = await Promise.all([getSicRows(), client ? [] : getClientNames(), targetedBefore(request.companyId, request.id)]);
  return (
    <>
      <Topbar title="Change the request" sub={request.title || request.client || "List request"} />
      <div className="flex-1 p-4 sm:p-6">
        <ListBuilderForm mode={client ? "client" : "staff"} rows={rows} before={before} initial={request}
          clients={clients.map((c) => ({ value: String(c.id), label: c.name }))} />
      </div>
    </>
  );
}
