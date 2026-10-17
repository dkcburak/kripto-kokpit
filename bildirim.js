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
  // Sinyal bildirimi: A+/A sınıfı sinyal geldiğinde bu cihazda bildirim gösterir (uygulama açıkken).
  // OneSignal v16'da sendSelfNotification yok; bildirim servis çalışanından (showNotification) gösterilir.
  // veri: { coin, yon, sinif, skor, maks, giris, stop, tp1 } (sayılar app.js'te biçimlenmiş metin)
  // Aynı coin+yon+sinif için 30 dk içinde tekrar göndermez (spam engeli, localStorage "bildirilenSinyaller").
  var SINYAL_ANAHTAR = 'bildirilenSinyaller', SINYAL_ARA = 30 * 60 * 1000, SINYAL_SAKLA = 7 * 24 * 60 * 60 * 1000;
  function sinyalBildir(veri) {
    if (!veri || !veri.coin || !veri.yon) return Promise.resolve(false);
    if (veri.sinif !== 'A+' && veri.sinif !== 'A') return Promise.resolve(false);
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return Promise.resolve(false);
    var kayit = {};
    try { kayit = JSON.parse(localStorage.getItem(SINYAL_ANAHTAR) || '{}') || {}; } catch (e) { kayit = {}; }
    var imza = veri.coin + '_' + veri.yon + '_' + veri.sinif, simdi = Date.now();
    if (kayit[imza] && simdi - kayit[imza] < SINYAL_ARA) return Promise.resolve(false); // 30 dk dolmadı
    kayit[imza] = simdi;
    // 7 günden eski kayıtları temizle
    Object.keys(kayit).forEach(function (k) { if (!(simdi - kayit[k] <= SINYAL_SAKLA)) delete kayit[k]; });
    try { localStorage.setItem(SINYAL_ANAHTAR, JSON.stringify(kayit)); } catch (e) { /* yok say */ }
    var baslik = (veri.sinif === 'A+' ? '🔥 ' : '⚡ ') + veri.coin + ' ' + (veri.yon === 'short' ? 'SHORT' : 'LONG') + ' sinyali';
    var govde = (veri.sinif === 'A+' ? 'Güçlü sinyal' : 'Sinyal') + ' · Skor ' + veri.skor + '/' + (veri.maks || 17);
    if (veri.giris) govde += ' · Giriş: ' + veri.giris;
    if (veri.stop) govde += ' · Stop: ' + veri.stop;
    if (veri.tp1) govde += ' · TP1: ' + veri.tp1;
    var kapsam = location.pathname.replace(/[^/]*$/, '');
    return navigator.serviceWorker.getRegistration(kapsam).then(function (r) {
      if (!r) throw new Error('Servis çalışanı yok');
      return r.showNotification(baslik, { body: govde, tag: 'sinyal-' + imza, icon: kapsam + 'ikon-192.png', data: { dkc: true, url: location.origin + kapsam + '#/coin/' + encodeURIComponent(veri.coin) } });
    }).then(function () { return true; }, function (e) {
      // gösterilemediyse kayıt geri alınır; bir sonraki denemede yeniden dener
      try { var k2 = JSON.parse(localStorage.getItem(SINYAL_ANAHTAR) || '{}') || {}; delete k2[imza]; localStorage.setItem(SINYAL_ANAHTAR, JSON.stringify(k2)); } catch (x) { /* yok say */ }
      if (window.console) console.error('Sinyal bildirimi gösterilemedi:', e);
      return false;
    });
  }
  // Bildirilen sinyalleri sıfırla (test için)
  function sinyalBildirimSifirla() {
    try { localStorage.removeItem(SINYAL_ANAHTAR); } catch (e) { /* yok say */ }
  }

  window.KOKPIT_BILDIRIM = {
    sinyalBildir: sinyalBildir,
    sinyalBildirimSifirla: sinyalBildirimSifirla,
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
  window.DKC_BILDIRIM = window.KOKPIT_BILDIRIM; // kısa ad (konsol testi için)
})();
