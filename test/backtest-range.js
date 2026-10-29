// test/backtest-range.js — küçük range (yatay piyasa) al-sat fikirlerinin geçmiş veriyle denemesi.
// Emir yok, anahtar yok; MEXC vadeli açık verisi. Konteynerde erişim yok, GitHub Actions'ta çalışır.
// Üç sistem, aynı veride, üç maliyet senaryosuyla:
//   MR  : ortalamaya dönüş. Range filtresi (ADX<20) açıkken alt Bollinger bandı altında kapanışta long, üst bandın üstünde short.
//         Stop 1,5 ATR, hedef SMA20 (orta bant), en fazla 48 mum bekler. Sinyal mum kapanışında, giriş sonraki mum açılışında.
//   MR0 : MR ile aynı ama range filtresi KAPALI (filtre işe yarıyor mu kontrolü).
//   GRID: range tespit edilince (ADX<20, 48 mumluk aralık %3-%8 genişlik) 6 aralıklı ızgara; her seviyede limit al, bir seviye üstte sat.
//         Aralığın 0,5 adım dışında 15dk kapanış = stop, tüm açık lotlar kapanır. En fazla 7 gün.
// Basitleştirmeler (sonuçlar tahmindir): aynı mumda stop ve hedef görülürse stop sayılır; funding dahil değil;
// ızgara limit emirlerinin dolumu "fiyat seviyeye değdi" kabul edilir (kuyruk sırası ve kayma yok, iyimser).
// Maliyet senaryoları = tek işlemde giriş+çıkış toplam (ücret+spread+kayma) fiyatın yüzdesi: 0,04 / 0,10 / 0,20.
// Geliştirme/test: ilk %70 geliştirme, son %30 test (kronolojik, sızıntı yok).
// Kullanım: node test/backtest-range.js [gün=180] [zamanDilimi=m15|h1]
'use strict';

var GUN = Number(process.argv[2]) || 180;
var TFARG = process.argv[3] || 'm15';
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'TIA', 'INJ', 'XMR', 'WLD', 'ENA', 'HYPE', 'NEAR', 'SUI'];
var M15 = 900;
var MALIYET = [0.0004, 0.001, 0.002];

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) {
  for (var d = 0; d < 3; d++) {
    await bekle(200);
    try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ }
    await bekle(1500);
  }
  throw new Error('MEXC erişilemedi: ' + url);
}
async function mumlar(coin, bas, bit) {
  var out = [], seen = {};
  for (var s = bas; s < bit; s += M15 * 400) {
    var e = Math.min(bit, s + M15 * 400);
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Min15&start=' + s + '&end=' + e);
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { if (seen[t] || t + M15 > bit) return; seen[t] = 1; out.push({ time: t, open: +d.open[i], high: +d.high[i], low: +d.low[i], close: +d.close[i] }); });
  }
  return out.sort(function (a, b) { return a.time - b.time; });
}
function topla(m15, k) { // k adet 15dk mumu birleştir (saat başına hizalı)
  var out = [], g = null;
  m15.forEach(function (m) {
    var anahtar = Math.floor(m.time / (M15 * k));
    if (!g || g.k !== anahtar) { if (g && g.n === k) out.push(g.m); g = { k: anahtar, n: 0, m: { time: anahtar * M15 * k, open: m.open, high: m.high, low: m.low, close: m.close } }; }
    g.n++; g.m.high = Math.max(g.m.high, m.high); g.m.low = Math.min(g.m.low, m.low); g.m.close = m.close;
  });
  if (g && g.n === k) out.push(g.m);
  return out;
}

// ---- göstergeler (tüm seri bir kerede, i. mum kapanışındaki değer) ----
function gosterge(m) {
  var n = m.length, atr = [], adx = [], sma = [], sd = [], P = 14;
  var tr = [], pdm = [], mdm = [];
  for (var i = 0; i < n; i++) {
    if (i === 0) { tr.push(m[0].high - m[0].low); pdm.push(0); mdm.push(0); continue; }
    var up = m[i].high - m[i - 1].high, dn = m[i - 1].low - m[i].low;
    tr.push(Math.max(m[i].high - m[i].low, Math.abs(m[i].high - m[i - 1].close), Math.abs(m[i].low - m[i - 1].close)));
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  var sT = 0, sP = 0, sM = 0, dx = [], adxv = null;
  for (var j = 0; j < n; j++) {
    atr.push(null); adx.push(null);
    if (j < P) { sT += tr[j]; sP += pdm[j]; sM += mdm[j]; if (j < P - 1) continue; }
    else { sT = sT - sT / P + tr[j]; sP = sP - sP / P + pdm[j]; sM = sM - sM / P + mdm[j]; }
    atr[j] = sT / P;
    var pdi = 100 * sP / sT, mdi = 100 * sM / sT;
    dx.push(pdi + mdi === 0 ? 0 : 100 * Math.abs(pdi - mdi) / (pdi + mdi));
    if (dx.length === P) adxv = dx.reduce(function (a, b) { return a + b; }, 0) / P;
    else if (dx.length > P) adxv = (adxv * (P - 1) + dx[dx.length - 1]) / P;
    adx[j] = adxv;
  }
  for (var q = 0; q < n; q++) {
    if (q < 19) { sma.push(null); sd.push(null); continue; }
    var s = 0, v = 0; for (var z = q - 19; z <= q; z++) s += m[z].close;
    var mu = s / 20; for (z = q - 19; z <= q; z++) v += Math.pow(m[z].close - mu, 2);
    sma.push(mu); sd.push(Math.sqrt(v / 20));
  }
  return { atr: atr, adx: adx, sma: sma, sd: sd };
}

// ---- MR (ortalamaya dönüş) ----
function mrKos(m, g, filtre, maliyet) {
  var islem = [], i = 21 + 14 * 3;
  while (i < m.length - 2) {
    var A = g.atr[i], X = g.adx[i], mu = g.sma[i], sd = g.sd[i];
    if (!A || !X || !mu) { i++; continue; }
    if (filtre && X >= 20) { i++; continue; }
    var yon = m[i].close < mu - 2 * sd ? 1 : m[i].close > mu + 2 * sd ? -1 : 0;
    if (!yon) { i++; continue; }
    var giris = m[i + 1].open, risk = 1.5 * A;
    var stop = giris - yon * risk, hedef = mu;
    if (yon * (hedef - giris) <= 0) { i++; continue; }
    var rr = Math.abs(hedef - giris) / risk;
    var cikis = null, k;
    for (k = i + 1; k < Math.min(m.length, i + 1 + 48); k++) {
      var hit = yon === 1 ? m[k].low <= stop : m[k].high >= stop;
      var tp = yon === 1 ? m[k].high >= hedef : m[k].low <= hedef;
      if (hit) { cikis = stop; break; }
      if (tp) { cikis = hedef; break; }
    }
    if (cikis === null) { k = Math.min(m.length, i + 1 + 48) - 1; cikis = m[k].close; }
    var brut = yon * (cikis - giris), ucret = maliyet * giris;
    islem.push({ t: m[i].time, r: (brut - ucret) / (risk + ucret), rr: rr });
    i = k + 1;
  }
  return islem;
}

// ---- GRID ----
function gridKos(m1, m15, g1, maliyet) {
  var islem = [], i = 60, ts = {};
  m15.forEach(function (x, ix) { ts[x.time] = ix; });
  while (i < m1.length - 2) {
    var X = g1.adx[i];
    if (X === null || X >= 20) { i++; continue; }
    var lo = Infinity, hi = -Infinity;
    for (var z = i - 47; z <= i; z++) { lo = Math.min(lo, m1[z].low); hi = Math.max(hi, m1[z].high); }
    var mid = (hi + lo) / 2, w = (hi - lo) / mid;
    if (w < 0.03 || w > 0.08) { i++; continue; }
    var N = 6, s = (hi - lo) / N, seviye = [];
    for (var l = 0; l < N; l++) seviye.push({ al: lo + l * s, sat: lo + (l + 1) * s, acik: false });
    var bas = ts[m1[i].time + 3600 - M15 * 0] !== undefined ? ts[m1[i].time + 3600] : null;
    if (bas === null || bas === undefined) { i++; continue; }
    var pnl = 0, fills = 0, son = Math.min(m15.length, bas + 4 * 24 * 7), stopMu = false, k;
    for (k = bas; k < son; k++) {
      var c = m15[k];
      if (c.close < lo - 0.5 * s || c.close > hi + 0.5 * s) {
        seviye.forEach(function (v) { if (v.acik) { pnl += (c.close - v.al) / v.al - maliyet; v.acik = false; } });
        stopMu = true; break;
      }
      seviye.forEach(function (v) {
        if (v.acik && c.high >= v.sat) { pnl += (v.sat - v.al) / v.al - maliyet; v.acik = false; fills++; }
        else if (!v.acik && c.low <= v.al && v.sat <= hi + 1e-9) v.acik = true;
      });
    }
    if (!stopMu) { var cs = m15[Math.min(k, m15.length - 1)].close; seviye.forEach(function (v) { if (v.acik) { pnl += (cs - v.al) / v.al - maliyet; } }); }
    islem.push({ t: m1[i].time, r: pnl / N, fills: fills, stop: stopMu }); // pnl: 1 birim/seviye toplamı; r alanı = sermayeye % (N birim üzerinden)
    var biten = Math.floor((k - bas) / 4) + 1;
    i += Math.max(biten, 1) + 1;
  }
  return islem;
}

// ---- rapor ----
function ozet(liste) {
  var n = liste.length; if (!n) return { n: 0 };
  var topR = liste.reduce(function (a, x) { return a + x.r; }, 0), kazan = liste.filter(function (x) { return x.r > 0; }).length;
  return { n: n, netR: +topR.toFixed(1), ortR: +(topR / n).toFixed(3), kazanOran: +(kazan / n * 100).toFixed(0) + '%' };
}
function bol(liste) { liste = liste.sort(function (a, b) { return a.t - b.t; }); var k = Math.floor(liste.length * 0.7); return { gel: liste.slice(0, k), test: liste.slice(k) }; }

(async function () {
  var son = Math.floor(Date.now() / 1000 / M15) * M15, bas = son - GUN * 86400;
  var veri = {};
  for (var ci = 0; ci < COINLER.length; ci++) {
    try { veri[COINLER[ci]] = await mumlar(COINLER[ci], bas, son); } catch (e) { console.log('atlandı', COINLER[ci], e.message); }
  }
  var coinler = Object.keys(veri).filter(function (c) { return veri[c].length > 1000; });
  var ilk = veri[coinler[0]];
  console.log('Veri: ' + coinler.length + ' coin, ' + GUN + ' gün, ' + (ilk ? new Date(ilk[0].time * 1000).toISOString().slice(0, 10) + ' → ' + new Date(ilk[ilk.length - 1].time * 1000).toISOString().slice(0, 10) : '') + ', mum sayısı/coin ≈ ' + (ilk ? ilk.length : 0));
  var sonuc = {};
  MALIYET.forEach(function (c) { sonuc[c] = { MR: [], MR0: [], GRID: [] }; });
  coinler.forEach(function (coin) {
    var m15 = veri[coin], m = TFARG === 'h1' ? topla(m15, 4) : m15, g = gosterge(m);
    var m1 = topla(m15, 4), g1 = TFARG === 'h1' ? g : gosterge(m1);
    MALIYET.forEach(function (c) {
      sonuc[c].MR = sonuc[c].MR.concat(mrKos(m, g, true, c));
      sonuc[c].MR0 = sonuc[c].MR0.concat(mrKos(m, g, false, c));
      sonuc[c].GRID = sonuc[c].GRID.concat(gridKos(m1, m15, g1, c));
    });
  });
  console.log('Zaman dilimi (MR): ' + TFARG + '. R = net kazanç / (stop mesafesi + maliyet). GRID için "ortR" = grid başına sermayeye % getiri (N=6 birim üstünden), netR = toplam %.');
  MALIYET.forEach(function (c) {
    console.log('\n=== Maliyet (giriş+çıkış toplam) ' + (c * 100).toFixed(2) + '% ===');
    ['MR', 'MR0', 'GRID'].forEach(function (ad) {
      var b = bol(sonuc[c][ad]);
      var fmt = function (o) { return o.n ? 'n=' + o.n + ' netR=' + o.netR + ' ortR=' + o.ortR + ' kazanç=' + o.kazanOran : 'n=0'; };
      console.log(ad.padEnd(5) + ' TÜMÜ: ' + fmt(ozet(sonuc[c][ad])) + ' | GELİŞTİRME: ' + fmt(ozet(b.gel)) + ' | TEST: ' + fmt(ozet(b.test)));
    });
  });
  var gs = sonuc[0.001].GRID; if (gs.length) console.log('\nGRID (maliyet 0,10%): grid sayısı ' + gs.length + ', stop ile biten ' + gs.filter(function (x) { return x.stop; }).length + ', ortalama dolum ' + (gs.reduce(function (a, x) { return a + x.fills; }, 0) / gs.length).toFixed(1));
  var mr = sonuc[0.001].MR; if (mr.length) console.log('MR (0,10%): ortalama hedef/risk oranı ' + (mr.reduce(function (a, x) { return a + x.rr; }, 0) / mr.length).toFixed(2));
})().catch(function (e) { console.error(e); process.exit(1); });
