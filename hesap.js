// dKc saf hesaplar: ekrandan bağımsız, Node'da test edilebilir (test/hesap.test.js).
(function (kok) {
  'use strict';
  var RISK_TAVAN = 5; // aynı anda açık toplam risk tavanı, sermayenin %'si

  function sayi(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  // Plan kurala uyuyor mu: long'da stop < giriş bölgesi < hedef, short'ta tersi
  function planGecerli(p) {
    if (!p || (p.yon !== 'long' && p.yon !== 'short')) return false;
    if (!Array.isArray(p.giris) || p.giris.length !== 2 || !sayi(p.giris[0]) || !sayi(p.giris[1])) return false;
    if (!sayi(p.stop) || !sayi(p.tp1) || (p.tp2 != null && !sayi(p.tp2))) return false;
    var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
    return p.yon === 'long' ? p.stop < alt && p.tp1 > ust : p.stop > ust && p.tp1 < alt;
  }

  // Plan hesapları (%1 risk, en fazla 5x). Ücret ve funding dahil değildir.
  function planHesap(p) {
    var giris = (p.giris[0] + p.giris[1]) / 2, risk = Math.abs(giris - p.stop), stopYuzde = risk / giris;
    var r1 = Math.abs(p.tp1 - giris) / risk, r2 = p.tp2 ? Math.abs(p.tp2 - giris) / risk : null;
    var poz = 0.01 / stopYuzde * 100;
    var maxKal = Math.min(5, Math.floor(1 / (2 * stopYuzde)));
    var kal = Math.max(1, Math.ceil(poz / 100));
    return { giris: giris, stopYuzde: stopYuzde * 100, r1: r1, r2: r2, poz: poz, kal: kal, kalUygun: kal <= maxKal, maxKal: maxKal };
  }

  // Fiyatın giriş bölgesine göre yeri. tur: 'uzak' (girişe gelmedi) | 'bolgede' | 'gecti' (bölgenin stop tarafında)
  function girisDurumu(plan, fiyat) {
    if (!plan || !sayi(fiyat)) return null;
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]), lng = plan.yon !== 'short';
    var stopa = Math.abs(fiyat - plan.stop) / fiyat * 100;
    if (fiyat >= alt && fiyat <= ust) return { tur: 'bolgede', stopa: stopa };
    if (lng ? fiyat > ust : fiyat < alt) return { tur: 'uzak', girise: Math.abs(fiyat - (lng ? ust : alt)) / fiyat * 100, stopa: stopa };
    return { tur: 'gecti', stopa: stopa };
  }

  // Giriş kararı (trafik ışığı). Emir değildir; planın koşul durumunu söyler.
  // yesil: teknik + temel + fiyat bölgede tamam. sari: plan var, bir koşul eksik. kirmizi: plan yok/geçersiz.
  var TERS = { long: 'asagi', short: 'yukari' }, AYNI = { long: 'yukari', short: 'asagi' };
  function karar(c, piyasa) {
    var p = c && c.plan, o = { renk: 'kirmizi', ad: 'Uzak dur', eksik: [], teknik: false, temel: false, fiyat: false, g: null };
    if (!c) return o;
    if (c.planHatali) { o.neden = 'Plan verisi hatalı'; return o; }
    if (!p) { o.neden = c.durum === 'uzak' ? 'Analiz: uzak dur' : 'İşlem planı yok'; return o; }
    var yon = p.yon === 'short' ? 'short' : 'long', tf = c.tf || {}, g = girisDurumu(p, c.fiyat);
    o.yon = yon; o.g = g;
    if (c.durum === 'uzak') { o.neden = 'Analiz: uzak dur'; return o; }
    if (g && g.tur === 'gecti' && (yon === 'short' ? c.fiyat >= p.stop : c.fiyat <= p.stop)) { o.neden = 'Fiyat stopun ötesinde · plan geçersiz'; return o; }
    // Teknik
    var tek = [];
    if (c.durum !== yon) tek.push('analiz onayı yok');
    if (tf.d === TERS[yon]) tek.push('1G ters yönde');
    if (tf.h4 === TERS[yon]) tek.push('4S ters yönde');
    if (tf.h1 !== 'onay' && tf.h1 !== AYNI[yon]) tek.push('1S onayı yok');
    // Temel
    var tem = [], tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu';
    (c.haberler || []).forEach(function (h) { if (h && h.etki === 'Yüksek' && h.yon === tersHaber && tem.indexOf('ters yönde önemli haber') < 0) tem.push('ters yönde önemli haber'); });
    if (yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') tem.push('piyasa riskten kaçışta');
    // Fiyat
    var fiy = [];
    if (!g) fiy.push('fiyat yok');
    else if (g.tur === 'uzak') fiy.push('girişe %' + (Math.round(g.girise * 10) / 10).toString().replace('.', ',') + ' kaldı');
    else if (g.tur === 'gecti') fiy.push('fiyat bölgenin ' + (yon === 'short' ? 'üstünde' : 'altında'));
    o.teknik = !tek.length; o.temel = !tem.length; o.fiyat = !fiy.length;
    o.eksik = fiy.concat(tek, tem);
    if (!o.eksik.length) { o.renk = 'yesil'; o.ad = 'Girişe uygun'; }
    else { o.renk = 'sari'; o.ad = 'Bekle'; }
    return o;
  }

  // Elle girilen pozisyon: kâr/zarar, stopa/hedefe uzaklık, risk, yaklaşık likidasyon (izole, bakım marjı ~%0,5)
  function pozisyonHesap(poz, fiyat, sermaye) {
    var yon = poz.yon === 'short' ? -1 : 1, deg = sayi(fiyat) ? (fiyat - poz.giris) / poz.giris * yon : 0;
    var kal = sayi(poz.kaldirac) ? poz.kaldirac : 1;
    var o = { hareket: deg * 100, kz: sayi(poz.buyukluk) ? poz.buyukluk * deg : null, kaldirac: kal };
    o.likidasyon = poz.giris * (1 - yon / kal + yon * 0.005);
    if (sayi(poz.stop)) {
      var stopMesafe = Math.abs(poz.giris - poz.stop) / poz.giris;
      o.stopa = sayi(fiyat) ? (fiyat - poz.stop) / fiyat * 100 * yon : null;
      o.r = stopMesafe ? deg / stopMesafe : null;
      o.risk = sayi(poz.buyukluk) ? poz.buyukluk * stopMesafe : null;
      o.riskYuzde = o.risk != null && sayi(sermaye) ? o.risk / sermaye * 100 : null;
    }
    if (sayi(poz.hedef) && sayi(fiyat)) o.hedefe = (poz.hedef - fiyat) / fiyat * 100 * yon;
    return o;
  }

  function toplamRisk(pozlar, fiyatlar, sermaye) {
    var t = 0, bilinmeyen = 0;
    pozlar.forEach(function (p) { var h = pozisyonHesap(p, fiyatlar[p.coin], sermaye); if (h.riskYuzde == null) bilinmeyen++; else t += h.riskYuzde; });
    return { yuzde: t, tavan: RISK_TAVAN, asildi: t > RISK_TAVAN, bilinmeyen: bilinmeyen };
  }

  // Sunucudan gelen tek coini kontrol eder; bozuk alanı temizler, sayfanın geri kalanını korur
  var DURUMLAR = { long: 1, short: 1, bekle: 1, uzak: 1 };
  function coinTemizle(c) {
    if (!c || typeof c.coin !== 'string' || !c.coin) return null;
    var o = {}; for (var k in c) o[k] = c[k];
    if (!DURUMLAR[o.durum]) o.durum = 'bekle';
    if (o.plan != null && !planGecerli(o.plan)) { o.plan = null; o.planHatali = true; if (o.durum === 'long' || o.durum === 'short') o.durum = 'bekle'; o.islemYok = 'Plan verisi hatalı geldi; bu coin için plan gösterilmiyor.'; }
    if (!sayi(o.fiyat)) o.fiyat = null;
    if (typeof o.deg24 !== 'number' || !isFinite(o.deg24)) o.deg24 = null;
    o.cizim = o.cizim && typeof o.cizim === 'object' ? o.cizim : {};
    o.haberler = Array.isArray(o.haberler) ? o.haberler : [];
    o.tf = o.tf && typeof o.tf === 'object' ? o.tf : {};
    return o;
  }
  // Wilder RSI: kapanış listesi -> aynı uzunlukta liste (ilk n eleman null)
  function rsiSeri(kapanis, n) {
    var out = kapanis.map(function () { return null; }), g = 0, l = 0;
    for (var i = 1; i < kapanis.length; i++) {
      var d = kapanis[i] - kapanis[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
      if (i <= n) { g += up; l += dn; if (i < n) continue; g /= n; l /= n; }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  function guvenliUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

  var dis = { RISK_TAVAN: RISK_TAVAN, planGecerli: planGecerli, planHesap: planHesap, girisDurumu: girisDurumu, karar: karar, pozisyonHesap: pozisyonHesap, toplamRisk: toplamRisk, coinTemizle: coinTemizle, guvenliUrl: guvenliUrl, rsiSeri: rsiSeri };
  if (typeof module !== 'undefined' && module.exports) module.exports = dis; else kok.DKC_HESAP = dis;
})(this);
