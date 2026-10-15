/**
 * Lighthouse's push worker. The browser runs it in the background, even with
 * every Lighthouse tab closed, and wakes it when the server pushes a new
 * notification (src/app/api/push/deliver).
 *
 * It shows the notification on the desktop, unless someone is looking at a
 * Lighthouse tab right now: that tab shows its own in-app pop-up. Clicking
 * the desktop one brings Lighthouse to the front on that notification,
 * opening a window when none is open.
 */

const ICON = "/notification-icon.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.focused && w.visibilityState === "visible")) return;
      await self.registration.showNotification(data.title || "Lighthouse", {
        body: data.body || "",
        tag: data.id ? `lighthouse-notification-${data.id}` : "lighthouse",
        icon: ICON,
        badge: ICON,
        // A call-back reminder stays on the desktop until it is clicked or closed.
        requireInteraction: data.kind === "reminder",
        data: { url: data.url || "/notifications" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // A call coming in (features/phone/incoming.js): Answer and Decline go back to the page that is ringing,
  // which answers or declines it. Answer, or the notification itself, brings Lighthouse to the front.
  if (event.notification.data?.kind === "call") {
    const action = event.action === "answer" || event.action === "decline" ? event.action : "show";
    const id = event.notification.data.id;
    event.waitUntil(
      (async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const mine = windows.filter((w) => new URL(w.url).origin === self.location.origin);
        for (const w of mine) w.postMessage({ type: "lighthouse:call", action, id });
        if (action !== "decline") {
          if (mine[0]) await mine[0].focus();
          else await self.clients.openWindow("/");
        }
      })()
    );
    return;
  }

  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        // The page moves itself, keeping its state (notification-bell.jsx).
        open.postMessage({ type: "lighthouse:open", url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
