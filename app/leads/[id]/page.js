import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Send, RefreshCw } from "lucide-react";
import Topbar from "@/components/topbar";
import StatusBadge from "@/components/status-badge";
import ToastButton from "@/components/toast-button";
import PrintButton from "@/components/print-button";
import { Card, CardContent } from "@/components/ui/card";
import { leads } from "@/lib/data";

export function generateStaticParams() {
  return leads.map((l) => ({ id: String(l.id) }));
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export default async function LeadSheet({ params }) {
  const { id } = await params;
  const lead = leads.find((l) => String(l.id) === id);
  if (!lead) notFound();

  return (
    <>
      <Topbar title="Lead Sheet" sub={lead.co} />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to leads
        </Link>

        <Card className="mx-auto max-w-2xl">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: lead.color }}>{lead.initials}</span>
                <div>
                  <h2 className="text-lg font-semibold">{lead.co}</h2>
                  <p className="text-sm text-muted-foreground">{lead.city}</p>
                </div>
              </div>
              <StatusBadge status={lead.status} />
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3">
              <Field label="Contact">{lead.contact}</Field>
              <Field label="Phone"><span className="tabular-nums">{lead.phone}</span></Field>
              <Field label="Location">{lead.city}</Field>
              <Field label="X-Date"><span className="tabular-nums">{lead.xdate}</span></Field>
              <Field label="Assigned rep"><span className={lead.rep === "Unassigned" ? "text-muted-foreground" : ""}>{lead.rep}</span></Field>
              <Field label="Lead ID"><span className="tabular-nums">#{lead.id}</span></Field>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide">Summary</div>
              Qualified during outbound contact. The current policy renews on the X-Date shown above; the prospect requested a quote comparison and agreed to the appointment. This sheet is delivered to the client on qualification.
            </div>

            <div className="mt-6 flex flex-wrap gap-2 border-t pt-5">
              <ToastButton size="sm" message={`Lead sheet sent to the client for ${lead.co}`}><Send /> Send to client</ToastButton>
              <ToastButton size="sm" variant="outline" type="message" message={`Reprocessing lead #${lead.id}`}><RefreshCw /> Reprocess</ToastButton>
              <PrintButton />
            </div>
          </CardContent>
        </Card>

        <p className="mx-auto max-w-2xl text-center text-xs text-muted-foreground">
          Delivered to the client by email when the lead qualifies · FR-LEAD-06 &amp; FR-ALERT-04.
        </p>
      </div>
    </>
  );
}
