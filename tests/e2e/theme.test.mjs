/**
 * Dropdowns follow the app's theme. The list a <select> opens used to be the
 * operating system's (grey, with a blue highlight) whatever the theme; it
 * now uses the app's colours, light and dark. Checked by opening a dropdown
 * in each theme and reading the open list's colours against the theme's.
 *
 *   npm run test:e2e      (SHOTS=<dir> to keep screenshots)
 */
import { check, finish, section, sleep, until } from "../support/assert.mjs";
import { launchBrowser } from "../support/browser.mjs";

const SHOTS = process.env.SHOTS;
const browser = await launchBrowser();
const ROWS = "select:has(option[value='100'])";

try {
  for (const theme of ["dark", "light"]) {
    section(`${theme[0].toUpperCase()}${theme.slice(1)} theme`);
    const page = await (await browser.newContext({ as: "admin@beacon.test" })).newPage({ width: 1440, height: 900 });
    await page.go("/login", 1500);
    await page.ev(`localStorage.setItem('theme', '${theme}')`);
    await page.go("/explore", 5000);
    check(`the page is in the ${theme} theme`, await page.ev(`document.documentElement.classList.contains('dark') === ${theme === "dark"}`));

    await page.ev(`document.querySelector("${ROWS}").scrollIntoView({ block: 'center' })`);
    await sleep(200);
    await page.mouseClick(ROWS);
    check("a dropdown opens", await until(() => page.ev(`document.querySelector("${ROWS}").matches(':open')`), { timeout: 2000 }));
    await sleep(250);
    const look = await page.ev(`(() => {
      const s = document.querySelector("${ROWS}");
      const list = getComputedStyle(s, '::picker(select)');
      const token = (name) => { const p = document.createElement('div'); p.style.color = 'var(' + name + ')'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; };
      return { listBg: list.backgroundColor, listText: list.color, popover: token('--popover'), popoverText: token('--popover-foreground'),
        checked: getComputedStyle(s.querySelector('option:checked')).color, primary: token('--primary') };
    })()`);
    check("its list has the theme's background", look.listBg === look.popover, JSON.stringify(look));
    check("…and the theme's text", look.listText === look.popoverText, `${look.listText} vs ${look.popoverText}`);
    check("the chosen option is marked in the theme's accent", look.checked === look.primary, `${look.checked} vs ${look.primary}`);
    if (SHOTS) await page.screenshot(`${SHOTS}/theme-dropdown-${theme}.png`);

    await page.key("ArrowDown");
    await page.key("Enter");
    check("the keyboard still picks an option (20 rows a page)", await until(async () => (await page.url()).includes("per=20"), { timeout: 5000 }), await page.url());
  }
} finally {
  browser.close();
}

finish("theme");
