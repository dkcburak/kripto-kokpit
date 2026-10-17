// node test/canli.test.js — canli.js 15dk göstergeleri (tarayıcı nesneleri taklit edilir)
var fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert'), n = 0;
var H = require('../hesap.js');
function t(ad, fn) { fn(); n++; console.log('ok', ad); }
function yukle(simdi) {
  var win = { DKC_HESAP: H, WebSocket: null, addEventListener: function () {} };
  var ctx = { window: win, document: { hidden: true, addEventListener: function () {} }, Date: { now: function () { return simdi; } }, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval, JSON: JSON, Math: Math, Number: Number, Object: Object, Array: Array };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'canli.js'), 'utf8'), ctx);
  return win.DKC_CANLI;
}
// 15dk mumlar: zaman saniye, fiyat ve hacim verilen fonksiyonla
function mumlar(adet, son, fiyatFn, hacimFn) {
  var o = []; for (var i = 0; i < adet; i++) { var p = fiyatFn(i); o.push({ time: son - (adet - 1 - i) * 900, open: p, high: p * 1.001, low: p * 0.999, close: p, vol: hacimFn ? hacimFn(i) : 100 }); }
  return o;
}
var SIMDI = 1792000000000, SON = SIMDI / 1000 - 60;
t('m15 başarılı: yükselen seri, düşük fiyatlı coin', function () {
  var C = yukle(SIMDI);
  C.m15Tohum('PEPE', mumlar(60, SON, function (i) { return 0.00001 * (1 + i * 0.002 + (i % 3 === 0 ? -0.001 : 0)); }, function (i) { return i === 58 ? 300 : 100; }));
  var g = C.m15('PEPE');
  assert(g, 'gösterge yok');
  assert(g.ema9 > 0 && g.ema21 > 0 && g.ema9 > g.ema21, 'EMA yuvarlanıp 0 olmamalı');
  assert.strictEqual(g.yon, 'yukari');
  assert(g.rsi > 50 && g.rsi <= 100);
  assert.strictEqual(g.hacim, 300); assert.strictEqual(g.hacimOrt, 100); // son kapanmış mum / önceki 20
  var r = H.rsiSeri(mumlar(60, SON, function (i) { return 0.00001 * (1 + i * 0.002 + (i % 3 === 0 ? -0.001 : 0)); }).map(function (m) { return m.close; }), 14);
  assert.strictEqual(g.rsi, Math.round(r[r.length - 1] * 10) / 10); // hesap.js rsiSeri ile aynı
  var z = H.m15Zamanlama(g, 'long'); assert.strictEqual(z.puan, 2); // EMA + hacim; RSI yüksek
});
t('m15 hatalı: az veri, eski veri, bozuk fiyat', function () {
  var C = yukle(SIMDI);
  C.m15Tohum('SOL', mumlar(20, SON, function () { return 150; }));
  assert.strictEqual(C.m15('SOL'), null); // 30 mumdan az
  C.m15Tohum('ETH', mumlar(60, SON - 3600, function (i) { return 3000 + i; }));
  assert.strictEqual(C.m15('ETH'), null); // son mum 1 saatten eski
  C.m15Tohum('BTC', mumlar(60, SON, function (i) { return i === 30 ? NaN : 80000 + i; }));
  assert.strictEqual(C.m15('BTC'), null);
  assert.strictEqual(C.m15('YOK'), null);
  C.m15Tohum(null, null); C.m15Tohum('X', 'bozuk'); // hata atmaz
});
t('m15Tohum birleştirme: tekrar eden zaman tek mum, sınır 100', function () {
  var C = yukle(SIMDI), a = mumlar(120, SON, function (i) { return 10 + i * 0.01; });
  C.m15Tohum('ADA', a.slice(0, 80)); C.m15Tohum('ADA', a.slice(40));
  var g = C.m15('ADA'); assert(g); assert.strictEqual(g.sonZaman, SON); assert.strictEqual(g.kapanis, a[119].close);
});
console.log(n + ' test geçti');
