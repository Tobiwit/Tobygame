/* Tobygame service worker: only shows admin push notifications and opens the app on tap.
   No caching, so new deploys show up immediately. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: event.data ? event.data.text() : 'Tobygame' };
    }
    event.waitUntil(self.registration.showNotification(data.title || 'Tobygame', {
        body: data.body || '',
        icon: 'assets/icon-192.png',
        badge: 'assets/icon-192.png',
        tag: data.tag ? `${data.tag}-${Date.now()}` : undefined,
        data: { url: data.url || './' },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        for (const w of wins) {
            if ('focus' in w) {
                w.postMessage({ open: 'admin' });
                return w.focus();
            }
        }
        return self.clients.openWindow(target);
    }));
});
