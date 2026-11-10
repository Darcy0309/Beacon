import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import SectionHeader from "@/components/shared/section-header";
import PaymentActions from "@/features/funding/components/payment-actions";
import StopProgram from "@/features/funding/components/stop-program";
import { FUNDING_PLANS, billingWords, billsMonthly, fundingSchedule, fundingTotals, readFunding, usd } from "@/lib/funding";
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
 * for a client taking them, Remind client; Remove for one not owed after all, and Stop program
 * when the client stops (its unpaid payments removed, nothing more billed).
 *   funding  getProjectFunding()'s; rates  { lead, appt }; today  "YYYY-MM-DD"; projectId
 */
export default function FundingCard({ funding, rates, today, projectId }) {
  const { plan, payments, reminders } = funding;
  const f = plan ? readFunding({
    plan: plan.plan, leads: plan.leads, appts: plan.appts, apptsIncluded: plan.appts_included, setupFee: plan.setup_fee,
    listFee: plan.list_fee, payments: plan.payments, firstLeads: plan.first_leads, firstDue: plan.first_due, dueDay: plan.due_day,
    billing: plan.billing,
  }) : null;
  const stopped = plan?.stopped_at ?? null;
  const live = payments.filter((p) => !p.removedAt);
  const unpaid = live.filter((p) => !p.paidAt).length;
  const monthly = f ? billsMonthly(f) : null;
  const bills = monthly && (monthly.leads || monthly.appts) ? `billed ${billingWords(f.billing)}` : null;
  const program = f && f.plan !== "monthly" ? fundingSchedule(f, rates) : null;
  const t = fundingTotals(payments);
  const planName = f ? FUNDING_PLANS.find(([k]) => k === f.plan)?.[1] : null;

  return (
    <Card data-program-funding>
      <SectionHeader label="Program Funding" icon={Wallet}
        action={planName ? (
          <span className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground" data-funding-plan-name>
              {planName}{f.plan === "installments" ? ` · ${f.payments} payments` : ""}{bills ? ` · ${bills}` : ""}
            </span>
            {projectId ? <StopProgram projectId={projectId} stopped={Boolean(stopped)} unpaid={unpaid} /> : null}
          </span>
        ) : null} />
      {stopped ? (
        <p className="border-b border-[var(--panel-border)] bg-amber-500/10 px-5 py-2.5 text-sm" data-program-stopped>
          <strong>Program stopped {formatIso(stopped.slice(0, 10), "medium")}.</strong>
          <span className="text-muted-foreground"> Its unpaid payments were removed and nothing more is billed.</span>
        </p>
      ) : null}
      {!f ? (
        <p className="p-5 text-sm text-muted-foreground">No funding plan yet. Set how the client pays under Edit, in Program Funding.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-[var(--panel-border)] p-5 sm:grid-cols-4" data-funding-totals>
            {[
              ["Program", program ? usd(program.total) : "Monthly", program ? [f.leads ? `${f.leads.toLocaleString()} leads` : null, f.apptsIncluded && f.appts ? `${f.appts.toLocaleString()} appointments` : null].filter(Boolean).join(" · ") || "fees only" : "billed for what we produce"],
              ["Billed", usd(t.billed), `${live.length} payment${live.length === 1 ? "" : "s"}${live.length < payments.length ? ` · ${payments.length - live.length} removed` : ""}`],
              ["Paid", usd(t.paid), `${live.filter((p) => p.paidAt).length} paid`],
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
              {f.plan === "monthly"
                ? f.billing === "semimonthly" ? "Bills come on the 1st and the 15th, for the half month before." : "Each month's bill comes on the 1st, for the month before."
                : "No payments yet: give the first payment's date under Edit."}
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
        const late = !p.paidAt && !p.removedAt && p.due && p.due < today;
        return (
          <div key={p.id} data-payment={p.id} data-payment-late={late || undefined} data-payment-removed={p.removedAt ? "" : undefined}
            className={cn("flex flex-wrap items-center justify-between gap-3 px-5 py-3", p.removedAt && "opacity-60")}>
            <div className={cn("min-w-0", p.removedAt && "line-through decoration-muted-foreground/60")}>
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
