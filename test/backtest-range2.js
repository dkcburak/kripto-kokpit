// test/backtest-range2.js — 2. tur: uzun veri (900 gün, 1S ve 4S mum), maker-limit giriş/hedef, walk-forward (60/20/20).
// Emir yok, anahtar yok; MEXC vadeli açık verisi. GitHub Actions'ta çalışır.
// Maliyet modeli (MEXC resmi blog 13.11.2025: vadeli maker %0, taker %0,02; uygulamada doğrulanmalı):
//   giriş ve hedef = limit emir (maker, ücret 0), dolum için fiyatın limiti dolum payı kadar GEÇMESİ şart (kuyruk iyimserliğine karşı)
//   stop = piyasa emri (taker %0,02 + kayma), zaman aşımı çıkışı = taker + kayma
//   funding = 8 saatte %0,01 (long öder, short alır) — ortalama tahmin; gerçek funding doğrulanmalı
//   "stres" senaryosu: dolum payı 2x, kayma 2x, funding 2x
// Aileler: MR1S, MR4S = range ortalamaya dönüş (ADX<eşik, Bollinger bandına limit); TREND4S = EMA20/50 trendinde EMA20'ye geri çekilme limiti (range DEĞİL, karşılaştırma).
// Seçim kuralı: ayarlar yalnız TRAIN dilimindeki ortalama R ile sıralanır; VAL ve TEST dokunulmaz raporlanır.
// Kullanım: node test/backtest-range2.js [gün=900]
'use strict';

var GUN = Number(process.argv[2]) || 900;
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'TIA', 'INJ', 'XMR', 'WLD', 'ENA', 'HYPE', 'NEAR', 'SUI'];
var TFS = { h1: { aralik: 'Min60', sn: 3600 }, h4: { aralik: 'Hour4', sn: 14400 } };
var SENARYO = {
  baz: { dolumPayi: 0.0005, takerUcret: 0.0002, kayma: 0.0005, fundingSekiz: 0.0001 },
  stres: { dolumPayi: 0.001, takerUcret: 0.0002, kayma: 0.001, fundingSekiz: 0.0002 }
};

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) {
  for (var d = 0; d < 3; d++) {
    await bekle(200);
    try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ }
    await bekle(1500);
  }
  throw new Error('MEXC erişilemedi: ' + url);
}
async function mumlar(coin, tf, bas, bit) {
  var out = [], seen = {}, adim = TFS[tf].sn;
  if (process.env.SENTETIK) { // yerel kod testi: sahte veri
    var p = 100, tr = 0;
    for (var t = bas; t < bit; t += adim) { if (Math.random() < 0.01) tr = (Math.random() - 0.5) * 0.01; var c = p * (1 + tr + (Math.random() - 0.5) * 0.02); out.push({ time: t, open: p, high: Math.max(p, c) * 1.003, low: Math.min(p, c) * 0.997, close: c }); p = c; }
    return out;
  }
  for (var s = bas; s < bit; s += adim * 400) {
    var e = Math.min(bit, s + adim * 400);
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=' + TFS[tf].aralik + '&start=' + s + '&end=' + e);
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { if (seen[t] || t + adim > bit) return; seen[t] = 1; out.push({ time: t, open: +d.open[i], high: +d.high[i], low: +d.low[i], close: +d.close[i] }); });
  }
  return out.sort(function (a, b) { return a.time - b.time; });
}

function gosterge(m) {
  var n = m.length, atr = [], adx = [], sma = [], sd = [], e20 = [], e50 = [], P = 14;
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
  var a20 = 2 / 21, a50 = 2 / 51;
  for (var q = 0; q < n; q++) {
    e20.push(q === 0 ? m[0].close : e20[q - 1] + a20 * (m[q].close - e20[q - 1]));
    e50.push(q === 0 ? m[0].close : e50[q - 1] + a50 * (m[q].close - e50[q - 1]));
    if (q < 19) { sma.push(null); sd.push(null); continue; }
    var s = 0, v = 0; for (var z = q - 19; z <= q; z++) s += m[z].close;
    var mu = s / 20; for (z = q - 19; z <= q; z++) v += Math.pow(m[z].close - mu, 2);
    sma.push(mu); sd.push(Math.sqrt(v / 20));
  }
  return { atr: atr, adx: adx, sma: sma, sd: sd, e20: e20, e50: e50 };
}

// cfg: aile, tf, k, stopCarpan, adxMax, minStop(% fiyat), tpR (trend), bekleme (limit geçerlilik mumu), maxTut (mum)
function kos(m, g, cfg, sc, tfSn) {
  var islem = [], i = 60, BEKLE = 3, MAXTUT = cfg.maxTut || 24;
  while (i < m.length - BEKLE - 2) {
    var A = g.atr[i], X = g.adx[i], mu = g.sma[i], sd = g.sd[i];
    if (!A || X === null || !mu) { i++; continue; }
    var yon = 0, L = 0, stop = 0, hedef = 0;
    if (cfg.aile === 'MR') {
      if (X >= cfg.adxMax) { i++; continue; }
      if (m[i].close < mu - cfg.k * sd) { yon = 1; L = mu - cfg.k * sd; } else if (m[i].close > mu + cfg.k * sd) { yon = -1; L = mu + cfg.k * sd; }
      if (!yon) { i++; continue; }
      stop = L - yon * cfg.stopCarpan * A; hedef = mu;
    } else { // TREND: EMA20/50 + ADX>25, EMA20'ye geri çekilme limiti
      if (X < 25) { i++; continue; }
      var yukari = g.e20[i] > g.e50[i] && m[i].close > g.e50[i], asagi = g.e20[i] < g.e50[i] && m[i].close < g.e50[i];
      if (yukari && m[i].close > g.e20[i]) yon = 1; else if (asagi && m[i].close < g.e20[i]) yon = -1;
      if (!yon) { i++; continue; }
      L = g.e20[i]; stop = L - yon * cfg.stopCarpan * A; hedef = L + yon * cfg.tpR * Math.abs(L - stop);
    }
    var risk = Math.abs(L - stop);
    if (risk / L * 100 < cfg.minStop || yon * (hedef - L) <= 0) { i++; continue; }
    // limit dolum: sonraki BEKLE mum içinde fiyat limiti dolum payı kadar geçmeli
    var fill = -1;
    for (var j = i + 1; j <= i + BEKLE; j++) {
      if (yon === 1 ? m[j].low <= L * (1 - sc.dolumPayi) : m[j].high >= L * (1 + sc.dolumPayi)) { fill = j; break; }
    }
    if (fill < 0) { i++; continue; }
    var cikis = null, tur = '', k;
    for (k = fill; k < Math.min(m.length, fill + MAXTUT); k++) {
      var hit = yon === 1 ? m[k].low <= stop : m[k].high >= stop;
      var tp = k > fill && (yon === 1 ? m[k].high >= hedef * (1 + sc.dolumPayi) : m[k].low <= hedef * (1 - sc.dolumPayi));
      if (hit) { cikis = stop; tur = 'stop'; break; }
      if (tp) { cikis = hedef; tur = 'tp'; break; }
    }
    if (cikis === null) { k = Math.min(m.length, fill + MAXTUT) - 1; cikis = m[k].close; tur = 'sure'; }
    var brut = yon * (cikis - L);
    var cikisMaliyet = tur === 'tp' ? 0 : (sc.takerUcret + sc.kayma) * cikis;
    var tutSaat = (k - fill + 1) * tfSn / 3600;
    var funding = yon * sc.fundingSekiz * (tutSaat / 8) * L; // long öder (+), short alır (-)
    islem.push({ t: m[fill].time, r: (brut - cikisMaliyet - funding) / risk, tur: tur });
    i = k + 1;
  }
  return islem;
}

var AYARLAR = [];
['h1', 'h4'].forEach(function (tf) {
  [2, 2.5].forEach(function (k) { [1.5, 2.5].forEach(function (sc) { [20, 25].forEach(function (adx) {
    AYARLAR.push({ ad: 'MR' + (tf === 'h1' ? '1S' : '4S') + ' k' + k + ' stop' + sc + 'ATR adx<' + adx, aile: 'MR', tf: tf, k: k, stopCarpan: sc, adxMax: adx, minStop: tf === 'h1' ? 0.5 : 0.8 });
  }); }); });
});
[1.5, 2].forEach(function (tp) { AYARLAR.push({ ad: 'TREND4S EMA20 geri çekilme stop1ATR tp' + tp + 'R', aile: 'TREND', tf: 'h4', stopCarpan: 1, tpR: tp, minStop: 0.8, maxTut: 30 }); });

function ozet(l) {
  var n = l.length; if (n < 2) return { n: n, ort: NaN, t: NaN, kz: NaN };
  var top = l.reduce(function (a, x) { return a + x.r; }, 0), ort = top / n;
  var v = l.reduce(function (a, x) { return a + Math.pow(x.r - ort, 2); }, 0) / (n - 1);
  return { n: n, ort: ort, t: ort / Math.sqrt(v / n), kz: l.filter(function (x) { return x.r > 0; }).length / n };
}
function f(o) { return o.n < 2 ? 'n=' + o.n : 'n=' + o.n + ' ort=' + o.ort.toFixed(3) + 'R t=' + o.t.toFixed(1) + ' kz=' + (o.kz * 100).toFixed(0) + '%'; }

(async function () {
  var son = Math.floor(Date.now() / 1000 / 14400) * 14400, bas = son - GUN * 86400;
  var veri = { h1: {}, h4: {} };
  for (var ci = 0; ci < COINLER.length; ci++) {
    for (var tf in TFS) { try { veri[tf][COINLER[ci]] = await mumlar(COINLER[ci], tf, bas, son); } catch (e) { console.log('atlandı', COINLER[ci], tf, e.message); } }
  }
  var ornek = veri.h4.BTC || veri.h4[Object.keys(veri.h4)[0]];
  console.log('Veri: ' + Object.keys(veri.h4).length + ' coin, ' + GUN + ' gün, ' + (ornek ? new Date(ornek[0].time * 1000).toISOString().slice(0, 10) + ' → ' + new Date(ornek[ornek.length - 1].time * 1000).toISOString().slice(0, 10) : '') + ', 4S mum/coin≈' + (ornek ? ornek.length : 0));
  var t1 = bas + (son - bas) * 0.6, t2 = bas + (son - bas) * 0.8;
  console.log('Dilimler: TRAIN ' + new Date(bas * 1000).toISOString().slice(0, 10) + '→' + new Date(t1 * 1000).toISOString().slice(0, 10) + ' | VAL →' + new Date(t2 * 1000).toISOString().slice(0, 10) + ' | TEST →' + new Date(son * 1000).toISOString().slice(0, 10));
  Object.keys(SENARYO).forEach(function (sn) {
    var sc = SENARYO[sn], sonuc = [];
    AYARLAR.forEach(function (a) {
      var hepsi = [], coinTest = {};
      Object.keys(veri[a.tf]).forEach(function (coin) {
        var m = veri[a.tf][coin]; if (m.length < 200) return;
        var il = kos(m, gosterge(m), a, sc, TFS[a.tf].sn);
        il.forEach(function (x) { x.coin = coin; });
        hepsi = hepsi.concat(il);
      });
      var tr = hepsi.filter(function (x) { return x.t < t1; }), va = hepsi.filter(function (x) { return x.t >= t1 && x.t < t2; }), te = hepsi.filter(function (x) { return x.t >= t2; });
      var pc = {}; te.forEach(function (x) { pc[x.coin] = (pc[x.coin] || 0) + x.r; });
      var poz = Object.keys(pc).filter(function (c) { return pc[c] > 0; }).length;
      sonuc.push({ a: a, tr: ozet(tr), va: ozet(va), te: ozet(te), coinPoz: poz + '/' + Object.keys(pc).length, stopOran: hepsi.length ? hepsi.filter(function (x) { return x.tur === 'stop'; }).length / hepsi.length : 0 });
    });
    sonuc.sort(function (x, y) { return (isNaN(y.tr.ort) ? -9 : y.tr.ort) - (isNaN(x.tr.ort) ? -9 : x.tr.ort); });
    console.log('\n=== Senaryo: ' + sn + ' (sıralama yalnız TRAIN ortalama R ile) ===');
    sonuc.forEach(function (s) {
      console.log(s.a.ad.padEnd(46) + ' TRAIN ' + f(s.tr) + ' | VAL ' + f(s.va) + ' | TEST ' + f(s.te) + ' | testte artı coin ' + s.coinPoz + ' | stop% ' + (s.stopOran * 100).toFixed(0));
    });
  });
})().catch(function (e) { console.error(e); process.exit(1); });
