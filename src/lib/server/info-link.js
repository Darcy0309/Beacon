/**
 * The private link a client fills in their Project Info from when they come
 * on board (Sean, Oct 2026), before they have signed in to Lighthouse: it
 * names the project, when the link stops working, and the key the project's
 * Project Info held when it was made, signed so none of it can be altered or
 * made up. A new key (Stop earlier links) ends every link made before it.
 * Opened without signing in (app/client-profile/[token]). Signed with a key
 * derived from the server's own secret, apart from the lead sheet's links.
 */

import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const INFO_LINK_DAYS = 30;

function key() {
  const secret = process.env.LEAD_SHEET_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", "lighthouse-project-info-link").update(secret).digest();
}

const sign = (k, body) => createHmac("sha256", k).update(body).digest("base64url");

/** A new key for a project's links. */
export const newLinkKey = () => randomBytes(12).toString("base64url");

/** The token for a project's Project Info with its current `linkKey`, good for `days`; null when the server has no secret. */
export function infoToken(projectId, linkKey, days = INFO_LINK_DAYS) {
  const k = key();
  if (!k || !linkKey) return null;
  const body = Buffer.from(`${projectId}.${Math.floor(Date.now() / 1000) + days * 86400}.${linkKey}`).toString("base64url");
  return `${body}.${sign(k, body)}`;
}

/**
 * What a token opens: { projectId, linkKey, expires } (expires: a Date), or
 * null when it was altered, made up or has expired. The caller still checks
 * the key against the project's own: a newer one ends this link.
 */
export function readInfoToken(token) {
  const k = key();
  const [body, mac] = String(token ?? "").split(".");
  if (!k || !body || !mac || body.length > 200) return null;
  const want = Buffer.from(sign(k, body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [project, exp, linkKey] = Buffer.from(body, "base64url").toString().split(".");
  const projectId = Number(project);
  if (!Number.isSafeInteger(projectId) || projectId < 1 || !linkKey || !(Number(exp) * 1000 > Date.now())) return null;
  return { projectId, linkKey, expires: new Date(Number(exp) * 1000) };
}

/** Whether a key the token carries is the project's own, compared in constant time. */
export function sameKey(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
