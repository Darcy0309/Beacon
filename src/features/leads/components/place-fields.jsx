"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import SuggestInput from "@/components/shared/suggest-input";
import { cityPlace, fillPlaceFields, placesInState, zipPlace } from "@/features/leads/place-actions";
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
 * if meant). A ZIP typed sets the city, state and county to its own (Sean,
 * Oct 2026: a new ZIP is where the business is), and says so; one that is
 * not a ZIP is said too. A city typed or picked in its state sets the county
 * and the ZIP (Sean, Nov 2026: Tucson, AZ is Pima County, 85701): the ZIP
 * there kept when it is one of the city's, else the city's main ZIP, saying
 * how many it has. What is on file changes nothing as the form opens.
 * Renders the City / State / ZIP row across the form's two columns, then
 * County.
 *
 *   fe, invalid, dv   the form's helpers (formHelpers)
 */
export default function PlaceFields({ fe, invalid, dv }) {
  const [place, setPlace] = useState(() => ({
    city: dv("city") ?? "", state: normalizeState(dv("state")) ?? (dv("state") ?? ""), zip: dv("zip") ?? "", county: dv("county") ?? "",
  }));
  const [options, setOptions] = useState({ cities: [], counties: [] });
  const set = (k) => (v) => setPlace((p) => ({ ...p, [k]: v }));
  // The last ZIP and city looked up (those on file to begin with), and what came of it.
  const looked = useRef(String(dv("zip") ?? "").slice(0, 5));
  const cityAt = (city, state) => `${state}|${String(city ?? "").trim().toLowerCase()}`;
  const cityLooked = useRef(cityAt(place.city, place.state));
  // The fields as they are now, for an answer that comes back after more typing.
  const latest = useRef(place);
  latest.current = place;
  const [said, setSaid] = useState(null);
  const countyName = (c) => (c ? (/(county|parish|borough|census area|municipality)$/i.test(c) ? c : `${c} County`) : null);
  const lookCity = (city, state) => {
    const at = cityAt(city, state);
    if (!String(city ?? "").trim() || !/^[A-Z]{2}$/.test(state ?? "") || at === cityLooked.current) return;
    cityLooked.current = at;
    cityPlace(city, state).then((got) => {
      if (cityLooked.current !== at || !got) return; // typed on since, or a city the state doesn't have (said under the field)
      const now = latest.current;
      const mine = now.zip.slice(0, 5);
      const keep = mine in got.zips;
      const zip = keep ? now.zip : got.zip;
      const county = keep ? got.zips[mine] : got.county;
      looked.current = zip.slice(0, 5);
      cityLooked.current = cityAt(got.city, state);
      const n = Object.keys(got.zips).length;
      setPlace((p) => ({ ...p, city: got.city, zip, county: county ?? p.county }));
      setSaid({ ok: true, text: keep
        ? `${got.city}, ${state}${county ? `: ${countyName(county)}` : ""}`
        : `${got.city}, ${state}: ZIP ${zip}${county ? ` and ${countyName(county)}` : ""} put in${n > 1 ? ` (${got.city} has ${n} ZIP codes: change it if the address is in another)` : ""}` });
    }).catch(() => {});
  };
  const typeZip = (raw) => {
    const zip = raw.replace(/[^\d-]/g, "").slice(0, 10);
    set("zip")(zip);
    const five = /^\d{5}(-?\d{0,4})?$/.test(zip) ? zip.slice(0, 5) : null;
    if (!five) { if (zip.length < 5) setSaid(null); return; }
    if (five === looked.current) return;
    looked.current = five;
    zipPlace(five).then((got) => {
      if (looked.current !== five) return; // typed on since
      if (!got) { setSaid({ ok: false, text: `${five} isn't a ZIP we know: check it.` }); return; }
      setPlace((p) => ({ ...p, city: got.city, state: got.state, county: got.county ?? (got.state === p.state ? p.county : "") }));
      cityLooked.current = cityAt(got.city, got.state);
      const county = countyName(got.county);
      setSaid({ ok: true, text: `From ZIP ${five}: ${got.city}, ${got.state}${county ? ` · ${county}` : ""}` });
    }).catch(() => {});
  };

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

  // A ZIP on file with the city, state or county blank: those filled in as the form opens.
  useEffect(() => {
    if (place.zip && ["city", "state", "county"].some((k) => !String(place[k] ?? "").trim())) fill();
    // Once, as it opens.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const named = /^[A-Z]{2}$/.test(place.state) ? place.state : null;
  // A state on file that is not one of the fifty (and DC) stays a choice, so saving does not lose it.
  const states = place.state && !US_STATES.includes(place.state) ? [place.state, ...US_STATES] : US_STATES;

  return (
    <>
      <div className="grid grid-cols-[1fr_6rem_7rem] gap-3 sm:col-span-2" data-place-fields>
        <Field label="City" error={fe("city")}>
          <SuggestInput name="city" value={place.city} onChange={set("city")} options={options.cities} maxLength={60} invalid={invalid("city")}
            onPick={(v) => lookCity(v, place.state)} onBlur={(v) => lookCity(v, place.state)} placeholder={named ? `A city in ${named}` : "Pick the state first"}
            unlisted={named && options.cities.length ? `Not a city we know in ${named}: check the spelling.` : null} />
        </Field>
        <Field label="State" error={fe("state")}>
          <Select name="state" value={place.state} onChange={(e) => { const st = e.target.value; setPlace((p) => ({ ...p, state: st })); lookCity(place.city, st); }}
            aria-invalid={invalid("state")} data-place-state>
            <option value="">—</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="ZIP" error={fe("zip")}>
          <Input name="zip" value={place.zip} onChange={(e) => typeZip(e.target.value)} inputMode="numeric" maxLength={10} aria-invalid={invalid("zip")} />
        </Field>
        {said ? (
          <p role="status" className={`col-span-3 -mt-1 text-xs ${said.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} data-zip-said>{said.text}</p>
        ) : null}
      </div>
      <Field label="County" error={fe("county")}>
        <SuggestInput name="county" value={place.county} onChange={set("county")} options={options.counties} maxLength={60} invalid={invalid("county")}
          placeholder={named ? `A county in ${named}` : "Pick the state first"}
          unlisted={named && options.counties.length ? `Not a county we know in ${named}: check the spelling.` : null} />
      </Field>
    </>
  );
}
