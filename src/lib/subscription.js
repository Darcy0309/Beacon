/**
 * How near a client's subscription is to its end (the old client bulletin's
 * warning, within 30 days). Days are "YYYY-MM-DD", in business time.
 *
 *   subscriptionNotice(end, today)  null when there is no end date or it is
 *     more than WARN_DAYS off; else { daysLeft, ended, text }
 */

export const WARN_DAYS = 30;

const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

export function subscriptionNotice(end, today, warnDays = WARN_DAYS) {
  if (!end || !today || !/^\d{4}-\d{2}-\d{2}/.test(end) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null;
  const daysLeft = dayNumber(end.slice(0, 10)) - dayNumber(today.slice(0, 10));
  if (daysLeft > warnDays) return null;
  const ended = daysLeft < 0;
  const text = ended
    ? `ended ${-daysLeft === 1 ? "yesterday" : `${-daysLeft} days ago`}`
    : daysLeft === 0 ? "ends today" : daysLeft === 1 ? "ends tomorrow" : `ends in ${daysLeft} days`;
  return { daysLeft, ended, text };
}
