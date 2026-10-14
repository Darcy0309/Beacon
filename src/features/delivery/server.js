/**
 * Lead delivery: email a lead's sheet to its project's delivery addresses
 * (or a private link to it), as the old system did when a call made the
 * name a lead or an appointment. Runs with the server's own role: after a
 * call is saved (recordCallResult, through after()), when someone sends it
 * again by hand, and for a link opened without signing in.
 */

import "server-only";
import { POLICY_LINES } from "@/lib/coverage";
import { mailFailure, isReservedAddress, oneLine } from "@/lib/email";
import { APPOINTMENT_NOTICES, deliverySubject, leadSheetNotes, parseDeliveryAddresses, renderLeadLink, renderLeadSheet, sendsSheet } from "@/lib/delivery";
import { appointmentSpan, calendarLinks, mapLink } from "@/lib/appointment-links";
import { fileSize, fullName, sicLabel } from "@/lib/format";
import { autosLine, employeesLine, locationsLine, subcontractorsLine, yesNo } from "@/lib/business";
import { mailServer, sendMail } from "@/lib/server/mail";
import { LINK_DAYS, sheetToken } from "@/lib/server/sheet-link";
import { createAdminClient } from "@/lib/supabase/admin";

const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** A date (YYYY-MM-DD) as "Dec 20, 2027". */
const longDate = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

/**
 * Everything on a lead's sheet, read with the server's role: the lead, its
 * coverage, client and project, and the call it is being sent for (the one
 * given, else its latest call with a delivering result). Nothing internal:
 * not the call notes, nor when the lead or appointment was entered. `origin`
 * (the app's address) adds the appointment's .ics file to its calendar links.
 * Also returns the appointment as a calendar `event` (null without one it
 * can time), the whole sheet as its notes, and its `appointmentId`.
 */
export async function loadLeadSheet(admin, leadId, callRecordId = null, { origin = null } = {}) {
  const { data: lead, error } = await admin
    .from("leads")
    .select(`id, company_name, contact_name, contact_title, phone, contact_mobile, email,
      decision_maker, dm_title, dm_phone, dm_mobile, dm_email,
      contact2_name, contact2_title, contact2_phone, contact2_mobile, contact2_email,
      address, city, state, zip, website, fax, producer_name, list_source,
      location, employees, autos, sales_volume, ein, years_in_business, sic_code, estimated_annual_premium, description, client_note,
      professionals, covered_employees, location_ownership, building_age, building_stories, building_acres,
      employees_full_time, employees_part_time, subcontractors_pct, auto_types, travel_radius, annual_payroll, dot_number, cargo, claims_3yrs,
      project_id, insurance:insurance_details(*),
      assigned:users!leads_assigned_user_id_fkey(first_name, last_name, email)`)
    .eq("id", leadId)
    // The server's role reads past the rule that hides a deleted lead: a deleted lead has no sheet.
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!lead) return null;

  let call = null;
  const calls = admin.from("call_records")
    .select("id, project_id, call_result, appointment_id, user:users(first_name, last_name, email), result:call_results(delivers, effect)")
    .eq("lead_id", leadId);
  if (callRecordId) {
    ({ data: call } = await calls.eq("id", callRecordId).maybeSingle());
  } else {
    const { data } = await calls.order("call_date", { ascending: false }).limit(50);
    // Sent again: as the latest call that sent it last (the appointment's confirmation or cancellation, too).
    call = (data ?? []).find((c) => sendsSheet(one(c.result))) ?? null;
  }
  // News of the appointment: confirmed, or cancelled. A cancelled one is no longer the lead's
  // appointment, so it is read by the call that cancelled it.
  const notice = APPOINTMENT_NOTICES[one(call?.result)?.effect] ?? null;
  const apptColumns = "id, appt_date, appt_time, duration_min, rep_name";
  const apptQuery = notice === "CANCELLED" && call?.appointment_id
    ? admin.from("appointments").select(apptColumns).eq("id", call.appointment_id).maybeSingle()
    : admin.from("appointments").select(apptColumns).eq("lead_id", leadId).is("invalid_at", null).is("deleted_at", null)
      .order("appt_create_date", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();

  const projectId = call?.project_id ?? lead.project_id;
  const [{ data: project }, { data: appt }, { data: tz }, { data: sic }, { data: docs }] = await Promise.all([
    projectId
      ? admin.from("projects").select("id, name, email, delivery_link_only, contact_name, company:companies(name)").eq("id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    apptQuery,
    admin.rpc("business_tz"),
    lead.sic_code
      ? admin.from("sic_codes").select("code, description").in("code", [lead.sic_code, String(lead.sic_code).slice(0, 4)])
          .then(({ data: rows }) => ({ data: rows?.find((r) => r.code === lead.sic_code) ?? rows?.[0] ?? null }))
      : Promise.resolve({ data: null }),
    // The policy files kept with the lead: they go with it, each behind the sheet's own signed link.
    admin.from("documents").select("id, name, file_type, size_bytes").eq("lead_id", leadId).is("deleted_at", null).order("created_at"),
  ]);
  const fileToken = origin && docs?.length ? sheetToken(leadId) : null;

  const ins = one(lead.insurance) ?? {};
  const rep = one(call?.user) ?? one(lead.assigned);
  const address = [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(" ")].filter(Boolean);

  const sheet = {
    company: lead.company_name,
    result: call?.call_result ?? "Lead",
    notice,
    // The business's logo, from the app's own address (an email cannot carry the app's drawn one).
    logo: origin ? `${origin}/brand/signature-marketing.png` : null,
    client: one(project?.company)?.name ?? null,
    project: project?.name ?? null,
    producer: lead.producer_name || project?.contact_name || null,
    listSource: lead.list_source,
    rep: fullName(rep) || null,
    appointment: appt ? { date: longDate(appt.appt_date), time: appt.appt_time, with: appt.rep_name, links: [] } : null,
    people: [
      { who: "Contact", name: lead.contact_name, title: lead.contact_title, phone: lead.phone, mobile: lead.contact_mobile, email: lead.email },
      { who: "Decision maker", name: lead.decision_maker, title: lead.dm_title, phone: lead.dm_phone, mobile: lead.dm_mobile, email: lead.dm_email },
      { who: "Secondary contact", name: lead.contact2_name, title: lead.contact2_title, phone: lead.contact2_phone, mobile: lead.contact2_mobile, email: lead.contact2_email },
    ],
    address,
    map: mapLink(address.join(", ")),
    website: lead.website,
    fax: lead.fax,
    coverage: {
      ultimate: longDate(ins.ultimate_xdate),
      agency: ins.agency_name && ins.agency_years != null ? `${ins.agency_name} (${ins.agency_years} year${ins.agency_years === 1 ? "" : "s"})` : ins.agency_name,
      lines: POLICY_LINES.map((l) => ({ label: l.label, xdate: longDate(ins[l.date]), carrier: ins[l.carrier] })),
    },
    profile: [
      // What the Business tab holds, as it reads there.
      ["Locations", locationsLine(lead)], ["Employees", employeesLine(lead)], ["Sub-contractors", subcontractorsLine(lead)],
      ["Autos", autosLine(lead)], ["DOT#", lead.dot_number], ["Cargo", lead.cargo],
      ["Sales volume", lead.sales_volume], ["Annual payroll", lead.annual_payroll],
      ["EIN", lead.ein], ["Years in business", lead.years_in_business], ["SIC code", sicLabel(lead.sic_code, sic?.description)],
      ["Est. premium", lead.estimated_annual_premium], ["Claims last 3 yrs", yesNo(lead.claims_3yrs)],
      ["Professionals", lead.professionals], ["Covered employees", lead.covered_employees],
    ],
    // Only what was written for the client: the call notes stay internal.
    notes: [["Client notes", lead.client_note], ["Description", lead.description]],
    files: (docs ?? []).map((d) => ({
      name: d.name,
      about: [d.file_type, d.size_bytes != null ? fileSize(d.size_bytes) : null].filter(Boolean).join(" · ") || "File",
      href: fileToken ? `${origin}/sheet/${fileToken}/files/${d.id}` : null,
    })),
  };

  // The calendar event carries the whole sheet as its notes, not only whom to meet and where.
  const event = appt && notice !== "CANCELLED" ? appointmentEvent(lead.company_name, appt, address, tz, leadSheetNotes(sheet)) : null;
  const token = event && origin ? sheetToken(leadId) : null;
  if (event) sheet.appointment.links = calendarLinks(event, token ? `${origin}/sheet/${token}/appointment.ics` : null);

  return { project, rep, sheet, event, appointmentId: appt?.id ?? null };
}

/**
 * The appointment for a calendar: its title, when (on the business's
 * clock), where, and `details` for its notes. Null when its day or time
 * cannot be read.
 */
export function appointmentEvent(company, appt, address, timeZone, details) {
  const span = appointmentSpan(appt.appt_date, appt.appt_time, appt.duration_min, timeZone || "America/Phoenix");
  if (!span) return null;
  return { ...span, title: `Appointment: ${company}`, location: address.join(", ") || null, details: details || null };
}

/**
 * Send a lead's sheet to its project's delivery addresses and keep a record
 * of each send. `origin`: the app's address, for links. Never throws: what
 * went wrong is kept with the delivery. Returns { sent, failed, addresses }.
 */
export async function deliverLead({ leadId, callRecordId = null, sentBy = null, resent = false, origin }) {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[delivery] no service role key; lead", leadId, "not delivered");
    return { sent: 0, failed: 0, addresses: 0, error: "The server's SUPABASE_SERVICE_ROLE_KEY is not set." };
  }
  try {
    const loaded = await loadLeadSheet(admin, leadId, callRecordId, { origin });
    if (!loaded) return { sent: 0, failed: 0, addresses: 0 };
    const { project, rep, sheet } = loaded;
    const { list } = parseDeliveryAddresses(project?.email, project?.delivery_link_only);
    if (!list.length) return { sent: 0, failed: 0, addresses: 0 };

    const { data: settings } = await admin.from("app_settings").select("key, value").in("key", ["mail", "organization"]);
    const setting = (k) => settings?.find((s) => s.key === k)?.value ?? {};
    const from = setting("mail").from;
    const sender = { name: setting("organization").name || "Customer Service", address: from };
    const replyTo = rep?.email && !isReservedAddress(rep.email) ? { name: fullName(rep), address: rep.email } : undefined;
    const full = renderLeadSheet(sheet);
    const token = sheetToken(leadId);
    const link = token ? renderLeadLink(sheet, `${origin}/sheet/${token}`, LINK_DAYS) : null;
    const subject = oneLine(deliverySubject(sheet.result, sheet.company, sheet.notice));

    let sent = 0;
    let failed = 0;
    for (const { address, linkOnly } of list) {
      let messageId = null;
      let problem = null;
      if (!mailServer()) problem = mailFailure({ code: "ENOCONFIG" });
      else if (!from) problem = "There's no address to send from: set it in Settings › Email.";
      else if (linkOnly && !link) problem = "A link could not be made: the server has no secret to sign it with.";
      else {
        try {
          const body = linkOnly ? link : full;
          ({ messageId } = await sendMail({ from: sender, replyTo, to: address, subject, text: body.text, html: body.html }));
        } catch (err) {
          problem = mailFailure(err);
        }
      }
      const { error: keepError } = await admin.from("lead_deliveries").insert({
        lead_id: leadId, project_id: project?.id ?? null, call_record_id: callRecordId, result: sheet.result,
        to_address: address, link_only: linkOnly, resent, status: problem ? "failed" : "sent",
        error: problem ? problem.slice(0, 500) : null, message_id: messageId ? String(messageId).slice(0, 300) : null, sent_by: sentBy,
      });
      if (keepError) console.error("[delivery] not recorded", leadId, keepError.message);
      if (problem) {
        failed += 1;
        console.error("[delivery] lead", leadId, "to", address, problem);
      } else sent += 1;
    }
    return { sent, failed, addresses: list.length };
  } catch (err) {
    console.error("[delivery] lead", leadId, err?.message ?? err);
    return { sent: 0, failed: 0, addresses: 0, error: err?.message ?? String(err) };
  }
}
