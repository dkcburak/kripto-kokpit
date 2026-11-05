// node test/masa.test.js — Trader Masası ajan kuralları ve Profesör (MEXC'ye istek atmaz, sahte mumlar)
'use strict';
var assert = require('assert'), A = require('../trader-masasi/ajanlar.js'), P = require('../trader-masasi/profesor.js'), B = require('./masa-backtest.js');
var n = 0; function t(ad, fn) { fn(); n++; console.log('ok', ad); }
function yatay(adet, adim, bas) { var o = []; for (var i = 0; i < adet; i++) { var p = 100 + (i % 2); o.push({ time: bas + i * adim, open: p, high: p + 1, low: p - 1, close: p, vol: 1000 }); } return o; }

t('kirilim: zirve + hacim 3x -> long plan; hacim 1x -> yok', function () {
  var h = yatay(40, 14400, 0); h.push({ time: 40 * 14400, open: 101, high: 106, low: 100, close: 105, vol: 3000 });
  var p = A.kirilim(h, 40); assert(p && p.yon === 'long' && p.stop < p.giris[0] && p.tp1 > p.giris[1] && p.tp2 > p.tp1 && p.rr === 2, JSON.stringify(p));
  h[40].vol = 1000; assert.strictEqual(A.kirilim(h, 40), null);
});
t('trend: 55 gün zirvesi + EMA50>EMA200 -> plan, takip stop alanları var', function () {
  var d = []; for (var i = 0; i < 260; i++) { var p = 100 + i * 0.5; d.push({ time: i * 86400, open: p, high: p + 1, low: p - 1, close: p, vol: 1 }); }
  var p2 = A.trend(d, 259); assert(p2 && p2.takipAtr === 3 && p2.atr > 0 && p2.tutma === 20, JSON.stringify(p2));
  d[259].close = 100; assert.strictEqual(A.trend(d, 259), null);
});
t('funding: negatif funding + EMA20 altı + fitilli yeşil mum -> plan; pozitif funding -> yok', function () {
  var h = yatay(40, 3600, 0); h.push({ time: 40 * 3600, open: 98, high: 99.5, low: 94, close: 99, vol: 2000 });
  assert(A.funding(h, 40, -0.0005, 105), 'plan bekleniyordu');
  assert.strictEqual(A.funding(h, 40, 0.0002, 105), null);
  assert.strictEqual(A.funding(h, 40, -0.0005, 90), null, 'EMA20 üstünde olmamalı');
});
t('guc: liderler BTC EMA50 üstünde ve getiri BTC üstü; geri çekilme + yeşil kapanış -> plan', function () {
  var btc = [], alt = [], zayif = [];
  for (var i = 0; i < 60; i++) { var p = 100 + i; btc.push({ time: i, open: p, high: p + 1, low: p - 1, close: p }); var a2 = 100 + i * 2; alt.push({ time: i, open: a2, high: a2 + 1, low: a2 - 1, close: a2 }); zayif.push({ time: i, open: 50, high: 51, low: 49, close: 50 }); }
  var l = A.gucLiderler({ ALT: alt, ZAYIF: zayif, BTC: btc }, btc, 59, 5);
  assert.deepStrictEqual(l, ['ALT'], JSON.stringify(l));
  var h = []; for (i = 0; i < 60; i++) { var q = 100 + i * 0.3; h.push({ time: i * 14400, open: q, high: q + .5, low: q - .5, close: q, vol: 1 }); }
  for (i = 60; i < 69; i++) { var c0 = h[i - 1].close + (i < 68 ? -0.25 : 0.1); h.push({ time: i * 14400, open: h[i - 1].close, high: Math.max(h[i - 1].close, c0) + .2, low: Math.min(h[i - 1].close, c0) - .2, close: c0, vol: 1 }); }
  var e = A.ema(h.slice(0, 69).map(function (x) { return x.close; }), 20);
  h[69] = { time: 69 * 14400, open: h[68].close, high: e * 1.02, low: h[68].close - .1, close: e * 1.015, vol: 1 };
  var r = A.rsi(h, 68, 14), p2 = A.guc(h, 69);
  assert(r >= 40 && r <= 55, 'RSI ' + r);
  assert(p2 && p2.trader === 'guc', JSON.stringify(p2));
});
t('ilerlet: stop, hedef, süre, takip stop', function () {
  var p = { giris: 100, stop: 95, stop0: 95, tp1: 110.3, rr: 2, tutma: 3, say: 0 };
  assert.strictEqual(A.ilerlet(p, { high: 101, low: 94, close: 96 }).r, -1);
  p.say = 0; assert.strictEqual(A.ilerlet(p, { high: 111, low: 99, close: 110 }).r, 2);
  p.say = 2; var s = A.ilerlet(p, { high: 103, low: 99, close: 102.5 }); assert(s.neden === 'süre' && s.r > 0 && s.r < 1, JSON.stringify(s));
  var q = { giris: 100, stop: 91, stop0: 91, tp1: 130, rr: 3, tutma: 20, say: 0, takipAtr: 3, atr: 3 };
  assert.strictEqual(A.ilerlet(q, { high: 120, low: 105, close: 118 }), null); assert(q.stop > 91 && q.birR);
  var s2 = A.ilerlet(q, { high: 119, low: 100, close: 101 }); assert(s2 && s2.neden === 'takip stop' && s2.r > 0, JSON.stringify(s2));
});
t('profesör: sert kurallar sırayla, yumuşak puan', function () {
  var simdi = 1e12, s = { trader: 'kirilim', coin: 'SOL', yon: 'long', giris: [100, 101], stop: 95, tp1: 112, rr: 2, veriZamani: simdi - 60000 };
  var d = { simdi: simdi, acik: [], sonStop: {}, gunSonuc: 0, gunBaslangic: 100, karne: {}, gozlem: {}, btcYon: 'yukari', fiyat: { SOL: 100.5 } };
  assert.strictEqual(P.karar(s, d).karar, 'onay');
  assert.strictEqual(P.karar(Object.assign({}, s, { rr: 1.2 }), d).kural[0], 'rr');
  assert.strictEqual(P.karar(Object.assign({}, s, { yon: 'short', stop: 106, tp1: 90 }), d).kural[0], 'short');
  assert.strictEqual(P.karar(s, Object.assign({}, d, { acik: [{ coin: 'SOL' }] })).kural[0], 'ayniCoin');
  assert.strictEqual(P.karar(s, Object.assign({}, d, { acik: [{ coin: 'A', yon: 'long' }, { coin: 'B', yon: 'long' }] })).kural[0], 'havuz');
  assert.strictEqual(P.karar(s, Object.assign({}, d, { gunSonuc: -25 })).kural[0], 'gunluk');
  assert.strictEqual(P.karar(Object.assign({}, s, { veriZamani: simdi - 3e6 }), d).kural[0], 'eski');
  assert.strictEqual(P.karar(Object.assign({}, s, { stop: 80 }), d).kural[0], 'lik');
  var g = P.karar(s, Object.assign({}, d, { gozlem: { kirilim: true } })); assert(g.kagit === true && g.karar === 'onay', JSON.stringify(g));
  var b = P.karar(s, Object.assign({}, d, { btcYon: 'asagi' })); assert(b.karar === 'onay' && b.puan === 70, JSON.stringify(b));
  var w = P.karar(s, Object.assign({}, d, { btcYon: 'asagi', acik: [{ coin: 'X', yon: 'long' }] })); assert.strictEqual(w.karar, 'bekle');
  var r = P.karar(s, Object.assign({}, d, { btcYon: 'asagi', acik: [{ coin: 'X', yon: 'long' }], olay: true })); assert.strictEqual(r.karar, 'ret');
});
t('simule: iki sinyal, biri hedef biri stop', function () {
  var m = yatay(10, 14400, 0); m[5] = { time: 5 * 14400, open: 100, high: 115, low: 99, close: 112, vol: 1 }; m[8] = { time: 8 * 14400, open: 100, high: 101, low: 90, close: 92, vol: 1 };
  var k = B.simule([{ t: 4 * 14400, coin: 'X', trader: 'a', plan: { stop: 95, tp1: 110.3, rr: 2, tutma: 12 } }, { t: 7 * 14400, coin: 'X', trader: 'a', plan: { stop: 95, tp1: 110.3, rr: 2, tutma: 12 } }], { X: m }, 14400, 0);
  assert.strictEqual(k.length, 2); assert.strictEqual(k[0].r, 2); assert.strictEqual(k[1].r, -1);
  var o = B.ozet(k); assert(o.n === 2 && o.toplamR === 1 && o.isabet === 50 && o.maxDD === -1, JSON.stringify(o));
});
console.log(n + ' test geçti');
