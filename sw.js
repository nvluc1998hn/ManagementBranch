// Service worker — cache-first cho app shell.
// BUMP version này (edubranch-v2, ...) mỗi khi sửa index.html/app.js/data.js/style.css
const CACHE_NAME = "edubranch-v25";
const PRECACHE = ["/", "index.html", "app.js?v=25", "data.js?v=25", "style.css?v=25", "assets/tnl-logo.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request)),
  );
});
