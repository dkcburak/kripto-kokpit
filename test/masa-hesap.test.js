// node test/masa-hesap.test.js — hesap simülasyonu (ağ yok, sahte mum)
'use strict';
var assert = require('assert'), S = require('../test/masa-hesap.js'), n = 0;
function t(ad, fn) { fn(); n++; console.log('ok', ad); }
var S4 = 14400, SG = 86400, bas = 1700000000 - (1700000000 % SG);
function mum(i, o, h, l, c) { return { time: bas + i * S4, open: o, high: h, low: l, close: c, vol: 1000 }; }
// 40 yatay mum, 40. mumda kırılım (plan dışarıdan), 41. mum dolum, 43. mumda hedef
var h4 = []; for (var i = 0; i < 40; i++) h4.push(mum(i, 100, 101, 99, 100));
h4.push(mum(40, 100, 106, 100, 105)); h4.push(mum(41, 105, 106, 104, 105.5)); h4.push(mum(42, 105.5, 107, 105, 106)); h4.push(mum(43, 106, 120, 105.5, 118));
var btcD = []; for (var g = 0; g < 70; g++) btcD.push({ time: bas - (70 - g) * SG, open: 100, high: 101, low: 99, close: 100 + g }); // BTC yukarı
var plan = { giris: [101, 105], stop: 99, tp1: 111.3, rr: 2, tutma: 12 };
t('onaylı sinyal dolar, hedefe gider, özkaynak artar; en küçük kontrat kuralı', function () {
  var r = S.simuleHesap([{ t: h4[41].time, coin: 'AAA', trader: 'kirilim', plan: plan, fiyat: 103 }], { AAA: h4 }, btcD, { AAA: { contractSize: 0.1, minVol: 1, priceUnit: 0.1 } }, 100, bas);
  assert.strictEqual(r.islem, 1); assert.strictEqual(r.kararlar.onay, 1);
  var k = r.islemler[0]; assert(k.neden === 'hedef' && k.giris === 105 && k.vol >= 1 && k.pnl > 0 && r.bitisUsdt > 100, JSON.stringify(k));
  assert(Math.abs(k.pnl - k.r * (105 - 99 + 0.105) * k.vol * 0.1) < 0.011);
});
t('en küçük kontrat özkaynağın %1\'inden fazla risk taşıyorsa işlem atlanır', function () {
  var r = S.simuleHesap([{ t: h4[41].time, coin: 'AAA', trader: 'kirilim', plan: plan, fiyat: 103 }], { AAA: h4 }, btcD, { AAA: { contractSize: 1, minVol: 1, priceUnit: 0.1 } }, 100, bas);
  assert.strictEqual(r.islem, 0); assert.strictEqual(r.boyutAtlanan.length, 1); assert(/en küçük kontrat/.test(r.boyutAtlanan[0].neden));
});
t('BTC aşağı + açık işlem varken ikinci sinyal bekle (puan 55), aynı coin ret', function () {
  var btcAsagi = btcD.map(function (x, i) { return { time: x.time, open: 200, high: 201, low: 199, close: 200 - i }; });
  var r = S.simuleHesap([{ t: h4[41].time, coin: 'AAA', trader: 'kirilim', plan: plan, fiyat: 103 }, { t: h4[41].time, coin: 'BBB', trader: 'guc', plan: plan, fiyat: 103 }, { t: h4[42].time, coin: 'AAA', trader: 'guc', plan: plan, fiyat: 103 }], { AAA: h4, BBB: h4 }, btcAsagi, { AAA: { contractSize: 0.1, minVol: 1 }, BBB: { contractSize: 0.1, minVol: 1 } }, 100, bas);
  assert.deepStrictEqual(r.kararlar, { onay: 1, bekle: 1, ayniCoin: 1 }, JSON.stringify(r.kararlar));
});
console.log(n + ' test geçti');
