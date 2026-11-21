"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { REACH_ERROR, isNetworkError } from "@/lib/reach";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select, formHelpers } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateLead } from "@/features/leads/actions";
import PhoneInput from "@/components/shared/phone-input";
import { SECTION_BOX, SECTION_LEGEND } from "@/features/leads/form-section";
import { AUTO_TYPES, TRAVEL_RADII, xmodText } from "@/lib/business";
import { sicLookup } from "@/lib/sic";
import DatePicker from "@/components/shared/date-picker";
import { campaignView } from "@/lib/campaign-types";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };

// The SIC list, read once a page when the form first opens; one that couldn't be read is said, and read again next time.
let sicList = null;
async function loadSic() {
  if (sicList) return sicList;
  try {
    const res = await fetch("/api/sic-codes?format=json");
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "The SIC list could not be read. Try again.");
    sicList = (await res.json()).codes ?? [];
    return sicList;
  } catch (e) {
    toast.error(isNetworkError(e) ? REACH_ERROR : e.message, { id: "sic-list" });
    return [];
  }
}

/**
 * Edit what a business is (the Business tab; Sean, Oct 2026): its name and
 * phone; its locations and the building (owned or leased, its age, stories
 * and acres); employees, full-time and part-time; sub-contractors as a %;
 * autos, their kinds, drivers, how far they travel, DOT number and cargo
 * (from the cargo list, `cargoTypes`); XMOD; sales volume and annual payroll, EIN, years in
 * business, estimated premium and claims in the last three years,
 * professionals, covered employees; and its SIC code, with what the code
 * means from the SIC list. Only these fields are sent, so nothing else on
 * the lead changes.
 */
export default function BusinessForm({ lead, cargoTypes = [], trigger, campaign = null, custom = {} }) {
  // The client's campaign type (Nov 2026): its names for the fields, those it turns off (left off the form, so
  // what they hold is kept), and its own questions.
  const view = campaignView(campaign);
  const show = (key) => !view.hidden(key);
  const L = view.label;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(updateLead, EMPTY);
  const { fe, invalid, dv } = formHelpers(state, lead);
  const [sic, setSic] = useState([]);
  const [code, setCode] = useState(lead.sic_code ?? "");
  useEffect(() => {
    if (open) loadSic().then(setSic);
  }, [open]);
  useEffect(() => {
    if (state?.ok) {
      toast.success("Business details saved");
      setOpen(false);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors) toast.error(state.error);
  }, [state, router]);
  const errors = state?.fieldErrors ? Object.keys(state.fieldErrors).length : 0;
  // What the code means: its own description, else its industry's (4 digits) or group's (2); 4225-05 and 422505 are one code.
  const meaning = sicLookup(code).map((c) => sic.find((s) => s.code === c)?.description).find(Boolean)
    ?? (code.trim() && sic.length ? "Not on the SIC list" : "");
  const types = new Set(state?.values ? [] : lead.auto_types ?? []);
  // The cargo list, and the lead's own cargo should it have come off the list since.
  const cargo = dv("cargo", "") ?? "";
  const cargoOptions = cargo && !cargoTypes.some((t) => t.name === cargo) ? [{ id: "kept", name: cargo }, ...cargoTypes] : cargoTypes;
  const claims = state?.values ? state.values.claims_3yrs ?? "" : { true: "yes", false: "no" }[String(lead.claims_3yrs)] ?? "";
  const num = (name, label, props = {}) => (
    <Field key={name} label={label} error={fe(name)} hint={props.hint}>
      <Input name={name} inputMode={props.decimal ? "decimal" : "numeric"} defaultValue={dv(name)} maxLength={props.max ?? 9} aria-invalid={invalid(name)} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* One scroll bar: the fields scroll, the title and the buttons stay put. */}
      <DialogContent className="max-w-2xl overflow-y-hidden">
        <DialogHeader>
          <DialogTitle>Edit business details</DialogTitle>
          <DialogDescription>{lead.company_name}: what the business is.</DialogDescription>
        </DialogHeader>
        <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col gap-4" data-business-form>
          <input type="hidden" name="id" value={lead.id} />
          {errors ? (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errors === 1 ? "One field needs attention." : `${errors} fields need attention.`}
            </p>
          ) : null}
          <div className="-mr-1 grid min-h-0 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {show("sic") ? (<>
            {/* What kind of business it is, first (Oct 2026); the description comes from the SIC list. */}
            <Field label={L("sic")} error={fe("sic_code")} hint="Type a code or what the business does, and pick from the list">
              <Input name="sic_code" list="sic-codes" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} aria-invalid={invalid("sic_code")} autoComplete="off" />
            </Field>
            <Field label="SIC description">
              <Input value={meaning} readOnly tabIndex={-1} placeholder={sic.length ? "" : "Loading the SIC list…"} className="bg-muted/40" data-sic-meaning />
            </Field>
            <datalist id="sic-codes">
              {sic.map((s) => <option key={s.code} value={s.code}>{s.description}</option>)}
            </datalist>
            </>) : null}
            <Field label="Company name" required error={fe("company_name")}>
              <Input name="company_name" defaultValue={dv("company_name")} maxLength={120} required aria-invalid={invalid("company_name")} />
            </Field>
            <Field label="Phone" error={fe("phone")}>
              <PhoneInput name="phone" defaultValue={dv("phone") ?? ""} invalid={invalid("phone")} />
            </Field>

            {show("locations") ? (
            <fieldset className={`grid grid-cols-2 gap-3 ${SECTION_BOX} sm:col-span-2 sm:grid-cols-5`} data-group="locations">
              <legend className={SECTION_LEGEND}>{L("locations")}</legend>
              <Field label="Locations" error={fe("location")}>
                <Input name="location" defaultValue={dv("location")} maxLength={60} aria-invalid={invalid("location")} />
              </Field>
              <Field label="Building" error={fe("location_ownership")}>
                <Select name="location_ownership" defaultValue={dv("location_ownership", "") ?? ""} aria-invalid={invalid("location_ownership")}>
                  <option value="">—</option>
                  <option value="own">Own</option>
                  <option value="lease">Lease</option>
                </Select>
              </Field>
              {num("building_age", "Age (years)", { max: 3 })}
              {num("building_stories", "Stories", { max: 3 })}
              {num("building_acres", "Acres", { decimal: true, max: 8 })}
            </fieldset>
            ) : null}

            {show("employees") || show("subcontractors") ? (
            <fieldset className={`grid grid-cols-2 gap-3 ${SECTION_BOX} sm:col-span-2 sm:grid-cols-4`} data-group="employees">
              <legend className={SECTION_LEGEND}>{show("employees") ? L("employees") : L("subcontractors")}</legend>
              {show("employees") ? <>{num("employees", "Total")}{num("employees_full_time", "Full-time")}{num("employees_part_time", "Part-time")}</> : null}
              {show("subcontractors") ? num("subcontractors_pct", `${L("subcontractors")} %`, { decimal: true, max: 6 }) : null}
            </fieldset>
            ) : null}

            {show("autos") || show("dot_number") || show("cargo") ? (
            <fieldset className={`grid grid-cols-2 gap-3 ${SECTION_BOX} sm:col-span-2`} data-group="autos">
              <legend className={SECTION_LEGEND}>{show("autos") ? L("autos") : [show("dot_number") && L("dot_number"), show("cargo") && L("cargo")].filter(Boolean).join(" & ")}</legend>
              {show("autos") ? <>
              {num("autos", L("autos"), { max: 6 })}
              {num("drivers", "Drivers", { max: 6 })}
              <Field label="Travel radius" error={fe("travel_radius")}>
                <Select name="travel_radius" defaultValue={dv("travel_radius", "") ?? ""} aria-invalid={invalid("travel_radius")}>
                  <option value="">—</option>
                  {TRAVEL_RADII.map((r) => <option key={r} value={r}>{r} miles</option>)}
                </Select>
              </Field>
              </> : null}
              {show("dot_number") ? (
              <Field label={L("dot_number")} error={fe("dot_number")}>
                <Input name="dot_number" inputMode="numeric" defaultValue={dv("dot_number")} maxLength={14} aria-invalid={invalid("dot_number")} />
              </Field>
              ) : null}
              {show("cargo") ? (
              <Field label={L("cargo")} error={fe("cargo")} hint={cargoTypes.length ? null : "An administrator loads the cargo list in Settings"}>
                <Select name="cargo" defaultValue={cargo} aria-invalid={invalid("cargo")}>
                  <option value="">—</option>
                  {cargoOptions.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </Select>
              </Field>
              ) : null}
              {show("autos") ? (
              <div className="sm:col-span-2" role="group" aria-label="Kinds of vehicles">
                <div className="mb-1.5 text-xs font-medium">Kinds of vehicles</div>
                {/* Sent even when none is ticked, so taking every one off clears them. */}
                <input type="hidden" name="auto_types" value="" />
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {AUTO_TYPES.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="auto_types" value={key} defaultChecked={types.has(key)} className="size-4 accent-[var(--primary)]" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              ) : null}
            </fieldset>
            ) : null}

            {show("xmod") ? (
            <Field label={L("xmod")} error={fe("xmod")} hint="e.g. .85 or 1.50">
              <Input name="xmod" inputMode="decimal" defaultValue={state?.values ? dv("xmod") : xmodText(lead.xmod) ?? ""} maxLength={4} aria-invalid={invalid("xmod")} />
            </Field>
            ) : null}
            {show("sales_volume") ? (
            <Field label={L("sales_volume")} error={fe("sales_volume")} hint="e.g. $12.4M">
              <Input name="sales_volume" defaultValue={dv("sales_volume")} maxLength={30} aria-invalid={invalid("sales_volume")} />
            </Field>
            ) : null}
            {show("annual_payroll") ? (
            <Field label={L("annual_payroll")} error={fe("annual_payroll")} hint="e.g. $1.2M">
              <Input name="annual_payroll" defaultValue={dv("annual_payroll")} maxLength={30} aria-invalid={invalid("annual_payroll")} />
            </Field>
            ) : null}
            {show("ein") ? (
            <Field label={L("ein")} error={fe("ein")} hint="Federal employer ID, 9 digits">
              <Input name="ein" inputMode="numeric" defaultValue={dv("ein")} maxLength={12} aria-invalid={invalid("ein")} />
            </Field>
            ) : null}
            {show("years_in_business") ? num("years_in_business", L("years_in_business"), { max: 3 }) : null}
            {show("estimated_annual_premium") ? (
            <Field label={L("estimated_annual_premium")} error={fe("estimated_annual_premium")}>
              <Input name="estimated_annual_premium" defaultValue={dv("estimated_annual_premium")} maxLength={30} aria-invalid={invalid("estimated_annual_premium")} />
            </Field>
            ) : null}
            {show("claims_3yrs") ? (
            <Field label={L("claims_3yrs")} error={fe("claims_3yrs")}>
              <Select name="claims_3yrs" defaultValue={claims} aria-invalid={invalid("claims_3yrs")}>
                <option value="">—</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            ) : null}
            {show("professionals") ? num("professionals", L("professionals")) : null}
            {show("covered_employees") ? num("covered_employees", L("covered_employees")) : null}

            {/* The campaign type's own questions (Nov 2026). */}
            {view.custom.length ? (
              <fieldset className={`grid grid-cols-1 gap-3 ${SECTION_BOX} sm:col-span-2 sm:grid-cols-2`} data-group="custom">
                <legend className={SECTION_LEGEND}>{view.name}</legend>
                {view.custom.map((f) => {
                  const name = `custom.${f.id}`;
                  const was = state?.values && name in state.values ? state.values[name] : custom?.[f.id];
                  const text = was === true ? "yes" : was === false ? "no" : was ?? "";
                  return (
                    <Field key={f.id} label={f.label} error={fe(name)}>
                      {f.type === "date" ? <DatePicker name={name} defaultValue={String(text)} aria-label={f.label} invalid={invalid(name)} />
                        : f.type === "yesno" ? (
                          <Select name={name} defaultValue={String(text)} aria-invalid={invalid(name)} data-custom-input={f.id}>
                            <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                          </Select>
                        ) : f.type === "select" ? (
                          <Select name={name} defaultValue={String(text)} aria-invalid={invalid(name)} data-custom-input={f.id}>
                            <option value="">—</option>
                            {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </Select>
                        ) : (
                          <Input name={name} defaultValue={String(text)} inputMode={f.type === "number" ? "decimal" : undefined} maxLength={f.type === "number" ? 20 : 500}
                            aria-invalid={invalid(name)} data-custom-input={f.id} />
                        )}
                    </Field>
                  );
                })}
              </fieldset>
            ) : null}

          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
