import { appointmentIcs } from "@/lib/appointment-links";
import { publicOrigin } from "@/lib/origin";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";
import { reminderEvent } from "@/lib/reminder-event";

export const dynamic = "force-dynamic";

const text = (body, status) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, no-store" } });

/**
 * One of my call-back reminders as a calendar file (Outlook on a desktop,
 * Apple): fifteen minutes at the time to call, with the lead to open.
 * Someone else's is not to be had (Row Level Security on reminders).
 */
export async function GET(request, { params }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return text("Sign in first.", 401);
  if (!/^[1-9]\d{0,17}$/.test(id)) return text("No such reminder.", 404);
  const supabase = await createClient();
  const { data: m } = await supabase.from("reminders")
    .select("id, remind_at, note, lead:leads(id, company_name, address, city, state, zip)").eq("id", Number(id)).maybeSingle();
  const lead = Array.isArray(m?.lead) ? m.lead[0] : m?.lead;
  if (!m || !lead) return text("No such reminder.", 404);
  const event = reminderEvent({ remindAt: m.remind_at, note: m.note, lead, origin: publicOrigin(request.headers) });
  return new Response(appointmentIcs(event, `reminder-${m.id}@lighthouse-crm`), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="call-back-${m.id}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
