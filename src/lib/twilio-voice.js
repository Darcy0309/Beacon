// The phone's Twilio line (Nov 2026): what the server signs, checks and answers
// Twilio with. Pure (node:crypto only), so the routes and the tests share it;
// the keys come from lib/server/twilio.js.

import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/**
 * A browser's calling token: a JWT signed with an API key's secret, saying
 * who it is (`identity`), that it may take calls coming in, and which TwiML
 * App its calls go through. Twilio's own format ("twilio-fpa;v=1").
 */
export function voiceToken({ accountSid, apiKey, apiSecret, appSid, identity, ttl = 600, now = Date.now() }) {
  const iat = Math.floor(now / 1000);
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${apiKey}-${iat}`,
    iss: apiKey,
    sub: accountSid,
    iat,
    nbf: iat,
    exp: iat + ttl,
    grants: { identity, voice: { incoming: { allow: true }, outgoing: { application_sid: appSid } } },
  };
  const body = `${b64url(header)}.${b64url(payload)}`;
  return `${body}.${createHmac("sha256", apiSecret).update(body).digest("base64url")}`;
}

/** What Twilio signs a webhook with: the URL it called, then each posted field (sorted by name) as name + value. */
export function twilioSignature(authToken, url, params) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/**
 * True when X-Twilio-Signature matches: the request came from Twilio, for
 * this account. Twilio may have signed the URL with or without its port (:443).
 */
export function validTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const given = Buffer.from(String(signature));
  const u = new URL(url);
  const urls = new Set([url]);
  if (!u.port) urls.add(`${u.protocol}//${u.hostname}:${u.protocol === "https:" ? 443 : 80}${u.pathname}${u.search}`);
  else if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    urls.add(`${u.protocol}//${u.hostname}${u.pathname}${u.search}`);
  }
  return [...urls].some((candidate) => {
    const want = Buffer.from(twilioSignature(authToken, candidate, params));
    return want.length === given.length && timingSafeEqual(want, given);
  });
}

// A browser's name on Twilio: the Lighthouse user's id ("lh_42"), and back.
export const identityOf = (userId) => `lh_${userId}`;
export function userIdOf(identity) {
  const m = /^(?:client:)?lh_([1-9]\d{0,17})$/.exec(String(identity ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * The number a call from Lighthouse may ring, as Twilio dials it, or null:
 * US and Canadian numbers only (+1, then a ten-digit number whose area code
 * and exchange do not start with 0 or 1), so a stolen session cannot run up
 * calls abroad or to premium lines. The rest of a tel: link (",203", an
 * extension) is returned as the tones to send once answered.
 */
export function callableNumber(to) {
  const [main, ...rest] = String(to ?? "").replace(/^tel:/i, "").split(/[,;]/);
  const d = main.replace(/[^\d+]/g, "");
  const ten = /^\+?1?([2-9]\d{2}[2-9]\d{6})$/.exec(d)?.[1];
  if (!ten || /^(900|976)/.test(ten)) return null;
  const tones = rest.join("").replace(/[^\d*#w]/gi, "");
  return { number: `+1${ten}`, tones: tones ? `ww${tones}` : "" };
}

const XML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
export const xml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => XML[c]);

/** A TwiML document: its verbs, already written ("<Dial>…</Dial>"). */
export const twiml = (inner = "") => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
