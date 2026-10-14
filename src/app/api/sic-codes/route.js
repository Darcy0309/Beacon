import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const cell = (v) => (/[",\r\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));

/**
 * The SIC master list as a CSV (SIC Code, SIC Description), for anyone
 * signed in; with ?format=json, as { codes: [{ code, description }] } for a
 * form's list to pick from.
 */
export async function GET(request) {
  const supabase = await createClient();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sic_codes").select("code, description").order("code").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  if (new URL(request.url).searchParams.get("format") === "json") {
    return NextResponse.json({ codes: rows }, { headers: { "cache-control": "private, max-age=300" } });
  }
  const csv = ["SIC Code,SIC Description", ...rows.map((r) => `${cell(r.code)},${cell(r.description)}`)].join("\r\n");
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sic-codes.csv"' },
  });
}
