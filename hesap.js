// dKc saf hesaplar: ekrandan bağımsız, Node'da test edilebilir (test/hesap.test.js).
(function (kok) {
  'use strict';
  var RISK_TAVAN = 3; // açık işlemlerin toplam risk tavanı (long ve short birlikte), sermayenin %'si
  var KAL_MIN = 5, KAL_MAX = 10; // önerilen kaldıraç aralığı; likidasyon stopun en az 2 katı uzakta kalır
  var UCRET = 0.001;  // giriş+çıkış ücret ve kayma payı (temkinli, işlem değerinin %0,1'i; MEXC tarifesi doğrulanmalı)
  var ESKI_SAAT = 13; // bundan eski analizle "Girişe uygun" denmez (akşam 19:30 -> sabah 08:00 arası 12,5 saat)

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
  function planSinif(c, piyasa) {
    var p = c && c.plan; if (!p) return null;
    var yy = AYNI[p.yon === 'short' ? 'short' : 'long'], tf = c.tf || {};
    var s = tf.h4 !== yy ? 'C' : tf.d === yy ? 'A' : tf.d === 'yatay' ? 'B' : 'C';
    if (s === 'A' && p.sinif === 'B') s = 'B';
    // Dominance planın tersine akıyorsa A planı B'ye iner (risk %0,5, girişte 1S onayı şart)
    if (s === 'A' && dominansEngeli(c.coin, p.yon, piyasa)) s = 'B';
    var tavan = s === 'A' ? 1 : s === 'B' ? 0.5 : 0;
    var risk = typeof p.riskYuzde === 'number' && p.riskYuzde > 0 ? Math.min(p.riskYuzde, tavan) : tavan;
    return { sinif: s, riskYuzde: risk };
  }

  // EMA serisinin son değeri (ilk n kapanışın ortalamasıyla başlar)
  function emaSon(kap, n) {
    if (kap.length < n) return null;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += kap[i];
    e /= n;
    for (i = n; i < kap.length; i++) e = kap[i] * k + e * (1 - k);
    return e;
  }
  // Tek trend tanımı (uygulama, sunucu, tarayıcı aynı): kapanmış mumlarda kapanış ve EMA20 EMA50'nin üstündeyse yukari,
  // ikisi de altındaysa asagi, aksi yatay. mumlar: [{ close }] eskiden yeniye. 50 mumdan azsa null.
  function trendEma(mumlar) {
    var kap = (mumlar || []).map(function (m) { return Number(m.close); }).filter(function (x) { return x > 0; });
    var e20 = emaSon(kap, 20), e50 = emaSon(kap, 50), c = kap[kap.length - 1];
    if (e20 == null || e50 == null) return null;
    if (c > e50 && e20 > e50) return 'yukari';
    if (c < e50 && e20 < e50) return 'asagi';
    return 'yatay';
  }

  // Piyasa pusulası: aynı anda tek yön. piyasa.btcTf = { d, h4 } (BTC trendi), piyasa.dominans (USDT.D, BTC.D 4S).
  // BTC 1G ve 4S aynı yöndeyse yön odur. BTC yatay ya da karışıksa dominans karar verir:
  // USDT.D düşüyorsa long (BTC.D yükselmiyorsa), USDT.D yükseliyorsa short (BTC.D düşmüyorsa);
  // USDT.D yataysa BTC.D düşüşü long, yükselişi short. Kalan durumlarda yön yok (yeni plan verilmez).
  // piyasa.btcTf hiç yoksa kural uygulanmaz (null).
  var YON_AD = { long: 'LONG', short: 'SHORT' };
  function pusula(piyasa) {
    if (!piyasa || !piyasa.btcTf || typeof piyasa.btcTf !== 'object') return null;
    var b = piyasa.btcTf, dm = piyasa.dominans || {}, u = dm.usdt && dm.usdt.h4, bd = dm.btc && dm.btc.h4;
    var ad = { yukari: 'yukarı', asagi: 'aşağı', yatay: 'yatay' };
    if (b.d && b.d === b.h4 && b.d !== 'yatay') return { yon: b.d === 'yukari' ? 'long' : 'short', neden: 'BTC 1G ve 4S ' + ad[b.d] };
    var btc = 'BTC ' + (b.d || b.h4 ? '1G ' + (ad[b.d] || '?') + ', 4S ' + (ad[b.h4] || '?') : 'trendi bilinmiyor');
    if (u === 'asagi') return bd === 'yukari' ? { yon: null, neden: btc + '; USDT.D düşüyor ama BTC.D yükseliyor' } : { yon: 'long', neden: btc + '; USDT.D düşüyor' };
    if (u === 'yukari') return bd === 'asagi' ? { yon: null, neden: btc + '; USDT.D yükseliyor ama BTC.D düşüyor' } : { yon: 'short', neden: btc + '; USDT.D yükseliyor' };
    if (bd === 'asagi') return { yon: 'long', neden: btc + '; BTC.D düşüyor' };
    if (bd === 'yukari') return { yon: 'short', neden: btc + '; BTC.D yükseliyor' };
    return { yon: null, neden: btc + '; dominans yatay' };
  }

  // Dominance engeli: piyasa.dominans = { btc: { deger, h4, d }, usdt: { deger, h4, d } } (h4/d: yukari|asagi|yatay).
  // USDT.D 4S yükselirken para stabil coine kaçar: long'a engel. USDT.D 4S düşerken short'a engel.
  // BTC.D 4S yükselirken altcoin long'a engel. Veri yoksa engel yok (null). Döner: neden metni ya da null.
  function dominansEngeli(coin, yon, piyasa) {
    var dm = piyasa && piyasa.dominans; if (!dm || typeof dm !== 'object') return null;
    var u = dm.usdt && dm.usdt.h4, b = dm.btc && dm.btc.h4, alt = String(coin || '').toUpperCase() !== 'BTC';
    if (yon === 'short') return u === 'asagi' ? 'USDT.D düşüyor (para piyasaya giriyor)' : null;
    if (u === 'yukari') return 'USDT.D yükseliyor (para stabil coine kaçıyor)';
    if (alt && b === 'yukari') return 'BTC.D yükseliyor (altcoin aleyhine)';
    return null;
  }

  // Canlı 1 saatlik onay. mumlar: 1S mumları {open, high, low, close}, en eskiden yeniye; son mum açık (yarım) sayılır.
  // onay: son 3 kapanmış mumdan biri giriş bölgesine değmiş, son kapanmış mum plan yönünde kapanmış ve kapanış
  // bölgede ya da bölgenin hedef tarafında (Hedef 1'e varmadan). yok: son kapanış bölgenin stop tarafında. Aksi: bekliyor.
  function h1Onay(mumlar, plan) {
    var o = { durum: 'bekliyor', sebep: '1S verisi yok' };
    if (!plan || !Array.isArray(mumlar) || mumlar.length < 4) return o;
    var kap = mumlar.slice(-4, -1).map(function (m) { return { o: Number(m.open), h: Number(m.high), l: Number(m.low), c: Number(m.close) }; });
    if (kap.some(function (m) { return !(sayi(m.o) && sayi(m.h) && sayi(m.l) && sayi(m.c)); })) return o;
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]), lng = plan.yon !== 'short';
    var son = kap[kap.length - 1];
    var degdi = kap.some(function (m) { return lng ? m.l <= ust : m.h >= alt; });
    if (lng ? son.c < alt : son.c > ust) return { durum: 'yok', sebep: '1S kapanış bölgenin ' + (lng ? 'altında' : 'üstünde') };
    if (!degdi) return { durum: 'bekliyor', sebep: '1S mum bölgeye değmedi' };
    if (lng ? son.c >= plan.tp1 : son.c <= plan.tp1) return { durum: 'bekliyor', sebep: 'fiyat Hedef 1\'e vardı' };
    if (lng ? son.c > son.o : son.c < son.o) return { durum: 'onay', sebep: '1S mum bölgeden ' + (lng ? 'yukarı' : 'aşağı') + ' kapandı' };
    return { durum: 'bekliyor', sebep: '1S mum ' + (lng ? 'yukarı' : 'aşağı') + ' kapanmadı' };
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

  // Plan hesapları (riskYuzde varsayılan %1, önerilen kaldıraç 5x-10x). r1Net: ücret ve kayma payı düşülmüş Hedef 1 kazanç/risk. Funding dahil değil.
  function planHesap(p, riskYuzde) {
    var giris = (p.giris[0] + p.giris[1]) / 2, risk = Math.abs(giris - p.stop), stopYuzde = risk / giris;
    var r1 = Math.abs(p.tp1 - giris) / risk, r2 = p.tp2 ? Math.abs(p.tp2 - giris) / risk : null;
    var u = UCRET * giris, r1Net = (Math.abs(p.tp1 - giris) - u) / (risk + u);
    var ry = typeof riskYuzde === 'number' && riskYuzde > 0 ? riskYuzde : 1;
    var poz = ry / 100 / stopYuzde * 100;
    // Gereken kaldıraç = pozisyon / sermaye; önerilen 5x-10x arası, likidasyon stopun en az 2 katı uzakta kalacak kadar
    var maxKal = Math.min(KAL_MAX, Math.floor(1 / (2 * stopYuzde)));
    var gerekli = Math.max(1, Math.ceil(poz / 100));
    var kal = Math.max(1, Math.min(maxKal, Math.max(KAL_MIN, gerekli)));
    return { giris: giris, stopYuzde: stopYuzde * 100, r1: r1, r1Net: r1Net, r2: r2, poz: poz, riskYuzde: ry, kal: kal, kalUygun: gerekli <= maxKal, maxKal: maxKal, gerekli: gerekli };
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
  // ek.acikYon: { long: adet, short: adet } açık işlemler; ters yönde açık işlem varken plan kırmızıdır.
  // Kırmızı + engel: piyasa pusulasına ters, açık işleme ters ya da trend tersi (C) plan; ekranda ve bildirimde gösterilmez.
  function karar(c, piyasa, ek) {
    var p = c && c.plan, o = { renk: 'kirmizi', ad: 'Uzak dur', eksik: [], teknik: false, temel: false, fiyat: false, g: null };
    if (!c) return o;
    if (c.planHatali) { o.neden = 'Plan verisi hatalı'; return o; }
    if (!p) { o.neden = c.durum === 'uzak' ? 'Analiz: uzak dur' : 'İşlem planı yok'; return o; }
    var yon = p.yon === 'short' ? 'short' : 'long', tf = c.tf || {}, g = girisDurumu(p, c.fiyat);
    var sn = planSinif(c, piyasa), h = planHesap(p, sn.riskYuzde);
    o.yon = yon; o.g = g; o.sinif = sn.sinif; o.riskYuzde = sn.riskYuzde; o.h = h;
    o.dominans = dominansEngeli(c.coin, yon, piyasa);
    // 1S: sunucunun canlı hesapladığı değer (c.h1Canli) analizdeki sabit değerin önüne geçer
    var h1 = c.h1Canli || tf.h1; o.h1 = h1;
    if (c.durum === 'uzak') { o.neden = 'Analiz: uzak dur'; return o; }
    if (g && g.tur === 'gecti' && (yon === 'short' ? c.fiyat >= p.stop : c.fiyat <= p.stop)) { o.neden = 'Fiyat stopun ötesinde · plan geçersiz'; return o; }
    // Tek yön kuralı: trend tersi plan, piyasa yönüne ters plan ve açık işleme ters plan yok
    var pu = pusula(piyasa), ters = yon === 'long' ? 'short' : 'long'; o.pusula = pu;
    if (sn.sinif === 'C') { o.neden = 'Trend plan yönünde değil · plan yok'; o.engel = true; return o; }
    if (pu && pu.yon !== yon) { o.neden = pu.yon ? 'Piyasa yönü ' + YON_AD[pu.yon] + ' · ' + YON_AD[yon] + ' plan yok' : 'Piyasa yönü belirsiz · yeni plan yok'; o.engel = true; return o; }
    if (ek && ek.acikYon && ek.acikYon[ters] > 0) { o.neden = 'Açık ' + YON_AD[ters] + ' işleminiz var · ters plan yok'; o.engel = true; return o; }
    // Teknik
    var tek = [];
    if (c.durum !== yon) tek.push('analiz onayı yok');
    if (tf.d === TERS[yon]) tek.push('1G ters yönde');
    if (tf.h4 === TERS[yon]) tek.push('4S ters yönde');
    else if (tf.h4 !== AYNI[yon]) tek.push('4S plan yönünde değil');
    if (sn.sinif === 'B' ? h1 !== 'onay' : h1 !== 'onay' && h1 !== AYNI[yon]) tek.push('1S onayı yok');
    if (h.r1Net < 1.5 - 1e-9) tek.push('ücret sonrası kazanç/risk ' + (Math.floor(h.r1Net * 100) / 100).toFixed(2).replace('.', ',') + ' (en az 1,5)');
    if (!h.kalUygun) tek.push(KAL_MAX + 'x sınırında stop çok yakın');
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

  // Tavan tektir: long ve short birlikte en fazla RISK_TAVAN. yuzde: toplam, yonler: {long, short} (bilgi).
  function toplamRisk(pozlar, fiyatlar, sermaye) {
    var t = 0, bilinmeyen = 0, y = { long: 0, short: 0 };
    pozlar.forEach(function (p) { var h = pozisyonHesap(p, fiyatlar[p.coin], sermaye); if (h.riskYuzde == null) bilinmeyen++; else { t += h.riskYuzde; y[p.yon === 'short' ? 'short' : 'long'] += h.riskYuzde; } });
    return { yuzde: t, yonler: y, tavan: RISK_TAVAN, asildi: t > RISK_TAVAN + 1e-9, bilinmeyen: bilinmeyen };
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
  // Her saatte açık pozisyon artışı yeni pozisyon sayılır; o saatin ortalama fiyatından,
  // long/short hesap oranına göre bölünüp 10/25/50/100x kaldıraçta likidasyon fiyatı hesaplanır.
  // Pozisyon azalınca tüm kümeler orantılı küçülür; fiyat bir kümeye değdiyse o küme silinir.
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
    // son açık pozisyon kaydından sonraki mumlar da kümeleri siler
    mumlar.forEach(function (m) { if (Number(m[0]) >= sonT) kume.forEach(function (k) { if (k.yon === 'long' ? Number(m[3]) <= k.p : Number(m[2]) >= k.p) k.v = 0; }); });
    var son = mumlar[mumlar.length - 1];
    var f = Number(fiyat) > 0 ? Number(fiyat) : Number(son[4]);
    kume = kume.filter(function (k) { return k.v > 0 && (k.yon === 'long' ? k.p < f : k.p > f); });
    if (!kume.length) return null;
    // Özet: fiyatın %0,5'lik dilimlerinde en yoğun küme, üstte (short likidasyonu) ve altta (long likidasyonu)
    var dilim = {}, en = { ust: null, alt: null };
    kume.forEach(function (k) { var d = Math.round(Math.log(k.p / f) / Math.log(1.005)); dilim[d] = (dilim[d] || 0) + k.v; });
    Object.keys(dilim).forEach(function (d) {
      d = Number(d); if (!d || Math.abs(d) > 30) return;
      var yer = d > 0 ? 'ust' : 'alt', p = f * Math.pow(1.005, d);
      if (!en[yer] || dilim[d] > en[yer].v) en[yer] = { p: p, v: dilim[d], uzak: (p / f - 1) * 100 };
    });
    return { kume: kume, fiyat: f, ust: en.ust, alt: en.alt };
  }
  // Grafik şeridi için: lo–hi aralığını n dilime böler, her dilimdeki tahmini tutar
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
  // Veto (skor 0): plan hatalı, analiz "uzak dur", fiyat stop ötesinde, 4S ters, plan sınıfı C (yayın yok), piyasa pusulasına ya da açık işleme ters yön.
  // Tavan (en fazla B): analiz 12 saatten eski, 10x sınırında stop çok yakın, fiyat bölgenin stop tarafında,
  // B sınıfı planda 1S onayı yok (karar() ile aynı kural).
  // Funding verisi yoksa funding puanı verilmez. 15m verisi (c.m15) henüz sunucudan gelmiyor.
  var SKOR_AGIRLIK = {
    h4: 3, d: 2, h1: 2, m15: 2, rr: 2, funding: 1, haber: 2, rejim: 1, fiyat: 2
  };
  var SKOR_MAX = 17;
  var SKOR_ESIK = { A_PLUS: 14, A: 11, B: 8 };
  // Haber sentiment ağırlığı (sinyalSkoruHaber içinde kullanılır)
  var HABER_AGIRLIK = 2;

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

  // ---- HABER SENTIMENT SKORU (Faz 1) ----
  // Her haberi -1 / 0 / +1 olarak puanlar. Toplam: -3 ile +3 arası.
  // Etki: Yüksek = 1.0, Orta = 0.5, Düşük = 0.2
  // Tazelik: 0-6 saat = 1.0, 6-24 saat = 0.7, 24-48 saat = 0.4, >48 saat = 0 (sayılmaz)
  // Yön: Olumlu = +1, Olumsuz = -1, Nötr = 0
  // Haber verisi: { yon: 'Olumlu'|'Olumsuz'|'Nötr', etki: 'Yüksek'|'Orta'|'Düşük', saat: kaç saat önce }
  // saat yoksa analizdeki zaman metninden ("16 Eki 09:34") hesaplanır; o da okunamazsa haber tam sayılır.
  var HABER_ETKI = { 'Yüksek': 1.0, 'Orta': 0.5, 'Düşük': 0.2 };
  var HABER_YON = { 'Olumlu': 1, 'Olumsuz': -1, 'Nötr': 0 };

  function haberTazelik(saat) {
    if (typeof saat !== 'number' || !isFinite(saat) || saat < 0) return 1.0; // bilinmiyorsa tam say
    if (saat <= 6) return 1.0;
    if (saat <= 24) return 0.7;
    if (saat <= 48) return 0.4;
    return 0; // 48 saatten eski haber sayılmaz
  }

  // Haberleri puanla. Dönüş: { skor, sinyalYon, sayi, etkili, detay[] }
  // skor: sinyal yönüne göre; pozitif = destekliyor, negatif = ters. simdi: test için (ms)
  function haberSentiment(haberler, sinyalYon, simdi) {
    var o = { skor: 0, sinyalYon: sinyalYon === 'short' ? 'short' : 'long', sayi: 0, etkili: 0, detay: [] };
    if (!Array.isArray(haberler) || !haberler.length) return o;
    var yonIsaret = o.sinyalYon === 'short' ? -1 : 1; // short'ta olumsuz haber destek sayılır
    haberler.forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      o.sayi++;
      var etki = HABER_ETKI[h.etki];
      if (etki == null) etki = 0.3; // bilinmeyen etki varsayılan
      var yon = HABER_YON[h.yon];
      if (yon == null) yon = 0;
      var saat = typeof h.saat === 'number' ? h.saat : analizYasi(h.zaman, simdi);
      var tazelik = haberTazelik(saat);
      if (tazelik === 0) { o.detay.push({ yon: h.yon, etki: h.etki, saat: saat, puan: 0, not: '48 saatten eski, sayılmadı' }); return; }
      var puan = yon * etki * tazelik * yonIsaret;
      o.skor += puan;
      if (Math.abs(puan) > 0.3) o.etkili++;
      o.detay.push({ yon: h.yon, etki: h.etki, saat: saat, puan: Math.round(puan * 100) / 100 });
    });
    // -3 ile +3 arasına sıkıştır
    o.skor = Math.round(Math.max(-3, Math.min(3, o.skor)) * 100) / 100;
    return o;
  }

  function sinyalSkoru(c, piyasa, ek) {
    var o = { skor: 0, maks: SKOR_MAX, sinif: 'yok', yon: null, renk: 'kirmizi', ad: 'Sinyal yok', veto: null, eksik: [], detay: {} };
    if (!c || !c.plan) { o.eksik.push(c && c.planHatali ? 'plan verisi hatalı' : 'plan yok'); return o; }
    if (!planGecerli(c.plan)) { o.veto = 'Plan verisi hatalı'; o.eksik.push(o.veto); return o; }
    var k = karar(c, piyasa, ek);
    o.yon = k.yon || (c.plan.yon === 'short' ? 'short' : 'long');
    o.detay.karar = k;
    if (k.neden && k.neden.indexOf('stopun ötesinde') >= 0) { o.veto = 'Fiyat stopun ötesinde'; o.eksik.push(o.veto); return o; }
    if (c.durum === 'uzak') { o.veto = 'Analiz: uzak dur'; o.eksik.push(o.veto); return o; }
    var yon = o.yon, tf = c.tf || {};
    if (tf.h4 === TERS[yon]) { o.veto = '4S ters yönde'; o.eksik.push(o.veto); return o; }
    if (k.sinif === 'C') { o.veto = 'Plan sınıfı C (trend tersi) · yayın yok'; o.eksik.push(o.veto); return o; }
    if (k.engel) { o.veto = k.neden; o.eksik.push(o.veto); return o; }
    var skor = 0;
    if (tf.h4 === AYNI[yon]) skor += SKOR_AGIRLIK.h4; else o.eksik.push('4S plan yönünde değil');
    o.detay.h4 = tf.h4;
    if (tf.d === AYNI[yon]) skor += SKOR_AGIRLIK.d;
    else if (tf.d === 'yatay') skor += SKOR_AGIRLIK.d * 0.5;
    else o.eksik.push('1G ters');
    o.detay.d = tf.d;
    var h1 = k.h1 || tf.h1;
    if (h1 === 'onay' || (k.sinif !== 'B' && h1 === AYNI[yon])) skor += SKOR_AGIRLIK.h1; else o.eksik.push('1S onay yok');
    o.detay.h1 = h1;
    var m15 = m15Zamanlama(c.m15, yon);
    skor += m15.puan * (SKOR_AGIRLIK.m15 / 3);
    o.detay.m15 = m15;
    if (m15.puan < 2) o.eksik.push('15m zamanlama zayıf: ' + m15.sebep);
    var h = k.h || planHesap(c.plan, (planSinif(c) || {}).riskYuzde);
    if (h.r1Net >= 1.5 - 1e-9) skor += SKOR_AGIRLIK.rr; else o.eksik.push('R:R ' + (Math.floor(h.r1Net * 100) / 100).toFixed(2).replace('.', ',') + ' (< 1,5)');
    o.detay.rr = h.r1Net;
    if (typeof c.funding === 'number') {
      var fundingOk = yon === 'short' ? c.funding > -0.0003 : c.funding < 0.001;
      if (fundingOk) skor += SKOR_AGIRLIK.funding; else o.eksik.push('funding aşırı');
    } else o.eksik.push('funding verisi yok');
    o.detay.funding = c.funding;
    var tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu', haberTemiz = true;
    (c.haberler || []).forEach(function (hb) { if (hb && hb.etki === 'Yüksek' && hb.yon === tersHaber) haberTemiz = false; });
    if (haberTemiz) skor += SKOR_AGIRLIK.haber; else o.eksik.push('ters yönde yüksek haber');
    o.detay.haber = haberTemiz;
    var rejimOk = !(yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') && !(yon === 'short' && piyasa && piyasa.mod === 'Risk açık');
    if (rejimOk && k.dominans) { rejimOk = false; o.eksik.push('dominance ters: ' + k.dominans); }
    else if (!rejimOk) o.eksik.push('piyasa rejimi ters');
    if (rejimOk) skor += SKOR_AGIRLIK.rejim;
    o.detay.rejim = piyasa && piyasa.mod;
    var g = k.g;
    if (g && g.tur === 'bolgede') skor += SKOR_AGIRLIK.fiyat;
    else if (g && g.tur === 'uzak') o.eksik.push('fiyat girişe uzak (%' + (Math.round(g.girise * 10) / 10).toString().replace('.', ',') + ')');
    else if (g && g.tur === 'gecti') o.eksik.push('fiyat bölgenin ' + (yon === 'short' ? 'üstünde' : 'altında'));
    else o.eksik.push('fiyat yok');
    o.detay.fiyat = g && g.tur;
    o.skor = Math.round(skor * 10) / 10;
    var tavanB = false;
    if (ek && typeof ek.analizSaat === 'number' && ek.analizSaat > ESKI_SAAT) { tavanB = true; o.eksik.push('analiz ' + Math.floor(ek.analizSaat) + ' saat önce'); }
    if (!h.kalUygun) { tavanB = true; o.eksik.push(KAL_MAX + 'x sınırında stop çok yakın'); }
    if (g && g.tur === 'gecti') tavanB = true;
    if (k.sinif === 'B' && h1 !== 'onay') tavanB = true;
    // Tek kural: ekrandaki trafik ışığı yeşil değilse skor da sinyal (A/A+) vermez; bildirim ile ekran aynı şeyi söyler
    if (k.renk !== 'yesil') tavanB = true;
    if (o.skor >= SKOR_ESIK.A_PLUS && !tavanB) { o.sinif = 'A+'; o.renk = 'yesil'; o.ad = 'Güçlü ' + (yon === 'long' ? 'LONG' : 'SHORT'); }
    else if (o.skor >= SKOR_ESIK.A && !tavanB) { o.sinif = 'A'; o.renk = 'yesil'; o.ad = (yon === 'long' ? 'LONG' : 'SHORT') + ' sinyali'; }
    else if (o.skor >= SKOR_ESIK.B) { o.sinif = 'B'; o.renk = 'sari'; o.ad = 'Zayıf sinyal · bekle'; }
    else { o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Sinyal yok'; }
    return o;
  }

  // ---- ATR BAZLI DİNAMİK STOP/TP (Faz 1) ----
  // Amaç: volatilite değişince stop/TP'yi uyarla. Analizin stop'u TAVAN/TABAN'dır;
  // ATR stop'u analizin stop'undan geniş olamaz, yalnızca daraltabilir.
  // Daraltılmış plan da kurala uymalı: stop giriş bölgesinin dışında, 10x içinde; aksi halde analizin stop'u kalır.
  // Bilgi amaçlı; karar() ve plan değişmez. Backtest yapılmadı.
  var ATR_PERIYOT = 7;           // 15m için hızlı ATR
  var ATR_STOP_CARPAN = 1.5;     // stop = giriş ± ATR * 1.5
  var ATR_TP1_R = 1.5;           // TP1: ücret sonrası kazanç/risk 1,5 (karar() eşiği)
  var ATR_TP2_R = 2.5;           // TP2: ücret sonrası kazanç/risk 2,5

  // Fiyata göre 8 anlamlı basamak (düşük fiyatlı coinde 1e6 yuvarlama değeri bozardı)
  function anlamli(x) { return Number(x.toPrecision(8)); }

  // True Range serisi: mum listesi -> TR listesi (ilk eleman null)
  // mum: [{ time, open, high, low, close, vol }, ...]
  function trSeri(mumlar) {
    var out = mumlar.map(function () { return null; });
    for (var i = 1; i < mumlar.length; i++) {
      var m = mumlar[i], onceki = mumlar[i - 1];
      var tr = Math.max(
        m.high - m.low,
        Math.abs(m.high - onceki.close),
        Math.abs(m.low - onceki.close)
      );
      out[i] = isFinite(tr) ? tr : null;
    }
    return out;
  }

  // Wilder ATR: ilk n TR'nin ortalaması, sonra (önceki * (n-1) + TR) / n
  // mumlar: [{ high, low, close }, ...], n: periyot (varsayılan ATR_PERIYOT)
  function atrHesap(mumlar, n) {
    n = n || ATR_PERIYOT;
    if (!Array.isArray(mumlar) || mumlar.length < n + 1) return null;
    var tr = trSeri(mumlar);
    var atr = 0, sayac = 0;
    for (var i = 1; i < tr.length; i++) {
      if (tr[i] == null) continue;
      if (sayac < n) { atr += tr[i]; sayac++; if (sayac === n) atr /= n; }
      else { atr = (atr * (n - 1) + tr[i]) / n; }
    }
    return sayac >= n ? atr : null;
  }

  // Ücret sonrası kazanç/risk = r olacak hedef uzaklığı (planHesap r1Net formülünün tersi)
  function netHedefMesafe(risk, giris, r) { var u = UCRET * giris; return r * (risk + u) + u; }

  // ATR bazlı stop/TP önerisi. Analizin planıyla karşılaştırıp daha sıkı stop'u seçer.
  // plan: { yon, giris, stop, tp1, tp2 }, atr: sayı, fiyat: güncel fiyat (bilgi)
  // Dönüş: { stop, tp1, tp2, atr, stopYuzde, kaynak: 'claude' | 'atr', notlar: [] } ya da null
  function atrStopTp(plan, atr, fiyat) {
    if (!planGecerli(plan) || !sayi(atr)) return null;
    var yon = plan.yon === 'short' ? 'short' : 'long', lng = yon === 'long';
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]);
    var giris = (alt + ust) / 2;
    var notlar = [], kaynak = 'claude', stop = plan.stop;
    var atrStop = lng ? giris - atr * ATR_STOP_CARPAN : giris + atr * ATR_STOP_CARPAN;
    if (lng ? atrStop <= plan.stop : atrStop >= plan.stop) notlar.push('Analiz stopu daha sıkı, korundu');
    else if (lng ? atrStop >= alt : atrStop <= ust) notlar.push('ATR stopu giriş bölgesinin içinde kalıyor, analiz stopu korundu');
    else if (!planHesap({ yon: yon, giris: plan.giris, stop: atrStop, tp1: plan.tp1 }).kalUygun) notlar.push('ATR stopu ' + KAL_MAX + 'x sınırı için çok yakın, analiz stopu korundu');
    else { stop = atrStop; kaynak = 'atr'; notlar.push('ATR stopu analiz stopundan sıkı'); }
    // TP'ler: ücret sonrası 1,5R ve 2,5R; analizin hedefi daha yakınsa o korunur (bölgenin dışında kalmak şartıyla)
    var risk = Math.abs(giris - stop);
    var atrTp1 = lng ? giris + netHedefMesafe(risk, giris, ATR_TP1_R) : giris - netHedefMesafe(risk, giris, ATR_TP1_R);
    var atrTp2 = lng ? giris + netHedefMesafe(risk, giris, ATR_TP2_R) : giris - netHedefMesafe(risk, giris, ATR_TP2_R);
    var tp1 = lng ? Math.min(plan.tp1, atrTp1) : Math.max(plan.tp1, atrTp1);
    var tp2 = plan.tp2 ? (lng ? Math.min(plan.tp2, atrTp2) : Math.max(plan.tp2, atrTp2)) : atrTp2;
    if (lng ? tp1 <= ust : tp1 >= alt) { tp1 = plan.tp1; notlar.push('ATR hedefi giriş bölgesinde, analiz hedefi korundu'); }
    if (lng ? tp2 < tp1 : tp2 > tp1) tp2 = tp1;
    if (tp1 !== plan.tp1) notlar.push('Hedef 1 ATR stopuna göre yakınlaştı');
    return {
      stop: anlamli(stop),
      tp1: anlamli(tp1),
      tp2: anlamli(tp2),
      atr: anlamli(atr),
      stopYuzde: Math.round(risk / giris * 10000) / 100,
      kaynak: kaynak,
      notlar: notlar
    };
  }

  // Sinyal skoru, ATR ayarlı planla baştan hesaplanır (tüm kurallar ayarlı plana uygulanır)
  // c.mumlar: 15m veya 1S mum listesi (henüz app.js doldurmuyor)
  function sinyalSkoruAtr(c, piyasa, ek) {
    var o = sinyalSkoru(c, piyasa, ek);
    if (!c || !c.mumlar || !c.plan) return o;
    var atr = atrHesap(c.mumlar, ATR_PERIYOT);
    if (!atr) { o.atrNot = 'ATR için yeterli mum yok'; return o; }
    var ayar = atrStopTp(c.plan, atr, c.fiyat);
    if (!ayar) { o.atrNot = 'ATR stop/TP hesaplanamadı'; return o; }
    var planAyarli = {}, k;
    for (k in c.plan) planAyarli[k] = c.plan[k];
    planAyarli.stop = ayar.stop; planAyarli.tp1 = ayar.tp1; planAyarli.tp2 = ayar.tp2;
    var c2 = {};
    for (k in c) c2[k] = c[k];
    c2.plan = planAyarli;
    var o2 = sinyalSkoru(c2, piyasa, ek);
    o2.atr = ayar; o2.planAyarli = planAyarli; o2.skorOzgun = o.skor; o2.sinifOzgun = o.sinif;
    return o2;
  }

  // Haber sentiment katmanı: sinyalSkoru() sonucuna ±HABER_AGIRLIK puan ekler (bilgi amaçlı; karar() değişmez).
  // sinyalSkoru()'nun vetoları ve "en fazla B" tavanı korunur; güçlü ters haber (≤ -2) veto eder.
  // Not: sinyalSkoru zaten "ters yönde yüksek haber yok" için 2 puan veriyor; bu katman onun üstüne gelir (maks 19).
  function sinyalSkoruHaber(c, piyasa, ek, simdi) {
    var o = sinyalSkoru(c, piyasa, ek);
    if (!c || !c.plan) return o;
    var yon = o.yon || 'long';
    var hs = haberSentiment(c.haberler, yon, simdi);
    o.haber = hs;
    o.detay.haberSkor = hs.skor;
    o.skorHabersiz = o.skor;
    o.maks = SKOR_MAX + HABER_AGIRLIK;
    if (o.veto) return o; // vetolu sinyal haberle geri gelmez
    if (hs.skor <= -2) {
      o.veto = 'Güçlü ters haber (skor ' + String(hs.skor).replace('.', ',') + ')'; o.eksik.push(o.veto);
      o.skor = 0; o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Ters haber · bekle';
      return o;
    }
    // Tavan: sinyalSkoru puanı A'ya yetip sınıfı B verdiyse (eski analiz, 10x, bölge geçildi, B'de 1S onayı yok) B kalır
    var tavanB = o.sinif === 'B' && o.skor >= SKOR_ESIK.A;
    // Haber katkısı: -3..+3 -> -HABER_AGIRLIK..+HABER_AGIRLIK
    var katki = hs.skor * HABER_AGIRLIK / 3;
    o.skor = Math.max(0, Math.round((o.skor + katki) * 10) / 10);
    if (hs.skor < 0) o.eksik.push('haber akışı ters (' + String(hs.skor).replace('.', ',') + ')');
    if (o.skor >= SKOR_ESIK.A_PLUS && !tavanB) { o.sinif = 'A+'; o.renk = 'yesil'; o.ad = 'Güçlü ' + (yon === 'long' ? 'LONG' : 'SHORT'); }
    else if (o.skor >= SKOR_ESIK.A && !tavanB) { o.sinif = 'A'; o.renk = 'yesil'; o.ad = (yon === 'long' ? 'LONG' : 'SHORT') + ' sinyali'; }
    else if (o.skor >= SKOR_ESIK.B) { o.sinif = 'B'; o.renk = 'sari'; o.ad = 'Zayıf sinyal · bekle'; }
    else { o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Sinyal yok'; }
    return o;
  }

  var dis = { RISK_TAVAN: RISK_TAVAN, KAL_MIN: KAL_MIN, KAL_MAX: KAL_MAX, emaSon: emaSon, trendEma: trendEma, pusula: pusula, UCRET: UCRET, planGecerli: planGecerli, planSinif: planSinif, dominansEngeli: dominansEngeli, h1Onay: h1Onay, ESKI_SAAT: ESKI_SAAT, analizYasi: analizYasi, planHesap: planHesap, girisDurumu: girisDurumu, karar: karar, pozisyonHesap: pozisyonHesap, toplamRisk: toplamRisk, coinTemizle: coinTemizle, guvenliUrl: guvenliUrl, rsiSeri: rsiSeri, turevHesap: turevHesap, likidasyonHesap: likidasyonHesap, likidasyonDilim: likidasyonDilim, binanceSembol: binanceSembol, sinyalSkoru: sinyalSkoru, m15Zamanlama: m15Zamanlama, SKOR_ESIK: SKOR_ESIK, SKOR_AGIRLIK: SKOR_AGIRLIK, atrHesap: atrHesap, atrStopTp: atrStopTp, sinyalSkoruAtr: sinyalSkoruAtr, trSeri: trSeri, ATR_PERIYOT: ATR_PERIYOT, haberSentiment: haberSentiment, haberTazelik: haberTazelik, sinyalSkoruHaber: sinyalSkoruHaber, HABER_AGIRLIK: HABER_AGIRLIK };
  if (typeof module !== 'undefined' && module.exports) module.exports = dis; else kok.DKC_HESAP = dis;
})(this);
