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
        data: { url: data.url || "/notifications" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
