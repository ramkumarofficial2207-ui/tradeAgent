// StockSage AI — Service Worker
// Cache-first for static assets, network-first for API calls

const CACHE_NAME = 'stocksage-v2';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Network-first for API calls — always fresh data
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ success: false, message: 'Offline — please reconnect.' }), {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // Network-first for navigation shell to avoid stale black-screen deploys
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
                }
                return response;
            }).catch(async () => {
                const cached = await caches.match('/index.html');
                return cached || Response.error();
            })
        );
        return;
    }

    // Cache-first for static assets (JS, CSS, fonts, images)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match('/index.html'));
        })
    );
});

self.addEventListener('message', (event) => {
    const payload = event.data;
    if (!payload || payload.type !== 'SHOW_NOTIFICATION') return;

    const title = payload.title || 'StockSage AI';
    const body = payload.body || '';
    const data = payload.data || {};

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/vite.svg',
            badge: '/vite.svg',
            tag: data.tag || title,
            data,
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate?.(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
            return undefined;
        })
    );
});
