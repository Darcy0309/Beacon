import { NextResponse } from "next/server";
import { listLeadFiles } from "@/features/leads/files";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** A lead's policy files, for whoever can see the lead (Row Level Security decides). */
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ error: "No such lead" }, { status: 404 });
  try {
    const files = await listLeadFiles(await createClient(), id);
    return NextResponse.json({ files }, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    console.error("[lead files]", err?.message ?? err);
    return NextResponse.json({ error: "The files could not be read" }, { status: 500 });
  }
}
