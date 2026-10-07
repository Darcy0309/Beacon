/**
 * A private link to one lead's sheet, for a delivery address that gets a
 * link instead of the sheet: it names the lead and when the link stops
 * working, signed so it cannot be altered or made up. Opened without
 * signing in (app/sheet/[token]). The signing key is derived from the
 * server's own secret, so nothing new needs setting.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const LINK_DAYS = 90;

function key() {
  const secret = process.env.LEAD_SHEET_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHmac("sha256", "lighthouse-lead-sheet-link").update(secret).digest();
}

const sign = (k, body) => createHmac("sha256", k).update(body).digest("base64url");

/** The token for a lead's sheet, good for `days`; null when the server has no secret. */
export function sheetToken(leadId, days = LINK_DAYS) {
  const k = key();
  if (!k) return null;
  const body = Buffer.from(`${leadId}.${Math.floor(Date.now() / 1000) + days * 86400}`).toString("base64url");
  return `${body}.${sign(k, body)}`;
}

/** The lead a token opens, or null when it was altered, made up or has expired. */
export function readSheetToken(token) {
  const k = key();
  const [body, mac] = String(token ?? "").split(".");
  if (!k || !body || !mac) return null;
  const want = Buffer.from(sign(k, body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [lead, exp] = Buffer.from(body, "base64url").toString().split(".").map(Number);
  if (!Number.isSafeInteger(lead) || lead < 1 || !(exp * 1000 > Date.now())) return null;
  return lead;
}
