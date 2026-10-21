// test/backtest-seri.js — bot 2 (15 dakikalık seri işlem) için strateji denemesi. Emir yok, anahtar yok (MEXC açık verisi).
// Ortak kurallar (bot 1 ile aynı): yalnız piyasa yönünde (BTC 1G ve 4S aynı yön; karışıkken işlem yok), coinin 1S trendi aynı yönde,
// aynı anda tek yön, en fazla 3 açık işlem, coin başına 1 işlem. Ücret+kayma hesap.js UCRET (gidiş-dönüş %0,1).
// Kurulumlar (15dk kapanmış mumlarla):
//   geri  : 15dk EMA20 > EMA50 (short'ta tersi), mum EMA20'ye değip trend tarafında kapanır -> kapanıştan giriş.
//           Stop son 5 mumun dibi/tepesi ± 0,1 ATR; stop mesafesi %0,3-%2,5 arası değilse işlem yok.
//   kirilim: kapanış önceki 20 mumun tepesini (short'ta dibini) geçer -> kapanıştan giriş, stop 1,5 ATR.
// Çıkış: hedef (R), stop ya da süre sınırı (16 mum = 4 saat) dolunca kapanış. Aynı mumda stop ve hedef görülürse stop sayılır.
// Kullanım: node test/backtest-seri.js [gün=60]  (GitHub Actions'ta çalışır: .github/workflows/backtest-seri.yml)
'use strict';
var H = require('../hesap.js');
var Y = require('./backtest-yon.js');

var GUN = Number(process.argv[2]) || 60;
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'SUI', 'HYPE', 'ENA', 'WLD', 'TIA', 'NEAR'];
var M15 = 900, S1 = 3600, S4 = 14400, SG = 86400;

function atrSeri(m, n) {
  var tr = H.trSeri(m), out = m.map(function () { return null; }), a = null;
  for (var i = 1; i < m.length; i++) { if (tr[i] == null) continue; a = a == null ? tr[i] : (a * (n - 1) + tr[i]) / n; if (i >= n) out[i] = a; }
  return out;
}
function emaSeri(m, n) { var k = 2 / (n + 1), e = null; return m.map(function (x) { e = e == null ? x.close : x.close * k + e * (1 - k); return e; }); }

// Zaman t'de (kapanmış mumlar) son değeri veren yardımcı: sıralı mum dizisinde t'ye kadar kapanmış son indeks
function sonKapanan(mumlar, adim, t, i0) { var i = i0; while (i + 1 < mumlar.length && mumlar[i + 1].time + adim <= t) i++; return i; }

function hazirla(veri) {
  Object.keys(veri).forEach(function (c) {
    var v = veri[c];
    v.e20 = emaSeri(v.m15, 20); v.e50 = emaSeri(v.m15, 50); v.atr = atrSeri(v.m15, 14);
    // 1S trend: her saat kapanışında son 200 kapanmış 1S mumla
    v.h1Trend = {};
    for (var i = 60; i < v.h1.length; i++) v.h1Trend[v.h1[i].time + S1] = H.trendEma(v.h1.slice(Math.max(0, i - 199), i + 1));
  });
  // BTC pusulası: her 4S kapanışında 1G ve 4S trendi
  var b = veri.BTC, pus = {}, k = 0;
  for (var j = 60; j < b.h4.length; j++) {
    var t = b.h4[j].time + S4;
    while (k < b.d.length && b.d[k].time + SG <= t) k++;
    var g = b.d.slice(Math.max(0, k - 120), k); if (g.length < 50) continue;
    pus[t] = Y.pusulaBtc({ d: H.trendEma(g), h4: H.trendEma(b.h4.slice(Math.max(0, j - 199), j + 1)) });
  }
  return pus;
}

function simule(veri, pus, sec) {
  var hedefR = sec.hedefR || 2, sure = sec.sure == null ? 16 : sec.sure;
  var acik = [], biten = [], coinler = Object.keys(veri);
  var zamanlar = veri.BTC.m15.map(function (m) { return m.time + M15; });
  var idx = {}; coinler.forEach(function (c) { idx[c] = 0; });
  zamanlar.forEach(function (t) {
    var t4 = Math.floor(t / S4) * S4, pu = pus[t4] !== undefined ? pus[t4] : null, t1 = Math.floor(t / S1) * S1;
    coinler.forEach(function (c) {
      var v = veri[c], i = idx[c] = sonKapanan(v.m15, M15, t, idx[c]), m = v.m15[i];
      if (!m || m.time + M15 !== t) return;
      // 1) açık işlem bu mumla ilerler
      var a = acik.filter(function (x) { return x.coin === c; })[0];
      if (a) {
        var lng = a.yon === 'long', st = lng ? m.low <= a.stop : m.high >= a.stop, tp = lng ? m.high >= a.tp : m.low <= a.tp;
        var r = st ? a.kayipR : tp ? a.kazancR : (++a.mum >= sure && sure > 0) ? ((lng ? m.close - a.g : a.g - m.close) - H.UCRET * a.g) / a.risk : null;
        if (r != null) { biten.push({ coin: c, yon: a.yon, r: r, t: t }); acik.splice(acik.indexOf(a), 1); }
        return;
      }
      // 2) yeni giriş
      if (!pu || i < 60 || v.h1Trend[t1] !== (pu === 'long' ? 'yukari' : 'asagi')) return;
      if (acik.length >= 3 || acik.some(function (x) { return x.yon !== pu; })) return;
      var lng2 = pu === 'long', atr = v.atr[i], e20 = v.e20[i], e50 = v.e50[i], g = m.close, stop;
      if (!atr) return;
      if (sec.kurulum === 'geri') {
        if (lng2 ? !(e20 > e50 && m.low <= e20 && m.close > e20) : !(e20 < e50 && m.high >= e20 && m.close < e20)) return;
        var son5 = v.m15.slice(i - 4, i + 1);
        stop = lng2 ? Math.min.apply(null, son5.map(function (x) { return x.low; })) - 0.1 * atr : Math.max.apply(null, son5.map(function (x) { return x.high; })) + 0.1 * atr;
      } else {
        var onc = v.m15.slice(i - 20, i);
        var tep = Math.max.apply(null, onc.map(function (x) { return x.high; })), dip = Math.min.apply(null, onc.map(function (x) { return x.low; }));
        if (lng2 ? !(m.close > tep) : !(m.close < dip)) return;
        stop = lng2 ? g - 1.5 * atr : g + 1.5 * atr;
      }
      var risk = Math.abs(g - stop), uz = risk / g;
      if (!(uz >= 0.003 && uz <= 0.025)) return;
      var u = H.UCRET * g, mes = hedefR * (risk + u) + u;
      acik.push({ coin: c, yon: pu, g: g, stop: stop, tp: lng2 ? g + mes : g - mes, risk: risk, mum: 0,
        kazancR: (mes - u) / risk, kayipR: -(risk + u) / risk });
    });
  });
  return Y.ozet(biten, 0, 3);
}

async function calis() {
  var bit = Math.floor(Date.now() / 1000), veri = {};
  for (var i = 0; i < COINLER.length; i++) {
    var c = COINLER[i];
    try {
      veri[c] = { m15: await Y.mumlar(c, 'Min15', M15, bit - GUN * SG - 100 * M15, bit), h1: await Y.mumlar(c, 'Min60', S1, bit - GUN * SG - 260 * S1, bit) };
      if (c === 'BTC') { veri.BTC.h4 = await Y.mumlar(c, 'Hour4', S4, bit - GUN * SG - 260 * S4, bit); veri.BTC.d = await Y.mumlar(c, 'Day1', SG, bit - (GUN + 130) * SG, bit); }
    } catch (e) { console.log('ATLANDI ' + c + ': ' + e.message); }
  }
  if (!veri.BTC) throw new Error('BTC verisi yok');
  console.log('Veri: ' + Object.keys(veri).map(function (c) { return c + ' ' + veri[c].m15.length + '/' + veri[c].h1.length; }).join(', '));
  var pus = hazirla(veri), sonuc = {};
  [['geri 1,5R', { kurulum: 'geri', hedefR: 1.5 }], ['geri 2R', { kurulum: 'geri', hedefR: 2 }], ['geri 2R süresiz', { kurulum: 'geri', hedefR: 2, sure: 0 }],
   ['kirilim 2R', { kurulum: 'kirilim', hedefR: 2 }], ['kirilim 3R', { kurulum: 'kirilim', hedefR: 3 }]].forEach(function (v) { sonuc[v[0]] = simule(veri, pus, v[1]); });
  var tablo = Object.keys(sonuc).map(function (k) { var r = sonuc[k]; return [k, r.islem, '%' + r.isabet, r.ortR, r.toplamR, r.maxDususR, r.artiAy].join(' | '); });
  console.log('TABLO kurulum | işlem | isabet | ort R | toplam R | en büyük düşüş R | artı ay\n' + tablo.join('\n'));
  console.log('Dönem: ' + GUN + ' gün, ' + Object.keys(veri).length + ' coin');
  console.log('SONUC ' + JSON.stringify(sonuc, null, 1));
}

if (require.main === module) calis().catch(function (e) { console.error('Backtest başarısız: ' + e.message); process.exit(1); });
module.exports = { simule: simule, hazirla: hazirla };
