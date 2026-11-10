/**
 * The tile charts name their bars along the foot (client, Nov 2026: "I don't know what the bars
 * represent"): on the dashboard, Day by the hour, Week by its days, Month and Pay by their dates;
 * on Projects, what each bar is, with a line saying so.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const browser = await launchBrowser({ mouse: true });
const labels = (page, tile) => page.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((p) => p.querySelector('.stat-label')?.textContent.trim() === ${JSON.stringify(tile)});
  return t ? { labels: [...t.querySelectorAll('[data-axis-label]')].map((l) => l.dataset.axisLabel), caption: t.querySelector('[data-chart-caption]')?.textContent ?? null } : null; })()`);

try {
  const admin = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 1000 });

  section("The dashboard: what the managers developed, by the period picked");
  await admin.go("/?tl=week&ta=day", 9000);
  const week = await labels(admin, "Leads");
  check("Week: the days across the bottom", week?.labels.join() === "Mon,Tue,Wed,Thu,Fri,Sat,Sun", JSON.stringify(week));
  const day = await labels(admin, "Appointments");
  check("Day: the hours", day?.labels[0] === "8a" && day.labels.filter(Boolean).includes("12p") && day.labels.at(-1) !== undefined, JSON.stringify(day));
  await admin.go("/?tl=month", 9000);
  const month = await labels(admin, "Leads");
  const days = Number(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate());
  check("Month: its dates, every few of them named", month?.labels.length >= 28 && month.labels[0] === "1" && month.labels.filter(Boolean).length <= 8, JSON.stringify(month));
  check("…and the tooltip names each day in full", Boolean(await admin.ev(`(() => { const t = [...document.querySelectorAll('[data-panel]')].find((p) => p.querySelector('.stat-label')?.textContent.trim() === 'Leads');
    return t?.querySelectorAll('[data-tip]').length >= 28; })()`)), String(days));

  section("Projects: what each bar is");
  await admin.go("/projects", 8000);
  await sleep(500);
  const kinds = await labels(admin, "Appointment Setting");
  check("Appointment Setting: appointment and DB dev projects", kinds?.labels.join() === "Appts,DB Dev" && kinds.caption === "Projects by kind", JSON.stringify(kinds));
  const status = await labels(admin, "Active Campaigns");
  check("Active Campaigns: projects by status", status?.labels.includes("Active") && status.caption === "Projects by status", JSON.stringify(status));
  const leads = await labels(admin, "Leads Across Campaigns");
  check("Leads Across Campaigns: the projects by name", leads?.labels.length >= 1 && leads.labels.length <= 8 && /^Leads by project/.test(leads.caption ?? ""), JSON.stringify(leads));

  section("A manager's own tiles");
  const sean = await (await browser.newContext({ as: "sean@beacon.test" })).newPage({ width: 1440, height: 1000 });
  await sean.go("/?ap=week", 9000);
  const calls = await labels(sean, "Calls Today");
  check("Calls Today: the last seven days by name", calls?.labels.length === 7 && calls.labels.every((l) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(l)), JSON.stringify(calls));
  const appts = await labels(sean, "Appointments");
  check("Appointments on Week: Mon to Sun", appts?.labels.join() === "Mon,Tue,Wed,Thu,Fri,Sat,Sun", JSON.stringify(appts));
} finally {
  browser.close();
}

finish("tile axis");
