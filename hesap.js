// dKc saf hesaplar: ekrandan bağımsız, Node'da test edilebilir (test/hesap.test.js).
(function (kok) {
  'use strict';
  var RISK_TAVAN = 5; // aynı yönde açık toplam risk tavanı, sermayenin %'si
  var UCRET = 0.001;  // giriş+çıkış ücret ve kayma payı (temkinli, işlem değerinin %0,1'i; MEXC tarifesi doğrulanmalı)
  var ESKI_SAAT = 12; // bundan eski analizle "Girişe uygun" denmez

  function sayi(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  // Plan kurala uyuyor mu: long'da stop < giriş bölgesi < hedef, short'ta tersi
  function planGecerli(p) {
    if (!p || (p.yon !== 'long' && p.yon !== 'short')) return false;
    if (!Array.isArray(p.giris) || p.giris.length !== 2 || !sayi(p.giris[0]) || !sayi(p.giris[1])) return false;
    if (!sayi(p.stop) || !sayi(p.tp1) || (p.tp2 != null && !sayi(p.tp2))) return false;
    var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
    if (p.yon === 'long') return p.stop < alt && p.tp1 > ust && (p.tp2 == null || p.tp2 >= p.tp1);
    return p.stop > ust && p.tp1 < alt && (p.tp2 == null || p.tp2 <= p.tp1);
  }

  // Plan sınıfı: A = 1G ve 4S plan yönünde, B = 1G yatay + 4S plan yönünde, C = trend tersi.
  // Analiz sinif yazmışsa ve trendle çelişmiyorsa onu kullanır; risk A'da %1, B'de %0,5, C'de yayın yok.
  var AYNI = { long: 'yukari', short: 'asagi' }, TERS = { long: 'asagi', short: 'yukari' };
  function planSinif(c) {
    var p = c && c.plan; if (!p) return null;
    var yy = AYNI[p.yon === 'short' ? 'short' : 'long'], tf = c.tf || {};
    var s = tf.h4 !== yy ? 'C' : tf.d === yy ? 'A' : tf.d === 'yatay' ? 'B' : 'C';
    if (s === 'A' && p.sinif === 'B') s = 'B';
    var tavan = s === 'A' ? 1 : s === 'B' ? 0.5 : 0;
    var risk = typeof p.riskYuzde === 'number' && p.riskYuzde > 0 ? Math.min(p.riskYuzde, tavan) : tavan;
    return { sinif: s, riskYuzde: risk };
  }

  // "12 Eki 08:00" -> kaç saat önce (yıl yazılmadığı için ileri tarih bir önceki yıl sayılır). Okunamazsa null.
  var AYLAR = { oca: 0, şub: 1, sub: 1, mar: 2, nis: 3, may: 4, haz: 5, tem: 6, ağu: 7, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11 };
  function analizYasi(metin, simdi) {
    var m = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3})[A-Za-zÇĞİÖŞÜçğıöşü]*\s+(\d{1,2})[:.](\d{2})/.exec(String(metin || ''));
    if (!m) return null;
    var ay = AYLAR[m[2].toLocaleLowerCase('tr')]; if (ay == null) return null;
    var n = new Date(simdi || Date.now()), y = n.getFullYear();
    var t = new Date(y, ay, +m[1], +m[3], +m[4]);
    if (t - n > 36e5 * 24) t = new Date(y - 1, ay, +m[1], +m[3], +m[4]);
    return (n - t) / 36e5;
  }

  // Plan hesapları (riskYuzde varsayılan %1, en fazla 5x). r1Net: ücret ve kayma payı düşülmüş Hedef 1 kazanç/risk. Funding dahil değil.
  function planHesap(p, riskYuzde) {
    var giris = (p.giris[0] + p.giris[1]) / 2, risk = Math.abs(giris - p.stop), stopYuzde = risk / giris;
    var r1 = Math.abs(p.tp1 - giris) / risk, r2 = p.tp2 ? Math.abs(p.tp2 - giris) / risk : null;
    var u = UCRET * giris, r1Net = (Math.abs(p.tp1 - giris) - u) / (risk + u);
    var ry = typeof riskYuzde === 'number' && riskYuzde > 0 ? riskYuzde : 1;
    var poz = ry / 100 / stopYuzde * 100;
    var maxKal = Math.min(5, Math.floor(1 / (2 * stopYuzde)));
    var kal = Math.max(1, Math.ceil(poz / 100));
    return { giris: giris, stopYuzde: stopYuzde * 100, r1: r1, r1Net: r1Net, r2: r2, poz: poz, riskYuzde: ry, kal: kal, kalUygun: kal <= maxKal, maxKal: maxKal };
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
  // ek.analizSaat: analizin yaşı (saat); 12 saatten eskiyse yeşil yanmaz.
  function karar(c, piyasa, ek) {
    var p = c && c.plan, o = { renk: 'kirmizi', ad: 'Uzak dur', eksik: [], teknik: false, temel: false, fiyat: false, g: null };
    if (!c) return o;
    if (c.planHatali) { o.neden = 'Plan verisi hatalı'; return o; }
    if (!p) { o.neden = c.durum === 'uzak' ? 'Analiz: uzak dur' : 'İşlem planı yok'; return o; }
    var yon = p.yon === 'short' ? 'short' : 'long', tf = c.tf || {}, g = girisDurumu(p, c.fiyat);
    var sn = planSinif(c), h = planHesap(p, sn.riskYuzde);
    o.yon = yon; o.g = g; o.sinif = sn.sinif; o.riskYuzde = sn.riskYuzde; o.h = h;
    if (c.durum === 'uzak') { o.neden = 'Analiz: uzak dur'; return o; }
    if (g && g.tur === 'gecti' && (yon === 'short' ? c.fiyat >= p.stop : c.fiyat <= p.stop)) { o.neden = 'Fiyat stopun ötesinde · plan geçersiz'; return o; }
    // Teknik
    var tek = [];
    if (c.durum !== yon) tek.push('analiz onayı yok');
    if (tf.d === TERS[yon]) tek.push('1G ters yönde');
    if (tf.h4 === TERS[yon]) tek.push('4S ters yönde');
    else if (tf.h4 !== AYNI[yon]) tek.push('4S plan yönünde değil');
    if (sn.sinif === 'B' ? tf.h1 !== 'onay' : tf.h1 !== 'onay' && tf.h1 !== AYNI[yon]) tek.push('1S onayı yok');
    if (h.r1Net < 1.5 - 1e-9) tek.push('ücret sonrası kazanç/risk ' + (Math.floor(h.r1Net * 100) / 100).toFixed(2).replace('.', ',') + ' (en az 1,5)');
    if (!h.kalUygun) tek.push('5x sınırında stop çok yakın');
    if (ek && typeof ek.analizSaat === 'number' && ek.analizSaat > ESKI_SAAT) tek.push('analiz ' + Math.floor(ek.analizSaat) + ' saat önce');
    // Temel
    var tem = [], tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu';
    (c.haberler || []).forEach(function (h) { if (h && h.etki === 'Yüksek' && h.yon === tersHaber && tem.indexOf('ters yönde önemli haber') < 0) tem.push('ters yönde önemli haber'); });
    if (yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') tem.push('piyasa riskten kaçışta');
    if (yon === 'short' && piyasa && piyasa.mod === 'Risk açık') tem.push('piyasa risk iştahında');
    if (typeof c.funding === 'number' && (yon === 'short' ? c.funding <= -0.0003 : c.funding >= 0.001)) tem.push('funding ' + (yon === 'short' ? 'belirgin negatif' : 'çok yüksek'));
    // Fiyat
    var fiy = [];
    if (!g) fiy.push('fiyat yok');
    else if (g.tur === 'uzak') fiy.push('girişe %' + (Math.round(g.girise * 10) / 10).toString().replace('.', ',') + ' kaldı');
    else if (g.tur === 'gecti') fiy.push('fiyat bölgenin ' + (yon === 'short' ? 'üstünde' : 'altında'));
    o.teknik = !tek.length; o.temel = !tem.length; o.fiyat = !fiy.length;
    o.eksik = fiy.concat(tek, tem); o.eksikTeknik = tek; o.eksikTemel = tem; o.eksikFiyat = fiy;
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

  // Tavan yön başına uygulanır (altcoin short'ları birlikte hareket eder). yuzde: toplam, yonler: {long, short}.
  function toplamRisk(pozlar, fiyatlar, sermaye) {
    var t = 0, bilinmeyen = 0, y = { long: 0, short: 0 };
    pozlar.forEach(function (p) { var h = pozisyonHesap(p, fiyatlar[p.coin], sermaye); if (h.riskYuzde == null) bilinmeyen++; else { t += h.riskYuzde; y[p.yon === 'short' ? 'short' : 'long'] += h.riskYuzde; } });
    return { yuzde: t, yonler: y, tavan: RISK_TAVAN, asildi: y.long > RISK_TAVAN || y.short > RISK_TAVAN, bilinmeyen: bilinmeyen };
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

  var dis = { RISK_TAVAN: RISK_TAVAN, UCRET: UCRET, planGecerli: planGecerli, planSinif: planSinif, analizYasi: analizYasi, planHesap: planHesap, girisDurumu: girisDurumu, karar: karar, pozisyonHesap: pozisyonHesap, toplamRisk: toplamRisk, coinTemizle: coinTemizle, guvenliUrl: guvenliUrl, rsiSeri: rsiSeri };
  if (typeof module !== 'undefined' && module.exports) module.exports = dis; else kok.DKC_HESAP = dis;
})(this);
