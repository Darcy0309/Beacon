// Form validation shared by the server actions (authoritative) and the client
// forms (instant feedback). Dependency-free so it runs in both places.
//
//   const { ok, errors } = validate(values, schema);
//   schema = { field: [rule, rule, ...] }
//
// Every rule except `required` passes on an empty value, so optional fields
// only get checked when the user actually typed something.

import { normalizeState } from "./csv.js";

const str = (v) => (v == null ? "" : String(v).trim());
const empty = (v) => str(v) === "";

export const rules = {
  required:
    (msg = "Required") =>
    (v) =>
      empty(v) ? msg : null,

  max:
    (n) =>
    (v) =>
      !empty(v) && str(v).length > n ? `Must be ${n} characters or fewer` : null,

  min:
    (n) =>
    (v) =>
      !empty(v) && str(v).length < n ? `Must be at least ${n} characters` : null,

  pattern:
    (re, msg) =>
    (v) =>
      !empty(v) && !re.test(str(v)) ? msg : null,

  email: (v) =>
    !empty(v) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(str(v)) ? "Enter a valid email address" : null,

  // Lenient North-American phone: 10 digits, optional +1, any common punctuation.
  phone: (v) => {
    if (empty(v)) return null;
    const digits = str(v).replace(/\D/g, "");
    const ok = (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) &&
      /^[+\d\s().-]+$/.test(str(v));
    return ok ? null : "Enter a valid phone number, e.g. (602) 555-0100";
  },

  date: (v) => {
    if (empty(v)) return null;
    const s = str(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "Enter a date as YYYY-MM-DD";
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "That date does not exist" : null;
  },

  time12: (v) =>
    !empty(v) && !/^(1[0-2]|0?[1-9]):[0-5]\d\s?(AM|PM)$/i.test(str(v)) ? "Enter a time like 9:30 AM" : null,

  int:
    ({ min = -Infinity, max = Infinity } = {}) =>
    (v) => {
      if (empty(v)) return null;
      const s = str(v).replace(/,/g, "");
      if (!/^-?\d+$/.test(s)) return "Enter a whole number";
      const n = Number(s);
      if (n < min) return `Must be at least ${min}`;
      if (n > max) return `Must be ${max} or less`;
      return null;
    },

  num:
    ({ min = -Infinity, max = Infinity } = {}) =>
    (v) => {
      if (empty(v)) return null;
      const s = str(v).replace(/[$,]/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(s)) return "Enter a number";
      const n = Number(s);
      if (n < min) return `Must be at least ${min}`;
      if (n > max) return `Must be ${max} or less`;
      return null;
    },

  /** A positive integer id from a <select>. */
  id: (v) => (!empty(v) && !/^[1-9]\d*$/.test(str(v)) ? "Choose a valid option" : null),

  oneOf:
    (list, msg = "Choose one of the listed options") =>
    (v) =>
      !empty(v) && !list.map(String).includes(str(v)) ? msg : null,

  stateCode: (v) =>
    !empty(v) && !normalizeState(str(v)) ? "Enter a US state code, e.g. AZ" : null,

  zip: (v) => (!empty(v) && !/^\d{5}(-\d{4})?$/.test(str(v)) ? "Enter a 5-digit ZIP code" : null),

  /** http(s) URL, or a site-relative path such as /logo.svg. */
  urlOrPath: (v) =>
    !empty(v) && !/^(https?:\/\/[^\s/$.?#].[^\s]*|\/[^\s]*)$/i.test(str(v))
      ? "Enter a URL starting with https:// or a path starting with /"
      : null,

  hostname: (v) =>
    !empty(v) && !/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(str(v))
      ? "Enter a hostname like smtp.example.com"
      : null,


  username: (v) =>
    !empty(v) && !/^[a-z0-9][a-z0-9._-]{2,24}$/i.test(str(v))
      ? "3–25 letters, numbers, dots, dashes or underscores"
      : null,

  /** Escape hatch: fn(value, allValues) => message | null */
  custom: (fn) => (v, all) => fn(v, all),
};

/**
 * Run a schema over a values object.
 * `cross(values, errors)` may add cross-field errors (e.g. end date before start).
 */
export function validate(values, schema, cross) {
  const errors = {};
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const msg = rule(values[field], values);
      if (msg) {
        errors[field] = msg;
        break; // first failing rule per field
      }
    }
  }
  if (cross) cross(values, errors);
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Pull the named fields out of a FormData into a plain object of trimmed strings. */
export function formValues(formData, fields) {
  const out = {};
  for (const f of fields) {
    const v = formData.get(f);
    out[f] = v == null ? "" : typeof v === "string" ? v.trim() : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schemas — one per form, shared by the action and the component.
// ---------------------------------------------------------------------------

export const ROLES = ["admin", "manager", "agent", "client"];
export const PAY_MODEL_KEYS = ["commission", "hybrid"];
export const ROUNDING_KEYS = ["hour_up", "day_up", "day_nearest", "none"];
export const PAY_PERIOD_KEYS = ["weekly", "biweekly", "semimonthly", "monthly"];
export const USER_STATUSES = ["active", "invited", "disabled"];
export const DURATIONS = ["15", "30", "45", "60", "90"];

/** Appointment start times offered in the forms, every half hour of the working day. */
export const APPOINTMENT_TIMES = [
  "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM",
  "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
];
const { required, max, email, phone, date, time12, int, num, id, oneOf, stateCode, zip, urlOrPath, hostname, username } = rules;

/**
 * A path inside this app, or the fallback. Used wherever a URL parameter
 * decides where to send someone after sign-in: "/leads/12" passes,
 * "//evil.example", "/\evil", "https://…" and anything with whitespace
 * do not — a browser would leave the site for all of them.
 */
export function safeInternalPath(value, fallback = "/") {
  const v = String(value ?? "").trim();
  return /^\/(?![/\\])[^\s\u0000-\u001f]*$/.test(v) ? v : fallback;
}

export const schemas = {
  login: {
    email: [required("Email is required"), email, max(120)],
    password: [required("Password is required"), max(200)],
  },

  lead: {
    company_name: [required("Company name is required"), max(120)],
    contact_name: [max(80)],
    contact_title: [max(60)],
    phone: [phone],
    email: [email, max(120)],
    website: [max(120)],
    address: [max(120)],
    city: [max(60)],
    state: [stateCode],
    zip: [zip],
    county: [max(60)],
    sic_code: [rules.pattern(/^\d{4}$/, "SIC codes are 4 digits, e.g. 6411")],
    description: [max(255)],
    list_source: [max(80)],
    employees: [int({ min: 0, max: 1000000 })],
    covered_employees: [int({ min: 0, max: 1000000 })],
    autos: [int({ min: 0, max: 100000 })],
    sales_volume: [max(30)],
    years_in_business: [int({ min: 0, max: 300 })],
    estimated_annual_premium: [max(30)],
    notes_dcm: [max(5000)],
    notes_client: [max(5000)],
    status_id: [id],
    project_id: [id],
    agency_id: [id],
    assigned_user_id: [id],
  },

  project: {
    name: [required("Project name is required"), max(120)],
    company_id: [id],
    project_type_id: [id],
    status_id: [id],
    appt_project_id: [id],
    description: [max(500)],
    client_name: [max(120)],
    amount_paid: [num({ min: 0, max: 100000000 })],
    start_date: [date],
    end_date: [date],
  },

  /** USD paid per lead, appointment and confirmation on a project. */
  projectRates: {
    lead_rate: [num({ min: 0, max: 10000 })],
    appointment_rate: [num({ min: 0, max: 10000 })],
    confirmation_rate: [num({ min: 0, max: 10000 })],
  },

  appointment: {
    lead_id: [required("Choose a lead"), id],
    appt_date: [required("Date is required"), date],
    appt_time: [required("Time is required"), time12],
    duration_min: [oneOf(DURATIONS, "Choose a duration")],
    status_id: [id],
    user_id: [id],
    rep_name: [max(80)],
  },

  user: {
    first_name: [max(40)],
    last_name: [max(40)],
    email: [required("Email is required"), email, max(120)],
    phone: [phone],
    role: [required("Choose a role"), oneOf(ROLES, "Choose a valid role")],
    status: [oneOf(USER_STATUSES)],
    username: [username],
    company_id: [id],
    // How an account manager or agent is paid. The hourly range is the one in Settings, checked by the database.
    pay_model: [oneOf(PAY_MODEL_KEYS, "Choose how they are paid")],
    hourly_rate: [num({ min: 0, max: 1000 })],
  },

  bulletin: {
    message: [required("Write something to post"), rules.min(3), max(100)],
    message_type: [oneOf(["IN", "AL"])],
    project_id: [id],
  },

  // A call result recorded from the lead sheet. What each result needs (an
  // appointment date, a corrected renewal date) is checked by
  // record_call_result() in the database, which knows what the result does.
  callResult: {
    lead_id: [required("Missing lead"), id],
    result_id: [required("Choose a call result"), id],
    project_id: [id],
    notes: [max(1000)],
    appt_date: [date],
    appt_time: [time12],
    duration_min: [oneOf(DURATIONS, "Choose a duration")],
    rep_name: [max(80)],
    corrected_xdate: [date],
    // A Lead or an Appointment needs it; the action says so when it is missing.
    ultimate_xdate: [date],
  },

  // Settings › Pay & time: the ranges project and hourly rates are picked from, and how time is counted.
  payRules: {
    lead_min: [required("Required"), num({ min: 0, max: 10000 })],
    lead_max: [required("Required"), num({ min: 0, max: 10000 })],
    lead_step: [required("Required"), num({ min: 0.01, max: 1000 })],
    appointment_min: [required("Required"), num({ min: 0, max: 10000 })],
    appointment_max: [required("Required"), num({ min: 0, max: 10000 })],
    appointment_step: [required("Required"), num({ min: 0.01, max: 1000 })],
    special_min: [required("Required"), num({ min: 0, max: 10000 })],
    special_max: [required("Required"), num({ min: 0, max: 10000 })],
    special_step: [required("Required"), num({ min: 0.01, max: 1000 })],
    hourly_min: [required("Required"), num({ min: 0, max: 1000 })],
    hourly_max: [required("Required"), num({ min: 0, max: 1000 })],
    idle_minutes: [required("Required"), int({ min: 1, max: 60 })],
    call_minutes: [required("Required"), int({ min: 0, max: 240 })],
    rounding: [required("Choose how time rounds"), oneOf(ROUNDING_KEYS)],
    round_to: [required("Required"), oneOf(["1", "5", "6", "10", "15", "30", "60"], "Choose 1, 5, 6, 10, 15, 30 or 60 minutes")],
    pay_period: [required("Choose the pay period"), oneOf(PAY_PERIOD_KEYS)],
    period_start: [required("Choose the day a pay period starts"), date],
  },

  csvImport: {
    project_id: [required("Choose the project these names go into"), id],
    list_source: [max(80)],
  },

  settings: {
    org_name: [required("Company name is required"), max(80)],
    product_name: [max(40)],
    logo: [urlOrPath, max(200)],
    mail_host: [hostname],
    mail_from: [email, max(120)],
    mail_provider: [max(40)],
  },

  // Set or change your own password. Matching is a cross-field rule below.
  password: {
    password: [required("Enter a new password"), rules.min(10), max(72)],
    confirm: [required("Type the new password again")],
  },

  // Direct messages. Recipients (roles, people) are multi-value and checked in the action.
  notification: {
    title: [required("Give the notification a title"), max(120)],
    body: [max(1000)],
    // Inside the app only, e.g. /leads/123 — never a link that leaves Lighthouse.
    link: [rules.pattern(/^\/(?![/\\])\S*$/, "Use a page inside Lighthouse, starting with /"), max(300)],
  },

  // A reply in a notification's conversation. The notification id is checked in the action.
  reply: {
    body: [required("Write a reply first"), max(1000)],
  },

  company: {
    name: [required("Company name is required"), max(120)],
    contact_name: [max(80)],
    contact_title: [max(60)],
    email: [email, max(120)],
    phone: [phone],
    address: [max(120)],
    city: [max(60)],
    state: [stateCode],
    zip: [zip],
    website: [max(120)],
    status: [oneOf(["active", "inactive"])],
  },
};

// Cross-field rules that a single-field schema cannot express.
export const cross = {
  password(values, errors) {
    if (!errors.password && !errors.confirm && values.password !== values.confirm) {
      errors.confirm = "The two passwords don't match";
    }
  },
  project(values, errors) {
    if (!errors.start_date && !errors.end_date && values.start_date && values.end_date &&
        values.end_date < values.start_date) {
      errors.end_date = "End date must be on or after the start date";
    }
  },
  user(values, errors) {
    // Client-portal users are scoped to a company by RLS; without one they see nothing.
    if (!errors.company_id && values.role === "client" && !values.company_id) {
      errors.company_id = "Client users must belong to a client account";
    }
    // Hybrid pay compares the hourly pay with the commission, so it needs a rate.
    if (!errors.hourly_rate && values.pay_model === "hybrid" && str(values.hourly_rate) === "") {
      errors.hourly_rate = "Hybrid pay needs an hourly rate";
    }
  },
  payRules(values, errors) {
    const amount = (k) => Number(str(values[k]).replace(/[$,]/g, ""));
    for (const kind of ["lead", "appointment", "special", "hourly"]) {
      if (!errors[`${kind}_min`] && !errors[`${kind}_max`] && amount(`${kind}_max`) < amount(`${kind}_min`)) {
        errors[`${kind}_max`] = "Must be at least the lowest rate";
      }
    }
  },
  appointment(values, errors) {
    if (!errors.appt_date && values.appt_date) {
      const d = new Date(`${values.appt_date}T00:00:00Z`);
      const floor = new Date(); floor.setUTCFullYear(floor.getUTCFullYear() - 1);
      const ceil = new Date(); ceil.setUTCFullYear(ceil.getUTCFullYear() + 2);
      if (d < floor) errors.appt_date = "That date is more than a year in the past";
      else if (d > ceil) errors.appt_date = "That date is more than two years out";
    }
  },
};

