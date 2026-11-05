// A voicemail left on the phone's Twilio number, as its notification carries it (Nov 2026): the title
// "Voicemail from (602) 555-0144", and a body of lines (app/api/twilio/voice, tellOfVoicemail):
//   the lead's name and contact, when the number is a lead's
//   "0:42 long"
//   "Listen: https://…/api/phone/recordings/RE…"
//   "Transcript: …", once Twilio has transcribed it
// Pure, so the notification page and the tests share it.

/** The voicemail in a notification, or null when it is not one: { from, recordingSid, seconds, lead, transcript }. */
export function voicemailOf(n) {
  const title = String(n?.title ?? "");
  const body = String(n?.body ?? "");
  const from = /^Voicemail from (.+)$/.exec(title)?.[1];
  const recordingSid = /\/api\/phone\/recordings\/(RE[0-9a-f]{32})\b/i.exec(body)?.[1];
  if (!from || !recordingSid) return null;
  const lines = body.split("\n");
  const length = /^(?:(\d+):)?(\d+):(\d{2}) long$/.exec(lines.find((l) => / long$/.test(l)) ?? "");
  const seconds = length ? Number(length[1] ?? 0) * 3600 + Number(length[2]) * 60 + Number(length[3]) : 0;
  const transcriptAt = lines.findIndex((l) => l.startsWith("Transcript: "));
  const transcript = transcriptAt >= 0 ? lines.slice(transcriptAt).join("\n").slice("Transcript: ".length).trim() || null : null;
  // The lead's line comes first, before the length, when there is one.
  const lead = lines[0] && !/ long$|^Listen: |^Transcript: /.test(lines[0]) ? lines[0] : null;
  return { from, recordingSid, seconds, lead, transcript };
}
