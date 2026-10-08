import { appointmentEvent } from "@/features/delivery/server";
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
 * one is saved at its new time.
 */
export async function GET(_request, { params }) {
  const { token } = await params;
  const leadId = readSheetToken(token);
  if (!leadId) return missing("This link has expired or is not valid.");
  const admin = createAdminClient();
  if (!admin) return missing("This appointment can't be shown right now.", 503);

  const [{ data: lead }, { data: appt }, { data: tz }] = await Promise.all([
    admin.from("leads").select("company_name, contact_name, contact_title, phone, address, city, state, zip, client_note").eq("id", leadId).maybeSingle(),
    admin.from("appointments").select("id, appt_date, appt_time, duration_min, rep_name").eq("lead_id", leadId).is("invalid_at", null)
      .order("appt_create_date", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    admin.rpc("business_tz"),
  ]);
  if (!lead || !appt) return missing("This appointment is no longer on the calendar.");
  const address = [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(" ")].filter(Boolean);
  const event = appointmentEvent(lead, appt, address, tz);
  if (!event) return missing("This appointment has no time set yet.");

  return new Response(appointmentIcs(event, `appointment-${appt.id}@lighthouse-crm`), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="appointment-${appt.id}.ics"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
