"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, CalendarX2, Landmark, MessageSquareText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PickList from "@/components/shared/pick-list";
import { saveProjectInfo, saveProjectInfoByLink } from "@/features/project-info/actions";
import { MAX_PRODUCERS, MIN_EMPLOYEES_MAX, QUOTE_MIN_TIMES, QUOTE_TIMES, US_STATES, WEEKDAYS } from "@/lib/project-info";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const YN = (v) => (v === true ? "yes" : v === false ? "no" : "");
const EMPLOYEE_SIZES = Array.from({ length: MIN_EMPLOYEES_MAX + 1 }, (_, i) => String(i));
const ROWS = Array.from({ length: MAX_PRODUCERS }, (_, i) => i);
const padProducers = (list) => ROWS.map((i) => ({ first: "", last: "", email: "", leads: false, ...(list?.[i] ?? {}) }));

/** A part of the form, boxed and titled. */
function Group({ title, icon: Icon, hint, group, children }) {
  return (
    <fieldset data-info-group={group} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--panel-border)] p-3 sm:grid-cols-2">
      <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold"><Icon className="size-3.5 text-primary" aria-hidden /> {title}</legend>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

/** A yes/no question with the number that goes with a yes: the fewest employees, autos or covered lives. */
function YesWith({ name, label, value, onChange, countName, countLabel, countDefault, fe, invalid }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end" data-yes-with={name}>
      <Field label={label} error={fe(name)}>
        <Select name={name} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid(name)}>
          <option value="">—</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
      <Field label={countLabel} error={fe(countName)}>
        <Input name={countName} inputMode="numeric" defaultValue={countDefault} maxLength={7} disabled={value !== "yes"} aria-invalid={invalid(countName)} />
      </Field>
    </div>
  );
}

/**
 * The Project Info form (Sean, Oct 2026), asked as the client profile
 * questionnaire asks it: the agent and office and the states they are
 * licensed in; up to five producers, each ticked to get leads by email or
 * not; the carriers they write with and those they can't compete with; the
 * days to avoid for appointments and what qualifies one; and about the
 * agency. Saves with `action`: saveProjectInfo when signed in (`info`
 * names the project), saveProjectInfoByLink with the private link's `token`.
 * `onSaved(data)` after each save. In a `dialog` its fields scroll between
 * the title and the buttons; on a page of its own the buttons stay in view,
 * with `status` beside them.
 */
export default function ProjectInfoForm({ info, carriers = [], action, token = null, onSaved, onCancel, submitLabel = "Save", dialog = false, status = null }) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  // The form's values as text: yes and no as the selects have them, numbers as typed.
  const record = info ? {
    ...info,
    personal_lines: YN(info.personal_lines), wc_mono: YN(info.wc_mono), auto_mono: YN(info.auto_mono), health_only: YN(info.health_only),
    min_employees: info.min_employees ?? "", wc_min_employees: info.wc_min_employees ?? "", auto_min_autos: info.auto_min_autos ?? "",
    health_min_lives: info.health_min_lives ?? "",
  } : null;
  const { fe, invalid, dv } = formHelpers(state, record);
  const form = useRef(null);
  const handled = useRef(null);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) onSaved?.(state.data);
    else if (state?.error && !state?.fieldErrors) toast.error(state.error);
    // A long form: the first field with a problem is brought into view, wherever Save was pressed.
    else if (state?.fieldErrors) requestAnimationFrame(() => form.current?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }, [state, onSaved]);

  // Kept as they are chosen, so a save sent back with a problem keeps them.
  const [states, setStates] = useState(info?.states_licensed ?? []);
  const [top, setTop] = useState(info?.top_carriers ?? []);
  const [avoid, setAvoid] = useState(info?.avoid_carriers ?? []);
  const [days, setDays] = useState(info?.avoid_days ?? []);
  const [producers, setProducers] = useState(() => padProducers(info?.producers));
  const [wc, setWc] = useState(YN(info?.wc_mono));
  const [auto, setAuto] = useState(YN(info?.auto_mono));
  const [health, setHealth] = useState(YN(info?.health_only));
  const setProducer = (i, key, v) => setProducers((list) => list.map((p, j) => (j === i ? { ...p, [key]: v } : p)));

  const errors = state?.fieldErrors ? Object.keys(state.fieldErrors).length : 0;
  const state2 = dv("state", "") ?? "";
  const stateOptions = state2 && !US_STATES.includes(state2) ? [state2, ...US_STATES] : US_STATES;
  const text = (name, label, { hint, rows = 3 } = {}) => (
    <Field key={name} label={label} hint={hint} error={fe(name)} className="sm:col-span-2">
      <Textarea name={name} rows={rows} maxLength={4000} defaultValue={dv(name) ?? ""} aria-invalid={invalid(name)} />
    </Field>
  );

  const fields = (
    <>
      {errors ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {errors === 1 ? "One field needs attention." : `${errors} fields need attention.`}
        </p>
      ) : null}

      <Group title="Agent & office" icon={Building2} group="agent">
        <Field label="Project agent" error={fe("contact_name")} className="sm:col-span-2">
          <Input name="contact_name" defaultValue={dv("contact_name") ?? ""} maxLength={80} aria-invalid={invalid("contact_name")} placeholder="The agent taking the appointments" />
        </Field>
        <Field label="Address" error={fe("address")} className="sm:col-span-2">
          <Input name="address" defaultValue={dv("address") ?? ""} maxLength={120} aria-invalid={invalid("address")} />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_7rem] gap-3 sm:col-span-2">
          <Field label="City" error={fe("city")}>
            <Input name="city" defaultValue={dv("city") ?? ""} maxLength={60} aria-invalid={invalid("city")} />
          </Field>
          <Field label="ST" error={fe("state")}>
            <Select name="state" defaultValue={state2} aria-invalid={invalid("state")}>
              <option value="">—</option>
              {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="ZIP" error={fe("zip")}>
            <Input name="zip" inputMode="numeric" defaultValue={dv("zip") ?? ""} maxLength={10} aria-invalid={invalid("zip")} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
          <Field label="Phone" error={fe("phone")} hint="Our calls for you come from its area code">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={dv("phone") ?? ""} aria-invalid={invalid("phone")} placeholder="(715) 555-0100" />
          </Field>
          <Field label="Mobile" error={fe("agent_mobile")}>
            <Input name="agent_mobile" type="tel" inputMode="tel" defaultValue={dv("agent_mobile") ?? ""} aria-invalid={invalid("agent_mobile")} />
          </Field>
          <Field label="Agent email" error={fe("agent_email")}>
            <Input name="agent_email" type="email" defaultValue={dv("agent_email") ?? ""} maxLength={254} aria-invalid={invalid("agent_email")} />
          </Field>
        </div>
        <Field label="States licensed" error={fe("states_licensed")} className="sm:col-span-2">
          <PickList name="states_licensed" label="States licensed" options={US_STATES} value={states} onChange={setStates} sorted placeholder="Add a state…" empty="No states chosen yet" />
        </Field>
      </Group>

      <Group title="Producers taking appointments" icon={Users} group="producers"
        hint="Up to five. Tick Leads by email for each producer who should be sent every lead and appointment.">
        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_7.5rem] gap-2 text-[0.7rem] font-medium text-muted-foreground sm:col-span-2 sm:grid" aria-hidden>
          <span>First name</span><span>Last name</span><span>Email</span><span>Leads by email</span>
        </div>
        {producers.map((p, i) => {
          const n = i + 1;
          return (
            <div key={n} data-producer={n} className="grid grid-cols-2 gap-2 border-t border-[var(--panel-border)] pt-2 first-of-type:border-t-0 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_7.5rem] sm:items-start sm:border-t-0 sm:pt-0">
              <Input name={`producer_first_${n}`} value={p.first} onChange={(e) => setProducer(i, "first", e.target.value)} maxLength={40}
                placeholder="First name" aria-label={`Producer ${n}: first name`} aria-invalid={invalid(`producer_first_${n}`)} />
              <Input name={`producer_last_${n}`} value={p.last} onChange={(e) => setProducer(i, "last", e.target.value)} maxLength={40}
                placeholder="Last name" aria-label={`Producer ${n}: last name`} aria-invalid={invalid(`producer_last_${n}`)} />
              <div className="col-span-2 sm:col-span-1">
                <Input name={`producer_email_${n}`} type="email" value={p.email} onChange={(e) => setProducer(i, "email", e.target.value)} maxLength={254}
                  placeholder="Email" aria-label={`Producer ${n}: email`} aria-invalid={invalid(`producer_email_${n}`)} />
                {fe(`producer_email_${n}`) ? <p role="alert" className="mt-1 text-[0.7rem] font-medium text-destructive">{fe(`producer_email_${n}`)}</p> : null}
              </div>
              <label className="relative col-span-2 flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap text-xs sm:col-span-1">
                <input type="checkbox" checked={p.leads} onChange={(e) => setProducer(i, "leads", e.target.checked)} className="size-4 accent-[var(--primary)]"
                  aria-label={`Producer ${n}: send them leads and appointments by email`} />
                <span className="sm:sr-only">Send them leads by email</span>
                <span aria-hidden className="hidden sm:inline">Leads by email</span>
              </label>
              <input type="hidden" name={`producer_leads_${n}`} value={p.leads ? "on" : ""} />
            </div>
          );
        })}
      </Group>

      <Group title="Carriers" icon={Landmark} group="carriers"
        hint={carriers.length ? "Pick each one from the list; it is added to the box." : "The carrier list is empty: an administrator loads it under Insurance Cos."}>
        <Field label="Top carriers you will use" error={fe("top_carriers")} className="sm:col-span-2">
          <PickList name="top_carriers" label="Top carriers you will use" options={carriers} value={top} onChange={setTop} placeholder="Add a carrier…" invalid={invalid("top_carriers")} />
        </Field>
        <Field label="Carriers you can't compete with" error={fe("avoid_carriers")} className="sm:col-span-2">
          <PickList name="avoid_carriers" label="Carriers you can't compete with" options={carriers} value={avoid} onChange={setAvoid} placeholder="Add a carrier…" invalid={invalid("avoid_carriers")} />
        </Field>
      </Group>

      <Group title="Appointments" icon={CalendarX2} group="appointments">
        <Field label="Days to avoid for appointments" className="sm:col-span-2"
          hint="Blocked out on the project's calendar every week, so no appointments are set on them.">
          <div role="group" aria-label="Days to avoid for appointments" className="flex flex-wrap gap-1.5" data-avoid-days>
            {WEEKDAYS.map(([d, short, long]) => {
              const on = days.includes(d);
              return (
                // Relative: the hidden checkbox is placed in it, not in the dialog, which would then scroll as a whole.
                <label key={d} title={long} data-day={short} className={cn(
                  "relative flex h-8 min-w-12 cursor-pointer select-none items-center justify-center rounded-md border px-2.5 text-xs font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40",
                  on ? "border-amber-400/60 bg-amber-400/15 text-amber-600 dark:text-amber-300" : "border-input text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}>
                  <input type="checkbox" name="avoid_days" value={d} checked={on} aria-label={long}
                    onChange={() => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]))} className="sr-only" />
                  {short}
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="Will you take appointments for personal home/auto?" error={fe("personal_lines")} className="sm:col-span-2">
          <Select name="personal_lines" defaultValue={dv("personal_lines", "") ?? ""} aria-invalid={invalid("personal_lines")}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Minimum employee size that will qualify" error={fe("min_employees")} className="sm:col-span-2">
          <Select name="min_employees" defaultValue={String(dv("min_employees", "") ?? "")} aria-invalid={invalid("min_employees")}>
            <option value="">—</option>
            {EMPLOYEE_SIZES.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Typical time desired to put a quote together" error={fe("quote_time")}>
          <Select name="quote_time" defaultValue={dv("quote_time", "") ?? ""} aria-invalid={invalid("quote_time")}>
            <option value="">—</option>
            {QUOTE_TIMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Minimum time needed to quote" error={fe("quote_min_time")}>
          <Select name="quote_min_time" defaultValue={dv("quote_min_time", "") ?? ""} aria-invalid={invalid("quote_min_time")}>
            <option value="">—</option>
            {QUOTE_MIN_TIMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <YesWith name="wc_mono" label="Will you take a mono-line appointment to only quote Work Comp?" value={wc} onChange={setWc}
          countName="wc_min_employees" countLabel="Minimum # of employees" countDefault={dv("wc_min_employees") ?? ""} fe={fe} invalid={invalid} />
        <YesWith name="auto_mono" label="Will you take a mono-line appointment to only quote Commercial Auto?" value={auto} onChange={setAuto}
          countName="auto_min_autos" countLabel="Minimum # of autos" countDefault={dv("auto_min_autos") ?? ""} fe={fe} invalid={invalid} />
        <YesWith name="health_only" label="Do you provide Group Health, and take appointments for just health insurance?" value={health} onChange={setHealth}
          countName="health_min_lives" countLabel="Minimum # of covered lives" countDefault={dv("health_min_lives") ?? ""} fe={fe} invalid={invalid} />
      </Group>

      <Group title="About the agency" icon={MessageSquareText} group="about">
        {text("special_programs", "Special programs or services that you offer", { hint: "A brief overview of your agency: years in business, the types of business you specialize in, references, etc.", rows: 4 })}
        {text("value_added", "Any value-added services that set you apart from your competitors?")}
        {text("exclusive_program", "Do you have an exclusive program for the industries we are targeting for you?")}
        {text("industry_notes", "Going by the SIC codes you targeted, is anything specific going on in the industry?", { hint: "Rate increases, carriers pulling out, downgraded carrier ratings, etc." })}
      </Group>
    </>
  );

  const buttons = (
    <>
      {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button> : null}
      <Button type="submit" disabled={pending} data-save-project-info>{pending ? "Saving…" : submitLabel}</Button>
    </>
  );

  return (
    <form ref={form} action={formAction} noValidate data-project-info-form className={dialog ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"}>
      {token ? <input type="hidden" name="token" value={token} /> : <input type="hidden" name="project_id" value={info?.project_id ?? ""} />}
      {dialog ? (
        <>
          {/* One scroll bar: the fields scroll, the title and the buttons stay put. */}
          <div className="-mr-1 min-h-0 space-y-4 overflow-y-auto pr-1">{fields}</div>
          <DialogFooter>{buttons}</DialogFooter>
        </>
      ) : (
        <>
          {fields}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--panel-border)] bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            {status ? <div className="mr-auto min-w-0 text-xs">{status}</div> : null}
            {buttons}
          </div>
        </>
      )}
    </form>
  );
}

/**
 * Project Info to change, in a dialog: an administrator's from a project or
 * a lead sheet, a client's from their own Project Info page. `trigger`: the
 * button that opens it.
 */
export function ProjectInfoDialog({ info, carriers, trigger }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const saved = useCallback(() => {
    toast.success("Project Info saved");
    setOpen(false);
    router.refresh();
  }, [router]);
  const about = [info.client_name, info.project_name].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl overflow-y-hidden">
        <DialogHeader>
          <DialogTitle>Project Info</DialogTitle>
          <DialogDescription>
            {about}{info.shared_with?.length ? ` · also used by ${info.shared_with.join(", ")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <ProjectInfoForm info={info} carriers={carriers} action={saveProjectInfo} onSaved={saved} onCancel={() => setOpen(false)} dialog />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Project Info from the private link (app/client-profile/[token]): the whole
 * form on a page of its own, saved as often as the client likes while the
 * link is good, each save said beside the button.
 */
export function LinkInfoForm({ info, carriers, token }) {
  const [savedAt, setSavedAt] = useState(null);
  const saved = useCallback((data) => {
    toast.success("Thank you: your Project Info is saved");
    setSavedAt(data?.savedAt ?? new Date().toISOString());
  }, []);
  return (
    <ProjectInfoForm info={info} carriers={carriers} action={saveProjectInfoByLink} token={token} onSaved={saved} submitLabel="Save Project Info"
      status={savedAt ? (
        <span role="status" data-info-saved className="font-medium text-emerald-600 dark:text-emerald-400">
          Saved at {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. You can keep making changes.
        </span>
      ) : null} />
  );
}
