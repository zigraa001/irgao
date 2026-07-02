// IraGo operator push service worker.
//
// Receives Web Push deliveries (dispatch offers) and shows a notification even
// when the operator tab is backgrounded/locked. Clicking the notification
// focuses/opens the operator console so the pilot can accept quickly.
self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'IraGo', body: event.data ? event.data.text() : 'New update' };
  }
  const title = data.title || 'IraGo — new ride request';
  const options = {
    body: data.body || 'You have a new dispatch offer.',
    tag: 'irago-offer-' + (data.offerId || data.requestId || Date.now()),
    renotify: true,
    requireInteraction: data.service === 'golden', // golden = air ambulance, keep visible
    data: { url: '/login/operator', requestId: data.requestId, offerId: data.offerId },
    icon: '/assets/images/irago-icon.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/login/operator';
  event.waitUntil(
    (async function () {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.includes('/login/operator') || client.url.includes('/app.html')) {
          try { await client.focus(); } catch (e) {}
          client.postMessage && client.postMessage({ type: 'push_clicked', offerId: event.notification.data && event.notification.data.offerId });
          return;
        }
      }
      try {
        await self.clients.openWindow(url);
      } catch (e) {}
    })()
  );
});
