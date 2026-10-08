/**
 * Every form dialog fits the screen: on a short laptop screen and on a
 * phone, Save and Cancel are inside the box and can be clicked, the fields
 * scrolling above them when there are more than fit.
 *
 * Opens the longest forms and changes nothing.
 *
 *   npm run test:e2e
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { sql } from "../support/db.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SEAN = sql("select first_name || ' ' || last_name from public.users where email = 'sean@beacon.test'") || "Sean Fitzgerald";

const FORMS = [
  { name: "Edit user", path: "/users", open: (p) => p.pointer(`button[aria-label="Actions for ${SEAN}"]`).then(() => sleep(300)).then(() => p.menuItem("Edit")) },
  { name: "Invite user", path: "/users", open: (p) => p.click("button", "Invite user") },
  { name: "New project", path: "/projects", open: (p) => p.click("button", "New project") },
  { name: "New lead", path: "/leads", open: (p) => p.click("button", "New lead") },
  { name: "New appointment", path: "/appointments", open: (p) => p.click("button", "New appointment") },
  { name: "Add carrier", path: "/insurance-companies", open: (p) => p.click("[data-add-carrier]") },
];

// Where the box, its footer and the submit button are, and whether the button is what a click there would hit.
const MEASURE = `(() => {
  const box = document.querySelector('[data-dialog-content]');
  const foot = box?.querySelector('[data-dialog-footer]');
  const save = foot?.querySelector('button[type=submit]') ?? foot?.querySelector('button:last-child');
  if (!box || !save) return null;
  const b = box.getBoundingClientRect(), s = save.getBoundingClientRect();
  const hit = document.elementFromPoint(s.x + s.width / 2, s.y + s.height / 2);
  return { inside: s.top >= b.top && s.bottom <= b.bottom + 0.5, onScreen: b.top >= 0 && b.bottom <= innerHeight,
           clickable: Boolean(hit && save.contains(hit)), scrolls: box.scrollHeight > box.clientHeight + 1,
           box: [Math.round(b.top), Math.round(b.bottom)], save: [Math.round(s.top), Math.round(s.bottom)] };
})()`;

const browser = await launchBrowser();

try {
  const admin = await browser.newContext({ as: "admin@beacon.test" });
  for (const [label, size] of [["A short laptop screen (1280×600)", { width: 1280, height: 600 }], ["A phone (390×640)", { width: 390, height: 640 }]]) {
    section(label);
    const page = await admin.newPage(size);
    for (const form of FORMS) {
      await page.go(form.path, 3000);
      await form.open(page);
      const m = await until(() => page.ev(MEASURE), { timeout: 5000 });
      check(`${form.name}: Save is inside the box, on screen and clickable${m?.scrolls ? " (the fields scroll)" : ""}`,
        Boolean(m?.inside && m.onScreen && m.clickable), JSON.stringify(m));
      if (m?.scrolls) {
        await page.ev(`document.querySelector('[data-dialog-content]').scrollTop = 1e6`);
        await sleep(150);
        const end = await page.ev(MEASURE);
        check("…and still there scrolled to the end", Boolean(end?.inside && end.clickable), JSON.stringify(end));
      }
      await page.key("Escape");
      await sleep(250);
    }
  }
} finally {
  browser.close();
}

finish("dialogs");
