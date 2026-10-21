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
  k = H.karar(Object.assign({}, tamam, { tf: { d: 'yukari', h4: 'asagi', h1: 'onay' } })); assert.strictEqual(k.renk, 'kirmizi'); assert(k.engel);
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
  k = H.karar({ coin: 'Z', durum: 'short', plan: S, fiyat: 105, tf: { d: 'yukari', h4: 'asagi', h1: 'onay' } }); assert.strictEqual(k.sinif, 'C'); assert.strictEqual(k.renk, 'kirmizi'); assert(k.engel);
  // 4S yatay long -> sarı
  assert.strictEqual(H.karar(Object.assign({}, tamam, { tf: { d: 'yukari', h4: 'yatay', h1: 'onay' } })).renk, 'kirmizi');
  // ücret sonrası kazanç/risk 1,5 altı -> sarı
  k = H.karar(Object.assign({}, tamam, { plan: { yon: 'long', giris: [100, 110], stop: 95, tp1: 120 } })); assert.strictEqual(k.renk, 'sari'); assert(/ücret sonrası/.test(k.eksik.join()));
  // eski analiz -> sarı
  assert.strictEqual(H.karar(tamam, null, { analizSaat: 14 }).renk, 'sari');
  assert.strictEqual(H.karar(tamam, null, { analizSaat: 3 }).renk, 'yesil');
  // 12,5 saatlik gece arası artık eski sayılmaz (sınır 13 saat)
  assert.strictEqual(H.karar(tamam, null, { analizSaat: 12.5 }).renk, 'yesil');
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
t('toplamRisk tek tavan (long + short birlikte)', function () {
  var p = [{ coin: 'A', yon: 'long', giris: 100, buyukluk: 1000, stop: 96 }, { coin: 'B', yon: 'short', giris: 10, buyukluk: 1000, stop: 10.4 }];
  var r = H.toplamRisk(p, { A: 100, B: 10 }, 1000); assert(Math.abs(r.yuzde - 8) < 1e-9); assert(r.asildi); assert(Math.abs(r.yonler.short - 4) < 1e-9);
  assert(!H.toplamRisk(p.slice(0, 1), { A: 100 }, 2000).asildi); // %2
  assert.strictEqual(H.RISK_TAVAN, 3);
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
t('sinyalSkoru başarılı: tüm koşullar uygun -> A+', function () {
  var P = { yon: 'long', giris: [100, 110], stop: 95, tp1: 140 }, m = { rsi: 50, ema9: 2, ema21: 1, hacim: 2, hacimOrt: 1 };
  var c = { durum: 'long', fiyat: 105, funding: 0.0001, plan: P, m15: m, tf: { d: 'yukari', h4: 'yukari', h1: 'onay' } };
  var s = H.sinyalSkoru(c, { mod: 'Temkinli' }, { analizSaat: 2 });
  assert.strictEqual(s.skor, 17); assert.strictEqual(s.sinif, 'A+'); assert.strictEqual(s.renk, 'yesil'); assert.strictEqual(s.veto, null);
  assert.strictEqual(H.karar(c, { mod: 'Temkinli' }, { analizSaat: 2 }).renk, 'yesil');
  // 15m verisi ve funding yoksa puan verilmez: 17 - 2 - 1 = 14, hâlâ A+
  delete c.m15; delete c.funding; s = H.sinyalSkoru(c, { mod: 'Temkinli' });
  assert.strictEqual(s.skor, 14); assert(s.eksik.indexOf('funding verisi yok') >= 0);
  var w = H.SKOR_AGIRLIK, top = 0; for (var k in w) top += w[k]; assert.strictEqual(top, H.sinyalSkoru(c).maks);
});
t('sinyalSkoru hatalı: veto ve tavan', function () {
  var P = { yon: 'long', giris: [100, 110], stop: 95, tp1: 140 }, tf = { d: 'yukari', h4: 'yukari', h1: 'onay' };
  function sk(c, ek) { return H.sinyalSkoru(c, { mod: 'Temkinli' }, ek); }
  // plan sınıfı C (1G ters) yayınlanmaz
  var s = sk({ durum: 'long', fiyat: 105, plan: P, tf: { d: 'asagi', h4: 'yukari', h1: 'onay' } });
  assert.strictEqual(s.skor, 0); assert(/sınıfı C/.test(s.veto));
  assert.strictEqual(sk({ durum: 'uzak', fiyat: 105, plan: P, tf: tf }).veto, 'Analiz: uzak dur');
  assert.strictEqual(sk({ durum: 'long', fiyat: 94, plan: P, tf: tf }).veto, 'Fiyat stopun ötesinde');
  assert.strictEqual(sk({ durum: 'long', fiyat: 105, plan: P, tf: { d: 'yukari', h4: 'asagi', h1: 'onay' } }).veto, '4S ters yönde');
  assert.strictEqual(sk({ durum: 'long', fiyat: 105, plan: { yon: 'long', giris: 100 }, tf: tf }).veto, 'Plan verisi hatalı');
  assert.strictEqual(sk(null).skor, 0);
  // eski analiz (14 saat): puan yüksek ama en fazla B
  s = sk({ durum: 'long', fiyat: 105, funding: 0.0001, plan: P, tf: tf }, { analizSaat: 14 });
  assert(s.skor >= H.SKOR_ESIK.A); assert.strictEqual(s.sinif, 'B'); assert.strictEqual(s.renk, 'sari');
  // B sınıfında 1S onayı yoksa yeşil olmaz
  s = sk({ durum: 'long', fiyat: 105, funding: 0.0001, plan: P, tf: { d: 'yatay', h4: 'yukari', h1: 'bekliyor' } });
  assert.notStrictEqual(s.renk, 'yesil');
  assert.strictEqual(H.m15Zamanlama(null, 'long').puan, 0);
  assert.strictEqual(H.m15Zamanlama({ rsi: 80, ema9: 1, ema21: 2, hacim: 1, hacimOrt: 2 }, 'long').puan, 0);
});
// ATR hesaplama testi (Burak'ın örneği): her mumda TR = 4
t('atrHesap', function () {
  var mumlar = [], fiyat = 100;
  for (var i = 0; i < 30; i++) { mumlar.push({ time: i * 900, open: fiyat, high: fiyat + 2, low: fiyat - 2, close: fiyat + 0.5, vol: 1000 }); fiyat += 0.5; }
  assert(Math.abs(H.atrHesap(mumlar, 7) - 4) < 1e-9);
  assert(Math.abs(H.atrHesap(mumlar) - 4) < 1e-9); // varsayılan periyot 7
  assert.strictEqual(H.atrHesap(mumlar.slice(0, 7), 7), null); // 8 mumdan az
  assert.strictEqual(H.atrHesap(null, 7), null);
  assert.strictEqual(H.trSeri(mumlar)[0], null);
});
t('atrStopTp başarılı: ATR stopu sıkı, plan kurala uyar', function () {
  // Burak'ın örneği: ATR 4 -> ATR stopu 95, analiz stopu ile aynı, korunur
  var a = H.atrStopTp({ yon: 'long', giris: [100, 102], stop: 95, tp1: 110, tp2: 115 }, 4, 101);
  assert.strictEqual(a.kaynak, 'claude'); assert.strictEqual(a.stop, 95); assert.strictEqual(a.tp1, 110);
  var P = { yon: 'long', giris: [80000, 80400], stop: 78800, tp1: 83000, tp2: 84500 };
  a = H.atrStopTp(P, 300, 80200);
  assert.strictEqual(a.kaynak, 'atr'); assert.strictEqual(a.stop, 79750);
  var p2 = { yon: 'long', giris: P.giris, stop: a.stop, tp1: a.tp1, tp2: a.tp2 }, h = H.planHesap(p2);
  assert(H.planGecerli(p2)); assert(h.r1Net >= 1.5 - 1e-9 && h.r1Net < 1.51); assert(h.kalUygun); // ücret sonrası 1,5R
  // short: ATR stopu girişin üstünde, analiz stopundan aşağıda
  var s = H.atrStopTp({ yon: 'short', giris: [100, 102], stop: 110, tp1: 90 }, 2, 101);
  assert.strictEqual(s.kaynak, 'atr'); assert.strictEqual(s.stop, 104); assert(s.tp1 < 100 && s.tp2 <= s.tp1);
  // düşük fiyatlı coin: yuvarlama değeri bozmaz
  var pe = H.atrStopTp({ yon: 'long', giris: [0.0000100, 0.0000102], stop: 0.0000090, tp1: 0.0000130 }, 0.0000002, 0.0000101);
  assert.strictEqual(pe.stop, 0.0000098); assert(pe.tp1 > 0.0000102);
});
t('atrStopTp hatalı: bölge içi, 10x sınırı, geçersiz girdi', function () {
  var P = { yon: 'long', giris: [80000, 80400], stop: 78800, tp1: 83000, tp2: 84500 };
  var a = H.atrStopTp(P, 80, 80200); // ATR stopu 80080: giriş bölgesinin içinde
  assert.strictEqual(a.kaynak, 'claude'); assert.strictEqual(a.stop, 78800); assert(/bölgesinin içinde/.test(a.notlar[0]));
  a = H.atrStopTp({ yon: 'long', giris: [80150, 80250], stop: 78800, tp1: 83000 }, 43, 80200); // ATR stopu 80135,5 (%0,08): %1 risk için 10x yetmez
  assert.strictEqual(a.kaynak, 'claude'); assert(/10x/.test(a.notlar[0]));
  assert.strictEqual(H.atrStopTp(P, 0, 80200), null);
  assert.strictEqual(H.atrStopTp({ yon: 'long', giris: [100], stop: 95, tp1: 110 }, 4, 100), null);
  assert.strictEqual(H.atrStopTp(null, 4, 100), null);
});
t('sinyalSkoruAtr: ayarlı planla baştan skor', function () {
  var mum = [], f = 80200;
  for (var i = 0; i < 30; i++) mum.push({ time: i * 900, open: f, high: f + 100, low: f - 100, close: f, vol: 1 }); // ATR 200
  var c = { durum: 'long', fiyat: 80200, funding: 0.0001, plan: { yon: 'long', giris: [80000, 80400], stop: 78800, tp1: 83000 }, tf: { d: 'yukari', h4: 'yukari', h1: 'onay' }, mumlar: mum };
  var o = H.sinyalSkoruAtr(c, { mod: 'Temkinli' });
  assert.strictEqual(o.atr.kaynak, 'atr'); assert.strictEqual(o.planAyarli.stop, 79900);
  assert(o.detay.rr >= 1.5 - 1e-9); assert.strictEqual(o.skorOzgun, H.sinyalSkoru(c, { mod: 'Temkinli' }).skor);
  assert.strictEqual(c.plan.stop, 78800); // asıl plan değişmez
  delete c.mumlar; assert.strictEqual(H.sinyalSkoruAtr(c).atr, undefined);
  c.mumlar = mum.slice(0, 5); assert.strictEqual(H.sinyalSkoruAtr(c).atrNot, 'ATR için yeterli mum yok');
});
t('haberSentiment başarılı: örnek skorlar ve zaman metni', function () {
  var hs1 = [{ yon: 'Olumlu', etki: 'Yüksek', saat: 2 }, { yon: 'Olumlu', etki: 'Orta', saat: 12 }];
  assert.strictEqual(H.haberSentiment(hs1, 'long').skor, 1.35);
  assert.strictEqual(H.haberSentiment(hs1, 'short').skor, -1.35); // short'ta olumlu haber ters
  var hs3 = [{ yon: 'Olumsuz', etki: 'Yüksek', saat: 1 }, { yon: 'Olumsuz', etki: 'Yüksek', saat: 3 }];
  assert.strictEqual(H.haberSentiment(hs3, 'long').skor, -2);
  assert.strictEqual(H.haberSentiment([{ yon: 'Olumlu', etki: 'Yüksek', saat: 72 }], 'long').skor, 0);
  assert.strictEqual(H.haberTazelik(30), 0.4); assert.strictEqual(H.haberTazelik(undefined), 1);
  // analiz haberlerinde saat yok, zaman metni var: 17 Eki 10:00'da 16 Eki 09:34 haberi ~24,4 saatlik -> 0,4
  var simdi = new Date(2026, 9, 17, 10, 0).getTime();
  assert.strictEqual(H.haberSentiment([{ yon: 'Olumlu', etki: 'Yüksek', zaman: '16 Eki 09:34' }], 'long', simdi).skor, 0.4);
  assert.strictEqual(H.haberSentiment([{ yon: 'Olumlu', etki: 'Yüksek', zaman: '10 Eki 09:34' }], 'long', simdi).skor, 0);
  assert.strictEqual(H.haberSentiment(null, 'long').skor, 0);
  // sinyalSkoruHaber: destekleyen haber puanı artırır, maks 19
  var P = { yon: 'long', giris: [100, 110], stop: 95, tp1: 140 }, tf = { d: 'yukari', h4: 'yukari', h1: 'onay' };
  var c = { durum: 'long', fiyat: 105, funding: 0.0001, plan: P, tf: tf, haberler: [{ yon: 'Olumlu', etki: 'Yüksek', saat: 1 }] };
  var s = H.sinyalSkoruHaber(c, { mod: 'Temkinli' }, { analizSaat: 2 });
  assert.strictEqual(s.skorHabersiz, 15); assert.strictEqual(s.skor, 15.7); assert.strictEqual(s.maks, 19); assert.strictEqual(s.sinif, 'A+');
  assert.strictEqual(H.sinyalSkoru(c, { mod: 'Temkinli' }, { analizSaat: 2 }).maks, 17); // sinyalSkoru değişmedi
});
t('sinyalSkoruHaber hatalı: ters haber, veto ve tavan korunur', function () {
  var P = { yon: 'long', giris: [100, 110], stop: 95, tp1: 140 }, tf = { d: 'yukari', h4: 'yukari', h1: 'onay' };
  var guclu = [{ yon: 'Olumlu', etki: 'Yüksek', saat: 1 }, { yon: 'Olumlu', etki: 'Yüksek', saat: 2 }, { yon: 'Olumlu', etki: 'Yüksek', saat: 3 }];
  // güçlü ters haber (≤ -2) veto eder
  var c = { durum: 'long', fiyat: 105, funding: 0.0001, plan: P, tf: tf, haberler: [{ yon: 'Olumsuz', etki: 'Yüksek', saat: 1 }, { yon: 'Olumsuz', etki: 'Yüksek', saat: 2 }] };
  var s = H.sinyalSkoruHaber(c, { mod: 'Temkinli' }, { analizSaat: 2 });
  assert.strictEqual(s.skor, 0); assert.strictEqual(s.sinif, 'yok'); assert(/Güçlü ters haber/.test(s.veto));
  // eski analiz (14 saat) en fazla B kalır, güçlü olumlu haberle bile
  c.haberler = guclu; s = H.sinyalSkoruHaber(c, { mod: 'Temkinli' }, { analizSaat: 14 });
  assert(s.skor >= H.SKOR_ESIK.A_PLUS); assert.strictEqual(s.sinif, 'B');
  // mevcut veto haberle geri gelmez
  s = H.sinyalSkoruHaber({ durum: 'uzak', fiyat: 105, plan: P, tf: tf, haberler: guclu }, { mod: 'Temkinli' });
  assert.strictEqual(s.veto, 'Analiz: uzak dur'); assert.strictEqual(s.skor, 0);
  assert.strictEqual(H.sinyalSkoruHaber(null).skor, 0);
});
t('dominansEngeli ve planSinif', function () {
  var yuk = { dominans: { usdt: { h4: 'yukari' }, btc: { h4: 'yatay' } } };
  assert.strictEqual(H.dominansEngeli('SOL', 'long', null), null);
  assert(/USDT\.D yükseliyor/.test(H.dominansEngeli('BTC', 'long', yuk)));
  assert.strictEqual(H.dominansEngeli('SOL', 'short', yuk), null);
  assert(/USDT\.D düşüyor/.test(H.dominansEngeli('SOL', 'short', { dominans: { usdt: { h4: 'asagi' } } })));
  var btcD = { dominans: { usdt: { h4: 'yatay' }, btc: { h4: 'yukari' } } };
  assert(/BTC\.D/.test(H.dominansEngeli('SOL', 'long', btcD)));
  assert.strictEqual(H.dominansEngeli('BTC', 'long', btcD), null); // BTC.D yükselişi BTC long'a engel değil
  // A planı ters dominance ile B'ye iner: risk %0,5 ve analizdeki 'yukari' 1S yetmez, onay şart
  var c = { coin: 'SOL', durum: 'long', plan: L, fiyat: 105, tf: { d: 'yukari', h4: 'yukari', h1: 'yukari' }, haberler: [] };
  assert.strictEqual(H.planSinif(c).sinif, 'A');
  assert.strictEqual(H.planSinif(c, btcD).sinif, 'B'); assert.strictEqual(H.planSinif(c, btcD).riskYuzde, 0.5);
  var k = H.karar(c, btcD); assert.strictEqual(k.sinif, 'B'); assert.strictEqual(k.renk, 'sari'); assert(/BTC\.D/.test(k.dominans));
  c.h1Canli = 'onay'; k = H.karar(c, btcD); assert.strictEqual(k.renk, 'yesil'); assert.strictEqual(k.riskYuzde, 0.5);
});
t('h1Onay canlı 1 saatlik onay', function () {
  var m = function (o, h, l, c) { return { open: o, high: h, low: l, close: c }; }, acik = m(106, 107, 105, 106);
  // long 100-110: bölgeye değip yukarı kapandı -> onay
  assert.strictEqual(H.h1Onay([m(115, 116, 112, 113), m(113, 113, 108, 109), m(109, 110, 104, 105), m(105, 108, 104, 107), acik], L).durum, 'onay');
  // değdi ama son mum aşağı kapandı -> bekliyor
  assert.strictEqual(H.h1Onay([m(115, 116, 112, 113), m(113, 113, 108, 109), m(109, 110, 104, 107), m(107, 108, 104, 105), acik], L).durum, 'bekliyor');
  // son kapanış bölgenin altında -> yok
  assert.strictEqual(H.h1Onay([m(115, 116, 112, 113), m(113, 113, 100, 101), m(101, 102, 97, 98), m(98, 99.5, 97, 99), acik], L).durum, 'yok');
  // bölgeye hiç değmedi -> bekliyor
  var r = H.h1Onay([m(120, 121, 118, 119), m(119, 121, 115, 116), m(116, 118, 112, 113), m(113, 116, 112, 115), acik], L);
  assert.strictEqual(r.durum, 'bekliyor'); assert(/değmedi/.test(r.sebep));
  // açık (son) mum sayılmaz: yalnız açık mum değdi -> bekliyor
  assert.strictEqual(H.h1Onay([m(120, 121, 118, 119), m(119, 121, 115, 116), m(116, 118, 112, 113), m(113, 116, 112, 115), m(115, 115, 105, 106)], L).durum, 'bekliyor');
  // short 100-110 (stop 115): bölgeye değip aşağı kapandı -> onay
  assert.strictEqual(H.h1Onay([m(95, 98, 94, 97), m(97, 102, 96, 101), m(101, 106, 100, 105), m(105, 106, 101, 102), acik], S).durum, 'onay');
  // yukarı kapandı ama bölge ortasının (105) altında -> bekliyor
  assert.strictEqual(H.h1Onay([m(115, 116, 112, 113), m(113, 113, 108, 109), m(109, 110, 101, 102), m(102, 105, 101, 104), acik], L).durum, 'bekliyor');
  // eksik veri
  assert.strictEqual(H.h1Onay(null, L).durum, 'bekliyor'); assert.strictEqual(H.h1Onay([acik], L).durum, 'bekliyor');
});
t('tek kural: karar yeşil değilse skor A/A+ olmaz, canlı 1S skoru da açar', function () {
  var P = { yon: 'long', giris: [100, 110], stop: 95, tp1: 140 };
  var c = { coin: 'SOL', durum: 'bekle', fiyat: 105, funding: 0.0001, plan: P, tf: { d: 'yukari', h4: 'yukari', h1: 'onay' }, haberler: [] };
  var s = H.sinyalSkoru(c, { mod: 'Temkinli' }, { analizSaat: 2 });
  assert(s.skor >= H.SKOR_ESIK.A); assert.strictEqual(s.sinif, 'B'); // analiz 'bekle' diyor -> ekran sarı, bildirim de yok
  c.durum = 'long'; c.tf = { d: 'yatay', h4: 'yukari', h1: 'bekliyor' };
  assert.notStrictEqual(H.sinyalSkoru(c, { mod: 'Temkinli' }, { analizSaat: 2 }).sinif, 'A');
  c.h1Canli = 'onay'; s = H.sinyalSkoru(c, { mod: 'Temkinli' }, { analizSaat: 2 });
  assert.strictEqual(H.karar(c, { mod: 'Temkinli' }, { analizSaat: 2 }).renk, 'yesil'); assert(s.sinif === 'A' || s.sinif === 'A+');
  // ters dominance skorun rejim puanını düşürür
  var d = H.sinyalSkoru(c, { mod: 'Temkinli', dominans: { usdt: { h4: 'yukari' } } }, { analizSaat: 2 });
  assert(d.skor < s.skor); assert(/dominance/.test(d.eksik.join()));
});

t('trendEma: tek trend tanımı', function () {
  var yuk = [], dus = [], i;
  for (i = 0; i < 80; i++) { yuk.push({ close: 100 + i }); dus.push({ close: 200 - i }); }
  assert.strictEqual(H.trendEma(yuk), 'yukari'); assert.strictEqual(H.trendEma(dus), 'asagi');
  assert.strictEqual(H.trendEma(yuk.slice(0, 40)), null);
  // yükselişten sonra sert düşüş: kapanış EMA50 altına indi ama EMA20 hâlâ üstte -> yatay
  var don = yuk.slice(); for (i = 0; i < 6; i++) don.push({ close: 150 - i * 4 });
  assert.strictEqual(H.trendEma(don), 'yatay');
});
t('pusula: aynı anda tek yön', function () {
  var dm = function (u, b) { return { usdt: { deger: 6.7, h4: u, d: 'yatay' }, btc: { deger: 60, h4: b, d: 'yatay' } }; };
  assert.strictEqual(H.pusula(null), null); assert.strictEqual(H.pusula({ mod: 'Temkinli' }), null); // veri yoksa kural uygulanmaz
  assert.strictEqual(H.pusula({ btcTf: { d: 'yukari', h4: 'yukari' }, dominans: dm('yukari', 'yukari') }).yon, 'long'); // BTC trendi önce gelir
  assert.strictEqual(H.pusula({ btcTf: { d: 'asagi', h4: 'asagi' } }).yon, 'short');
  // BTC yatay: dominans karar verir
  assert.strictEqual(H.pusula({ btcTf: { d: 'yatay', h4: 'yatay' }, dominans: dm('asagi', 'yatay') }).yon, 'long');
  assert.strictEqual(H.pusula({ btcTf: { d: 'yatay', h4: 'yatay' }, dominans: dm('asagi', 'yukari') }).yon, null);
  assert.strictEqual(H.pusula({ btcTf: { d: 'yatay', h4: 'asagi' }, dominans: dm('yukari', 'yatay') }).yon, 'short');
  assert.strictEqual(H.pusula({ btcTf: { d: 'yatay', h4: 'yatay' }, dominans: dm('yatay', 'asagi') }).yon, 'long');
  assert.strictEqual(H.pusula({ btcTf: { d: 'yatay', h4: 'yatay' }, dominans: dm('yatay', 'yatay') }).yon, null);
  assert.strictEqual(H.pusula({ btcTf: {} }).yon, null);
});
t('karar: pusulaya ve açık işleme ters plan kırmızı, skor veto', function () {
  var L = { yon: 'long', giris: [100, 102], stop: 97, tp1: 110, tp2: 115 };
  var c = { coin: 'TIA', durum: 'long', plan: L, fiyat: 101, tf: { d: 'yukari', h4: 'yukari', h1: 'onay' }, funding: 0.0001 };
  var kisa = { mod: 'Temkinli', btcTf: { d: 'asagi', h4: 'asagi' } }, uzun = { mod: 'Temkinli', btcTf: { d: 'yukari', h4: 'yukari' } };
  var k = H.karar(c, kisa, { analizSaat: 1 });
  assert.strictEqual(k.renk, 'kirmizi'); assert(k.engel); assert(/Piyasa yönü SHORT/.test(k.neden));
  assert.strictEqual(H.sinyalSkoru(c, kisa, { analizSaat: 1 }).veto, k.neden);
  assert.strictEqual(H.karar(c, uzun, { analizSaat: 1 }).renk, 'yesil');
  k = H.karar(c, { mod: 'Temkinli', btcTf: { d: 'yatay', h4: 'yatay' } }, { analizSaat: 1 });
  assert.strictEqual(k.renk, 'kirmizi'); assert(/belirsiz/.test(k.neden));
  k = H.karar(c, uzun, { analizSaat: 1, acikYon: { long: 0, short: 2 } });
  assert.strictEqual(k.renk, 'kirmizi'); assert(/Açık SHORT/.test(k.neden));
  assert.strictEqual(H.karar(c, uzun, { analizSaat: 1, acikYon: { long: 1, short: 0 } }).renk, 'yesil');
});
t('planHesap: kaldıraç 5x-10x, likidasyon stopun 2 katı ötesinde', function () {
  var h = H.planHesap({ yon: 'long', giris: [99, 101], stop: 98, tp1: 104 }); // stop %2: pozisyon %50
  assert.strictEqual(h.kal, 5); assert.strictEqual(h.maxKal, 10); assert(h.kalUygun);
  h = H.planHesap({ yon: 'long', giris: [99, 101], stop: 92, tp1: 115 }); // stop %8: en fazla 6x
  assert.strictEqual(h.maxKal, 6); assert.strictEqual(h.kal, 5);
  h = H.planHesap({ yon: 'long', giris: [99.9, 100.1], stop: 99.85, tp1: 100.5 }); // stop %0,15: pozisyon %667 -> 7x
  assert.strictEqual(h.kal, 7); assert(h.kalUygun);
  h = H.planHesap({ yon: 'long', giris: [99.95, 100.05], stop: 99.92, tp1: 100.3 }); // stop %0,08: 13x gerekir
  assert(!h.kalUygun);
});
console.log(n + ' test geçti');
