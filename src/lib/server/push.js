/**
 * Web Push from the server: a notification on someone's desktop even while
 * every Lighthouse tab is closed. Each browser's push service (Google's for
 * Chrome and Edge on Android, Mozilla's, Apple's, Microsoft's) takes the
 * message and wakes the browser's worker (public/sw.js), which shows it.
 *
 * The server's keys, in its environment (Vercel: Project → Settings →
 * Environment Variables); make a pair once with `npx web-push generate-vapid-keys`:
 *
 *   VAPID_PUBLIC_KEY     given to browsers when they subscribe
 *   VAPID_PRIVATE_KEY    signs each message; never leaves the server
 *   VAPID_SUBJECT        how a push service can reach us: mailto:… or https://…
 *   PUSH_DELIVER_SECRET  what the database must send to ask for a push
 */

import "server-only";
import webpush from "web-push";

/** The keys, or null while push is not set up. */
export function pushServer() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:alerts@signaturemktg.net";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Push one message to one browser. Resolves with the push service's status;
 * a 404 or 410 means the browser has gone (unsubscribed, cleared, reinstalled).
 */
export async function sendPush(subscription, payload) {
  const keys = pushServer();
  if (!keys) throw new Error("Push is not set up");
  try {
    const res = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      { vapidDetails: keys, TTL: 24 * 60 * 60, urgency: "high", timeout: 10_000 }
    );
    return { status: res.statusCode, gone: false };
  } catch (err) {
    const status = err?.statusCode ?? 0;
    return { status, gone: status === 404 || status === 410, error: err?.body || err?.message };
  }
}
