/**
 * The Pipeline by Month (Sean, Nov 2026: the old system's pipeline sheet), from
 * the leads by renewal month (getXdatesByMonth()): each month's total, those
 * off the list (resolved, appointments and invalid ones among them), those
 * still viable, the appointments projected at the project's rate (20% unless
 * set), and those set, with each month's conversion and the overall one.
 * Pure, so the page and the tests share it.
 */

export const DEFAULT_CONVERSION = 20;

const pctOf = (n, total) => (total ? Math.round((n / total) * 100) : null);

/**
 * `months`: [{ month, short, total, appointment, off, viable }] (January first);
 * `rate`: the projected % (none: 20). Returns { rate, months: [{ month, short,
 * total, off, viable, projected, conversion, appointments }], total: the same
 * over the year, overall: the year's conversion %, or null without leads }.
 */
export function pipelineByMonth(months, rate) {
  const r = rate == null || rate === "" || !Number.isFinite(Number(rate)) ? DEFAULT_CONVERSION : Number(rate);
  const row = (m) => ({
    month: m.month, short: m.short, total: m.total,
    off: m.off + m.appointment,
    viable: m.viable,
    projected: Math.round((m.total * r) / 100),
    conversion: pctOf(m.appointment, m.total),
    appointments: m.appointment,
  });
  const rows = (months ?? []).map(row);
  const sum = (k) => (months ?? []).reduce((n, m) => n + m[k], 0);
  const total = row({ month: null, short: "Total", total: sum("total"), appointment: sum("appointment"), off: sum("off"), viable: sum("viable") });
  return { rate: r, months: rows, total, overall: total.conversion };
}
