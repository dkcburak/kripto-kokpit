importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// dKc: internetsiz açılış. Önce ağ (güncel sürüm hep gelir), ağ yoksa son kaydedilen kopya.
// Yalnızca bu sitenin dosyaları; veri servisi ve MEXC istekleri önbelleğe alınmaz.
var DKC_ONBELLEK = 'dkc-kabuk-v4';
var DKC_DOSYALAR = ['./', 'index.html', 'app.css?v=4', 'app.js?v=4', 'hesap.js?v=4', 'canli.js?v=4', 'bildirim.js?v=4', 'ornek.js?v=4', 'ayar.js',
  'lib/lightweight-charts-4.2.0.js', 'manifest.webmanifest', 'ikon.svg', 'ikon-180.png', 'ikon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(DKC_ONBELLEK).then(function (c) { return c.addAll(DKC_DOSYALAR); }).catch(function () { /* biri eksikse kurulum yine sürer */ }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('dkc-') === 0 && k !== DKC_ONBELLEK; }).map(function (k) { return caches.delete(k); }));
  }));
});
self.addEventListener('fetch', function (e) {
  var istek = e.request, u = new URL(istek.url);
  if (istek.method !== 'GET' || u.origin !== self.location.origin) return;
  e.respondWith(fetch(istek).then(function (yanit) {
    if (yanit && yanit.ok && yanit.type === 'basic') { var kopya = yanit.clone(); caches.open(DKC_ONBELLEK).then(function (c) { c.put(istek, kopya); }); }
    return yanit;
  }).catch(function () {
    return caches.match(istek)
      .then(function (r) { return r || (istek.mode === 'navigate' ? caches.match(new URL('index.html', self.registration.scope).href) : null); })
      .then(function (r) { return r || Response.error(); });
  }));
});
