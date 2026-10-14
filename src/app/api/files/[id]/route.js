import { NextResponse } from "next/server";
import { FILES_BUCKET } from "@/features/leads/files";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Open a policy file: for someone who can see it (Row Level Security on
 * documents and on the bucket), a link to it that works for one minute.
 */
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return new NextResponse("Sign in first.", { status: 401 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return new NextResponse("No such file.", { status: 404 });
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("name, storage_path").eq("id", Number(id)).is("deleted_at", null).maybeSingle();
  if (!doc?.storage_path?.startsWith("lead/")) return new NextResponse("No such file.", { status: 404 });
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data?.signedUrl) return new NextResponse("The file could not be opened.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
