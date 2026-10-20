import { EXPORT_HEADERS, csvLine, currentAppointment, exportCells, exportFileName } from "@/lib/lead-export";
import { logActivity } from "@/lib/server/action-helpers";
import { one } from "@/lib/server/query-helpers";
import { getCurrentUser } from "@/lib/server/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Leads read per request: no more than the database returns in one page.
const BATCH = 1000;

const LEAD_COLUMNS = `id, company_name, contact_name, contact_title, phone, contact_mobile, email, fax, website,
  decision_maker, dm_title, dm_phone, dm_mobile, dm_email,
  contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email,
  address, city, state, zip, county, territory,
  sic_code, description, employees, autos, drivers, xmod, sales_volume, location, ein, years_in_business, estimated_annual_premium,
  producer_name, list_source, call_result_dbdv, call_result_appt, client_note,
  result:call_results(name, project_type),
  insurance:insurance_details(agency_name, agency_years, ultimate_xdate, pkg_xdate, pkg_carrier, wc_xdate, wc_carrier, auto_xdate, auto_carrier,
    health_xdate, health_carrier, dental_xdate, dental_provider, vision_xdate, vision_provider, prof_liab_xdate, prof_liab_carrier,
    do_xdate, do_carrier, eo_xdate, eo_carrier),
  note:lead_notes(notes),
  appointments(id, appt_date, appt_time, appt_create_date, invalid_at)`;

/**
 * A project's leads as a CSV in the import template's columns, with what
 * each lead holds now: its contacts, coverage, call result, appointment and
 * notes (the internal ones too). Administrators only. Every lead on the
 * project, in the order they are called, streamed a batch at a time.
 */
export async function GET(_request, { params }) {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return new Response("Only an administrator can export a project.", { status: 403 });
  const { id } = await params;
  if (!/^[1-9]\d{0,17}$/.test(id)) return new Response("No such project.", { status: 404 });

  const supabase = await createClient();
  try {
    const [{ data: project }, { count }] = await Promise.all([
      supabase.from("projects").select("id, name").eq("id", id).maybeSingle(),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("project_id", id),
    ]);
    if (!project) return new Response("No such project.", { status: 404 });

    // What each SIC code means, for the template's description column.
    const sic = new Map();
    for (let from = 0; ; from += BATCH) {
      const { data, error } = await supabase.from("sic_codes").select("code, description").order("code").range(from, from + BATCH - 1);
      if (error) throw error;
      for (const r of data ?? []) sic.set(r.code, r.description);
      if (!data?.length) break;
    }

    const batch = async (after) => {
      const { data, error } = await supabase.from("leads").select(LEAD_COLUMNS).eq("project_id", id).gt("id", after).order("id").limit(BATCH);
      if (error) throw error;
      return data ?? [];
    };
    const line = (lead) => csvLine(exportCells({
      lead,
      result: one(lead.result),
      insurance: one(lead.insurance),
      note: one(lead.note)?.notes,
      appointment: currentAppointment(lead.appointments),
      sicDescription: lead.sic_code ? sic.get(lead.sic_code) : null,
    }));

    // The first batch before anything is sent, so a failure is an error and not half a file.
    const first = await batch(0);
    await logActivity(supabase, "leads.export", { entity: "project", entityId: project.id, userId: me.id, detail: `${(count ?? 0).toLocaleString()} leads from ${project.name}` });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          // The byte-order mark has a spreadsheet read the file as UTF-8.
          controller.enqueue(encoder.encode(`﻿${csvLine(EXPORT_HEADERS)}\r\n`));
          for (let rows = first; rows.length; rows = await batch(rows[rows.length - 1].id)) {
            controller.enqueue(encoder.encode(`${rows.map(line).join("\r\n")}\r\n`));
          }
          controller.close();
        } catch (err) {
          console.error("[projects/export]", err?.message ?? err);
          controller.error(err);
        }
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFileName(project.name, new Date().toISOString().slice(0, 10))}"`,
        "X-Total-Count": String(count ?? 0),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[projects/export]", err?.message ?? err);
    return new Response("Export failed. Try again.", { status: 502 });
  }
}
