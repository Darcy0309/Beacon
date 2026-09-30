/**
 * The whole test vocabulary: named checks that print ✓ / ✗ and keep going,
 * waiting for something to become true, and one exit code at the end.
 */
let failures = 0;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function section(title) {
  console.log(`\n== ${title} ==`);
}

/** Record one expectation. `detail` is printed alongside, to explain a failure. */
export function check(label, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail !== "" && detail != null ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
  return Boolean(ok);
}

/** Poll `fn` until it returns something truthy, or give up and return its last value. */
export async function until(fn, { timeout = 6000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout;
  let value;
  do {
    value = await fn();
    if (value) return value;
    await sleep(interval);
  } while (Date.now() < deadline);
  return value;
}

/** Print the verdict and exit with it. */
export function finish(name) {
  console.log(failures ? `\n${failures} check(s) failed` : `\nAll ${name} checks passed.`);
  process.exit(failures ? 1 : 0);
}
