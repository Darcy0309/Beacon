import Link from "@/components/shared/intent-link";
import { AlarmClock, CalendarClock, CheckCheck, Wallet } from "lucide-react";
import Topbar from "@/components/layout/topbar";
import SectionHeader from "@/components/shared/section-header";
import { Card } from "@/components/ui/card";
import { PaymentList } from "@/features/funding/components/funding-card";
import { getPaymentsDue } from "@/features/funding/queries";
import { fundingTotals, usd } from "@/lib/funding";
import { getBusinessToday } from "@/lib/server/business-day";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Payments Due (client, Nov 2026: Program Funding): the payments of the clients a Sales Rep
 * looks after (an administrator, every client's): overdue, due in the next 30 days, later, and
 * those paid in the last 60 days. Each marked paid here (QuickBooks keeps the money); a client
 * taking payment reminders can be emailed one. The Sales Rep is told 5 days before each is due.
 */
export default async function PaymentsPage() {
  const [me, today] = await Promise.all([getCurrentUser(), getBusinessToday()]);
  const all = await getPaymentsDue(today);
  const admin = me?.role === "admin";
  const soon = addDays(today, 30);
  const unpaid = all.filter((p) => !p.paidAt);
  const groups = [
    { key: "overdue", label: "Overdue", icon: AlarmClock, rows: unpaid.filter((p) => p.due && p.due < today) },
    { key: "soon", label: "Due in the next 30 days", icon: CalendarClock, rows: unpaid.filter((p) => p.due && p.due >= today && p.due <= soon) },
    { key: "later", label: "Later", icon: Wallet, rows: unpaid.filter((p) => !p.due || p.due > soon) },
    { key: "paid", label: "Paid in the last 60 days", icon: CheckCheck,
      rows: all.filter((p) => p.paidAt).sort((a, b) => b.paidAt.localeCompare(a.paidAt)) },
  ];
  const owed = fundingTotals(unpaid).billed;
  const overdue = fundingTotals(groups[0].rows).billed;
  // Whose payment it is: the client and project (the project's page, for an administrator), and its Sales Rep.
  const extra = (p) => (
    <span className="ml-2 text-xs font-normal text-muted-foreground">
      {p.client} · {admin ? <Link href={`/projects/${p.projectId}`} className="hover:text-primary hover:underline">{p.project}</Link> : p.project}
      {admin && p.salesRep ? ` · ${p.salesRep}` : ""}
    </span>
  );

  return (
    <>
      <Topbar title="Payments Due" sub={`${usd(owed)} still owed${overdue ? ` · ${usd(overdue)} overdue` : ""}${admin ? "" : " · your clients"}`} />
      <div className="flex-1 space-y-4 p-4 sm:p-6" data-payments-page>
        {all.length === 0 ? (
          <Card><p className="p-6 text-sm text-muted-foreground">
            No payments yet. They come from each project&apos;s Program Funding{admin ? ", set under Edit on the project's page" : ""}.
          </p></Card>
        ) : null}
        {groups.filter((g) => g.rows.length).map((g) => (
          <Card key={g.key} data-payments-group={g.key}>
            <SectionHeader label={`${g.label} · ${g.rows.length} · ${usd(fundingTotals(g.rows).billed)}`} icon={g.icon} />
            <PaymentList payments={g.rows} today={today} reminders={(p) => p.reminders} extra={extra} />
          </Card>
        ))}
      </div>
    </>
  );
}
