// Texts to a client's producers (Sean, Nov 2026: "the option to receive text messages in addition to emails for
// new appointments, appointment confirmations, & reschedules"): which call sends one, and what it says. The
// producers ticked for Texts in Project Info get it, as the appointment's email goes (held in QA with it).
// Pure, so the server and the tests share it.

import { formatPhone } from "./format.js";

/**
 * What a delivering call means for the producers' texts: "new" (an appointment set), "rescheduled" (one moved:
 * set again on another day or time), "confirmed", or null (a lead, a cancellation, or one set again unchanged).
 * `effect`: the call result's; `ownCall`: the appointment was made by this call; `moved`: this call moved it.
 */
export function producerTextKind({ effect, ownCall = false, moved = false }) {
  if (effect === "confirm") return "confirmed";
  // Appointment-Rescheduled (Sean, Nov 2026): set again on another day.
  if (effect === "reschedule") return "rescheduled";
  if (effect !== "appointment") return null;
  if (moved) return "rescheduled";
  return ownCall ? "new" : null;
}

const HEAD = { new: "New appointment", confirmed: "Appointment confirmed", rescheduled: "Appointment rescheduled" };

/**
 * The text: "Signature Marketing: New appointment: ABC Trucking, Thursday, November 20 at 10:00 AM. Joe Smith,
 * 602-555-0100. Details are in your email. Reply STOP to opt out." `from`: who it is from (the business's name);
 * `when`: the day as words; the rest from the lead.
 */
export function producerTextBody(kind, { from, company, when, time, contact, phone, emailed = true }) {
  if (!HEAD[kind]) return null;
  const at = [when, time].filter(Boolean).join(" at ");
  const who = [contact, formatPhone(phone) ?? (phone || null)].filter(Boolean).join(", ");
  return [
    `${from ? `${from}: ` : ""}${HEAD[kind]}: ${company || "a lead"}${at ? `, ${kind === "rescheduled" ? "now " : ""}${at}` : ""}.`,
    who ? `${who}.` : null,
    emailed && kind !== "confirmed" ? "Details are in your email." : null,
    "Reply STOP to opt out.",
  ].filter(Boolean).join(" ");
}
