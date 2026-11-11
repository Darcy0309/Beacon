/**
 * The phone's Twilio line, from the server: calls made and taken in the
 * browser (lib/twilio-voice.js signs and checks; features/phone/twilio-line.js
 * is the browser's side). Its keys, in the server's environment, all made by
 * `node scripts/twilio-setup.mjs` from the account's SID and Auth Token:
 *
 *   TWILIO_ACCOUNT_SID     the account (AC…)
 *   TWILIO_AUTH_TOKEN      checks that a webhook came from Twilio; reads recordings
 *   TWILIO_API_KEY         signs the browsers' calling tokens (SK…)
 *   TWILIO_API_SECRET      …with this secret
 *   TWILIO_TWIML_APP_SID   the TwiML App calls from the browser go through (AP…)
 *   TWILIO_CALLER_ID       the Twilio number calls are made from (+1…)
 */

import "server-only";

const KEYS = {
  accountSid: "TWILIO_ACCOUNT_SID",
  authToken: "TWILIO_AUTH_TOKEN",
  apiKey: "TWILIO_API_KEY",
  apiSecret: "TWILIO_API_SECRET",
  appSid: "TWILIO_TWIML_APP_SID",
  callerId: "TWILIO_CALLER_ID",
};

/** The keys, or null while Twilio is not set up (the phone then hands calls to the computer's calling app). */
export function twilioConfig() {
  const config = Object.fromEntries(Object.entries(KEYS).map(([k, env]) => [k, process.env[env]?.trim() || ""]));
  return Object.values(config).every(Boolean) ? config : null;
}

/** Who may have the phone's Twilio line: the staff who call (as workspace-shell.jsx gives them the phone). */
export const CALLS_ROLES = ["admin", "manager", "agent"];
export const canCall = (user) => Boolean(user) && CALLS_ROLES.includes(user.role) && user.status === "active";

/**
 * Twilio's REST API, as the account: `path` under /2010-04-01/Accounts/{sid}
 * ("/Calls/CA….json"); `form`, the fields posted. Resolves with the JSON
 * answer; throws with Twilio's message on an error.
 */
export async function twilioApi(config, path, { method = "GET", form } = {}) {
  // TWILIO_API_URL only for the tests' stand-in.
  const base = (process.env.TWILIO_API_URL?.trim() || "https://api.twilio.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/2010-04-01/Accounts/${config.accountSid}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.message || `Twilio answered ${res.status}`), { status: res.status, code: data?.code });
  return data;
}

/**
 * Who a text goes out as (Nov 2026): the account's Messaging Service when TWILIO_MESSAGING_SERVICE_SID
 * is set (the usual home of an A2P 10DLC registration), else TWILIO_SMS_FROM, else the number calls
 * are made from. As Twilio's Messages API takes it, with the number replies come back to.
 */
export function textSender(config) {
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim() || config.callerId;
  return { form: service ? { MessagingServiceSid: service } : { From: from }, number: from };
}
