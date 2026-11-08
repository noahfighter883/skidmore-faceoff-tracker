// Lets the app load at the rink without Wi-Fi once it has been opened online.
// Serves the saved copy straight away and refreshes it in the background.
const CACHE = 'skidmore-faceoffs-4';
const FILES = ['./', 'index.html', 'styles.css', 'js/app.js', 'js/stats.js', 'js/store.js', 'js/seed.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
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

  const refresh = fetch(request).then(async (response) => {
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  });

  event.respondWith(caches.match(request, { ignoreSearch: true }).then((saved) => {
    if (!saved) return refresh;
    event.waitUntil(refresh.catch(() => {}));
    return saved;
  }));
});
