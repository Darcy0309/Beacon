// Presentation constants. The lead status codes mirror the legacy LEADSTATUS
// table, which is seeded with these same codes in supabase/seed.sql.

export const STATUS = {
  appt: { label: "Phone appointment" },
  survey: { label: "Survey appointment" },
  hot: { label: "X-date hot lead" },
  xdate: { label: "X-date lead" },
  profile: { label: "X-date profile" },
  new: { label: "New" },
};

/** Tailwind tone for a lead status code. */
export const STATUS_TONE = {
  appt: "emerald",
  survey: "teal",
  hot: "rose",
  xdate: "sky",
  profile: "amber",
  new: "slate",
};

/** Accent bar colour used in appointment lists. */
export const STATUS_BAR = {
  appt: "bg-emerald-500",
  survey: "bg-teal-500",
  hot: "bg-rose-500",
  xdate: "bg-sky-500",
  profile: "bg-amber-500",
  new: "bg-slate-400",
};

/** Tone for appointment status names. */
export const APPT_TONE = {
  Scheduled: "sky",
  Confirmed: "emerald",
  Held: "teal",
  Rescheduled: "amber",
  Cancelled: "rose",
  "No Show": "slate",
};

export const PROJECT_TONE = {
  Active: "emerald",
  Paused: "amber",
  Draft: "slate",
  Completed: "sky",
};

export const ROLE_TONE = {
  admin: "primary",
  manager: "teal",
  agent: "sky",
  client: "slate",
};

export const FB_TONE = {
  Open: "amber",
  "In review": "sky",
  Resolved: "emerald",
  Closed: "slate",
};

export const IMPORT_TONE = {
  completed: "emerald",
  processing: "sky",
  pending: "amber",
  failed: "rose",
};

export const DOC_TONE = { PDF: "rose", DOCX: "sky", CSV: "emerald", PNG: "teal" };
