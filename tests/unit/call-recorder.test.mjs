#!/usr/bin/env node
/**
 * Unit tests for a call's recording on the Twilio line (call-recorder.js): Record pressed while the
 * call still rings starts it once answered (Sean, Nov 2026: two calls of four not recorded), a server
 * still saying "not connected" is asked again, "Record every call" starts it by itself, and nothing
 * is asked once the call is over.
 */
import { callRecorder } from "../../src/features/phone/call-recorder.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else { console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`); failures++; }
};

const SID = "CA0123456789abcdef0123456789abcdef";
const notConnected = () => Object.assign(new Error("The call is not connected yet"), { status: 409 });

/** A recorder whose server answers from `answers` in turn (an Error to fail), noting each ask and each thing told. */
function rig({ answers = [], auto = false } = {}) {
  const asked = [];
  const told = [];
  const rec = callRecorder({
    auto,
    wait: async () => {},
    post: async (sid, on, opts) => {
      asked.push({ sid, on, auto: opts?.auto });
      const a = answers.shift();
      if (a instanceof Error) throw a;
    },
    tell: (s) => told.push(s),
  });
  return { rec, asked, told };
}

{
  const { rec, asked, told } = rig();
  await rec.set(true);
  check("Record pressed while it rings: nothing asked of the server yet", asked.length === 0, JSON.stringify(asked));
  check("…the button stays on, saying it starts when they answer", told.at(-1)?.on === true && told.at(-1)?.pending === true, JSON.stringify(told));
  await rec.answered(SID);
  check("answered: recording asked for, on that call", asked.length === 1 && asked[0].sid === SID && asked[0].on === true && asked[0].auto === false, JSON.stringify(asked));
  check("…and it says it is recording", told.at(-1)?.on === true && !told.at(-1)?.pending && !told.at(-1)?.error, JSON.stringify(told.at(-1)));
  await rec.set(false);
  check("Record again: stopped", asked.at(-1)?.on === false && told.at(-1)?.on === false, JSON.stringify(told.at(-1)));
}

{
  const { rec, asked } = rig();
  await rec.set(true);
  await rec.set(false);
  await rec.answered(SID);
  check("pressed twice while it rang (on, then off): nothing recorded", asked.length === 0, JSON.stringify(asked));
}

{
  const { rec, asked, told } = rig({ answers: [notConnected(), notConnected()] });
  await rec.answered(SID);
  await rec.set(true);
  check("the server not connected yet just after the answer: asked again until it is", asked.length === 3 && told.at(-1)?.on === true && !told.at(-1)?.error, JSON.stringify({ asked, told }));
}

{
  const { rec, told } = rig({ answers: [notConnected(), notConnected(), notConnected(), notConnected()] });
  await rec.answered(SID);
  await rec.set(true);
  check("…but not for ever: then the button goes back, saying why", told.at(-1)?.on === false && /not connected/.test(told.at(-1)?.error ?? ""), JSON.stringify(told.at(-1)));
}

{
  const { rec, told } = rig({ answers: [Object.assign(new Error("Not your call"), { status: 403 })] });
  await rec.answered(SID);
  await rec.set(true);
  check("another refusal: not asked again, the button back, saying why", told.length === 1 && told[0].on === false && told[0].error === "Not your call", JSON.stringify(told));
}

{
  const { rec, asked, told } = rig({ auto: true });
  check("Record every call: nothing until the call is answered", asked.length === 0);
  await rec.answered(SID);
  check("…answered: recorded by itself, marked as the setting's", asked.length === 1 && asked[0].on === true && asked[0].auto === true, JSON.stringify(asked));
  check("…and the button says so", told.at(-1)?.on === true && told.at(-1)?.auto === true, JSON.stringify(told.at(-1)));
  await rec.set(false);
  check("…Record still stops it", asked.at(-1)?.on === false && told.at(-1)?.on === false);
  await rec.set(true);
  check("…and starts it again, then as the person's own", asked.at(-1)?.on === true && asked.at(-1)?.auto === false, JSON.stringify(asked.at(-1)));
}

{
  const { rec, asked } = rig({ auto: true });
  await rec.set(false);
  await rec.answered(SID);
  check("Record every call, turned off for this call before it was answered: not recorded", asked.length === 0, JSON.stringify(asked));
}

{
  const { rec, asked } = rig();
  await rec.set(true);
  rec.end();
  await rec.answered(SID);
  check("the call over before it was answered: nothing asked", asked.length === 0, JSON.stringify(asked));
}

console.log(failures ? `\n${failures} call recorder check(s) failed.\n` : "\nAll call recorder checks passed.\n");
process.exit(failures ? 1 : 0);
