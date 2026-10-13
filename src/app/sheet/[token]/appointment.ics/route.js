import { loadLeadSheet } from "@/features/delivery/server";
import { appointmentIcs } from "@/lib/appointment-links";
import { readSheetToken } from "@/lib/server/sheet-link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const missing = (text, status = 404) =>
  new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } });

/**
 * The appointment on a lead sheet as a calendar file, for "Add to calendar ›
 * Apple" (and Outlook on a desktop): no sign-in, the same signed token as
 * the sheet's own link. Always the lead's current appointment, so a moved
 * one is saved at its new time, with the whole sheet as its notes.
 */
export async function GET(_request, { params }) {
  const { token } = await params;
  const leadId = readSheetToken(token);
  if (!leadId) return missing("This link has expired or is not valid.");
  const admin = createAdminClient();
  if (!admin) return missing("This appointment can't be shown right now.", 503);

  const loaded = await loadLeadSheet(admin, leadId);
  if (!loaded?.appointmentId) return missing("This appointment is no longer on the calendar.");
  const { event, appointmentId } = loaded;
  if (!event) return missing("This appointment has no time set yet.");

  return new Response(appointmentIcs(event, `appointment-${appointmentId}@lighthouse-crm`), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="appointment-${appointmentId}.ics"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
