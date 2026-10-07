import { loadLeadSheet } from "@/features/delivery/server";
import { renderLeadSheet } from "@/lib/delivery";
import { readSheetToken } from "@/lib/server/sheet-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const page = (status, html) =>
  new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // A client's private link: never indexed, cached or framed elsewhere.
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "private, no-store",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });

const notice = (text) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead sheet</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;padding:40px;color:#374151;"><p>${text}</p></body></html>`;

/**
 * A lead's sheet, from the private link in a delivery email: no sign-in,
 * the signed token in the address says which lead and until when.
 */
export async function GET(_request, { params }) {
  const { token } = await params;
  const leadId = readSheetToken(token);
  if (!leadId) return page(404, notice("This link has expired or is not valid. Ask your Lighthouse contact to send the lead again."));
  const admin = createAdminClient();
  if (!admin) return page(503, notice("This lead sheet can't be shown right now."));
  const loaded = await loadLeadSheet(admin, leadId);
  if (!loaded) return page(404, notice("This lead is no longer available."));
  const { html } = renderLeadSheet(loaded.sheet);
  return page(200, html.replace("<html>", '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead sheet</title></head>'));
}
