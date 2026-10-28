/**
 * A message's web addresses, and Lighthouse pages written as their path
 * (/leads/123), found to show as links (Sean, Oct 2026: in place of a
 * separate Link box). Pure, for the message views and the tests.
 */
const PAGES = "leads|projects|clients|appointments|calendar|notifications|work|reports|list-builder|documents|bulletin|team|settings|explore|insurance-companies|account-managers|pay|qa";
const FIND = new RegExp(`(https?:\\/\\/[^\\s<>"']+[^\\s<>"'.,;:!?)\\]])|((?:^|(?<=\\s))\\/(?:${PAGES})(?:\\/[^\\s<>"']*[^\\s<>"'.,;:!?)\\]])?)`, "g");

/** The text in parts: { text } as written, or { href, internal } for a link. */
export function linkParts(text) {
  const t = String(text ?? "");
  const out = [];
  let at = 0;
  for (const m of t.matchAll(FIND)) {
    if (m.index > at) out.push({ text: t.slice(at, m.index) });
    out.push(m[1] ? { href: m[1], internal: false } : { href: m[2], internal: true });
    at = m.index + m[0].length;
  }
  if (at < t.length) out.push({ text: t.slice(at) });
  return out;
}
