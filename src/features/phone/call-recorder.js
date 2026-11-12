/**
 * Recording one call on the Twilio line (twilio-line.js), from the Record button or, with "Record
 * every call" on (Settings), by itself once the call is answered.
 *
 * Twilio can record a call only once it is connected: a call out rings until the other end answers
 * (answerOnBridge). Record pressed before then used to fail, saying "The call is not connected yet",
 * and the button went back off unnoticed (Sean, Nov 2026: two calls of four not recorded). Now it is
 * kept until the call is answered, then asked of the server; a server still saying "not connected"
 * just after the answer is asked again a moment later.
 *
 *   post(callSid, on, { auto })  asks the server (app/api/phone/recording); rejects with an Error
 *                               whose `status` is the HTTP status (409: not connected yet)
 *   tell({ on, pending, auto, error })  what the Record button shows, and says:
 *     pending  kept for the answer: on, it starts then; off, it won't
 *     auto     started by "Record every call"
 *     error    why it could not be changed (the button goes back)
 *   auto     record from the answer by itself
 */
export function callRecorder({ post, tell = () => {}, auto = false, retries = 3, wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let sid = null; // the call's CallSid, once it is answered
  let wanted = Boolean(auto); // what the person (or the setting) wants
  let byAuto = Boolean(auto); // whether what is wanted came from the setting
  let on = false; // what Twilio is doing
  let over = false;
  let busy = null;

  const apply = async () => {
    while (sid && !over && wanted !== on) {
      const target = wanted;
      const viaAuto = byAuto && target;
      for (let i = 0; ; i += 1) {
        try {
          await post(sid, target, { auto: viaAuto });
          on = target;
          if (!over) tell({ on, auto: viaAuto });
          break;
        } catch (err) {
          if (over) return;
          if (err?.status === 409 && i < retries) {
            await wait(1500);
            if (over) return;
            continue;
          }
          wanted = on;
          tell({ on, error: err?.message || "Recording could not be changed." });
          return;
        }
      }
    }
  };
  const run = () => (busy ??= apply().finally(() => {
    busy = null;
  }));

  return {
    /** Record pressed: on or off. Before the answer, kept for it. */
    set(value) {
      wanted = Boolean(value);
      byAuto = false;
      if (!sid) {
        tell({ on: wanted, pending: true });
        return Promise.resolve();
      }
      return run();
    },
    /** The call is answered: its CallSid, to record it by. */
    answered(callSid) {
      if (!callSid || sid) return Promise.resolve();
      sid = callSid;
      return run();
    },
    /** The call is over: nothing more to ask. */
    end() {
      over = true;
    },
  };
}
