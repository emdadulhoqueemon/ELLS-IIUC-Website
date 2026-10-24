/**
 * ELLS Club - PWA Service Worker (v1.1.0)
 * Dual-PWA Support: Public Site (manifest.json) & IT Secretary Admin Console (admin-manifest.json).
 * Provides offline asset caching, network-first document navigations,
 * and resilient performance for mobile and desktop devices.
 */

const CACHE_NAME = 'ells-cache-v2';

const STATIC_ASSETS = [
  './',
  'index.html',
  'about.html',
  'events.html',
  'membership.html',
  'admin.html',
  'css/style.css',
  'css/responsive.css',
  'css/polish.css',
  'css/admin.css',
  'js/main.js',
  'js/admin.js',
  'js/theme-switcher.js',
  'images/ELLS LOGO Favicon.svg',
  'images/IIUC LOGO Favicon.svg',
  'manifest.json',
  'admin-manifest.json'
];

// Install: Cache critical static assets immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Claim clients and purge outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy depending on request type
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Bypass service worker for external APIs & Firebase
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('api.imgbb.com') ||
    url.hostname.includes('facebook.com')
  ) {
    return;
  }

  // Navigation requests (HTML pages): Network-first with Cache fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // If navigating to admin while offline, fallback to admin.html
          if (request.url.includes('admin')) {
            const adminCached = await caches.match('admin.html');
            if (adminCached) return adminCached;
          }
          // Otherwise fallback to home page
          return caches.match('index.html');
        })
    );
    return;
  }

  // Static assets (CSS, JS, SVGs, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback silently if offline and fetch fails
      });

      return cachedResponse || fetchPromise;
    })
  );
});
