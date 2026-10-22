/**
 * Meet the Team's pieces that are the same wherever they are used: the gifts
 * a birthday can bring (the database keeps the same keys: send_kudos()), the
 * filters by what people do, and a birthday as month and day (kept in 2000:
 * the year is never asked or shown).
 */

/** [key, emoji, label]: what can be sent on someone's birthday. */
export const GIFTS = [
  ["flowers", "💐", "Flowers"], ["cake", "🎂", "Birthday cake"], ["balloons", "🎈", "Balloons"],
  ["coffee", "☕", "Coffee"], ["chocolates", "🍫", "Chocolates"], ["present", "🎁", "A present"],
  ["pizza", "🍕", "Pizza party"], ["trophy", "🏆", "Trophy"], ["party", "🎉", "Party"],
];
export const giftOf = (key) => GIFTS.find(([k]) => k === key) ?? null;

/** The filters at the top of Meet the Team: [key, label, test(member)]. */
export const TEAM_FILTERS = [
  ["all", "Everyone", () => true],
  ["leads", "Lead developers", (m) => /Lead development/.test(m.does ?? "")],
  ["appts", "Appointment setters", (m) => /ppointment setting/.test(m.does ?? "")],
  ["admins", "Administrators", (m) => m.role === "admin"],
];

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A birthday from its month and day (1-based): "2000-MM-DD", null when either is missing; throws on a day the month lacks. */
export function birthdayOf(month, day) {
  const m = Number(month);
  const d = Number(day);
  if (!m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(2000, m, 0)).getUTCDate()) throw new Error("That day is not in that month");
  return `2000-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2000-03-14" -> "March 14". */
export const birthdayLabel = (iso) => (iso ? `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}` : null);

/** How long someone has been on the team, from the day they joined: "3 years", "8 months", "New this month". */
export function tenure(since, today) {
  if (!since || !today) return null;
  const months = (Number(today.slice(0, 4)) - Number(since.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(since.slice(5, 7))
    - (Number(today.slice(8, 10)) < Number(since.slice(8, 10)) ? 1 : 0);
  if (months < 1) return "New this month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}
