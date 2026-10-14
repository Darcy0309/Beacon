import { loadLeadSheet } from "@/features/delivery/server";
import { renderLeadSheet } from "@/lib/delivery";
import { publicOrigin } from "@/lib/origin";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const page = (status, html) =>
  new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" },
  });

/**
 * A lead as the client gets it, to print (Sean, Oct 2026: Print on the lead
 * page printed the screen). The same sheet the delivery email carries, read
 * as the person signed in, so they print only a lead they can see; it opens
 * the browser's print dialog by itself.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return page(401, "<p>Sign in to print a lead.</p>");
  if (!/^[1-9]\d{0,17}$/.test(id)) return page(404, "<p>No such lead.</p>");
  const supabase = await createClient();
  const loaded = await loadLeadSheet(supabase, Number(id), null, { origin: publicOrigin(request.headers) });
  if (!loaded) return page(404, "<p>This lead is no longer available.</p>");
  const { html } = renderLeadSheet(loaded.sheet);
  const title = `Lead sheet: ${String(loaded.sheet.company ?? "").replace(/[<>&"]/g, "")}`;
  return page(200, html
    .replace("<html>", `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>@media print { body { padding: 0 !important; background: #fff !important; } }</style></head>`)
    .replace("</body>", "<script>addEventListener('load', () => setTimeout(() => print(), 250));</script></body>"));
}
