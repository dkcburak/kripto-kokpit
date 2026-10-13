// node test/hesap.test.js
var H = require('../hesap.js'), assert = require('assert'), n = 0;
function t(ad, fn) { fn(); n++; console.log('ok', ad); }
var L = { yon: 'long', giris: [100, 110], stop: 95, tp1: 125, tp2: 140 };
var S = { yon: 'short', giris: [100, 110], stop: 115, tp1: 90 };
t('planGecerli', function () {
  assert(H.planGecerli(L)); assert(H.planGecerli(S));
  assert(!H.planGecerli({ yon: 'long', giris: [100, 110], stop: 105, tp1: 125 }));
  assert(!H.planGecerli({ yon: 'long', giris: [100], stop: 95, tp1: 125 }));
  assert(!H.planGecerli({ yon: 'long', giris: [100, 110], stop: 95 }));
  assert(!H.planGecerli(null));
});
t('girisDurumu', function () {
  assert.strictEqual(H.girisDurumu(L, 105).tur, 'bolgede');
  assert.strictEqual(H.girisDurumu(L, 120).tur, 'uzak');
  assert(Math.abs(H.girisDurumu(L, 120).girise - 10 / 120 * 100) < 1e-9);
  assert.strictEqual(H.girisDurumu(L, 98).tur, 'gecti');
  assert.strictEqual(H.girisDurumu(S, 95).tur, 'uzak');
  assert.strictEqual(H.girisDurumu(S, 112).tur, 'gecti');
  assert.strictEqual(H.girisDurumu(L, null), null);
});
t('pozisyonHesap long', function () {
  var h = H.pozisyonHesap({ coin: 'X', yon: 'long', giris: 100, buyukluk: 1000, kaldirac: 5, stop: 95, hedef: 120 }, 110, 2000);
  assert(Math.abs(h.hareket - 10) < 1e-9); assert(Math.abs(h.kz - 100) < 1e-9);
  assert(Math.abs(h.risk - 50) < 1e-9); assert(Math.abs(h.riskYuzde - 2.5) < 1e-9);
  assert(Math.abs(h.r - 2) < 1e-9); assert(Math.abs(h.likidasyon - 80.5) < 1e-9);
  assert(h.stopa > 0 && h.hedefe > 0);
});
t('pozisyonHesap short', function () {
  var h = H.pozisyonHesap({ coin: 'X', yon: 'short', giris: 100, buyukluk: 500, kaldirac: 2, stop: 104 }, 98, 1000);
  assert(Math.abs(h.hareket - 2) < 1e-9); assert(Math.abs(h.kz - 10) < 1e-9);
  assert(Math.abs(h.likidasyon - 149.5) < 1e-9); assert(Math.abs(h.riskYuzde - 2) < 1e-9);
});
t('toplamRisk tavan', function () {
  var p = [{ coin: 'A', yon: 'long', giris: 100, buyukluk: 1000, stop: 95 }, { coin: 'B', yon: 'long', giris: 10, buyukluk: 600, stop: 9.5 }, { coin: 'C', yon: 'long', giris: 1 }];
  var r = H.toplamRisk(p, { A: 101, B: 10, C: 1 }, 1000);
  assert(Math.abs(r.yuzde - 8) < 1e-9); assert(r.asildi); assert.strictEqual(r.bilinmeyen, 1);
  assert(!H.toplamRisk(p.slice(0, 1), { A: 101 }, 2000).asildi);
});
t('coinTemizle', function () {
  assert.strictEqual(H.coinTemizle({}), null);
  var c = H.coinTemizle({ coin: 'SOL', durum: 'long', plan: { yon: 'long', giris: [1, 2], stop: 3, tp1: 4 }, fiyat: 'x' });
  assert.strictEqual(c.plan, null); assert.strictEqual(c.durum, 'bekle'); assert(c.planHatali); assert.strictEqual(c.fiyat, null);
  assert.deepStrictEqual(c.haberler, []);
  assert.strictEqual(H.coinTemizle({ coin: 'A', durum: '???' }).durum, 'bekle');
});
t('guvenliUrl', function () {
  assert.strictEqual(H.guvenliUrl('javascript:alert(1)'), ''); assert.strictEqual(H.guvenliUrl('https://a.b'), 'https://a.b');
});
console.log(n + '/7 geçti');
