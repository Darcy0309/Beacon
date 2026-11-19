"use client";

import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import DatePicker from "@/components/shared/date-picker";
import ToneBadge from "@/components/shared/tone-badge";
import { annualEnd, currentTerm, dollars, termSummary } from "@/lib/signature-select";
import { mediumDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS = { on: ["emerald", "Current"], ended: ["slate", "Ended"], upcoming: ["sky", "Upcoming"] };
const dayAfter = (iso) => {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

/**
 * Signature Select on the client form (Sean, Nov 2026): the fee for Lighthouse, exclusivity and appointment
 * confirmations, one for all the client's projects, monthly or yearly. Its terms so far (months and what each
 * has charged), and the term on now to change, or a new one (a renewal, a new rate). Annual: a start and an
 * end; monthly: runs from its start until an end is put in (when they stop). Their access to Lighthouse stops
 * once the last term has ended. Saved with the client (saveCompany), as select_*.
 */
export default function SelectFields({ terms = [], today, open, fe, invalid }) {
  const now = currentTerm(terms, today);
  const has = terms.length > 0;
  const blank = { plan: "", amount: "", start: today, end: "" };
  const fromTerm = (t) => (t ? { plan: t.plan, amount: String(t.amount), start: t.starts_on, end: t.ends_on ?? "" } : blank);
  const [mode, setMode] = useState(has ? "edit" : "new");
  const [f, setF] = useState(() => fromTerm(now));
  useEffect(() => {
    if (!open) return;
    setMode(has ? "edit" : "new");
    setF(fromTerm(now));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const newTerm = () => {
    setMode("new");
    // A renewal starts the day after the term on now ends; a new monthly rate today.
    const start = now?.plan === "annual" && now.ends_on ? dayAfter(now.ends_on) : today;
    setF({ plan: now?.plan ?? "", amount: now ? String(now.amount) : "", start, end: now?.plan === "annual" ? annualEnd(start) : "" });
  };
  const set = (k, v) => setF((x) => {
    const next = { ...x, [k]: v };
    // An annual term's end follows its start, a year on, until it is set by hand.
    if ((k === "start" || k === "plan") && next.plan === "annual" && next.start && (!x.end || x.end === annualEnd(x.start || today))) next.end = annualEnd(next.start);
    if (k === "plan" && v === "monthly" && x.plan === "annual" && x.end === annualEnd(x.start)) next.end = "";
    return next;
  });
  const annual = f.plan === "annual";

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2" data-select-form>
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold"><Crown className="size-3.5 text-primary" aria-hidden /> Signature Select</legend>
      <p className="text-xs text-muted-foreground">
        One fee for all their projects. Their access to Lighthouse stops after the last term ends unless it&apos;s renewed; the Sales Rep is told two weeks before.
      </p>
      <input type="hidden" name="select_mode" value={has || f.plan ? mode : ""} />
      <input type="hidden" name="select_term_id" value={mode === "edit" && now ? now.id : ""} />

      {has ? (
        <ul className="space-y-1.5 text-xs" data-select-terms>
          {terms.map((t) => {
            const sum = termSummary(t, today);
            const [tone, label] = STATUS[sum.status];
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-muted/40 px-2.5 py-1.5" data-select-term={t.id}>
                <span className="font-semibold">{t.plan === "annual" ? "Annual" : "Monthly"}</span>
                <span>{dollars(t.amount)} a {t.plan === "annual" ? "year" : "month"}</span>
                <span className="text-muted-foreground">{mediumDate(t.starts_on)} – {t.ends_on ? mediumDate(t.ends_on) : "ongoing"}</span>
                <span className="text-muted-foreground" data-select-charged>
                  {t.plan === "monthly" ? `${sum.months} month${sum.months === 1 ? "" : "s"} · ${dollars(sum.charged)} so far` : sum.charged ? `${dollars(sum.charged)}` : "not yet started"}
                </span>
                <ToneBadge tone={tone} className="ml-auto">{label}</ToneBadge>
              </li>
            );
          })}
        </ul>
      ) : null}

      {has ? (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Signature Select change">
          {[["edit", "Change the current term", () => { setMode("edit"); setF(fromTerm(now)); }], ["new", "New term (renewal or new rate)", newTerm]].map(([key, label, pick]) => (
            <button key={key} type="button" role="radio" aria-checked={mode === key} data-select-mode={key} onClick={pick}
              className={cn("rounded-md border px-3 py-1.5 text-xs", mode === key ? "border-primary bg-primary/15 font-medium text-primary" : "border-[var(--panel-border)] text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Plan" error={fe("select_plan")}>
          <Select name="select_plan" value={f.plan} onChange={(e) => set("plan", e.target.value)} aria-invalid={invalid("select_plan")} data-select-plan>
            {has ? null : <option value="">Not on Signature Select</option>}
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </Select>
        </Field>
        {f.plan ? (
          <>
            <Field label={annual ? "Amount a year ($)" : "Amount a month ($)"} required error={fe("select_amount")}>
              <Input name="select_amount" type="number" inputMode="decimal" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)}
                aria-invalid={invalid("select_amount")} data-select-amount />
            </Field>
            <Field label="Starts" required error={fe("select_starts")}>
              <DatePicker name="select_starts" value={f.start} onChange={(v) => set("start", v ?? "")} invalid={invalid("select_starts")} aria-label="Signature Select starts" />
            </Field>
            <Field label={annual ? "Ends" : "Ends (when they stop)"} required={annual} error={fe("select_ends")}
              hint={annual ? "Access stops after this day unless renewed" : "Leave empty while they keep paying; put in the last day when they stop"}>
              <DatePicker name="select_ends" value={f.end} onChange={(v) => set("end", v ?? "")} invalid={invalid("select_ends")} aria-label="Signature Select ends"
                min={f.start || undefined} presets={annual ? [] : ["today"]} />
            </Field>
            {!annual && f.start ? (
              <p className="text-xs text-muted-foreground sm:col-span-2">Charged on the {Number(f.start.slice(8, 10))}{["th", "st", "nd", "rd"][Number(f.start.slice(8, 10)) % 10 > 3 || [11, 12, 13].includes(Number(f.start.slice(8, 10))) ? 0 : Number(f.start.slice(8, 10)) % 10]} of each month, from {mediumDate(f.start)}{f.end ? ` to ${mediumDate(f.end)}` : ""}.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </fieldset>
  );
}
