/**
 * Which days each dashboard card shows, read from the address: a period
 * (`keyParam`: day, pay period, week or month, of `keys`) around a day
 * (`dateParam`, today by default; never a day still to come).
 */

import { formatIso, formatRange, isIsoDate } from "@/lib/dates";
import { stepView, viewRange } from "@/lib/pay";

export function readView(sp, { keyParam, dateParam, keys, today, time }) {
  const key = keys.includes(sp?.[keyParam]) ? sp[keyParam] : keys[0];
  const raw = sp?.[dateParam];
  const anchor = typeof raw === "string" && isIsoDate(raw) && raw <= today ? raw : today;
  const range = viewRange(key, anchor, time);
  const next = stepView(range, 1);
  const label =
    key === "day" ? (anchor === today ? `Today · ${formatIso(anchor, "short")}` : formatIso(anchor, "long"))
    : key === "month" ? formatIso(range.from, "month")
    : formatRange(range.from, range.to);
  return {
    key, anchor, range, label, today,
    prev: stepView(range, -1),
    next: next <= today ? next : null,
    showsToday: today >= range.from && today <= range.to,
    // Up to today: the days still to come in a week or month have nothing in them yet.
    through: range.to < today ? range.to : today,
  };
}

/** The address's other values, to keep when one card changes its own. */
export function otherParams(sp, ...drop) {
  return Object.fromEntries(Object.entries(sp ?? {}).filter(([k, v]) => !drop.includes(k) && typeof v === "string"));
}
