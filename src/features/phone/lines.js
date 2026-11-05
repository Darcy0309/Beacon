// How the phone in Lighthouse places a call: a "line". The phone's screen,
// keypad and call log are the same whichever line is used; what a line can
// do (mute, hold, tones during a call, recording) switches its buttons on.
//
// There are two. The computer's own calling app, handed the number as a tel:
// link (PanTerra's Streams app, when it is the computer's default for phone
// links): Lighthouse cannot hear or control that call, so the controls that
// would need it stay off. And the Twilio line (twilio-line.js), calling from
// the browser itself, which takes its place once the server has Twilio's keys.

/**
 * A line: { id, label, note, lacks, can: { mute, hold, tones, record, receive, hangUp, answered },
 * call(tel) → id, hangUp(), setMuted(on), setHeld(on), tone(key),
 * setRecording(on) (may reject, saying why), onIncoming(handler) → stop,
 * onEnded(handler) → stop, onAnswered(handler) → stop, answer(id), decline(id) }.
 * `can.answered`: the line says when a call out is answered (onAnswered, { id }); until then it is
 * still ringing. Without it, a call counts as on from the moment it is dialed.
 * `lacks`: why a control that is off is off.
 * `onIncoming`: calls coming in, each { id, number }, to ring the phone.
 * `onEnded`: a call ended on the line itself, { id } (the id call() gave, or
 * the one a call coming in rang with): hung up at the other end, or cancelled
 * while it rang.
 * `can.hangUp`: End hangs the call up; without it the call is hung up where
 * it was made, and End only stops the timer here.
 */
export const deviceLine = {
  id: "device",
  label: "Your computer's calling app",
  note: "Calls open in your calling app (PanTerra Streams, when it is your default for phone links). Mute, hold and recording come with the PanTerra connection.",
  lacks: "comes with the PanTerra connection",
  // Calls coming in ring in the calling app, not here; and a call is hung up there.
  can: { mute: false, hold: false, tones: false, record: false, receive: false, hangUp: false, answered: false },
  /** Hand the number to the computer: through a frame of its own, so this page never navigates away. */
  call(tel) {
    if (typeof document === "undefined" || !tel) return;
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.setAttribute("data-phone-dial", tel);
    frame.src = tel;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 2000);
    return null;
  },
  hangUp() {},
  setMuted() {},
  setHeld() {},
  tone() {},
  setRecording() {},
  onIncoming() {
    return () => {};
  },
  // Nor does it see a call end: End here stops the timer.
  onEnded() {
    return () => {};
  },
  onAnswered() {
    return () => {};
  },
  answer() {},
  decline() {},
};
