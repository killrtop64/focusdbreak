const CACHE = 'focus-break-v1.0.0';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './styles.css', './app.js', './core.js', './i18n.js', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(asset => new URL(asset, ROOT).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('focus-break-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== ROOT.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    // Never cache error pages or redirects to a hosting sign-in screen.
    if (response.ok && !response.redirected) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return (await caches.match(new URL('./index.html', ROOT).href)) || Response.error();
    return Response.error();
  }));
});
