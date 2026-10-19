// node test/tarayici.test.js — tarayıcı plan kuralları (MEXC'ye istek atmaz, sahte mumlar)
'use strict';
var assert = require('assert'), T = require('../tarayici/tara.js'), H = require('../hesap.js'), n = 0;
function t(ad, fn) { return Promise.resolve().then(fn).then(function () { n++; console.log('ok', ad); }); }

// Eğimli seri: her mum %egim değişir, kapanış zamanı simdi'den önce
function seri(adet, bas, egim, adimSn, sonSn, salinim) {
  var o = [];
  for (var i = 0; i < adet; i++) {
    var p = bas * Math.pow(1 + egim, i) * (1 + (salinim || 0.004) * Math.sin(i));
    o.push({ time: sonSn - (adet - i) * adimSn, open: p * 0.998, high: p * 1.01, low: p * 0.99, close: p });
  }
  return o;
}
var SN = 1792450000;

var testler = [
  t('trend: yükselen seri yukarı, düşen aşağı, kısa seri null', function () {
    assert.strictEqual(T.trend(seri(80, 100, 0.01, 14400, SN)), 'yukari');
    assert.strictEqual(T.trend(seri(80, 100, -0.01, 14400, SN)), 'asagi');
    assert.strictEqual(T.trend(seri(30, 100, 0.01, 14400, SN)), null);
  }),
  t('başarılı: 1G ve 4S yukarı, fiyat EMA20 bölgesinde -> geçerli long planı, R:R ≥ 1,5, bölge ≥ %0,6', function () {
    var h4 = seri(200, 100, 0.002, 14400, SN), d = seri(120, 60, 0.005, 86400, SN);
    var e20 = T.ema(h4.map(function (m) { return m.close; }), 20);
    var o = T.planUret('SOL', { d: d, h4: h4 }, e20 * 1.002, 0.0001, true);
    assert.ok(o.plan, o.neden);
    assert.strictEqual(o.plan.yon, 'long'); assert.strictEqual(o.durum, 'long');
    assert.ok(H.planGecerli(o.plan));
    var h = H.planHesap(o.plan); assert.ok(h.r1Net >= 1.5 - 1e-6, 'r1Net ' + h.r1Net); assert.ok(h.kalUygun);
    assert.ok((o.plan.giris[1] - o.plan.giris[0]) / o.plan.giris[0] >= 0.0059);
    // Uygulamanın sınıf kuralı: 1G ve 4S plan yönünde -> A
    assert.strictEqual(H.planSinif({ coin: 'SOL', plan: o.plan, tf: o.tf }, {}).sinif, 'A');
  }),
  t('başarılı: 1G ve 4S aşağı -> short; ilk 20 dışıysa short verilmez', function () {
    var h4 = seri(200, 100, -0.002, 14400, SN), d = seri(120, 200, -0.005, 86400, SN);
    var e20 = T.ema(h4.map(function (m) { return m.close; }), 20);
    var o = T.planUret('ETH', { d: d, h4: h4 }, e20 * 0.999, 0.0001, true);
    assert.ok(o.plan, o.neden); assert.strictEqual(o.plan.yon, 'short');
    assert.ok(o.plan.stop > o.plan.giris[1] && o.plan.tp1 < o.plan.giris[0]);
    var o2 = T.planUret('KUCUK', { d: d, h4: h4 }, e20 * 0.999, 0.0001, false);
    assert.ok(!o2.plan); assert.ok(/short verilmez/.test(o2.neden));
  }),
  t('hatalı: 4S ve 1G ters, fiyat bölgenin stop tarafında, funding aşırı, uzak fiyat -> plan yok', function () {
    var yuk = seri(200, 100, 0.002, 14400, SN), dus = seri(120, 200, -0.005, 86400, SN);
    var e20 = T.ema(yuk.map(function (m) { return m.close; }), 20);
    assert.ok(!T.planUret('X', { d: dus, h4: yuk }, e20, 0.0001, true).plan, 'ters trend');
    var d = seri(120, 60, 0.005, 86400, SN);
    assert.ok(/altında/.test(T.planUret('X', { d: d, h4: yuk }, e20 * 0.95, 0.0001, true).neden));
    assert.ok(/funding/.test(T.planUret('X', { d: d, h4: yuk }, e20, 0.002, true).neden));
    assert.ok(/uzak/.test(T.planUret('X', { d: d, h4: yuk }, e20 * 1.5, 0.0001, true).neden));
  }),
  t('evren: stabil/altın/hisse elenir, hacim eşiği ve sıralama', function () {
    var l = T.evren([
      { symbol: 'BTC_USDT', amount24: 3e9, lastPrice: 82000, fundingRate: 0.0001 },
      { symbol: 'USDC_USDT', amount24: 9e9, lastPrice: 1 },
      { symbol: 'PAXG_USDT', amount24: 5e8, lastPrice: 4000 },
      { symbol: 'TSLASTOCK_USDT', amount24: 5e8, lastPrice: 400 },
      { symbol: 'SOL_USDT', amount24: 9e8, lastPrice: 107 },
      { symbol: 'AZ_USDT', amount24: 1e6, lastPrice: 1 },
      { symbol: 'ETH_USD', amount24: 9e9, lastPrice: 2400 }
    ]);
    assert.deepStrictEqual(l.map(function (x) { return x.coin; }), ['BTC', 'SOL']);
  }),
  t('tara: sahte MEXC ile uçtan uca; bozuk coin yalnız kendisi düşer, açık mum hesaba girmez', function () {
    var h4 = seri(200, 100, 0.002, 14400, SN), d = seri(120, 60, 0.005, 86400, SN);
    var e20 = T.ema(h4.map(function (m) { return m.close; }), 20);
    // Açık (kapanmamış) mum: kapanışı çok yüksek; plan sonucu değişmemeli
    var acik = { time: SN - 100, open: 1, high: 1e6, low: 1, close: 1e6 };
    function paket(m) { return { success: true, data: { time: m.map(function (x) { return x.time; }), open: m.map(function (x) { return x.open; }), high: m.map(function (x) { return x.high; }), low: m.map(function (x) { return x.low; }), close: m.map(function (x) { return x.close; }) } }; }
    var getJson = function (url) {
      if (/ticker$/.test(url)) return Promise.resolve({ success: true, data: [{ symbol: 'SOL_USDT', amount24: 9e8, lastPrice: e20, fundingRate: 0.0001 }, { symbol: 'BOZUK_USDT', amount24: 5e8, lastPrice: 1, fundingRate: 0 }] });
      if (/BOZUK/.test(url)) return Promise.resolve({ success: false });
      return Promise.resolve(paket((/Hour4/.test(url) ? h4 : d).concat([acik])));
    };
    return T.tara(getJson, SN * 1000).then(function (s) {
      assert.strictEqual(s.taranan, 2);
      assert.strictEqual(s.coinler.length, 1); assert.strictEqual(s.coinler[0].coin, 'SOL');
      assert.strictEqual(s.coinler[0].kaynak, 'tarayici');
      assert.ok(/^\d{1,2} [A-ZÇĞİÖŞÜ][a-zçğıöşü]{2} \d\d:\d\d$/.test(s.coinler[0].analizZamani));
      assert.ok(H.analizYasi(s.coinler[0].analizZamani, SN * 1000) < 0.1, 'analiz yaşı okunmalı');
      assert.strictEqual(s.hatalar.length, 1);
      assert.deepStrictEqual(s.hacimListesi, ['SOL', 'BOZUK']);
      assert.ok(H.coinTemizle(s.coinler[0]).plan, 'uygulama planı geçerli saymalı');
    });
  }),
  t('hatalı: MEXC ticker bozuk gelirse tarama hata verir (boş liste yazılmaz)', function () {
    return T.tara(function () { return Promise.resolve({ success: false }); }, SN * 1000).then(function () { throw new Error('hata beklenirdi'); }, function (e) { assert.ok(/beklenmedik/.test(e.message)); });
  })
];
testler.reduce(function (p, x) { return p.then(function () { return x; }); }, Promise.resolve())
  .then(function () { console.log(n + ' test geçti'); }, function (e) { console.error('KALDI:', e.message); process.exit(1); });
