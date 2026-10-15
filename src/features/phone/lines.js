// How the phone in Lighthouse places a call: a "line". The phone's screen,
// keypad and call log are the same whichever line is used; what a line can
// do (mute, hold, tones during a call, recording) switches its buttons on.
//
// Today there is one: the computer's own calling app, handed the number as a
// tel: link (PanTerra's Streams app, when it is the computer's default for
// phone links). Lighthouse cannot hear or control that call, so the controls
// that would need it stay off. A PanTerra line (calling from the browser)
// takes its place once PanTerra's connection details are known, with the
// same shape.

/**
 * A line: { id, label, note, can: { mute, hold, tones, record, receive },
 * call(tel), hangUp(), setMuted(on), setHeld(on), tone(key),
 * setRecording(on), onIncoming(handler) → stop, answer(id), decline(id) }.
 * `onIncoming`: calls coming in, each { id, number }, to ring the phone.
 */
export const deviceLine = {
  id: "device",
  label: "Your computer's calling app",
  note: "Calls open in your calling app (PanTerra Streams, when it is your default for phone links). Mute, hold and recording come with the PanTerra connection.",
  // Calls coming in ring in the calling app, not here.
  can: { mute: false, hold: false, tones: false, record: false, receive: false },
  /** Hand the number to the computer: through a frame of its own, so this page never navigates away. */
  call(tel) {
    if (typeof document === "undefined" || !tel) return;
    const frame = document.createElement("iframe");
    frame.style.display = "none";
    frame.setAttribute("data-phone-dial", tel);
    frame.src = tel;
    document.body.appendChild(frame);
    setTimeout(() => frame.remove(), 2000);
  },
  hangUp() {},
  setMuted() {},
  setHeld() {},
  tone() {},
  setRecording() {},
  onIncoming() {
    return () => {};
  },
  answer() {},
  decline() {},
};
