// A voicemail left on the phone's Twilio number, as its notification carries it (Nov 2026): the title
// "Voicemail from (602) 555-0144", and a body of lines (app/api/twilio/voice, tellOfVoicemail):
//   the lead's name and contact, when the number is a lead's
//   "0:42 long"
//   "Listen: https://…/api/phone/recordings/RE…"
//   "Transcript: …", once Twilio has transcribed it
// Pure, so the notification page and the tests share it.

// A call recorded with the phone's Record button (Nov 2026), told to the person who recorded it
// (app/api/twilio/voice, step=recorded), the same way: the title "Recorded call with (510) 831-0107",
// and a body of the lead's line, the length and the Listen line.
const RECORDED = /^Recorded call with (.+)$/;

/** The voicemail in a notification, or null when it is not one: { from, recordingSid, seconds, lead, transcript }. */
export function voicemailOf(n) {
  return heard(n, /^Voicemail from (.+)$/);
}

/** A recorded call in a notification, or null: { from (the other number), recordingSid, seconds, lead }. */
export function callRecordingOf(n) {
  return heard(n, RECORDED);
}

/** Either, with which it is: { kind: "voicemail" | "recording", ... }, or null. */
export function recordingOf(n) {
  const v = voicemailOf(n);
  if (v) return { kind: "voicemail", ...v };
  const r = callRecordingOf(n);
  return r ? { kind: "recording", ...r } : null;
}

function heard(n, titled) {
  const title = String(n?.title ?? "");
  const body = String(n?.body ?? "");
  const from = titled.exec(title)?.[1];
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

/**
 * How a notification reads wherever it is shown (the pop-up, the bell, the inbox, the desktop): its
 * title and body; a voicemail as the call missed (Nov 2026), not its recording's address:
 * "You missed a call from (510) 831-0107", "Left a voicemail · 0:06 · Delta Door · Dana Reyes"; a
 * recorded call as "Your call with (510) 831-0107 was recorded", "Recording ready to play · 0:42".
 */
export function notificationText(n) {
  const v = recordingOf(n);
  if (!v) return { title: n?.title ?? "", body: n?.body ?? null };
  const length = v.seconds ? `${Math.floor(v.seconds / 60)}:${String(v.seconds % 60).padStart(2, "0")}` : null;
  if (v.kind === "recording") {
    return { title: `Your call with ${v.from} was recorded`, body: ["Recording ready to play", length, v.lead].filter(Boolean).join(" · ") };
  }
  return {
    title: `You missed a call from ${v.from}`,
    body: ["Left a voicemail", length, v.lead].filter(Boolean).join(" · "),
  };
}
