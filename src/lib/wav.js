// A voicemail greeting recorded in the browser, as a WAV file Twilio can play (Nov 2026): the browser's own
// recordings (WebM, Ogg) are not among the formats Twilio's <Play> takes. Pure, so the tests read it too.

/**
 * Samples (Float32Arrays at `rate`) as a 16-bit mono WAV at `to` samples a second (16 kHz: clear speech, a
 * minute about 2 MB). Each output sample is the mean of the input samples it covers.
 */
export function encodeWav(chunks, rate, to = 16000) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    input.set(c, at);
    at += c.length;
  }
  const step = rate / to;
  const length = Math.floor(total / step);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset, s) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, to, true);
  view.setUint32(28, to * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const from = Math.floor(i * step);
    const end = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = from; j < end && j < total; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / (end - from)));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return buffer;
}

/** How long a WAV made by encodeWav plays, in seconds. */
export const wavSeconds = (buffer) => {
  const view = new DataView(buffer);
  return view.getUint32(40, true) / view.getUint32(28, true);
};
