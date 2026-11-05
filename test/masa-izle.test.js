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
  t('karne: kapalı işlemlerden son 30 ve tümü', function () {
    var k = I.karne([{ trader: 'a', r: 2 }, { trader: 'a', r: -1 }, { trader: 'b', r: 1 }], 'a');
    assert(k.hepsi.n === 2 && k.hepsi.toplamR === 1 && k.hepsi.isabet === 50, JSON.stringify(k));
  })
];
Promise.all(testler).then(function () { console.log(n + ' test geçti'); }, function (e) { console.error(e); process.exit(1); });
