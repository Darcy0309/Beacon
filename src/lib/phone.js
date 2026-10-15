// The phone in Lighthouse (Oct 2026): what is dialed, as it is typed and as
// it is called, and the keypad. Pure, so the phone and the tests share it.

/** The keypad: each key, and the letters under it. */
export const KEYS = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
];

/** What can be dialed, from anything typed or pasted: digits, *, # and a leading +. At most 20. */
export function dialable(text) {
  const s = String(text ?? "");
  const plus = s.trim().startsWith("+") ? "+" : "";
  return (plus + s.replace(/[^\d*#]/g, "")).slice(0, 20);
}

/**
 * A number as it reads while it is dialed: a US number grouped as it grows
 * ("602", "(602) 555", "(602) 555-0144"; with its leading 1, "1 (602)
 * 555-0144"); anything else (short codes, *, #, +44…) as typed.
 */
export function formatDial(value) {
  const v = dialable(value);
  if (!v || /[*#+]/.test(v)) return v;
  const lead = v.length === 11 && v.startsWith("1") ? "1 " : "";
  const d = lead ? v.slice(1) : v;
  if (d.length > 10) return v;
  if (d.length <= 3) return lead + d;
  if (d.length <= 6) return `${lead}(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `${lead}(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** A dialed number as a tel: link, US numbers with their country code. Null for none. */
export function telOf(value) {
  const v = dialable(value);
  if (!v) return null;
  const n = /^\d{10}$/.test(v) ? `+1${v}` : /^1\d{10}$/.test(v) ? `+${v}` : v;
  return `tel:${n}`;
}

/** The number in a tel: link (what a Call button holds), its extension left off: "6025550144". */
export function numberOfTel(href) {
  const m = /^tel:\+?1?(\d{10})\b/.exec(String(href ?? "").replace(/[\s().-]/g, ""));
  if (m) return m[1];
  return dialable(String(href ?? "").replace(/^tel:/, "").split(",")[0]);
}

/** Ten digits a lead search can match ("+16025550144" → "6025550144"); null for anything shorter. */
export function searchDigits(value) {
  const d = dialable(value).replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? ten : null;
}

/** A call's length: "0:07", "12:30", "1:02:03". */
export function callClock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
