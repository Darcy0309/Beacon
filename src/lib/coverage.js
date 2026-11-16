// A name's coverage: its policy lines and the carrier names suggested while
// typing one. Dependency-free so the page, the form and the server share it.

/**
 * The policy lines on a lead sheet, each an X-date and a carrier on the
 * name's insurance_details row. `always`: listed even when empty, as the
 * client asked; the rest show once they have something.
 */
export const POLICY_LINES = [
  // The client's "Liability" X-date: the package (general liability) policy.
  { key: "pkg", label: "Liability / Package", date: "pkg_xdate", carrier: "pkg_carrier", always: true },
  { key: "wc", label: "Workers comp", date: "wc_xdate", carrier: "wc_carrier", always: true },
  { key: "auto", label: "Auto", date: "auto_xdate", carrier: "auto_carrier", always: true },
  { key: "health", label: "Group health", date: "health_xdate", carrier: "health_carrier", always: true },
  { key: "personal", label: "Personal lines", date: "personal_lines_xdate", carrier: "personal_lines_carrier", always: true },
  // The rest, the professional lines first (Sean, Oct 2026).
  { key: "prof", label: "Prof. liability", date: "prof_liab_xdate", carrier: "prof_liab_carrier" },
  { key: "do", label: "D&O", date: "do_xdate", carrier: "do_carrier" },
  { key: "eo", label: "E&O", date: "eo_xdate", carrier: "eo_carrier" },
  { key: "dental", label: "Dental", date: "dental_xdate", carrier: "dental_provider" },
  { key: "vision", label: "Vision", date: "vision_xdate", carrier: "vision_provider" },
];

/** A carrier name as two spellings of it compare: lower case, letters and digits only. */
export const carrierKey = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The carriers to suggest for what someone has typed, best first: names
 * that start with it, then names with a word that does, then names that
 * contain it anywhere. Case and punctuation do not matter.
 */
export function suggestCarriers(options, typed, limit = 8) {
  const t = String(typed ?? "").trim().toLowerCase();
  if (!t) return [];
  const k = carrierKey(t);
  const scored = [];
  for (const name of options) {
    const lower = name.toLowerCase();
    const rank = lower.startsWith(t) || carrierKey(name).startsWith(k) ? 0
      : lower.split(/[^a-z0-9]+/).some((w) => w.startsWith(t)) ? 1
      : k && carrierKey(name).includes(k) ? 2
      : -1;
    if (rank >= 0) scored.push([rank, name]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, limit).map(([, name]) => name);
}

/**
 * Carrier names from an imported sheet: the column headed Carrier, Name,
 * Company or Insurance Company, else the first; blanks and repeats (by
 * carrierKey) dropped.
 */
export function carrierNamesFromRows(rows) {
  if (!rows.length) return [];
  const head = rows[0].map((h) => carrierKey(h));
  const at = head.findIndex((h) => ["carrier", "carriername", "name", "company", "insurancecompany", "companyname"].includes(h));
  const body = at >= 0 ? rows.slice(1) : rows;
  const col = Math.max(at, 0);
  const seen = new Set();
  const names = [];
  for (const row of body) {
    const name = String(row[col] ?? "").replace(/\s+/g, " ").trim();
    const key = carrierKey(name);
    if (!key || seen.has(key) || name.length > 120) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// The words a carrier's name is written with or without: "Auto Owners Mutual Ins Co", "the Travelers Cos", "Selective Ins Group".
const CARRIER_FILLER = new Set(["the", "of", "and", "insurance", "ins", "insur", "company", "companies", "co", "cos", "corp",
  "corporation", "inc", "llc", "group", "grp", "mutual", "mut", "assurance"]);

/** A carrier's name without case, punctuation or its filler words: "Auto-Owners Insurance" and "auto owners mutual ins co" are both "autoowners". */
export function carrierCore(name) {
  const words = String(name ?? "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);
  const kept = words.filter((w) => !CARRIER_FILLER.has(w));
  return (kept.length ? kept : words).join("");
}

/** How many letters apart two names are (a letter added, dropped, changed or two swapped), or more than `most` once past it. */
function lettersApart(a, b, most) {
  if (Math.abs(a.length - b.length) > most) return most + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1);
    }
    if (Math.min(...row) > most) return most + 1;
    [prev2, prev] = [prev, row];
  }
  return prev[b.length];
}

/**
 * The carrier on the Insurance Companies list a name written on an old list is (Sean, Nov 2026: "if whatever is
 * in the old system's carrier fields isn't a similar match to the master list of carriers, it just imports blank"):
 * the list's own spelling, or null. Similar is the same name without its filler words ("hartford ins" for The
 * Hartford), a longer form of it ("Travelers Casualty"), the start of one long enough to say which ("cincinnati"
 * for Cincinnati Financial), or a slip of a letter or two ("cincinatti", "aquity"). Two carriers as near as each
 * other: neither, rather than the wrong one. Each name written is worked out once.
 */
export function carrierMatcher(names) {
  const list = [];
  const byCore = new Map();
  for (const name of names ?? []) {
    const core = carrierCore(name);
    if (!core || byCore.has(core)) continue;
    byCore.set(core, name);
    list.push({ core, name });
  }
  const seen = new Map();
  return (written) => {
    const core = carrierCore(written);
    if (seen.has(core)) return seen.get(core);
    let found = null;
    if (core.length >= 2) {
      found = byCore.get(core) ?? null;
      if (!found) {
        // Nearest first: a longer form of a listed name (the longest it starts with), the start of one, then a slip.
        let best = Infinity;
        let tied = false;
        for (const c of list) {
          const rank = c.core.length >= 4 && core.startsWith(c.core) ? 1 - c.core.length / 1000
            : core.length >= 5 && c.core.startsWith(core) ? 2
            : (() => {
              const shorter = Math.min(core.length, c.core.length);
              // Two letters only in a long name: "acrisure" (a broker) is two from Amerisure.
              const most = shorter >= 10 ? 2 : shorter >= 5 ? 1 : 0;
              const d = most ? lettersApart(core, c.core, most) : most + 1;
              return d <= most ? 2 + d : Infinity;
            })();
          if (rank < best) [best, found, tied] = [rank, c.name, false];
          else if (rank === best && rank !== Infinity && c.name !== found) tied = true;
        }
        if (tied) found = null;
      }
    }
    seen.set(core, found);
    return found;
  };
}
