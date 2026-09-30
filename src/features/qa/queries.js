/** Quality QA: reviewed calls. */

import "server-only";
import { shortDate, shortName } from "@/lib/format";
import { inner, one, paged, runPaged } from "@/lib/server/query-helpers";
import { createClient } from "@/lib/supabase/server";

export const QA_RESULT_OPTIONS = ["Passed", "Review", "Failed"].map((v) => ({ value: v, label: v }));

const toQaView = (c) => ({
  id: c.id,
  rep: shortName(one(c.user)),
  client: one(c.lead)?.company_name ?? "—",
  score: c.qa_score ?? 0,
  result: c.qa_result ?? "Review",
  date: shortDate(c.call_date),
});

/**
 * One page of scored calls, plus every score for the tiles and the reps
 * who appear in the scored calls, for the rep facet. Search matches the
 * lead's company name; the rep facet filters by user id.
 */
export async function listQaCalls(params) {
  const supabase = await createClient();
  const searching = Boolean(params.q);
  const [{ rows, total }, { data: scores }, { data: reps }] = await Promise.all([
    runPaged(
      (p) =>
        paged(
          supabase
            .from("call_records")
            .select(
              `id, call_date, qa_score, qa_result, user:users(id, first_name, last_name, email), lead:leads${inner(searching)}(company_name)`,
              { count: "exact" }
            )
            .not("qa_score", "is", null)
            .order("call_date", { ascending: false })
            .order("id", { ascending: false }),
          p,
          { search: ["company_name"], table: "lead", columns: { result: "qa_result", rep: "user_id" } }
        ),
      params
    ),
    supabase.from("call_records").select("qa_score, qa_result").not("qa_score", "is", null),
    supabase.from("users").select("id, first_name, last_name, email").in("role", ["manager", "agent"]).order("id"),
  ]);

  return {
    rows: rows.map(toQaView),
    total,
    stats: (scores ?? []).map((c) => ({ score: c.qa_score ?? 0, result: c.qa_result ?? "Review" })),
    reps: (reps ?? []).map((u) => ({ value: String(u.id), label: shortName(u) })),
  };
}
