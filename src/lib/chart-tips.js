/**
 * Tooltips for charts drawn on the server and shown by TipLayer
 * (components/shared/tip-layer.jsx). Plain data, so a server page can hand
 * them to it.
 */

import { formatIso } from "./dates.js";

/**
 * The six-month leads and appointments bars, keyed by month ("2026-09"):
 * the month and year, and each bar's figure. `labels` names the two bars.
 */
export function monthBarTips(months, labels = { leads: "Leads", appts: "Appointments" }) {
  return Object.fromEntries(
    (months ?? []).map((m) => [
      m.key,
      {
        title: formatIso(`${m.key}-01`, "month"),
        rows: [
          { key: "leads", label: labels.leads, color: "var(--neon-cyan)", value: Number(m.leads ?? 0).toLocaleString() },
          { key: "appts", label: labels.appts, color: "var(--neon-emerald)", value: Number(m.appts ?? 0).toLocaleString() },
        ],
      },
    ])
  );
}
