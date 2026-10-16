import { NextResponse } from "next/server";
import { FILES_BUCKET } from "@/features/leads/files";
import { fileKind } from "@/lib/files";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Open a policy file: for someone who can see it (Row Level Security on
 * documents and on the bucket), a short-lived link to it. A PDF, a picture
 * or plain text opens in the browser (and in Lighthouse's own viewer), its
 * link good for ten minutes, as a PDF viewer reads a large file a part at a
 * time; with ?download=1, or a kind the browser cannot show, it is saved
 * under its own name, the link good for a minute.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return new NextResponse("Sign in first.", { status: 401 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return new NextResponse("No such file.", { status: 404 });
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("name, file_type, storage_path").eq("id", Number(id)).is("deleted_at", null).maybeSingle();
  if (!doc?.storage_path?.startsWith("lead/")) return new NextResponse("No such file.", { status: 404 });
  const save = new URL(request.url).searchParams.get("download") === "1" || !fileKind(doc.name, doc.file_type);
  const { data, error } = await supabase.storage.from(FILES_BUCKET)
    .createSignedUrl(doc.storage_path, save ? 60 : 600, save ? { download: doc.name } : undefined);
  if (error || !data?.signedUrl) return new NextResponse("The file could not be opened.", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
