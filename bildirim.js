// Telefon bildirimleri (OneSignal). App ID ayar.js içinde; boşsa bildirim kapalı kalır.
(function () {
  var AYAR = window.KOKPIT_AYAR || {};
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var anaEkranda = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var hazir = false;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  if (AYAR.onesignalAppId) {
    var yol = location.pathname.replace(/[^/]*$/, '');
    var s = document.createElement('script'); s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'; s.defer = true; document.head.appendChild(s);
    OneSignalDeferred.push(function (OneSignal) {
      return OneSignal.init({ appId: AYAR.onesignalAppId, serviceWorkerPath: yol.slice(1) + 'OneSignalSDKWorker.js', serviceWorkerParam: { scope: yol }, notifyButton: { enable: false }, allowLocalhostAsSecureOrigin: true })
        .then(function () { hazir = true; OneSignal.Notifications.addEventListener('permissionChange', function () { window.dispatchEvent(new HashChangeEvent('hashchange')); }); });
    });
  }
  // İnternetsiz açılış için önbellek: OneSignal'ın kullandığı aynı servis çalışanı dosyası (aynı kapsam)
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    var kapsam = location.pathname.replace(/[^/]*$/, '');
    navigator.serviceWorker.getRegistration(kapsam).then(function (r) { if (!r) navigator.serviceWorker.register(kapsam + 'OneSignalSDKWorker.js', { scope: kapsam }).catch(function () {}); else r.update().catch(function () {}); }).catch(function () {});
    // Uygulama öne gelince yeni sürüm var mı diye bakılır
    document.addEventListener('visibilitychange', function () { if (!document.hidden) navigator.serviceWorker.getRegistration(kapsam).then(function (r) { if (r) r.update().catch(function () {}); }).catch(function () {}); });
  }
  window.KOKPIT_BILDIRIM = {
    durum: function () {
      if (!AYAR.onesignalAppId) return 'kurulmadi';
      if (!('Notification' in window) || (ios && !anaEkranda)) return 'desteklenmiyor';
      return Notification.permission === 'granted' ? 'acik' : 'kapali';
    },
    // Bu cihazın bildirim abonelik kimliği (eşlemede sunucuya gider: bildirimler yalnızca eşli cihazlara)
    aboneId: function () {
      if (!AYAR.onesignalAppId) return Promise.resolve('');
      return new Promise(function (bitti) {
        var zaman = setTimeout(function () { bitti(''); }, 4000);
        OneSignalDeferred.push(function (OneSignal) { clearTimeout(zaman); bitti((OneSignal.User && OneSignal.User.PushSubscription && OneSignal.User.PushSubscription.id) || ''); });
      });
    },
    ac: function () {
      return new Promise(function (bitti) {
        OneSignalDeferred.push(function (OneSignal) {
          return OneSignal.Notifications.requestPermission().then(function () { return OneSignal.User.PushSubscription.optIn(); }).then(bitti, bitti);
        });
      });
    }
  };
})();
