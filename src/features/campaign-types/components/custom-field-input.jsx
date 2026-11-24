"use client";

import { useState } from "react";
import DatePicker from "@/components/shared/date-picker";
import PickList from "@/components/shared/pick-list";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";

/**
 * A campaign type's own field, as a form asks it (Sean, Nov 2026: "# value, %, text, drop down with answers like the
 * carrier field"): text, a number, a percent, a date, Yes or No, one choice from its list (a long list searchable), or
 * several (a pick list like the carriers'). Submitted as `name` (several: one input each, with a blank one so none
 * chosen clears it). `value` what it holds; `data` the attribute that marks it, e.g. { "data-custom-input": id }.
 */
export default function CustomFieldInput({ field: f, name, value, invalid, data }) {
  const [several, setSeveral] = useState(() => (Array.isArray(value) ? value : value ? String(value).split(/\s*,\s*/).filter((v) => (f.options ?? []).includes(v)) : []));
  const text = value === true ? "yes" : value === false ? "no" : Array.isArray(value) ? value.join(", ") : value ?? "";
  if (f.type === "date") return <DatePicker name={name} defaultValue={String(text)} aria-label={f.label} invalid={invalid} />;
  if (f.type === "multi") {
    return (
      <div {...data}>
        <input type="hidden" name={name} value="" />
        <PickList name={name} label={f.label} options={f.options ?? []} value={several} onChange={setSeveral} invalid={invalid} placeholder="Add…" empty="None chosen yet" />
      </div>
    );
  }
  if (f.type === "yesno" || f.type === "select") {
    return (
      <Select name={name} defaultValue={String(text)} aria-invalid={invalid} {...data}>
        <option value="">—</option>
        {(f.type === "yesno" ? [["yes", "Yes"], ["no", "No"]] : (f.options ?? []).map((o) => [o, o])).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </Select>
    );
  }
  const numeric = f.type === "number" || f.type === "percent";
  const input = <Input name={name} defaultValue={String(text)} inputMode={numeric ? "decimal" : undefined} maxLength={numeric ? 20 : 500} aria-invalid={invalid} {...data}
    className={f.type === "percent" ? "pr-7" : undefined} />;
  return f.type === "percent" ? (
    <div className="relative">
      {input}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
    </div>
  ) : input;
}
