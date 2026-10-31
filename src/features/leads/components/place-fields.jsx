"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import SuggestInput from "@/components/shared/suggest-input";
import { fillPlaceFields, placesInState } from "@/features/leads/place-actions";
import { normalizeState } from "@/lib/csv";
import { US_STATES } from "@/lib/project-info";

// Each state's cities and counties, read once a visit.
const lists = new Map();
const listsOf = (state) => {
  if (!lists.has(state)) lists.set(state, placesInState(state).catch(() => { lists.delete(state); return { cities: [], counties: [] }; }));
  return lists.get(state);
};

/**
 * A lead's city, state, ZIP and county (Sean, Oct 2026: one spelling each).
 * The state is picked from the list; the city and county are suggested from
 * that state's as they are typed (a name not on its list is said, and kept
 * if meant). A ZIP fills in a blank city, state and county; a city picked, a
 * blank county (and its ZIP when it has just one). Renders the City / State /
 * ZIP row across the form's two columns, then County.
 *
 *   fe, invalid, dv   the form's helpers (formHelpers)
 */
export default function PlaceFields({ fe, invalid, dv }) {
  const [place, setPlace] = useState(() => ({
    city: dv("city") ?? "", state: normalizeState(dv("state")) ?? (dv("state") ?? ""), zip: dv("zip") ?? "", county: dv("county") ?? "",
  }));
  const [options, setOptions] = useState({ cities: [], counties: [] });
  const set = (k) => (v) => setPlace((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    let live = true;
    if (!/^[A-Z]{2}$/.test(place.state)) { setOptions({ cities: [], counties: [] }); return undefined; }
    listsOf(place.state).then((o) => live && setOptions(o));
    return () => { live = false; };
  }, [place.state]);

  // Fill in what is blank from what the rest says for certain.
  const fill = (over = {}) => {
    const now = { ...place, ...over };
    if (!["city", "state", "zip", "county"].some((k) => !String(now[k] ?? "").trim())) return;
    fillPlaceFields(now).then((got) => {
      if (got && Object.keys(got).length) setPlace((p) => ({ ...p, ...Object.fromEntries(Object.entries(got).filter(([k]) => !String(p[k] ?? "").trim() || k === "zip")) }));
    }).catch(() => {});
  };

  const named = /^[A-Z]{2}$/.test(place.state) ? place.state : null;
  // A state on file that is not one of the fifty (and DC) stays a choice, so saving does not lose it.
  const states = place.state && !US_STATES.includes(place.state) ? [place.state, ...US_STATES] : US_STATES;

  return (
    <>
      <div className="grid grid-cols-[1fr_6rem_7rem] gap-3 sm:col-span-2" data-place-fields>
        <Field label="City" error={fe("city")}>
          <SuggestInput name="city" value={place.city} onChange={set("city")} options={options.cities} maxLength={60} invalid={invalid("city")}
            onPick={(v) => fill({ city: v })} placeholder={named ? `A city in ${named}` : "Pick the state first"}
            unlisted={named && options.cities.length ? `Not a city we know in ${named}: check the spelling.` : null} />
        </Field>
        <Field label="State" error={fe("state")}>
          <Select name="state" value={place.state} onChange={(e) => setPlace((p) => ({ ...p, state: e.target.value }))} aria-invalid={invalid("state")} data-place-state>
            <option value="">—</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="ZIP" error={fe("zip")}>
          <Input name="zip" value={place.zip} onChange={(e) => set("zip")(e.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
            onBlur={(e) => /^\d{5}/.test(e.target.value) && fill({ zip: e.target.value })} inputMode="numeric" placeholder="85016" maxLength={10} aria-invalid={invalid("zip")} />
        </Field>
      </div>
      <Field label="County" error={fe("county")}>
        <SuggestInput name="county" value={place.county} onChange={set("county")} options={options.counties} maxLength={60} invalid={invalid("county")}
          placeholder={named ? `A county in ${named}` : "Pick the state first"}
          unlisted={named && options.counties.length ? `Not a county we know in ${named}: check the spelling.` : null} />
      </Field>
    </>
  );
}
