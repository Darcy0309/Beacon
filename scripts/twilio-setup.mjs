#!/usr/bin/env node
/**
 * Sets up the phone's Twilio line, once, from the account's SID and Auth
 * Token (Twilio Console → Account info), and prints the server's keys:
 *
 *   TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… node scripts/twilio-setup.mjs --url https://crm.example.com
 *
 *   --url      where Lighthouse is reached from the internet (Twilio calls it for every call)
 *   --number   the Twilio number to call from and ring on (+16025550100); needed when the account has several
 *   --write F  also write the keys into the env file F (an existing TWILIO_* line there is replaced)
 *
 * It makes or updates, in the Twilio account:
 *   - a TwiML App, "Lighthouse phone", whose Voice URL is <url>/api/twilio/voice
 *   - the number's voice calls, sent to that app (calls to it ring the phone)
 *   - an API key, "Lighthouse phone", that signs the browsers' calling tokens
 *     (kept when TWILIO_API_KEY and TWILIO_API_SECRET are already set: Twilio shows a secret only once)
 * Safe to run again, for a new address or another number.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const NAME = "Lighthouse phone";

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const sid = (arg("sid") ?? process.env.TWILIO_ACCOUNT_SID ?? "").trim();
const authToken = (arg("token") ?? process.env.TWILIO_AUTH_TOKEN ?? "").trim();
const site = (arg("url") ?? "").trim().replace(/\/+$/, "");
const wanted = (arg("number") ?? "").replace(/[^\d+]/g, "");
const envFile = arg("write");

const stop = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};
if (!/^AC[0-9a-f]{32}$/i.test(sid) || !authToken) stop("Give the account's SID and Auth Token: TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… (Twilio Console → Account info).");
if (!/^https:\/\/[^/]+/.test(site)) stop("Give the address Lighthouse is reached at, with https: --url https://crm.example.com (Twilio cannot call 127.0.0.1).");

async function api(path, { method = "GET", form } = {}) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString("base64")}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) stop(`Twilio refused ${method} ${path}: ${data?.message ?? res.status}`);
  return data;
}

// The account: the SID and token work, and it is open.
const account = await api(".json");
if (account.status !== "active") stop(`The account is ${account.status}.`);
console.log(`✓ Account: ${account.friendly_name} (${account.type})`);

// The number.
const { incoming_phone_numbers: numbers = [] } = await api("/IncomingPhoneNumbers.json?PageSize=100");
const voice = numbers.filter((n) => n.capabilities?.voice);
let number = wanted ? voice.find((n) => n.phone_number === (wanted.startsWith("+") ? wanted : `+1${wanted.replace(/^1/, "")}`)) : voice.length === 1 ? voice[0] : null;
if (!number) {
  if (!voice.length) stop("The account has no number for voice calls yet: buy one in Twilio Console → Phone Numbers, then run this again.");
  stop(`${wanted ? `${wanted} is not one of the account's voice numbers.` : "The account has several numbers: say which with --number."}\n  ${voice.map((n) => `${n.phone_number}  ${n.friendly_name}`).join("\n  ")}`);
}
console.log(`✓ Number: ${number.phone_number}`);

// The TwiML App calls from the browser go through, and calls to the number too.
const voiceUrl = `${site}/api/twilio/voice`;
const { applications = [] } = await api(`/Applications.json?FriendlyName=${encodeURIComponent(NAME)}`);
const appForm = { FriendlyName: NAME, VoiceUrl: voiceUrl, VoiceMethod: "POST" };
const app = applications[0]
  ? await api(`/Applications/${applications[0].sid}.json`, { method: "POST", form: appForm })
  : await api("/Applications.json", { method: "POST", form: appForm });
console.log(`✓ TwiML App: ${app.sid} → ${voiceUrl}`);

if (number.voice_application_sid !== app.sid) {
  const before = number.voice_application_sid ? `the app ${number.voice_application_sid}` : number.voice_url || "nothing";
  await api(`/IncomingPhoneNumbers/${number.sid}.json`, { method: "POST", form: { VoiceApplicationSid: app.sid } });
  console.log(`✓ Calls to ${number.phone_number} now ring Lighthouse (they went to ${before})`);
} else {
  console.log(`✓ Calls to ${number.phone_number} already ring Lighthouse`);
}

// The API key that signs calling tokens.
let apiKey = process.env.TWILIO_API_KEY?.trim();
let apiSecret = process.env.TWILIO_API_SECRET?.trim();
if (apiKey && apiSecret) {
  console.log(`✓ API key: ${apiKey} (kept)`);
} else {
  const key = await api("/Keys.json", { method: "POST", form: { FriendlyName: NAME } });
  apiKey = key.sid;
  apiSecret = key.secret;
  console.log(`✓ API key: ${apiKey} (new; its secret is shown only now)`);
}

const env = {
  TWILIO_ACCOUNT_SID: sid,
  TWILIO_AUTH_TOKEN: authToken,
  TWILIO_API_KEY: apiKey,
  TWILIO_API_SECRET: apiSecret,
  TWILIO_TWIML_APP_SID: app.sid,
  TWILIO_CALLER_ID: number.phone_number,
};
const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);

if (envFile) {
  const was = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const MARK = "# The phone's Twilio line (scripts/twilio-setup.mjs)";
  const kept = was.split("\n").filter((l) => l !== MARK && !Object.keys(env).some((k) => l.startsWith(`${k}=`)));
  while (kept.length && kept.at(-1) === "") kept.pop();
  writeFileSync(envFile, `${[...kept, "", MARK, ...lines].join("\n").replace(/^\n/, "")}\n`);
  console.log(`\n✓ Written to ${envFile}. Restart the app to pick them up.`);
}
console.log(`\nThe server's environment (Vercel: Project → Settings → Environment Variables), server only:\n\n${lines.join("\n")}\n`);
