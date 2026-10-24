// Çevrimdışı açılış için kabuk önbelleği. Gemini istekleri önbelleğe alınmaz.
var S = 'kasanot-v2';
var DOSYALAR = ['./', 'index.html', 'app.css', 'app.js', 'mantik.js', 'db.js', 'okuma.js', 'manifest.webmanifest', 'ikon.svg', 'ikon-192.png', 'ikon-512.png', 'ikon-180.png', 'yazi/inter-latin-wght-normal.woff2', 'yazi/inter-latin-ext-wght-normal.woff2'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(S).then(function (c) { return c.addAll(DOSYALAR); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== S; }).map(function (x) { return caches.delete(x); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(function (r) {
    var kopya = r.clone(); caches.open(S).then(function (c) { c.put(e.request, kopya); }); return r;
  }).catch(function () { return caches.match(e.request).then(function (r) { return r || caches.match('index.html'); }); }));
});
