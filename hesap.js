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
  // Türev verisi (Binance açık verisi): açık pozisyon (OI) 24s değişimi, long/short hesap oranı, funding ve kısa okuma.
  // Bilgi amaçlıdır; "Girişe uygun" kararına girmez. Binance, MEXC'teki pozisyonları göstermez.
  function turevHesap(oiHist, ls, pi, deg24) {
    if (!Array.isArray(oiHist) || oiHist.length < 2) return null;
    var seri = oiHist.map(function (x) { return Number(x.sumOpenInterestValue); }).filter(function (x) { return x > 0; });
    if (seri.length < 2) return null;
    var son = seri[seri.length - 1], oiDeg = (son / seri[0] - 1) * 100;
    var oran = ls && ls[0] ? Number(ls[0].longShortRatio) : null, fon = pi && pi.lastFundingRate != null ? Number(pi.lastFundingRate) : null;
    var o = { oi: son, oiDeg24: oiDeg, seri: seri, ls: isFinite(oran) ? oran : null, longYuzde: isFinite(oran) && oran > 0 ? oran / (1 + oran) * 100 : null, funding: isFinite(fon) ? fon : null, okuma: [] };
    var d = typeof deg24 === 'number' && isFinite(deg24) ? deg24 : 0, fy = d > 1 ? 1 : d < -1 ? -1 : 0, oy = oiDeg > 2 ? 1 : oiDeg < -2 ? -1 : 0;
    if (!oy) o.okuma.push('Açık pozisyon yatay: hareket yeni para getirmiyor.');
    else if (fy > 0) o.okuma.push(oy > 0 ? 'Fiyat ve açık pozisyon birlikte artıyor: yeni long girişi yükselişi destekliyor.' : 'Fiyat artarken açık pozisyon düşüyor: yükseliş short kapanışından geliyor, zayıf olabilir.');
    else if (fy < 0) o.okuma.push(oy > 0 ? 'Fiyat düşerken açık pozisyon artıyor: yeni short girişi düşüşü destekliyor.' : 'Fiyat ve açık pozisyon birlikte düşüyor: long kapanışı ve likidasyon; satış baskısı azalabilir.');
    else o.okuma.push(oy > 0 ? 'Fiyat yatayken açık pozisyon artıyor: sert bir kırılma için birikim var.' : 'Fiyat yatayken açık pozisyon azalıyor: pozisyonlar kapanıyor, piyasa sakinleşiyor.');
    if (o.ls != null && o.ls >= 2.5) o.okuma.push('Hesapların çoğu long: kalabalık taraf long, aşağı sert iğne riski var.');
    else if (o.ls != null && o.ls <= 0.8) o.okuma.push('Hesapların çoğu short: short sıkışması (yukarı sert hareket) riski var.');
    if (o.funding != null && o.funding >= 0.0005) o.okuma.push('Funding yüksek: long tutmanın maliyeti arttı.');
    else if (o.funding != null && o.funding <= -0.0003) o.okuma.push('Funding belirgin negatif: short tutmanın maliyeti arttı.');
    return o;
  }
  // Tahmini likidasyon kümeleri (bilgi amaçlı; karara girmez).
  var LIK_KALDIRAC = [[10, 0.35], [25, 0.3], [50, 0.2], [100, 0.15]], LIK_MM = 0.005;
  function likidasyonHesap(oiHist, mumlar, lsHist, fiyat) {
    if (!Array.isArray(oiHist) || !Array.isArray(mumlar) || oiHist.length < 3 || mumlar.length < 3) return null;
    var mumSaat = {}, oran = {};
    mumlar.forEach(function (m) { mumSaat[Number(m[0])] = { h: Number(m[2]), l: Number(m[3]), o: (Number(m[2]) + Number(m[3]) + Number(m[4])) / 3 }; });
    (lsHist || []).forEach(function (x) { var r = Number(x.longShortRatio); if (r > 0) oran[Number(x.timestamp)] = r / (1 + r); });
    var kume = [], onceki = null, sonOran = 0.5, sonT = 0;
    oiHist.forEach(function (x) {
      var t = Number(x.timestamp), v = Number(x.sumOpenInterestValue), m = mumSaat[t - 3600000] || mumSaat[t];
      if (oran[t] != null) sonOran = oran[t];
      if (!(v > 0)) return;
      if (m) kume.forEach(function (k) { if (k.yon === 'long' ? m.l <= k.p : m.h >= k.p) k.v = 0; });
      if (onceki != null && m) {
        if (v > onceki) {
          var yeni = v - onceki;
          LIK_KALDIRAC.forEach(function (lk) {
            kume.push({ p: m.o * (1 - 1 / lk[0] + LIK_MM), v: yeni * sonOran * lk[1], yon: 'long' });
            kume.push({ p: m.o * (1 + 1 / lk[0] - LIK_MM), v: yeni * (1 - sonOran) * lk[1], yon: 'short' });
          });
        } else { var o = v / onceki; kume.forEach(function (k) { k.v *= o; }); }
      }
      onceki = v; sonT = t;
    });
    mumlar.forEach(function (m) { if (Number(m[0]) >= sonT) kume.forEach(function (k) { if (k.yon === 'long' ? Number(m[3]) <= k.p : Number(m[2]) >= k.p) k.v = 0; }); });
    var son = mumlar[mumlar.length - 1];
    var f = Number(fiyat) > 0 ? Number(fiyat) : Number(son[4]);
    kume = kume.filter(function (k) { return k.v > 0 && (k.yon === 'long' ? k.p < f : k.p > f); });
    if (!kume.length) return null;
    var dilim = {}, en = { ust: null, alt: null };
    kume.forEach(function (k) { var d = Math.round(Math.log(k.p / f) / Math.log(1.005)); dilim[d] = (dilim[d] || 0) + k.v; });
    Object.keys(dilim).forEach(function (d) {
      d = Number(d); if (!d || Math.abs(d) > 30) return;
      var yer = d > 0 ? 'ust' : 'alt', p = f * Math.pow(1.005, d);
      if (!en[yer] || dilim[d] > en[yer].v) en[yer] = { p: p, v: dilim[d], uzak: (p / f - 1) * 100 };
    });
    return { kume: kume, fiyat: f, ust: en.ust, alt: en.alt };
  }
  function likidasyonDilim(kume, lo, hi, n) {
    var d = []; for (var i = 0; i < n; i++) d.push(0);
    if (!(hi > lo) || !kume) return d;
    kume.forEach(function (k) { if (k.p < lo || k.p >= hi) return; d[Math.floor((k.p - lo) / (hi - lo) * n)] += k.v; });
    return d;
  }
  var BINANCE_AD = { PEPE: '1000PEPE', SHIB: '1000SHIB', BONK: '1000BONK', FLOKI: '1000FLOKI', SATS: '1000SATS', LUNC: '1000LUNC', XEC: '1000XEC', RATS: '1000RATS', CAT: '1000CAT' };
  function binanceSembol(coin) { return (BINANCE_AD[coin] || coin) + 'USDT'; }
  function guvenliUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

  // ---- AĞIRLIKLI CONFLUENCE SKORU (Faz 1) ----
  // Mevcut karar() AND mantığını bozmaz; paralel çalışır.
  // Amaç: sinyal kalitesini puanlamak, eşik üstünde "sinyal var" demek.
  // Kural: 4S ters yöndeyse veya fiyat stop ötesindeyse skor 0 (otomatik veto).
  var SKOR_AGIRLIK = {
    h4: 3, d: 2, h1: 2, m15: 2, rr: 2, funding: 1, haber: 2, rejim: 1, fiyat: 2
  };
  var SKOR_MAX = 17;
  var SKOR_ESIK = { A_PLUS: 14, A: 11, B: 8 };

  function m15Zamanlama(m15, yon) {
    if (!m15 || typeof m15.rsi !== 'number') return { puan: 0, maks: 3, sebep: '15m verisi yok' };
    var puan = 0, sebepler = [];
    if (yon === 'long') {
      if (m15.rsi >= 40 && m15.rsi <= 65) { puan += 1; sebepler.push('15m RSI uygun'); }
      else if (m15.rsi > 75) sebepler.push('15m RSI aşırı alım');
      else if (m15.rsi < 30) sebepler.push('15m RSI aşırı satım');
    } else {
      if (m15.rsi >= 35 && m15.rsi <= 60) { puan += 1; sebepler.push('15m RSI uygun'); }
      else if (m15.rsi < 25) sebepler.push('15m RSI aşırı satım');
      else if (m15.rsi > 70) sebepler.push('15m RSI aşırı alım');
    }
    if (m15.ema9 && m15.ema21) {
      var emaUygun = yon === 'long' ? m15.ema9 > m15.ema21 : m15.ema9 < m15.ema21;
      if (emaUygun) { puan += 1; sebepler.push('15m EMA hizası uygun'); }
      else sebepler.push('15m EMA ters');
    }
    if (m15.hacim && m15.hacimOrt && m15.hacim > m15.hacimOrt * 1.1) { puan += 1; sebepler.push('15m hacim onaylı'); }
    else if (m15.hacim && m15.hacimOrt && m15.hacim < m15.hacimOrt * 0.7) sebepler.push('15m hacim zayıf');
    return { puan: Math.min(3, puan), maks: 3, sebep: sebepler.join(', ') };
  }

  function sinyalSkoru(c, piyasa, ek) {
    var o = { skor: 0, maks: SKOR_MAX, sinif: 'yok', yon: null, renk: 'kirmizi', ad: 'Sinyal yok', veto: null, eksik: [], detay: {} };
    if (!c || !c.plan) { o.eksik.push('plan yok'); return o; }
    var k = karar(c, piyasa, ek);
    o.yon = k.yon || (c.plan.yon === 'short' ? 'short' : 'long');
    o.detay.karar = k;
    if (k.neden && k.neden.indexOf('stopun ötesinde') >= 0) { o.veto = 'Fiyat stopun ötesinde'; o.eksik.push(o.veto); return o; }
    var yon = o.yon, tf = c.tf || {};
    if (tf.h4 === TERS[yon]) { o.veto = '4S ters yönde'; o.eksik.push(o.veto); return o; }
    var skor = 0;
    if (tf.h4 === AYNI[yon]) skor += SKOR_AGIRLIK.h4; else o.eksik.push('4S plan yönünde değil');
    o.detay.h4 = tf.h4;
    if (tf.d === AYNI[yon]) skor += SKOR_AGIRLIK.d;
    else if (tf.d === 'yatay') skor += SKOR_AGIRLIK.d * 0.5;
    else o.eksik.push('1G ters');
    o.detay.d = tf.d;
    if (tf.h1 === 'onay' || tf.h1 === AYNI[yon]) skor += SKOR_AGIRLIK.h1; else o.eksik.push('1S onay yok');
    o.detay.h1 = tf.h1;
    var m15 = m15Zamanlama(c.m15, yon);
    skor += m15.puan * (SKOR_AGIRLIK.m15 / 3);
    o.detay.m15 = m15;
    if (m15.puan < 2) o.eksik.push('15m zamanlama zayıf: ' + m15.sebep);
    var h = k.h || planHesap(c.plan, (planSinif(c) || {}).riskYuzde);
    if (h.r1Net >= 1.5) skor += SKOR_AGIRLIK.rr; else o.eksik.push('R:R ' + (Math.floor(h.r1Net * 100) / 100) + ' (< 1,5)');
    o.detay.rr = h.r1Net;
    if (typeof c.funding === 'number') {
      var fundingOk = yon === 'short' ? c.funding > -0.0003 : c.funding < 0.001;
      if (fundingOk) skor += SKOR_AGIRLIK.funding; else o.eksik.push('funding aşırı');
    } else { skor += SKOR_AGIRLIK.funding; }
    o.detay.funding = c.funding;
    var tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu', haberTemiz = true;
    (c.haberler || []).forEach(function (hb) { if (hb && hb.etki === 'Yüksek' && hb.yon === tersHaber) haberTemiz = false; });
    if (haberTemiz) skor += SKOR_AGIRLIK.haber; else o.eksik.push('ters yönde yüksek haber');
    o.detay.haber = haberTemiz;
    var rejimOk = !(yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') && !(yon === 'short' && piyasa && piyasa.mod === 'Risk açık');
    if (rejimOk) skor += SKOR_AGIRLIK.rejim; else o.eksik.push('piyasa rejimi ters');
    o.detay.rejim = piyasa && piyasa.mod;
    var g = k.g;
    if (g && g.tur === 'bolgede') skor += SKOR_AGIRLIK.fiyat;
    else if (g && g.tur === 'uzak') o.eksik.push('fiyat girişe uzak (%' + (Math.round(g.girise * 10) / 10) + ')');
    o.detay.fiyat = g && g.tur;
    o.skor = Math.round(skor * 10) / 10;
    if (o.skor >= SKOR_ESIK.A_PLUS) { o.sinif = 'A+'; o.renk = 'yesil'; o.ad = 'Güçlü ' + (yon === 'long' ? 'LONG' : 'SHORT'); }
    else if (o.skor >= SKOR_ESIK.A) { o.sinif = 'A'; o.renk = 'yesil'; o.ad = (yon === 'long' ? 'LONG' : 'SHORT') + ' sinyali'; }
    else if (o.skor >= SKOR_ESIK.B) { o.sinif = 'B'; o.renk = 'sari'; o.ad = 'Zayıf sinyal · bekle'; }
    else { o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Sinyal yok'; }
    return o;
  }

  var dis = { RISK_TAVAN: RISK_TAVAN, UCRET: UCRET, planGecerli: planGecerli, planSinif: planSinif, analizYasi: analizYasi, planHesap: planHesap, girisDurumu: girisDurumu, karar: karar, pozisyonHesap: pozisyonHesap, toplamRisk: toplamRisk, coinTemizle: coinTemizle, guvenliUrl: guvenliUrl, rsiSeri: rsiSeri, turevHesap: turevHesap, likidasyonHesap: likidasyonHesap, likidasyonDilim: likidasyonDilim, binanceSembol: binanceSembol, sinyalSkoru: sinyalSkoru, m15Zamanlama: m15Zamanlama, SKOR_ESIK: SKOR_ESIK, SKOR_AGIRLIK: SKOR_AGIRLIK };
  if (typeof module !== 'undefined' && module.exports) module.exports = dis; else kok.DKC_HESAP = dis;
})(this);
