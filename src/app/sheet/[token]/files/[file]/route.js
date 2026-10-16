import { NextResponse } from "next/server";
import { FILES_BUCKET } from "@/features/leads/files";
import { fileKind } from "@/lib/files";
import { readSheetToken } from "@/lib/server/sheet-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const missing = (text, status = 404) =>
  new NextResponse(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });

/**
 * A policy file from the lead sheet a client was emailed: no sign-in, the
 * same signed token as the sheet's own link, and only a file of that lead.
 * A PDF, a picture or plain text opens in the browser; with ?download=1, or
 * a kind the browser cannot show, it is saved under its own name.
 */
export async function GET(request, { params }) {
  const { token, file } = await params;
  const leadId = readSheetToken(token);
  if (!leadId) return missing("This link has expired or is not valid.");
  if (!/^[1-9]\d{0,17}$/.test(file)) return missing("No such file.");
  const admin = createAdminClient();
  if (!admin) return missing("This file can't be opened right now.", 503);
  const { data: doc } = await admin.from("documents").select("name, file_type, storage_path")
    .eq("id", Number(file)).eq("lead_id", leadId).is("deleted_at", null).maybeSingle();
  if (!doc?.storage_path) return missing("This file is no longer available.");
  const save = new URL(request.url).searchParams.get("download") === "1" || !fileKind(doc.name, doc.file_type);
  const { data, error } = await admin.storage.from(FILES_BUCKET)
    .createSignedUrl(doc.storage_path, save ? 60 : 600, save ? { download: doc.name } : undefined);
  if (error || !data?.signedUrl) return missing("This file could not be opened.");
  return NextResponse.redirect(data.signedUrl, { headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
