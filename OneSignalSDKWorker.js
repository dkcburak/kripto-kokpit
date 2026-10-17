importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');

// dKc: internetsiz açılış. Önce ağ (güncel sürüm hep gelir), ağ yoksa son kaydedilen kopya.
// Yalnızca bu sitenin dosyaları; veri servisi ve MEXC istekleri önbelleğe alınmaz.
var DKC_ONBELLEK = 'dkc-kabuk-v12';
var DKC_DOSYALAR = ['./', 'index.html', 'app.css?v=12', 'app.js?v=12', 'hesap.js?v=12', 'canli.js?v=12', 'bildirim.js?v=12', 'ornek.js?v=12', 'ayar.js',
  'lib/lightweight-charts-4.2.0.js', 'manifest.webmanifest', 'ikon.svg', 'ikon-180.png', 'ikon-192.png'];

// dKc sinyal bildirimi (bildirim.js showNotification): dokununca coin sayfası açılır. OneSignal bildirimlerine karışmaz.
self.addEventListener('notificationclick', function (e) {
  var d = e.notification && e.notification.data;
  if (!d || !d.dkc || !d.url) return;
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (l) {
    for (var i = 0; i < l.length; i++) if (l[i].url.indexOf(self.registration.scope) === 0 && 'focus' in l[i]) { l[i].navigate(d.url).catch(function () {}); return l[i].focus(); }
    return self.clients.openWindow(d.url);
  }));
});
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
  // Sürüm etiketi olmayan dosyalar (sayfanın kendisi, ayar.js) tarayıcı önbelleği atlanarak sunucuya sorulur;
  // böylece yeni sürüm yayına girer girmez görünür (GitHub Pages sayfayı 10 dakika önbellekte tutar).
  var taze = istek.mode === 'navigate' || u.search.indexOf('v=') < 0;
  var ag = taze ? fetch(istek.mode === 'navigate' ? new Request(istek.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(istek, { cache: 'no-cache' })) : fetch(istek);
  e.respondWith(ag.then(function (yanit) {
    if (yanit && yanit.ok && yanit.type === 'basic') { var kopya = yanit.clone(); caches.open(DKC_ONBELLEK).then(function (c) { c.put(istek, kopya); }); }
    return yanit;
  }).catch(function () {
    return caches.match(istek)
      .then(function (r) { return r || (istek.mode === 'navigate' ? caches.match(new URL('index.html', self.registration.scope).href) : null); })
      .then(function (r) { return r || Response.error(); });
  }));
});
