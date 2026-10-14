import { NextResponse } from "next/server";
import { FILES_BUCKET } from "@/features/leads/files";
import { readSheetToken } from "@/lib/server/sheet-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const missing = (text, status = 404) =>
  new NextResponse(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });

/**
 * A policy file from the lead sheet a client was emailed: no sign-in, the
 * same signed token as the sheet's own link, and only a file of that lead.
 */
export async function GET(_request, { params }) {
  const { token, file } = await params;
  const leadId = readSheetToken(token);
  if (!leadId) return missing("This link has expired or is not valid.");
  if (!/^[1-9]\d{0,17}$/.test(file)) return missing("No such file.");
  const admin = createAdminClient();
  if (!admin) return missing("This file can't be opened right now.", 503);
  const { data: doc } = await admin.from("documents").select("name, storage_path")
    .eq("id", Number(file)).eq("lead_id", leadId).is("deleted_at", null).maybeSingle();
  if (!doc?.storage_path) return missing("This file is no longer available.");
  const { data, error } = await admin.storage.from(FILES_BUCKET).createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data?.signedUrl) return missing("This file could not be opened.");
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
