"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { saveProject } from "@/features/projects/actions";
import DatePicker from "@/components/shared/date-picker";
import { monthlyFromGoal, projectDays } from "@/lib/project-goals";
import { useDialogOpen } from "@/components/shared/row-edit-context";
import FundingFields from "@/features/funding/components/funding-fields";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

export default function ProjectForm({ project, options, trigger, funding = null, canFund = false }) {
  const isEdit = Boolean(project?.id);
  // Inside a row's action menu the menu owns the open state and there is no trigger.
  const [open, setOpen, inRowMenu, onCloseAutoFocus] = useDialogOpen();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveProject, EMPTY);

  useEffect(() => {
    if (state?.ok) {
      toast.success(isEdit ? "Project updated" : "Project created");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) {
      toast.error(state.error);
    }
  }, [state, isEdit, router, setOpen]);

  const { companies = [], projectTypes = [], projectStatuses = [], projects = [], clientOffices = {}, timezones = [] } = options ?? {};
  const record = project
    ? {
        ...project,
        company_id: project.company?.id ?? "",
        project_type_id: project.type?.id ?? "",
        status_id: project.status?.id ?? "",
        amount_paid: project.amount_paid ?? "",
        start_date: project.start_date ?? "",
        end_date: project.end_date ?? "",
        lead_goal: project.lead_goal ?? "",
        appt_goal: project.appt_goal ?? "",
        lead_goal_month: project.lead_goal_month ?? "",
        appt_goal_month: project.appt_goal_month ?? "",
        projected_conversion: project.projected_conversion ?? "",
        bill_lead_rate: project.bill_lead_rate ?? "",
        bill_appointment_rate: project.bill_appointment_rate ?? "",
      }
    : null;
  const { fe, invalid, dv } = formHelpers(state, record);
  // A DBDev project promotes its leads to one of the same client's Appt projects.
  const [companyId, setCompanyId] = useState(String(dv("company_id") ?? ""));
  const [typeId, setTypeId] = useState(String(dv("project_type_id") ?? ""));
  const isDbdev = projectTypes.find((t) => String(t.id) === typeId)?.code === "DBDV";
  // Changing an existing project's type moves its names to that type's stage.
  const names = Number(Array.isArray(project?.leads) ? project.leads[0]?.count : project?.leads) || 0;
  const retyped = isEdit && typeId && String(record?.project_type_id ?? "") !== typeId;
  const newType = projectTypes.find((t) => String(t.id) === typeId);
  const apptProjects = projects.filter((p) => p.type === "APPT" && String(p.company_id ?? "") === companyId && p.id !== project?.id);

  // The goals (client, Nov 2026): leads and appointments a month filled in from the overall goal over the
  // project's dates (200 leads, 1/1 to 4/30: 50 a month), so the reports can say whether each month is on
  // track. Still theirs to change: one typed by hand is left as typed.
  const GOAL_KEYS = ["start_date", "end_date", "lead_goal", "appt_goal", "lead_goal_month", "appt_goal_month"];
  const [goals, setGoals] = useState(() => Object.fromEntries(GOAL_KEYS.map((k) => [k, String(dv(k) ?? "")])));
  const [typed, setTyped] = useState({ lead: false, appt: false });
  const goalDays = (g) => projectDays({ start: g.start_date || null, end: g.end_date || null, today: g.start_date || "2000-01-01" });
  const GOAL_PAIRS = [["lead", "lead_goal", "lead_goal_month"], ["appt", "appt_goal", "appt_goal_month"]];
  const setGoal = (key, value) => {
    const next = { ...goals, [key]: value };
    for (const [kind, total, month] of GOAL_PAIRS) {
      if (typed[kind] || ![total, "start_date", "end_date"].includes(key)) continue;
      const filled = monthlyFromGoal(next[total], goalDays(next));
      if (filled) next[month] = String(filled.perMonth);
    }
    setGoals(next);
  };
  const typeMonthly = (kind, key, value) => {
    setTyped((t) => ({ ...t, [kind]: true }));
    setGoals((g) => ({ ...g, [key]: value }));
  };
  // "200 over 4 months" under a monthly goal that is the one worked out.
  const filledHint = (total, month) => {
    const f = monthlyFromGoal(goals[total], goalDays(goals));
    return f && String(f.perMonth) === goals[month] ? `${Number(goals[total]).toLocaleString()} over ${f.months} month${f.months === 1 ? "" : "s"}, from the dates` : null;
  };

  // The billing rates, as typed: Program Funding works its payments out from them.
  const [rates, setRates] = useState(() => ({ lead: dv("bill_lead_rate") ?? "", appt: dv("bill_appointment_rate") ?? "" }));

  // The project's office, held here so "use the client's details" can fill it in.
  const OFFICE = ["contact_name", "contact_title", "phone", "address", "city", "state", "zip", "timezone_id"];
  const startOffice = () => Object.fromEntries(OFFICE.map((k) => [k, String(dv(k) ?? "")]));
  const [office, setOffice] = useState(startOffice);
  useEffect(() => {
    if (open) setOffice(startOffice());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const clientOffice = clientOffices[companyId];
  const useClient = () => setOffice(Object.fromEntries(OFFICE.map((k) => [k, String(clientOffice?.[k] ?? "")])));
  const setO = (k) => (e) => setOffice((o) => ({ ...o, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inRowMenu ? null : (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">{isEdit ? <Pencil /> : <Plus />} {isEdit ? "Edit" : "New project"}</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${project.name}` : "New project"}</DialogTitle>
        </DialogHeader>

        <form action={formAction} noValidate className="flex flex-col gap-4">
          {isEdit && <input type="hidden" name="id" value={project.id} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project name" required error={fe("name")} className="sm:col-span-2">
              <Input name="name" defaultValue={dv("name")} maxLength={120} required aria-invalid={invalid("name")} autoFocus />
            </Field>

            <Field label="Client" error={fe("company_id")}>
              <Select name="company_id" defaultValue={dv("company_id")} onChange={(e) => setCompanyId(e.target.value)} aria-invalid={invalid("company_id")}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Type" error={fe("project_type_id")}>
              <Select name="project_type_id" defaultValue={dv("project_type_id")} onChange={(e) => setTypeId(e.target.value)} aria-invalid={invalid("project_type_id")}>
                <option value="">—</option>
                {projectTypes.map((t) => <option key={t.id} value={t.id}>{t.description}</option>)}
              </Select>
            </Field>
            {retyped ? (
              <p role="note" data-retype-warning className="rounded-md border border-amber-400/50 bg-amber-400/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">
                {names ? `This project's ${names.toLocaleString()} name${names === 1 ? "" : "s"}` : "Its names"} move to the {newType?.description?.toLowerCase() ?? "new"} stage
                and are called with its results. A result from the other list starts again at {newType?.code === "APPT" ? "Lead-No Contact" : "Viable-CallBack"}.
              </p>
            ) : null}

            {isDbdev ? (
              <Field
                label="Promotes leads to"
                className="sm:col-span-2"
                error={fe("appt_project_id")}
                hint={apptProjects.length ? "The appointment project a Lead result moves names to" : "This client has no appointment project yet"}
              >
                <Select name="appt_project_id" defaultValue={dv("appt_project_id")} aria-invalid={invalid("appt_project_id")}>
                  <option value="">—</option>
                  {apptProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="appt_project_id" value="" />
            )}

            {/* Where this project's agent and office are: a client with offices in several states runs a project from each. */}
            <fieldset className="rounded-lg border border-[var(--panel-border)] p-3 sm:col-span-2" data-project-office-form>
              <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold"><Building2 className="size-3.5 text-primary" /> Office for this project</legend>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>The agent and office this project calls for. The same as the client&apos;s, or its own.</span>
                <button type="button" onClick={useClient} disabled={!clientOffice} data-use-client-office
                  className="font-semibold text-primary hover:underline disabled:pointer-events-none disabled:opacity-40">
                  Use the client&apos;s details
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Agent / producer name" error={fe("contact_name")}>
                  <Input name="contact_name" value={office.contact_name} onChange={setO("contact_name")} maxLength={80} aria-invalid={invalid("contact_name")} />
                </Field>
                <Field label="Title" error={fe("contact_title")}>
                  <Input name="contact_title" value={office.contact_title} onChange={setO("contact_title")} maxLength={60} aria-invalid={invalid("contact_title")} />
                </Field>
                <Field label="Phone" error={fe("phone")}>
                  <Input name="phone" type="tel" value={office.phone} onChange={setO("phone")} aria-invalid={invalid("phone")} placeholder="(602) 555-0100" />
                </Field>
                <Field label="Time zone" error={fe("timezone_id")}>
                  <Select name="timezone_id" value={office.timezone_id} onChange={setO("timezone_id")} aria-invalid={invalid("timezone_id")}>
                    <option value="">—</option>
                    {timezones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </Select>
                </Field>
                <Field label="Address" error={fe("address")} className="sm:col-span-2">
                  <Input name="address" value={office.address} onChange={setO("address")} maxLength={120} aria-invalid={invalid("address")} />
                </Field>
                <div className="grid grid-cols-[1fr_5rem_7rem] gap-3 sm:col-span-2">
                  <Field label="City" error={fe("city")}>
                    <Input name="city" value={office.city} onChange={setO("city")} maxLength={60} aria-invalid={invalid("city")} />
                  </Field>
                  <Field label="State" error={fe("state")}>
                    <Input name="state" value={office.state} onChange={setO("state")} maxLength={2} placeholder="AZ" aria-invalid={invalid("state")} />
                  </Field>
                  <Field label="ZIP" error={fe("zip")}>
                    <Input name="zip" value={office.zip} onChange={setO("zip")} maxLength={10} aria-invalid={invalid("zip")} />
                  </Field>
                </div>
              </div>
            </fieldset>

            <Field label="Status" error={fe("status_id")}>
              <Select name="status_id" defaultValue={dv("status_id")} aria-invalid={invalid("status_id")}>
                <option value="">—</option>
                {projectStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Contract value" error={fe("amount_paid")} hint="USD">
              <Input name="amount_paid" type="number" inputMode="decimal" step="0.01" min="0" defaultValue={dv("amount_paid")} aria-invalid={invalid("amount_paid")} />
            </Field>

            <Field label="Start date" error={fe("start_date")}>
              <DatePicker name="start_date" value={goals.start_date} onChange={(v) => setGoal("start_date", v ?? "")} invalid={invalid("start_date")} aria-label="Start date" presets={["today"]} />
            </Field>
            <Field label="Due date" error={fe("end_date")}>
              <DatePicker name="end_date" value={goals.end_date} onChange={(v) => setGoal("end_date", v ?? "")} invalid={invalid("end_date")} aria-label="Due date" presets={["nextMonth", "nextYear"]} />
            </Field>
            <Field label="Leads per month" error={fe("lead_goal_month")} hint={filledHint("lead_goal", "lead_goal_month") ?? "The client's goal each month; filled in from the lead goal and the dates"}>
              <Input name="lead_goal_month" type="number" inputMode="numeric" min="0" step="1" value={goals.lead_goal_month} onChange={(e) => typeMonthly("lead", "lead_goal_month", e.target.value)}
                aria-invalid={invalid("lead_goal_month")} data-lead-goal-month />
            </Field>
            <Field label="Appointments per month" error={fe("appt_goal_month")} hint={filledHint("appt_goal", "appt_goal_month") ?? "e.g. 5 a month is 60 a year; filled in from the appointment goal and the dates"}>
              <Input name="appt_goal_month" type="number" inputMode="numeric" min="0" step="1" value={goals.appt_goal_month} onChange={(e) => typeMonthly("appt", "appt_goal_month", e.target.value)}
                aria-invalid={invalid("appt_goal_month")} data-appt-goal-month />
            </Field>
            <Field label="Lead goal (total)" error={fe("lead_goal")} hint="Leave empty: per month × the project's months">
              <Input name="lead_goal" type="number" inputMode="numeric" min="0" step="1" value={goals.lead_goal} onChange={(e) => setGoal("lead_goal", e.target.value)} aria-invalid={invalid("lead_goal")} data-lead-goal />
            </Field>
            <Field label="Appointment goal (total)" error={fe("appt_goal")} hint="Leave empty: per month × the project's months">
              <Input name="appt_goal" type="number" inputMode="numeric" min="0" step="1" value={goals.appt_goal} onChange={(e) => setGoal("appt_goal", e.target.value)} aria-invalid={invalid("appt_goal")} data-appt-goal />
            </Field>

            {/* The Pipeline by Month's projected appointments (Sean, Nov 2026): this share of each month's leads. */}
            <Field label="Projected appointment rate (%)" error={fe("projected_conversion")} hint="Pipeline by Month: this % of each month's leads. Leave empty for 20%">
              <Input name="projected_conversion" type="number" inputMode="decimal" min="0" max="100" step="0.5" defaultValue={dv("projected_conversion")} aria-invalid={invalid("projected_conversion")} data-projected-conversion />
            </Field>

            {/* What the client is billed (Sean, Nov 2026): Reports' billing listing; a manager's pay is under Pay rates. */}
            <Field label="Billing per lead ($)" error={fe("bill_lead_rate")} hint="What the client is billed for each lead">
              <Input name="bill_lead_rate" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={dv("bill_lead_rate")} onChange={(e) => setRates((r) => ({ ...r, lead: e.target.value }))} aria-invalid={invalid("bill_lead_rate")} data-bill-lead-rate />
            </Field>
            <Field label="Billing per appointment ($)" error={fe("bill_appointment_rate")} hint="…and for each appointment">
              <Input name="bill_appointment_rate" type="number" inputMode="decimal" min="0" step="0.01" defaultValue={dv("bill_appointment_rate")} onChange={(e) => setRates((r) => ({ ...r, appt: e.target.value }))} aria-invalid={invalid("bill_appointment_rate")} data-bill-appointment-rate />
            </Field>

            {/* How the client pays for the program (client, Nov 2026): administrators, on a project's own page. */}
            {canFund ? (
              <FundingFields plan={funding} rates={rates}
                goals={{ leads: goals.lead_goal, appts: goals.appt_goal, leadsMonth: goals.lead_goal_month, start: goals.start_date }} />
            ) : null}

            <Field label="Description" error={fe("description")} className="sm:col-span-2">
              <Textarea name="description" rows={3} maxLength={500} defaultValue={dv("description")} aria-invalid={invalid("description")} />
            </Field>

            {/* Where its leads go: a lead's sheet is emailed here when a call makes it a lead or an appointment. */}
            <Field label="Lead delivery emails" error={fe("email")} className="sm:col-span-2"
              hint="Each lead and appointment's sheet is emailed here, and to the producers ticked in Project Info. Separate several with commas.">
              <Input name="email" maxLength={500} placeholder="leads@client.com, producer@client.com" defaultValue={dv("email")} aria-invalid={invalid("email")} />
            </Field>
            <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
              <input type="hidden" name="delivery_link_only" value="off" />
              <input type="checkbox" name="delivery_link_only" value="on" defaultChecked={Boolean(record?.delivery_link_only)} className="mt-0.5 size-4 accent-[var(--primary)]" />
              <span>Send a link to the lead sheet instead of the sheet itself<span className="block text-xs text-muted-foreground">The link opens the sheet without signing in, for 90 days.</span></span>
            </label>
            {/* Appointment reminder texts (client, Nov 2026): off for clients who confirm their own. */}
            <label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2">
              <input type="hidden" name="appt_texts" value="off" />
              <input type="checkbox" name="appt_texts" value="on" defaultChecked={Boolean(record?.appt_texts)} className="mt-0.5 size-4 accent-[var(--primary)]" data-project-appt-texts />
              <span>Text appointment reminders<span className="block text-xs text-muted-foreground">The prospect is texted a reminder the day before, as set in Settings › Appointment Reminder Texts. Leave it off for clients who confirm their own appointments.</span></span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
