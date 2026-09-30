/**
 * How each lead status is labelled and styled. The codes mirror the legacy
 * LEADSTATUS table, seeded with the same codes in supabase/seed.sql.
 */
export const STATUS = {
  appt:    { cls: "p-appt",    label: "Phone appointment" },
  survey:  { cls: "p-survey",  label: "Survey appointment" },
  hot:     { cls: "p-hot",     label: "X-date hot lead" },
  xdate:   { cls: "p-xdate",   label: "X-date lead" },
  profile: { cls: "p-profile", label: "X-date profile" },
  new:     { cls: "p-new",     label: "New" },
  not_interested:  { cls: "p-new", label: "Not interested" },
  disconnected:    { cls: "p-new", label: "Disconnected number" },
  out_of_business: { cls: "p-new", label: "Out of business" },
  not_qualified:   { cls: "p-new", label: "Not qualified" },
  do_not_call:     { cls: "p-new", label: "Do not call" },
  removed:         { cls: "p-new", label: "Removed" },
  invalid:         { cls: "p-new", label: "Invalid lead" },
};
