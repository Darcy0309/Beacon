"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import DatePicker from "@/components/shared/date-picker";
import { FUNDING_BILLING, FUNDING_PLANS, MAX_PAYMENTS, billsMonthly, fundingSchedule, readFunding, usd } from "@/lib/funding";
import { formatIso } from "@/lib/dates";

/**
 * Program Funding on the project form (client, Nov 2026; administrators): how the client pays
 * for the program, with its payments worked out as it is filled in. Saved with the project
 * (saveProject's saveFunding). Leads and appointments bought start from the project's goals, the
 * first block of leads from its leads a month, the first payment from its start.
 *
 *   plan     the project's saved plan (project_funding's row), or null
 *   rates    { lead, appt }: the project's billing rates, as the form has them now
 *   goals    { leads, appts, leadsMonth, start }: the project's, as the form has them now
 */
export default function FundingFields({ plan, rates, goals }) {
  const [f, setF] = useState(() => ({
    plan: plan?.plan ?? "monthly",
    leads: String(plan?.leads || goals.leads || ""),
    appts: String(plan?.appts || goals.appts || ""),
    apptsIncluded: Boolean(plan?.appts_included),
    setupFee: plan?.setup_fee != null && Number(plan.setup_fee) ? String(Number(plan.setup_fee)) : "",
    listFee: plan?.list_fee != null && Number(plan.list_fee) ? String(Number(plan.list_fee)) : "",
    payments: String(plan?.payments ?? 6),
    firstLeads: plan?.first_leads != null ? String(plan.first_leads) : goals.leadsMonth ? String(goals.leadsMonth) : "",
    firstDue: plan?.first_due ?? goals.start ?? "",
    dueDay: plan?.due_day != null ? String(plan.due_day) : "",
    billing: plan?.billing ?? "monthly",
  }));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e ?? "" }));
  const read = readFunding(f);
  const s = fundingSchedule(read, rates);
  const monthly = billsMonthly(read);
  const fixed = f.plan !== "monthly";
  // Something billed for what was produced: once a month, or on the 1st and the 15th (client, Nov 2026).
  const produced = monthly.leads || monthly.appts;
  const twice = produced && read.billing === "semimonthly";

  return (
    <fieldset className="rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2" data-funding-form>
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold"><Wallet className="size-3.5 text-primary" /> Program Funding</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="How the client pays" className="sm:col-span-2">
          <Select name="funding_plan" value={f.plan} onChange={set("plan")} data-funding-plan>
            {FUNDING_PLANS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
        </Field>
        {fixed ? (
          <>
            <Field label="Leads bought" hint={rates.lead ? `${usd(rates.lead)} a lead` : "Set the billing per lead above"}>
              <Input name="funding_leads" type="number" inputMode="numeric" min="0" step="1" value={f.leads} onChange={set("leads")} data-funding-leads />
            </Field>
            <Field label="Appointments bought" hint={rates.appt ? `${usd(rates.appt)} an appointment` : "Set the billing per appointment above"}>
              <Input name="funding_appts" type="number" inputMode="numeric" min="0" step="1" value={f.appts} onChange={set("appts")} data-funding-appts />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="funding_appts_included" value="on" checked={f.apptsIncluded} onChange={set("apptsIncluded")} className="mt-0.5 size-4 accent-[var(--primary)]" data-funding-appts-included />
              <span>Appointments in the {f.plan === "advance" ? "payment" : "installments"}<span className="block text-xs text-muted-foreground">Unticked, they're billed each month for the valid ones the client updates, apart from the leads.</span></span>
            </label>
          </>
        ) : null}
        <Field label="Setup fee ($)">
          <Input name="funding_setup_fee" type="number" inputMode="decimal" min="0" step="0.01" value={f.setupFee} onChange={set("setupFee")} data-funding-setup-fee />
        </Field>
        <Field label="List fee ($)">
          <Input name="funding_list_fee" type="number" inputMode="decimal" min="0" step="0.01" value={f.listFee} onChange={set("listFee")} data-funding-list-fee />
        </Field>
        {f.plan === "installments" ? (
          <>
            <Field label="Payments" hint="The first, then the rest monthly">
              <Input name="funding_payments" type="number" inputMode="numeric" min="2" max={MAX_PAYMENTS} step="1" value={f.payments} onChange={set("payments")} data-funding-payments />
            </Field>
            <Field label="Leads in the first payment" hint="The first block, with the setup and list fees">
              <Input name="funding_first_leads" type="number" inputMode="numeric" min="0" step="1" value={f.firstLeads} onChange={set("firstLeads")} data-funding-first-leads />
            </Field>
          </>
        ) : <input type="hidden" name="funding_payments" value="1" />}
        <Field label={f.plan === "monthly" ? "First bill due" : "First payment due"}>
          <DatePicker name="funding_first_due" value={f.firstDue} onChange={(v) => setF((x) => ({ ...x, firstDue: v ?? "" }))} aria-label="First payment due" />
        </Field>
        {produced ? (
          <Field label={f.plan === "monthly" ? "Billed" : "Appointments billed"} hint={twice ? "On the 15th for the 1st to the 14th, on the 1st for the rest of the month; due the day billed" : "On the 1st, for the month before"}>
            <Select name="funding_billing" value={read.billing} onChange={set("billing")} data-funding-billing>
              {FUNDING_BILLING.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
          </Field>
        ) : null}
        {f.plan === "monthly" && twice ? null : (
          <Field label="Due each month on the" hint="Day 1 to 28; the first payment's day without one">
            <Input name="funding_due_day" type="number" inputMode="numeric" min="1" max="28" step="1" value={f.dueDay} onChange={set("dueDay")} data-funding-due-day />
          </Field>
        )}
      </div>

      {/* What it comes to, as filled in now. */}
      <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-xs" data-funding-preview>
        {fixed ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <span>Total {usd(s.total)}</span>
              {s.leadAmount ? <span className="font-normal text-muted-foreground">Leads {usd(s.leadAmount)}</span> : null}
              {s.apptAmount ? <span className="font-normal text-muted-foreground">Appointments {usd(s.apptAmount)}</span> : null}
              {s.fees ? <span className="font-normal text-muted-foreground">Fees {usd(s.fees)}</span> : null}
            </div>
            {s.payments.length ? (
              <ol className="mt-1.5 space-y-0.5 tabular-nums" data-funding-schedule>
                {s.payments.map((p) => (
                  <li key={p.seq} className="flex justify-between gap-3">
                    <span>{p.label}{p.due ? ` · ${formatIso(p.due, "medium")}` : ""}{p.leads ? ` · ${p.leads.toLocaleString()} leads` : ""}{p.fees ? " + fees" : ""}</span>
                    <span className="font-semibold">{usd(p.amount)}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </>
        ) : (
          <p>{twice
            ? "The leads and valid appointments billed at the rates above on the 1st and the 15th, for the half month before, each due the day billed"
            : `Each month's ${monthly.leads ? "leads and valid appointments" : "valid appointments"} billed at the rates above on the 1st, due on the day set`}{s.fees ? `; the fees, ${usd(s.fees)}, with the first` : ""}.</p>
        )}
        {fixed && monthly.appts && rates.appt ? <p className="mt-1 text-muted-foreground">Appointments billed {twice ? "on the 1st & 15th" : "monthly"}, {usd(rates.appt)} each valid one.</p> : null}
      </div>
    </fieldset>
  );
}
