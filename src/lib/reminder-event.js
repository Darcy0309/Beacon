/**
 * A call-back reminder as an event for someone's own calendar: fifteen
 * minutes at the time to call, the business's name, where it is, the note,
 * and the link that opens the lead. Pure: the lead page and the reminder's
 * .ics file both build it.
 *
 *   remindAt  the reminder's time (an ISO instant); lead { id, company_name, address, city, state, zip }
 */
export function reminderEvent({ remindAt, note, lead, origin }) {
  const start = new Date(remindAt);
  return {
    start,
    end: new Date(start.getTime() + 15 * 60000),
    title: `Call back: ${lead.company_name ?? "a lead"}`,
    location: [lead.address, [lead.city, lead.state, lead.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    details: [note, `Open the lead: ${origin}/leads/${lead.id}`].filter(Boolean).join("\n"),
  };
}
