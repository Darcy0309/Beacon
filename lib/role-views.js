// What each role sees on the dashboard and the reports page.
//
// The *data* is already scoped by Row Level Security — a client's queries only
// ever count their own records. This decides which panels are worth showing to
// whom, and how the same numbers are framed.
//
// Why clients get months rather than weeks: Signature works a client's account
// one or two weeks in a month, so a weekly activity line reads as "nothing is
// happening" on the quiet weeks. Monthly totals and cumulative campaign
// progress tell the client what they actually bought.

const INTERNAL = {
  // Volume over time: "weeks" = the 8-week activity line, "months" = 6 monthly totals.
  trend: "weeks",
  // Per-rep appointment bars. Internal staffing detail — never shown to clients.
  reps: true,
  // Cumulative leads delivered per campaign.
  campaigns: false,
  // Lead status mix.
  statusMix: false,
  // "Your numbers" alongside the team's.
  myPerformance: false,
};

export const DASHBOARD = {
  admin: { ...INTERNAL, audience: "company" },
  manager: { ...INTERNAL, audience: "accounts" },
  agent: { ...INTERNAL, audience: "own", myPerformance: true },
  client: { trend: "months", reps: false, campaigns: true, statusMix: true, myPerformance: false, audience: "client" },
};

// Account managers and agents both set appointments, so both get their own
// numbers next to the team's; admins are looking at the team, not themselves.
export const REPORTS = {
  admin: { reps: true, states: true, outcomes: true, myPerformance: false },
  manager: { reps: true, states: true, outcomes: true, myPerformance: true },
  agent: { reps: true, states: true, outcomes: true, myPerformance: true },
  client: { reps: false, states: true, outcomes: true, myPerformance: false },
};

export const dashboardView = (role) => DASHBOARD[role] ?? DASHBOARD.client;
export const reportsView = (role) => REPORTS[role] ?? REPORTS.client;
