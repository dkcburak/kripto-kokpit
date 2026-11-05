// Trader Masası: 4 trader ajanının saf sinyal kuralları (T2 Kırılım, T3 Trend, T4 Funding, T5 Güç).
// T1 dKc mevcut tarayıcıdan (tarayici-veri dalı) okunur, burada yeniden yazılmaz.
// Hepsi kapanmış mumlarla çalışır, emir vermez. Kural metinleri: /mnt/project-files/kripto/trader-paneli/ajanlar/
// Testi: node test/masa.test.js   Geriye dönük test: node test/masa-backtest.js (GitHub Actions, MEXC açık veri)
'use strict';
var UCRET = 0.001; // giriş+çıkış ücret ve kayma (hesap.js ile aynı; MEXC tarifesi doğrulanmalı)

function ema(kap, n) {
  if (kap.length < n) return null;
  var k = 2 / (n + 1), e = 0, i;
  for (i = 0; i < n; i++) e += kap[i];
  e /= n;
  for (i = n; i < kap.length; i++) e = kap[i] * k + e * (1 - k);
  return e;
}
function atr(m, k, n) {
  if (k < n) return null;
  var s = 0;
  for (var i = k - n + 1; i <= k; i++) s += Math.max(m[i].high - m[i].low, Math.abs(m[i].high - m[i - 1].close), Math.abs(m[i].low - m[i - 1].close));
  return s / n;
}
function rsi(m, k, n) {
  if (k < n) return null;
  var g = 0, l = 0;
  for (var i = k - n + 1; i <= k; i++) { var d = m[i].close - m[i - 1].close; if (d > 0) g += d; else l -= d; }
  if (l === 0) return 100;
  return 100 - 100 / (1 + (g / n) / (l / n));
}
function kapanis(m, k, n) { var o = []; for (var i = Math.max(0, k - n + 1); i <= k; i++) o.push(m[i].close); return o; }
function y(x) { return Number(Number(x).toPrecision(6)); }
// Plan: giriş aralığı ortası referans; hedefler ücret sonrası net R (kirilim.js ile aynı formül)
function plan(ad, giris, stop, rr1, rr2, gerekce, ek) {
  var mid = (giris[0] + giris[1]) / 2, risk = mid - stop, u = UCRET * mid;
  if (!(risk > 0) || risk / mid > 0.12) return null; // stop %12'den uzaksa plan yok
  var p = { trader: ad, yon: 'long', giris: [y(Math.min(giris[0], giris[1])), y(Math.max(giris[0], giris[1]))], stop: y(stop), tp1: y(mid + rr1 * (risk + u) + u), tp2: y(mid + rr2 * (risk + u) + u), gerekce: gerekce, rr: rr1 };
  if (ek) Object.keys(ek).forEach(function (x) { p[x] = ek[x]; });
  return p;
}

// T2 Kırılım: 4S kapanış önceki 20 mum zirvesinin üstünde, hacim ≥ 2,5× ortalama. Stop zirve - 2 ATR14. Hedef 2R/3R. Tutma 12 mum.
function kirilim(h4, k, ayar) {
  ayar = ayar || {};
  var volK = ayar.volK || 2.5, atrK = ayar.atrK || 2;
  if (k < 22) return null;
  var yuk = -Infinity, hv = 0;
  for (var i = k - 20; i < k; i++) { yuk = Math.max(yuk, h4[i].high); hv += h4[i].vol; }
  hv /= 20;
  var m = h4[k];
  if (!(hv > 0) || m.vol < volK * hv || !(m.close > yuk)) return null;
  var a = atr(h4, k, 14); if (!a) return null;
  return plan('kirilim', [yuk, m.close], yuk - atrK * a, 2, 3, 'Önceki 20 mum zirvesi (' + y(yuk) + ') kapanışla kırıldı, hacim ' + (m.vol / hv).toFixed(1) + 'x', { tutma: 12, tf: '4S' });
}

// T3 Trend: 1G kapanış son 55 günün en yüksek kapanışının üstünde, EMA50 > EMA200. Stop giriş - 3 ATR20, takip eden stop. Zaman stopu 20 gün (+1R görülmezse).
function trend(d1, k) {
  if (k < 200) return null;
  var kap = kapanis(d1, k, 200), e50 = ema(kap, 50), e200 = ema(kap, 200), m = d1[k];
  if (!(e50 > e200)) return null;
  var yuk = -Infinity; for (var i = k - 55; i < k; i++) yuk = Math.max(yuk, d1[i].close);
  if (!(m.close > yuk)) return null;
  var a = atr(d1, k, 20); if (!a) return null;
  return plan('trend', [m.close, m.close * 1.005], m.close - 3 * a, 3, 5, '55 gün zirvesi (' + y(yuk) + ') günlük kapanışla aşıldı, EMA50 > EMA200', { tutma: 20, tf: '1G', takipAtr: 3, atr: a });
}

// T4 Funding: son 3 funding ortalaması ≤ -%0,03, fiyat 4S EMA20 altında, 1S'de hacimli dönüş mumu (alt fitil ≥ 1,5 gövde). Stop dip - 1 ATR14. Hedef 2R. Tutma 16 saat.
function funding(h1, k, fundOrt, h4Ema20, ayar) {
  ayar = ayar || {};
  var esik = ayar.esik != null ? ayar.esik : -0.0003;
  if (k < 30 || fundOrt == null || !(fundOrt <= esik) || !(h4Ema20 > 0)) return null;
  var m = h1[k];
  if (!(m.close < h4Ema20) || !(m.close > m.open)) return null;
  var govde = m.close - m.open, fitil = Math.min(m.open, m.close) - m.low;
  if (!(govde > 0) || fitil < 1.5 * govde) return null;
  var hv = 0; for (var i = k - 20; i < k; i++) hv += h1[i].vol; hv /= 20;
  if (!(hv > 0) || m.vol < 1.2 * hv) return null;
  var a = atr(h1, k, 14); if (!a) return null;
  return plan('funding', [m.open, m.close], m.low - a, 2, 3, 'Funding ' + (fundOrt * 100).toFixed(3) + '%, fiyat 4S EMA20 altında, 1S dönüş mumu (fitil ' + (fitil / govde).toFixed(1) + '× gövde)', { tutma: 16, tf: '1S' });
}

// T5 Güç: lider coinde (BTC'ye göre 14 gün getiri ilk 5, BTC 1G EMA50 üstünde) 4S EMA20'ye geri çekilme + RSI 40-55, sonra EMA20 üstünde yeşil kapanış.
// Son 7 günde %40'tan fazla yükselen coin atlanır. Stop geri çekilme dibi - 1 ATR14. Hedef 2R. Tutma 12 mum.
function gucLiderler(gunluk, btc, k, adet) {
  // gunluk: { coin: d1[] } hepsi aynı takvimle hizalı; k: BTC indeksi; dönüş: [coin,...]
  adet = adet || 5;
  if (k < 50) return [];
  var bk = kapanis(btc, k, 50);
  if (!(btc[k].close > ema(bk, 50))) return [];
  var bt = btc[k].close / btc[k - 14].close, l = [];
  Object.keys(gunluk).forEach(function (c) {
    var d = gunluk[c]; if (!d || d.length <= k || !d[k] || !d[k - 14] || d[k].time !== btc[k].time) return;
    var g = d[k].close / d[k - 14].close, g7 = d[k].close / d[k - 7].close;
    if (g7 > 1.4) return;
    l.push({ coin: c, guc: g / bt });
  });
  return l.sort(function (a, b) { return b.guc - a.guc; }).slice(0, adet).filter(function (x) { return x.guc > 1; }).map(function (x) { return x.coin; });
}
function guc(h4, k) {
  if (k < 30) return null;
  var m = h4[k], onc = h4[k - 1], kap = kapanis(h4, k - 1, 60), e20o = ema(kap, 20);
  if (!e20o) return null;
  var r = rsi(h4, k - 1, 14);
  var cek = Math.abs(onc.close / e20o - 1) <= 0.01 && r >= 40 && r <= 55;
  if (!cek) return null;
  var e20 = ema(kapanis(h4, k, 60), 20);
  if (!(m.close > e20 && m.close > m.open)) return null;
  var dip = Math.min(h4[k - 2].low, onc.low, m.low), a = atr(h4, k, 14); if (!a) return null;
  return plan('guc', [m.open, m.close], dip - a, 2, 3, 'Lider coin, 4S EMA20 geri çekilmesi (RSI ' + r.toFixed(0) + ') sonrası yeşil kapanış', { tutma: 12, tf: '4S' });
}

// Açık kağıt işlemi yeni kapanmış mumlarla ilerlet. p: { giris (dolum), stop, tp1, tutma, say, takipAtr?, atr? }.
// Dönüş: { r, neden } ya da null. Aynı mumda stop+hedef = stop. R ücret sonrası net (risk + u payda).
function ilerlet(p, m) {
  p.say = (p.say || 0) + 1;
  var u = UCRET * p.giris, risk = p.giris - p.stop0;
  function net(cikis) { return Math.max(-1.2, ((cikis - p.giris) - u) / (risk + u)); }
  if (m.low <= p.stop) return { r: p.stop === p.stop0 ? -1 : net(p.stop), neden: p.stop > p.stop0 ? 'takip stop' : 'stop' };
  if (!p.takipAtr && m.high >= p.tp1) return { r: p.rr, neden: 'hedef' };
  if (p.takipAtr) {
    p.enYuksek = Math.max(p.enYuksek || p.giris, m.high);
    if (p.enYuksek - p.giris >= risk) p.birR = true;
    var yeni = m.close - p.takipAtr * p.atr; if (yeni > p.stop) p.stop = yeni;
    if (p.say >= p.tutma && !p.birR) return { r: net(m.close), neden: 'süre' };
    return null;
  }
  if (p.say >= p.tutma) return { r: Math.min(p.rr, net(m.close)), neden: 'süre' };
  return null;
}

module.exports = { UCRET: UCRET, ema: ema, atr: atr, rsi: rsi, plan: plan, kirilim: kirilim, trend: trend, funding: funding, gucLiderler: gucLiderler, guc: guc, ilerlet: ilerlet };
