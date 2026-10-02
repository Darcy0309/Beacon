// The explorer's criteria live in the URL as comma-separated lists —
//   /explore?sic=1711&zips=85018,85016&months=7
// so a question worth asking twice can be bookmarked, and a list someone
// wants can be sent as a link rather than exported and emailed.

export const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

/** The most leads one CSV export holds; beyond this, narrow the question. */
export const EXPORT_LIMIT = 10000;

/** Every criterion, in the order the panel lays them out. */
export const FIELDS = [
  { key: "sic", label: "Industry", options: "industries", hint: "SIC code" },
  { key: "months", label: "Renewal month", options: "months", hint: "Ultimate X-date, else the soonest line" },
  { key: "states", label: "State", options: "states" },
  { key: "counties", label: "County", options: "counties" },
  { key: "statuses", label: "Status", options: "statuses" },
  { key: "clients", label: "Client", options: "clients" },
  { key: "carriers", label: "Current carrier", options: "carriers" },
  { key: "reps", label: "Assigned rep", options: "reps" },
];

const LIST_KEYS = FIELDS.map((f) => f.key);

// Keys whose values are numbers in the database. Anything else typed into
// the URL is dropped here rather than reaching Postgres as a cast error.
// (Carriers are named by carrier_key(), "the hartford"; an old link's
// numeric carrier id still works too.)
const VALID = {
  months: (v) => /^(?:[1-9]|1[0-2])$/.test(v),
  clients: (v) => /^\d{1,12}$/.test(v),
  reps: (v) => /^\d{1,12}$/.test(v),
};

const list = (key, v) =>
  [
    ...new Set(
      String(v ?? "")
        .split(",")
        .map((s) => s.trim().slice(0, 80))
        .filter((s) => s && (VALID[key] ? VALID[key](s) : true))
    ),
  ].slice(0, 50);

/** Read the criteria out of a page's searchParams. */
export function readCriteria(sp) {
  const criteria = {};
  for (const key of LIST_KEYS) {
    const values = list(key, sp?.[key]);
    if (values.length) criteria[key] = values;
  }
  // ZIPs are typed, not picked: "85018 85016" and "85018,85016" both work.
  const zips = String(sp?.zips ?? "")
    .split(/[\s,;]+/)
    .map((z) => z.trim().slice(0, 5))
    .filter((z) => /^\d{5}$/.test(z))
    .slice(0, 100);
  if (zips.length) criteria.zips = [...new Set(zips)];

  const q = String(sp?.q ?? "").trim().slice(0, 100);
  if (q) criteria.q = q;
  return criteria;
}

/** True when nothing is selected — the explorer opens on the whole book. */
export const isEmpty = (criteria) => Object.keys(criteria).length === 0;

/** Criteria back to a query string, for links and the CSV export. */
export function criteriaToParams(criteria, extra = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(criteria)) {
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value != null && value !== "") params.set(key, String(value));
  }
  return params;
}

/** A plain-English summary of what is being asked, for the results header. */
export function describe(criteria, options) {
  if (isEmpty(criteria)) return "Every lead in the book";
  const labelFor = (field, value) => {
    const source = field.options === "months" ? MONTHS : options?.[field.options] ?? [];
    return source.find((o) => String(o.value) === String(value))?.label ?? value;
  };
  const parts = [];
  for (const field of FIELDS) {
    const values = criteria[field.key];
    if (values?.length) parts.push(`${field.label.toLowerCase()}: ${values.map((v) => labelFor(field, v)).join(", ")}`);
  }
  if (criteria.zips?.length) parts.push(`ZIP: ${criteria.zips.join(", ")}`);
  if (criteria.q) parts.push(`matching “${criteria.q}”`);
  return parts.join(" · ");
}
