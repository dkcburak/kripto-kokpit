// node test/kirilim-izle.test.js — kırılım kuru izleme kuralları (MEXC'ye istek atmaz, sahte mumlar)
'use strict';
var assert = require('assert'), K = require('../tarayici/kirilim.js'), n = 0;
function t(ad, fn) { return Promise.resolve().then(fn).then(function () { n++; console.log('ok', ad); }); }
var ADIM = 14400, SN = 1792450000, SIMDI = SN * 1000;
// Yatay 40 mum (zirve 101, hacim 1000), ardından kırılım mumu
function yatay(adet, sonKapanis) {
  var o = [];
  for (var i = 0; i < adet; i++) { var p = 100 + (i % 2); o.push({ time: sonKapanis - (adet - i) * ADIM, open: p, high: p + 1, low: p - 1, close: p, vol: 1000 }); }
  return o;
}
function kirilim(h, vol, kapanis) { var son = h[h.length - 1]; return { time: son.time + ADIM, open: 101, high: kapanis + 1, low: 100, close: kapanis, vol: vol }; }
function paket(m) { return { success: true, data: { time: m.map(function (x) { return x.time; }), open: m.map(function (x) { return x.open; }), high: m.map(function (x) { return x.high; }), low: m.map(function (x) { return x.low; }), close: m.map(function (x) { return x.close; }), vol: m.map(function (x) { return x.vol; }) } }; }
function sahte(coinMumlari) {
  return function (url) {
    if (/ticker$/.test(url)) return Promise.resolve({ success: true, data: Object.keys(coinMumlari).map(function (c) { return { symbol: c + '_USDT', amount24: 9e8, lastPrice: 100, fundingRate: 0 }; }) });
    if (/detail$/.test(url)) return Promise.resolve({ success: true, data: [] });
    var c = /kline\/([A-Z]+)_USDT/.exec(url)[1];
    return Promise.resolve(paket(coinMumlari[c]));
  };
}
function senaryo(volK, kapanis) {
  var h = yatay(40, SN - ADIM), k = kirilim(h, volK * 1000, kapanis), acik = { time: SN, open: 103, high: 104, low: 102, close: 103, vol: 10 };
  return h.concat([k, acik]);
}
// Yatay mumlar SN-2*ADIM'a kadar, kırılım mumu SN-ADIM (kapanmış), son mum SN'de başlayan açık mum.
function kaydir(m) { return m; }

var testler = [
  t('sinyal: önceki 20 zirvesi aşılır ve hacim patlar -> sinyal; hacim yetmezse ya da zirve aşılmazsa yok', function () {
    var h = yatay(40, SN);
    var kr = h.concat([kirilim(h, 3000, 106)]);
    assert.ok(K.sinyal(kr, kr.length - 1, 2.5));
    assert.ok(!K.sinyal(kr, kr.length - 1, 4), 'hacim 3x, eşik 4x');
    var az = h.concat([kirilim(h, 3000, 101)]);
    assert.ok(!K.sinyal(az, az.length - 1, 2.5), 'zirve (102) aşılmadı');
    assert.ok(!K.sinyal(h.slice(0, 15), 14, 2.5), 'kısa seri');
  }),
  t('ilerlet: stop, hedef, süre ve aynı mumda ikisi = stop; tekrar işlenmez', function () {
    var p = { t: 100, sonKontrol: 0, say: 0, tutma: 3, giris: 100, risk: 2, u: 0.1, stop: 98, tp: 104.3 };
    var m = function (time, low, high, close) { return { time: time, low: low, high: high, close: close }; };
    assert.strictEqual(K.ilerlet(Object.assign({}, p), [m(100, 97, 105, 101)]).neden, 'stop');
    assert.strictEqual(K.ilerlet(Object.assign({}, p), [m(100, 99, 105, 101)]).neden, 'hedef');
    var q = Object.assign({}, p);
    assert.strictEqual(K.ilerlet(q, [m(100, 99, 101, 100.5), m(200, 99, 101, 100.5)]), null);
    var s = K.ilerlet(q, [m(100, 99, 101, 100.5), m(200, 99, 101, 100.5), m(300, 99, 101, 101.9)]);
    assert.strictEqual(s.neden, 'süre'); assert.ok(s.r > 0 && s.r < 2);
    assert.strictEqual(K.ilerlet(Object.assign({}, p, { sonKontrol: 100 }), [m(100, 97, 105, 101)]), null, 'işlenmiş mum atlanır');
  }),
  t('izle: kırılım mumunda ilgili ayarlar işlem açar; aynı mumlar ikinci çalışmada tekrar işlem açmaz', function () {
    var mum = kaydir(senaryo(5, 106));       // hacim 5x: A (2,5) ve B (4) ikisi de tetiklenir
    return K.izle(sahte({ SOL: mum }), null, SIMDI).then(function (d) {
      assert.strictEqual(d.acik.length, 2, JSON.stringify(d.acik));
      assert.deepStrictEqual(d.acik.map(function (p) { return p.ayar; }).sort(), ['A', 'B']);
      var p = d.acik[0]; assert.ok(p.stop < p.giris && p.tp > p.giris && p.giris === 103);
      return K.izle(sahte({ SOL: mum }), JSON.parse(JSON.stringify(d)), SIMDI + 1000).then(function (d2) {
        assert.strictEqual(d2.acik.length, 2, 'tekrar eklenmemeli'); assert.strictEqual(d2.kapali.length, 0);
      });
    });
  }),
  t('izle: hacim 3x yalnız A işlem açar; slot dolunca (B: 1) ikinci coin atlanır', function () {
    return K.izle(sahte({ SOL: kaydir(senaryo(3, 106)) }), null, SIMDI).then(function (d) {
      assert.deepStrictEqual(d.acik.map(function (p) { return p.ayar; }), ['A']);
      return K.izle(sahte({ SOL: kaydir(senaryo(5, 106)), ETH: kaydir(senaryo(6, 106)), XRP: kaydir(senaryo(7, 106)) }), null, SIMDI).then(function (d3) {
        var b = d3.acik.filter(function (p) { return p.ayar === 'B'; }), a = d3.acik.filter(function (p) { return p.ayar === 'A'; });
        assert.strictEqual(b.length, 1); assert.strictEqual(b[0].coin, 'XRP', 'en yüksek hacim patlaması seçilir');
        assert.strictEqual(a.length, 3);
      });
    });
  }),
  t('izle: sonraki çalışmada stop mumu işlemi kapatır, R = -1 yazılır', function () {
    var mum = kaydir(senaryo(5, 106));
    return K.izle(sahte({ SOL: mum }), null, SIMDI).then(function (d) {
      // Giriş mumu (açık mum) kapandıktan sonra: aynı mumu stopun altına düşen kapanmış mum olarak ver
      var gm = mum.slice(0, -1).concat([{ time: SN, open: 103, high: 104, low: 50, close: 60, vol: 10 }, { time: SN + ADIM, open: 60, high: 61, low: 59, close: 60, vol: 10 }]);
      return K.izle(sahte({ SOL: gm }), JSON.parse(JSON.stringify(d)), SIMDI + ADIM * 1000).then(function (d2) {
        assert.strictEqual(d2.acik.length, 0); assert.strictEqual(d2.kapali.length, 2);
        assert.ok(d2.kapali.every(function (x) { return x.r === -1 && x.neden === 'stop'; }));
        assert.strictEqual(d2.ozet.A.toplamR, -1);
      });
    });
  }),
  t('hatalı: mumların çoğu okunamazsa hata verir, bozuk coin yalnız kendisi düşer', function () {
    var mum = kaydir(senaryo(5, 106));
    var getJson = function (url) { return /BOZUK/.test(url) ? Promise.resolve({ success: false }) : sahte({ SOL: mum, BOZUK: mum })(url); };
    return K.izle(getJson, null, SIMDI).then(function (d) {
      assert.strictEqual(d.hatalar.length, 1); assert.strictEqual(d.acik.length, 2);
      return K.izle(function (url) { return /kline/.test(url) ? Promise.resolve({ success: false }) : sahte({ SOL: mum, ETH: mum })(url); }, null, SIMDI).then(function () { throw new Error('hata beklenirdi'); }, function (e) { assert.ok(/okunamadı/.test(e.message)); });
    });
  })
];
testler.reduce(function (p, x) { return p.then(function () { return x; }); }, Promise.resolve())
  .then(function () { console.log(n + ' test geçti'); }, function (e) { console.error('KALDI:', e.message); process.exit(1); });
