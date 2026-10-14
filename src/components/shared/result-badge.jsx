import ToneBadge from "@/components/shared/tone-badge";

/**
 * Where a name stands: its call result (call_results), the same words the
 * call result buttons use. The old system's statuses are not shown: they
 * followed the old results and no longer say anything the result does not.
 * `result`: { name, viable } or null for a name not called yet.
 */
export function resultTone(result) {
  if (!result) return "slate";
  if (/^appointment/i.test(result.name)) return result.viable === false ? "rose" : "violet";
  if (/^lead/i.test(result.name)) return result.viable === false ? "slate" : "emerald";
  return result.viable === false ? "slate" : "cyan";
}

export default function ResultBadge({ result }) {
  return <ToneBadge tone={resultTone(result)}>{result?.name ?? "Not called yet"}</ToneBadge>;
}
