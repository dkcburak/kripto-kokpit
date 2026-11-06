// node test/masa-izle.test.js — Trader Masası saatlik izleme (MEXC'ye istek atmaz, sahte veri)
'use strict';
var assert = require('assert'), I = require('../trader-masasi/izle.js'), n = 0;
function t(ad, fn) { return Promise.resolve().then(fn).then(function () { n++; console.log('ok', ad); }); }
var SN = 1792450000 - (1792450000 % 86400), SIMDI = SN * 1000;
function seri(adet, adim, bitis, fiyat, egim) { var o = []; for (var i = 0; i < adet; i++) { var p = fiyat + (i - adet) * egim + (i % 2) * 0.2; o.push({ time: bitis - (adet - i) * adim, open: p, high: p + 0.5, low: p - 0.5, close: p, vol: 1000 }); } return o; }
function paket(m) { return { success: true, data: { time: m.map(function (x) { return x.time; }), open: m.map(function (x) { return x.open; }), high: m.map(function (x) { return x.high; }), low: m.map(function (x) { return x.low; }), close: m.map(function (x) { return x.close; }), vol: m.map(function (x) { return x.vol; }) } }; }
function sahte(coinler, kirilimCoin) {
  return function (url) {
    if (/ticker$/.test(url)) return Promise.resolve({ success: true, data: coinler.map(function (c) { return { symbol: c + '_USDT', amount24: 9e8, lastPrice: 100, fundingRate: 0.0001 }; }) });
    if (/detail$/.test(url)) return Promise.resolve({ success: true, data: [] });
    if (/funding_rate/.test(url)) return Promise.resolve({ success: true, data: { resultList: [{ fundingRate: 0.0001 }, { fundingRate: 0.0001 }, { fundingRate: 0.0001 }] } });
    if (/tarayici\.json/.test(url)) return Promise.resolve({ surum: 1, zaman: SIMDI - 60000, coinler: [{ coin: 'ETH', analizZamani: '5 Kas 03:00', plan: { yon: 'long', giris: [99, 100], stop: 95, tp1: 110, tp2: 115 }, ozet: 'test' }] });
    var c = /kline\/([A-Z]+)_USDT\?interval=(\w+)/.exec(url), coin = c[1], ar = c[2];
    if (ar === 'Day1') return Promise.resolve(paket(seri(270, 86400, SN, 100, 0.1)));
    if (ar === 'Min60') return Promise.resolve(paket(seri(48, 3600, SN, 100, 0)));
    var h4 = seri(80, 14400, SN, 100, 0);
    if (coin === kirilimCoin) { var k = h4[79]; k.open = 100.5; k.high = 106; k.low = 100; k.close = 105; k.vol = 4000; }
    return Promise.resolve(paket(h4));
  };
}
var testler = [
  t('ilk çalışma: kırılım sinyali Profesör onayı alır, dKc planı kayda girer, özet dolu', async function () {
    var s = await I.izle(sahte(['BTC', 'ETH', 'SOL'], 'SOL'), null, SIMDI);
    var kk = s.kararlar.filter(function (x) { return x.trader === 'kirilim'; });
    assert(kk.length === 1 && kk[0].coin === 'SOL' && kk[0].karar === 'onay', JSON.stringify(s.kararlar));
    assert(s.kararlar.some(function (x) { return x.trader === 'dkc' && x.coin === 'ETH'; }), 'dKc kaydı yok');
    assert(s.acik.some(function (x) { return x.coin === 'SOL' && x.trader === 'kirilim' && !x.sanal; }), 'kağıt işlem açılmalı');
    assert.strictEqual(s.ozet.ajanlar.kirilim.durum, 'pozisyonda');
    assert(s.ozet.onayli.length >= 1 && s.ozet.onayli[0].mumlar.length === 60, 'onaylı grafik verisi');
    assert.strictEqual(s.ozet.ajanlar.trend.gozlem, true);
    assert(s.ozet.havuz.acik >= 1 && s.btcYon, JSON.stringify(s.ozet.havuz));
  }),
  t('ikinci çalışma: aynı mum tekrar sinyal üretmez, durum korunur', async function () {
    var s1 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI);
    var s2 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), JSON.parse(JSON.stringify(s1)), SIMDI + 60000);
    assert.strictEqual(s2.kararlar.filter(function (x) { return x.trader === 'kirilim'; }).length, 1);
    assert.strictEqual(s2.acik.length, s1.acik.length);
  }),
  t('dolum: aralığa değmeyen mum doldurmaz, 12 mum sonra iptal; değen mum üst sınırdan doldurur', async function () {
    var s1 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI);
    var p = s1.acik.filter(function (x) { return x.coin === 'SOL' && x.trader === 'kirilim'; })[0]; assert(p && !p.dolum, 'ilk çalışmada dolum beklenmez');
    // sonraki 13 mum aralığın (101-105) üstünde: dolmaz, iptal
    var yuksek = function (url) { var c = /kline\/([A-Z]+)_USDT\?interval=(\w+)/.exec(url); if (c && c[2] === 'Hour4') { var h = seri(80, 14400, SN + 13 * 14400, 100, 0); for (var i = 66; i < 80; i++) { h[i].open = 110; h[i].high = 112; h[i].low = 108; h[i].close = 111; } return Promise.resolve(paket(h)); } return sahte(['BTC', 'SOL'], 'SOL')(url); };
    var s2 = await I.izle(yuksek, JSON.parse(JSON.stringify(s1)), SIMDI + 13 * 14400000);
    var k = s2.kapali.filter(function (x) { return x.coin === 'SOL' && x.neden === 'dolmadı'; }); assert.strictEqual(k.length, 1);
    assert.strictEqual(I.karne(s2.kapali, 'kirilim').hepsi.n, 0, 'dolmayan işlem karneye girmez');
    // aralığa değen mum: açılış 106, dip 104 -> dolum 105 (üst sınır)
    var deger = function (url) { var c = /kline\/([A-Z]+)_USDT\?interval=(\w+)/.exec(url); if (c && c[2] === 'Hour4') { var h = seri(80, 14400, SN + 14400, 100, 0); h[79].open = 106; h[79].high = 107; h[79].low = 104; h[79].close = 106.5; return Promise.resolve(paket(h)); } return sahte(['BTC', 'SOL'], 'SOL')(url); };
    var s3 = await I.izle(deger, JSON.parse(JSON.stringify(s1)), SIMDI + 14400000);
    var q = s3.acik.filter(function (x) { return x.coin === 'SOL' && x.trader === 'kirilim'; })[0]; assert(q && Math.abs(q.dolum - 105) < 1e-9, JSON.stringify(q));
  }),
  t('listeden düşen coin: açık işlem yine izlenir; verisi gelmezse özet çökmez', async function () {
    var s1 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI);
    assert(s1.acik.some(function (x) { return x.coin === 'SOL'; }));
    // SOL artık ticker'da yok ama mum verisi var: işlem ilerler, özette kalır
    var s2 = await I.izle(sahte(['BTC', 'ETH'], 'YOK'), JSON.parse(JSON.stringify(s1)), SIMDI + 14400000);
    assert(s2.acik.some(function (x) { return x.coin === 'SOL'; }) && s2.ozet.onayli.some(function (x) { return x.coin === 'SOL' && x.mumlar.length === 60; }), 'SOL izlenmeli');
    // SOL mum isteği de başarısız: hata listesine girer, özet yine üretilir
    var kirik = function (url) { if (/kline\/SOL_/.test(url)) return Promise.reject(new Error('erişilemedi')); return sahte(['BTC', 'ETH'], 'YOK')(url); };
    var s3 = await I.izle(kirik, JSON.parse(JSON.stringify(s1)), SIMDI + 14400000);
    assert(s3.hatalar.some(function (h) { return /^SOL/.test(h); }) && s3.ozet.onayli.some(function (x) { return x.coin === 'SOL' && x.mumlar.length === 0; }), JSON.stringify(s3.hatalar));
  }),
  t('karne: kapalı işlemlerden son 30 ve tümü', function () {
    var k = I.karne([{ trader: 'a', r: 2 }, { trader: 'a', r: -1 }, { trader: 'b', r: 1 }], 'a');
    assert(k.hepsi.n === 2 && k.hepsi.toplamR === 1 && k.hepsi.isabet === 50, JSON.stringify(k));
  })
];
Promise.all(testler).then(function () { console.log(n + ' test geçti'); }, function (e) { console.error(e); process.exit(1); });
