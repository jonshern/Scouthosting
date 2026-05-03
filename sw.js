// Compass service worker — handles browser push notifications.
//
// Lifecycle:
//   - register on the org subdomain (scope: "/")
//   - the page subscribes via the Push API and POSTs the subscription
//     to /push/web-subscribe (server stores it as a PushDevice with
//     provider="webpush")
//   - server pushes a VAPID-signed payload here on incoming DMs
//   - we display a notification and on click route the user back to
//     the chat surface
//
// Payload shape (matches lib/push.js webpushSend):
//   { title, body, data: { channelId?, url?, … } }

self.addEventListener("install", (event) => {
  // Activate immediately on first install so subscribe-and-receive
  // works without a page reload.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Compass", body: event.data.text() };
  }
  const title = payload.title || "Compass";
  const body = payload.body || "";
  const data = payload.data || {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      // Tag groups multiple notifications from the same channel so
      // a user with five unread DMs doesn't see five separate
      // banners stacked.
      tag: data.channelId || "compass-message",
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If a Compass tab is already open, focus it and route there.
      for (const client of clients) {
        try {
          const u = new URL(client.url);
          if (u.hostname === self.location.hostname) {
            client.focus();
            client.navigate(url);
            return;
          }
        } catch {
          // ignore parse failures on weird client URLs
        }
      }
      // No open tab — open one.
      if (self.clients.openWindow) self.clients.openWindow(url);
    }),
  );
});
