/**
 * A client's or a project's figures (lead_stats(), counted by call result)
 * as the pages show them. Pure functions.
 */

const n = (v) => Number(v ?? 0);

/** A percentage of `part` in `whole`, to the whole number; null when there is nothing to compare with. */
export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : null);
export const pctLabel = (v) => (v == null ? "—" : `${v}%`);

/**
 * One lead_stats() row as figures: the names loaded, those left to call
 * (DB dev), the leads (names at the appointment stage: active, or
 * resolved), those DB dev developed, the appointments and the invalid
 * ones; and the two conversions: names to leads developed, and leads
 * developed to appointments (invalid ones count as set).
 */
export function shapeStats(row) {
  const s = {
    names: n(row?.names),
    namesLeft: n(row?.names_left),
    leadsActive: n(row?.leads_active),
    leadsResolved: n(row?.leads_resolved),
    developed: n(row?.developed),
    appointments: n(row?.appointments),
    invalid: n(row?.invalid_appointments),
  };
  s.leads = s.leadsActive + s.leadsResolved;
  s.appointmentsSet = s.appointments + s.invalid;
  s.leadRate = pct(s.developed, s.names);
  s.apptRate = pct(s.appointmentsSet, s.developed);
  return s;
}

const count = (v, one, many = `${one}s`) => `${v.toLocaleString()} ${v === 1 ? one : many}`;

/** A project's figures in a line, for a list of projects: only what its kind of project has. */
export function statsLine(s, type) {
  return [
    count(s.names, "name"),
    type === "DBDV" ? `${s.namesLeft.toLocaleString()} left to call` : null,
    `${count(s.leads, "lead")} (${s.leadsActive.toLocaleString()} active, ${s.leadsResolved.toLocaleString()} resolved)`,
    `${count(s.appointments, "appointment")}${s.invalid ? `, ${s.invalid.toLocaleString()} invalid` : ""}`,
    type === "DBDV" && s.leadRate != null ? `${s.leadRate}% names to leads` : null,
    s.apptRate != null ? `${s.apptRate}% leads to appointments` : null,
  ].filter(Boolean);
}
