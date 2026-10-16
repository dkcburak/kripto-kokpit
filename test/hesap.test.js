// node test/hesap.test.js
var H = require('../hesap.js'), assert = require('assert'), n = 0;
function t(ad, fn) { fn(); n++; console.log('ok', ad); }
var L = { yon: 'long', giris: [100, 110], stop: 95, tp1: 125, tp2: 140 };
var S = { yon: 'short', giris: [100, 110], stop: 115, tp1: 85 };
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
t('rsiSeri', function () {
  var r = H.rsiSeri([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], 14);
  assert.strictEqual(r[13], null); assert.strictEqual(r[14], 100); assert.strictEqual(r.length, 16);
  // Bilinen örnek (Wilder, 14): ilk RSI ~70.46
  var k = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
  var x = H.rsiSeri(k, 14); assert(Math.abs(x[14] - 70.46) < 0.1, x[14]); assert(x[15] < x[14]);
});
t('karar', function () {
  var tamam = { coin: 'X', durum: 'long', plan: L, fiyat: 105, tf: { d: 'yukari', h4: 'yukari', h1: 'onay' }, haberler: [] };
  var k = H.karar(tamam, { mod: 'Temkinli' }); assert.strictEqual(k.renk, 'yesil'); assert.strictEqual(k.ad, 'Girişe uygun');
  // 1S onayı yok -> sarı
  k = H.karar(Object.assign({}, tamam, { tf: { d: 'yukari', h4: 'yukari', h1: 'yok' } })); assert.strictEqual(k.renk, 'sari'); assert(k.eksik.indexOf('1S onayı yok') >= 0); assert(!k.teknik && k.temel && k.fiyat);
  // 4S ters
  k = H.karar(Object.assign({}, tamam, { tf: { d: 'yukari', h4: 'asagi', h1: 'onay' } })); assert.strictEqual(k.renk, 'sari');
  // ters yüksek haber, aynı yöndeki haber sorun değil
  k = H.karar(Object.assign({}, tamam, { haberler: [{ etki: 'Yüksek', yon: 'Olumsuz' }] })); assert.strictEqual(k.renk, 'sari'); assert(!k.temel);
  assert.strictEqual(H.karar(Object.assign({}, tamam, { haberler: [{ etki: 'Yüksek', yon: 'Olumlu' }, { etki: 'Orta', yon: 'Olumsuz' }] })).renk, 'yesil');
  // piyasa riskten kaçış long'u durdurur
  assert.strictEqual(H.karar(tamam, { mod: 'Riskten kaçış' }).renk, 'sari');
  // fiyat bölgede değil
  k = H.karar(Object.assign({}, tamam, { fiyat: 120 })); assert.strictEqual(k.renk, 'sari'); assert(/girişe %/.test(k.eksik[0]));
  // analiz bekle diyorsa yeşil olmaz
  assert.strictEqual(H.karar(Object.assign({}, tamam, { durum: 'bekle' })).renk, 'sari');
  // stop geçildi -> kırmızı; plan yok -> kırmızı; uzak -> kırmızı
  assert.strictEqual(H.karar(Object.assign({}, tamam, { fiyat: 94 })).renk, 'kirmizi');
  assert.strictEqual(H.karar({ coin: 'Y', durum: 'bekle', plan: null }).renk, 'kirmizi');
  assert.strictEqual(H.karar(Object.assign({}, tamam, { durum: 'uzak' })).renk, 'kirmizi');
  // short
  var ks = H.karar({ coin: 'Z', durum: 'short', plan: S, fiyat: 105, tf: { d: 'asagi', h4: 'asagi', h1: 'asagi' }, haberler: [{ etki: 'Yüksek', yon: 'Olumsuz' }] }, { mod: 'Riskten kaçış' });
  assert.strictEqual(ks.renk, 'yesil'); assert.strictEqual(ks.sinif, 'A'); assert.strictEqual(ks.riskYuzde, 1);
  // short stopun ötesinde -> kırmızı
  assert.strictEqual(H.karar({ coin: 'Z', durum: 'short', plan: S, fiyat: 116, tf: { d: 'asagi', h4: 'asagi', h1: 'onay' } }).renk, 'kirmizi');
  // short B sınıfı: 1G yatay + 4S aşağı; risk %0,5, 1S 'asagi' yetmez, 'onay' gerekir
  var b = { coin: 'Z', durum: 'short', plan: S, fiyat: 105, tf: { d: 'yatay', h4: 'asagi', h1: 'asagi' } };
  k = H.karar(b); assert.strictEqual(k.sinif, 'B'); assert.strictEqual(k.riskYuzde, 0.5); assert.strictEqual(k.renk, 'sari');
  b.tf.h1 = 'onay'; assert.strictEqual(H.karar(b).renk, 'yesil');
  // short piyasa filtresi ve funding
  assert.strictEqual(H.karar(b, { mod: 'Risk açık' }).renk, 'sari');
  assert.strictEqual(H.karar(Object.assign({}, b, { funding: -0.0005 })).renk, 'sari');
  // trend tersi (C) asla yeşil olmaz
  k = H.karar({ coin: 'Z', durum: 'short', plan: S, fiyat: 105, tf: { d: 'yukari', h4: 'asagi', h1: 'onay' } }); assert.strictEqual(k.sinif, 'C'); assert.strictEqual(k.renk, 'sari');
  // 4S yatay long -> sarı
  assert.strictEqual(H.karar(Object.assign({}, tamam, { tf: { d: 'yukari', h4: 'yatay', h1: 'onay' } })).renk, 'sari');
  // ücret sonrası kazanç/risk 1,5 altı -> sarı
  k = H.karar(Object.assign({}, tamam, { plan: { yon: 'long', giris: [100, 110], stop: 95, tp1: 120 } })); assert.strictEqual(k.renk, 'sari'); assert(/ücret sonrası/.test(k.eksik.join()));
  // eski analiz -> sarı
  assert.strictEqual(H.karar(tamam, null, { analizSaat: 13 }).renk, 'sari');
  assert.strictEqual(H.karar(tamam, null, { analizSaat: 3 }).renk, 'yesil');
});
t('planGecerli tp2 sırası', function () {
  assert(!H.planGecerli({ yon: 'long', giris: [100, 110], stop: 95, tp1: 125, tp2: 120 }));
  assert(!H.planGecerli({ yon: 'short', giris: [100, 110], stop: 115, tp1: 90, tp2: 95 }));
});
t('planHesap risk ve ücret', function () {
  var h = H.planHesap(L, 0.5); assert(Math.abs(h.poz - 0.5 / 9.5238095 * 100) < 1e-3); assert(h.r1Net < h.r1);
  assert.strictEqual(H.planHesap(L).riskYuzde, 1);
});
t('analizYasi', function () {
  var simdi = new Date(2026, 9, 16, 14, 0).getTime();
  assert.strictEqual(H.analizYasi('16 Eki 08:00', simdi), 6);
  assert.strictEqual(H.analizYasi('15 Eki 19:30', simdi), 18.5);
  assert.strictEqual(H.analizYasi('', simdi), null);
  assert(H.analizYasi('31 Ara 10:00', simdi) > 24 * 200);
});
t('toplamRisk yön başına', function () {
  var p = [{ coin: 'A', yon: 'long', giris: 100, buyukluk: 1000, stop: 96 }, { coin: 'B', yon: 'short', giris: 10, buyukluk: 1000, stop: 10.4 }];
  var r = H.toplamRisk(p, { A: 100, B: 10 }, 1000); assert(Math.abs(r.yuzde - 8) < 1e-9); assert(!r.asildi); assert(Math.abs(r.yonler.short - 4) < 1e-9);
});
t('turevHesap', function () {
  var oi = [{ sumOpenInterestValue: '100' }, { sumOpenInterestValue: '110' }];
  var d = H.turevHesap(oi, [{ longShortRatio: '3' }], { lastFundingRate: '0.0001' }, -2);
  assert(Math.abs(d.oiDeg24 - 10) < 1e-9); assert.strictEqual(d.longYuzde, 75); assert(/yeni short/.test(d.okuma[0])); assert(/kalabalık taraf long/.test(d.okuma[1]));
  assert(/yeni long/.test(H.turevHesap(oi, [], {}, 3).okuma[0]));
  assert(/yatay/.test(H.turevHesap([{ sumOpenInterestValue: '100' }, { sumOpenInterestValue: '101' }], null, null, 5).okuma[0]));
  assert.strictEqual(H.turevHesap([], null, null, 0), null);
  assert.strictEqual(H.binanceSembol('PEPE'), '1000PEPEUSDT'); assert.strictEqual(H.binanceSembol('SOL'), 'SOLUSDT');
});
t('likidasyonHesap', function () {
  var H0 = 1700000000000, sa = 3600000, oi = [], mum = [], ls = [];
  // 100 civarı yatay mumlar (tipik fiyat 100); ikinci saatte açık pozisyon 1000 artıyor, long oranı %60
  for (var i = 0; i < 6; i++) { mum.push([H0 + i * sa, '100', '100.6', '99.4', '100']); oi.push({ timestamp: H0 + (i + 1) * sa, sumOpenInterestValue: i < 1 ? '5000' : '6000' }); ls.push({ timestamp: H0 + (i + 1) * sa, longShortRatio: '1.5' }); }
  var d = H.likidasyonHesap(oi, mum, ls, 100);
  assert.strictEqual(d.kume.length, 6, 'yakın 100x kümeleri mumla silinir'); // 100x long 99.5 ve short 100.5'e değdi
  var top = d.kume.reduce(function (a, k) { return a + k.v; }, 0); assert(Math.abs(top - 1000 * 0.85) < 1e-6);
  var l10 = d.kume.filter(function (k) { return k.yon === 'long' && Math.abs(k.p - 90.5) < 1e-9; })[0]; assert(l10 && Math.abs(l10.v - 1000 * 0.6 * 0.35) < 1e-9);
  assert(d.alt.p < 100 && d.ust.p > 100 && d.alt.uzak < 0);
  // pozisyon yarıya inerse kümeler yarıya iner
  oi[5].sumOpenInterestValue = '3000';
  var y = H.likidasyonHesap(oi, mum, ls, 100), top2 = y.kume.reduce(function (a, k) { return a + k.v; }, 0); assert(Math.abs(top2 - top / 2) < 1e-6);
  // fiyat 92'ye inerse 10x long kümesi (90,5) durur, 25x (96,5) silinir
  var z = H.likidasyonHesap(oi, mum.concat([[H0 + 6 * sa, '100', '100', '92', '93']]), ls, 93);
  assert(z.kume.some(function (k) { return k.yon === 'long' && k.p < 91; })); assert(!z.kume.some(function (k) { return k.yon === 'long' && k.p > 93; }));
  var b = H.likidasyonDilim(d.kume, 80, 120, 40); assert.strictEqual(b.length, 40); assert(b[10] > 0); // 90,5 → dilim 10
  assert.strictEqual(H.likidasyonHesap([], [], [], 1), null);
});
console.log(n + ' test geçti');
