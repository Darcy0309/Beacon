import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import PaymentActions from "@/features/funding/components/payment-actions";
import { FUNDING_PLANS, fundingSchedule, fundingTotals, readFunding, usd } from "@/lib/funding";
import { formatIso } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** What a payment covers: its leads, appointments and fees. */
export const covers = (p) => [
  p.leads ? `${p.leads.toLocaleString()} lead${p.leads === 1 ? "" : "s"}` : null,
  p.appts ? `${p.appts.toLocaleString()} appointment${p.appts === 1 ? "" : "s"}` : null,
  p.fees ? `fees ${usd(p.fees)}` : null,
].filter(Boolean).join(" · ") || "—";

/**
 * A project's Program Funding (client, Nov 2026; administrators): its plan, the program's
 * total, what has been billed, paid and is still owed, and each payment, with Mark paid and,
 * for a client taking them, Remind client.
 *   funding  getProjectFunding()'s; rates  { lead, appt }; today  "YYYY-MM-DD"
 */
export default function FundingCard({ funding, rates, today }) {
  const { plan, payments, reminders } = funding;
  const f = plan ? readFunding({
    plan: plan.plan, leads: plan.leads, appts: plan.appts, apptsIncluded: plan.appts_included, setupFee: plan.setup_fee,
    listFee: plan.list_fee, payments: plan.payments, firstLeads: plan.first_leads, firstDue: plan.first_due, dueDay: plan.due_day,
  }) : null;
  const program = f && f.plan !== "monthly" ? fundingSchedule(f, rates) : null;
  const t = fundingTotals(payments);
  const planName = f ? FUNDING_PLANS.find(([k]) => k === f.plan)?.[1] : null;

  return (
    <Card data-program-funding>
      <SectionHeader label="Program Funding" icon={Wallet}
        action={planName ? <span className="text-xs font-semibold text-muted-foreground" data-funding-plan-name>{planName}{f.plan === "installments" ? ` · ${f.payments} payments` : ""}</span> : null} />
      {!f ? (
        <p className="p-5 text-sm text-muted-foreground">No funding plan yet. Set how the client pays under Edit, in Program Funding.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-[var(--panel-border)] p-5 sm:grid-cols-4" data-funding-totals>
            {[
              ["Program", program ? usd(program.total) : "Monthly", program ? [f.leads ? `${f.leads.toLocaleString()} leads` : null, f.apptsIncluded && f.appts ? `${f.appts.toLocaleString()} appointments` : null].filter(Boolean).join(" · ") || "fees only" : "billed for what we produce"],
              ["Billed", usd(t.billed), `${payments.length} payment${payments.length === 1 ? "" : "s"}`],
              ["Paid", usd(t.paid), `${payments.filter((p) => p.paidAt).length} paid`],
              ["Still owed", usd(t.owed), reminders ? "client reminders on" : "client reminders off"],
            ].map(([label, value, note]) => (
              <div key={label} data-funding-total={label.toLowerCase().replace(/\s+/g, "-")}>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-bold tabular-nums">{value}</div>
                <div className="truncate text-[0.7rem] text-muted-foreground">{note}</div>
              </div>
            ))}
          </div>
          {payments.length ? <PaymentList payments={payments} reminders={reminders} today={today} /> : (
            <p className="p-5 text-sm text-muted-foreground">
              {f.plan === "monthly" ? "Each month's bill comes on the 1st, for the month before." : "No payments yet: give the first payment's date under Edit."}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/** Payments, one a row: what, when, what it covers, how much, and their buttons. Overdue ones in red. */
export function PaymentList({ payments, reminders, today, extra }) {
  return (
    <div className="divide-y divide-[var(--panel-border)]" data-payment-list>
      {payments.map((p) => {
        const late = !p.paidAt && p.due && p.due < today;
        return (
          <div key={p.id} data-payment={p.id} data-payment-late={late || undefined} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{p.label}{extra ? extra(p) : null}</div>
              <div className="text-xs text-muted-foreground">
                <span className={cn(late && "font-semibold text-rose-500")}>{p.due ? `${late ? "Overdue · was due" : "Due"} ${formatIso(p.due, "medium")}` : "No due date"}</span>
                {" · "}{covers(p)}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-semibold tabular-nums" data-payment-amount>{usd(p.amount)}</span>
              <PaymentActions payment={p} reminders={typeof reminders === "function" ? reminders(p) : reminders} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
