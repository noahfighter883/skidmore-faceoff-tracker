// Lets the app load at the rink without Wi-Fi once it has been opened online.
// Serves the saved copy straight away and refreshes it in the background.
const CACHE = 'skidmore-faceoffs-6';
const FILES = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/stats.js', 'js/store.js', 'js/seed.js'];

// GitHub Pages lets browsers reuse files for 10 minutes, so both downloads below skip or
// recheck that cache. Otherwise a new version can install with old code.
self.addEventListener('install', (event) => {
  const fresh = FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  const refresh = fetch(request.url, { cache: 'no-cache' }).then(async (response) => {
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  });

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((saved) => {
    if (!saved) return refresh;
    event.waitUntil(refresh.catch(() => {}));
    return saved;
  }));
});
