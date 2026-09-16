// Presentation constants for the Beacon UI.
//
// The record data that used to live here now comes from Postgres via
// lib/queries.js — these are the display-only values the components share.

export const STATUS = {
  appt:    { cls: 'p-appt',    label: 'Phone appointment' },
  survey:  { cls: 'p-survey',  label: 'Survey appointment' },
  hot:     { cls: 'p-hot',     label: 'X-date hot lead' },
  xdate:   { cls: 'p-xdate',   label: 'X-date lead' },
  profile: { cls: 'p-profile', label: 'X-date profile' },
  new:     { cls: 'p-new',     label: 'New' },
};

export const clientSlug = (name) =>
  String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
