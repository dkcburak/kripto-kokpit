// test/masa-backtest.js — Trader Masası ajanlarının (T2 Kırılım, T3 Trend, T4 Funding, T5 Güç) geriye dönük testi.
// MEXC açık verisi (konteynerde erişim yok; GitHub Actions'ta çalışır: .github/workflows/masa-backtest.yml).
// Basitleştirmeler (sonuç TAHMİNDİR): giriş bir sonraki mumun açılışı, aynı mumda stop+hedef = stop, Hedef 1'de tamamı kapanır,
// funding ödemesi dahil değil, ücret+kayma UCRET (%0,1). Evren bugünkü hacim sırasıyla ilk 40 coin (hayatta kalma yanlılığı var).
// Her ajan tek başına ölçülür (coin başına tek açık işlem, ajanlar arası havuz yok); ayrıca "havuz" satırı: 4 ajan birlikte, en fazla 2 açık işlem.
// İlk %70 TRAIN, son %30 TEST. Kullanım: node test/masa-backtest.js [gün=300] [coin=40] [cikti.json]
'use strict';
var fs = require('fs');
var A = require('../trader-masasi/ajanlar.js');
var T = require('../tarayici/tara.js');
var GUN = Number(process.argv[2]) || 300, COIN = Number(process.argv[3]) || 40, CIKTI = process.argv[4] || '';
var S1 = 3600, S4 = 14400, SG = 86400;

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) {
  for (var d = 0; d < 3; d++) {
    await bekle(120);
    try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ }
    await bekle(1500);
  }
  throw new Error('MEXC erişilemedi: ' + url);
}
async function mumlar(coin, aralik, adim, bas, bit) {
  var out = [], seen = {};
  for (var s = bas; s < bit; s += adim * 400) {
    var e = Math.min(bit, s + adim * 400);
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=' + aralik + '&start=' + s + '&end=' + e);
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { if (seen[t] || t + adim > bit) return; seen[t] = 1; out.push({ time: t, open: +d.open[i], high: +d.high[i], low: +d.low[i], close: +d.close[i], vol: +d.vol[i] }); });
  }
  return out.sort(function (a, b) { return a.time - b.time; });
}
// Funding geçmişi: [{ t (ms), oran }] eskiden yeniye
async function fundingGecmisi(coin, basMs) {
  var out = [];
  for (var p = 1; p <= 40; p++) {
    var j = await getJson('https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=' + coin + '_USDT&page_num=' + p + '&page_size=100');
    var l = j && j.data && j.data.resultList; if (!Array.isArray(l) || !l.length) break;
    var eski = false;
    l.forEach(function (x) { var t = Number(x.settleTime); if (t < basMs) eski = true; else out.push({ t: t, oran: Number(x.fundingRate) }); });
    if (eski || p >= Number(j.data.totalPage || 1)) break;
  }
  return out.sort(function (a, b) { return a.t - b.t; });
}

// ---- Simülasyon ----
// sinyaller: [{ t (giriş mumu zamanı, sn), coin, trader, plan }]; her coin+trader için tek açık işlem; mumlar: coin -> dizi (ajanın zaman dilimi)
function simule(sinyaller, mumlar, adim, slotSinir) {
  sinyaller.sort(function (a, b) { return a.t - b.t; });
  var acik = [], kapali = [], idx = {};
  function ilerletHepsi(kadar) {
    acik = acik.filter(function (p) {
      var m = mumlar[p.coin], i = idx[p.coin + p.trader + p.t] || 0;
      for (; i < m.length && m[i].time + adim <= kadar; i++) {
        if (m[i].time < p.t) continue;
        var s = A.ilerlet(p, m[i]);
        if (s) { kapali.push({ coin: p.coin, trader: p.trader, t: p.t, bitis: m[i].time, r: Math.round(s.r * 100) / 100, neden: s.neden }); return false; }
      }
      idx[p.coin + p.trader + p.t] = i; return true;
    });
  }
  sinyaller.forEach(function (s) {
    ilerletHepsi(s.t);
    if (acik.some(function (p) { return p.coin === s.coin && (!slotSinir || true) && p.trader === s.trader; })) return;
    if (slotSinir && (acik.length >= slotSinir || acik.some(function (p) { return p.coin === s.coin; }))) return;
    var m = mumlar[s.coin], g = null;
    for (var i = 0; i < m.length; i++) if (m[i].time === s.t) { g = m[i]; break; }
    if (!g) return;
    var p = s.plan, giris = g.open;
    if (giris <= p.stop) return;
    acik.push({ coin: s.coin, trader: s.trader, t: s.t, giris: giris, stop: p.stop, stop0: p.stop, tp1: p.tp1, rr: p.rr, tutma: p.tutma, say: 0, takipAtr: p.takipAtr, atr: p.atr });
  });
  ilerletHepsi(Infinity);
  return kapali;
}
function ozet(k) {
  var top = 0, kz = 0, enKotu = 0, tepe = 0, kum = 0;
  k.sort(function (a, b) { return a.bitis - b.bitis; }).forEach(function (x) { top += x.r; if (x.r > 0) kz++; kum += x.r; tepe = Math.max(tepe, kum); enKotu = Math.min(enKotu, kum - tepe); });
  return { n: k.length, toplamR: +top.toFixed(1), ortR: k.length ? +(top / k.length).toFixed(3) : 0, isabet: k.length ? Math.round(kz / k.length * 100) : 0, maxDD: +enKotu.toFixed(1) };
}
function bol(k, sinirSn) { return { train: ozet(k.filter(function (x) { return x.t < sinirSn; })), test: ozet(k.filter(function (x) { return x.t >= sinirSn; })) }; }

async function calistir() {
  var sn = Math.floor(Date.now() / 1000), bit = sn - (sn % S4), bas = bit - GUN * SG;
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker');
  var tradfi = {};
  try { var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail'); if (dt && dt.success) dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; }); } catch (e) { /* devam */ }
  var liste = T.evren(t.data, tradfi).slice(0, COIN).map(function (x) { return x.coin; });
  if (liste.indexOf('BTC') < 0) liste.unshift('BTC');
  console.log('Evren (' + liste.length + '): ' + liste.join(' '));
  var V = {}, hata = [];
  for (var i = 0; i < liste.length; i++) {
    var c = liste[i];
    try {
      V[c] = { d: await mumlar(c, 'Day1', SG, bas - 215 * SG, bit), h4: await mumlar(c, 'Hour4', S4, bas - 60 * S4, bit), h1: await mumlar(c, 'Min60', S1, bas - 30 * S1, bit), f: await fundingGecmisi(c, (bas - 3 * SG) * 1000) };
      if (V[c].d.length < 260 || V[c].h4.length < 100) { hata.push(c + ': az mum (' + V[c].d.length + ' gün)'); delete V[c]; }
    } catch (e) { hata.push(c + ': ' + e.message.slice(0, 50)); delete V[c]; }
  }
  var coinler = Object.keys(V);
  console.log('Veri: ' + coinler.length + ' coin' + (hata.length ? ', hata: ' + hata.join(' | ') : ''));
  if (!V.BTC) throw new Error('BTC verisi yok');
  // Günlük mumları BTC takvimiyle hizala (gucLiderler aynı indeksi kullanır)
  var btc = V.BTC.d, gunluk = {};
  coinler.forEach(function (c) { var m = {}; V[c].d.forEach(function (x) { m[x.time] = x; }); gunluk[c] = btc.map(function (b) { return m[b.time] || null; }); });

  var sinyal = { kirilim: [], trend: [], funding: [], guc: [] }, mum = { kirilim: {}, trend: {}, funding: {}, guc: {} };
  coinler.forEach(function (c) {
    var h4 = V[c].h4, d1 = gunluk[c], h1 = V[c].h1, f = V[c].f;
    mum.kirilim[c] = h4; mum.guc[c] = h4; mum.trend[c] = V[c].d; mum.funding[c] = h1;
    // T2 Kırılım
    for (var k = 22; k < h4.length - 1; k++) { if (h4[k].time < bas) continue; var p = A.kirilim(h4, k); if (p) sinyal.kirilim.push({ t: h4[k + 1].time, coin: c, trader: 'kirilim', plan: p }); }
    // T3 Trend (gerçek günlük dizi)
    var d = V[c].d;
    for (k = 200; k < d.length - 1; k++) { if (d[k].time < bas) continue; p = A.trend(d, k); if (p) sinyal.trend.push({ t: d[k + 1].time, coin: c, trader: 'trend', plan: p }); }
    // T4 Funding: her 1S kapanışında son 3 funding ortalaması ve 4S EMA20
    var fi = 0, hi = 0;
    for (k = 30; k < h1.length - 1; k++) {
      var tms = (h1[k].time + S1) * 1000; if (h1[k].time < bas) continue;
      while (fi < f.length && f[fi].t <= tms) fi++;
      if (fi < 3) continue;
      var fo = (f[fi - 1].oran + f[fi - 2].oran + f[fi - 3].oran) / 3;
      if (!(fo <= -0.0003)) continue;
      while (hi < h4.length && h4[hi].time + S4 <= h1[k].time + S1) hi++;
      if (hi < 21) continue;
      var e20 = A.ema(h4.slice(hi - 60 > 0 ? hi - 60 : 0, hi).map(function (x) { return x.close; }), 20);
      p = A.funding(h1, k, fo, e20); if (p) sinyal.funding.push({ t: h1[k + 1].time, coin: c, trader: 'funding', plan: p });
    }
  });
  // T5 Güç: her gün lider listesi, o günün 4S mumlarında kurulum
  var liderGun = {};
  for (var kb = 50; kb < btc.length; kb++) { if (btc[kb].time < bas - SG) continue; liderGun[btc[kb].time + SG] = A.gucLiderler(gunluk, btc, kb, 5); }
  coinler.forEach(function (c) {
    var h4 = V[c].h4;
    for (var k = 30; k < h4.length - 1; k++) {
      if (h4[k].time < bas) continue;
      var gunBas = h4[k].time - (h4[k].time % SG), l = liderGun[gunBas]; // o günün başında (önceki günlük kapanışla) belirlenen liderler
      if (!l || l.indexOf(c) < 0) continue;
      var p = A.guc(h4, k); if (p) sinyal.guc.push({ t: h4[k + 1].time, coin: c, trader: 'guc', plan: p });
    }
  });
  var sinir = bas + Math.floor(GUN * 0.7) * SG, sonuc = { gun: GUN, coin: coinler.length, baslangic: new Date(bas * 1000).toISOString().slice(0, 10), trainTestSiniri: new Date(sinir * 1000).toISOString().slice(0, 10), ajanlar: {}, hatalar: hata };
  var adimlar = { kirilim: S4, trend: SG, funding: S1, guc: S4 };
  Object.keys(sinyal).forEach(function (a) {
    var k = simule(sinyal[a], mum[a], adimlar[a], 0);
    sonuc.ajanlar[a] = { sinyal: sinyal[a].length, hepsi: ozet(k), bolum: bol(k, sinir), nedenler: k.reduce(function (o, x) { o[x.neden] = (o[x.neden] || 0) + 1; return o; }, {}), son10: k.slice(-10) };
    console.log(a + ': sinyal ' + sinyal[a].length + ', işlem ' + k.length + ', ' + JSON.stringify(sonuc.ajanlar[a].hepsi) + ' | TRAIN ' + JSON.stringify(sonuc.ajanlar[a].bolum.train) + ' | TEST ' + JSON.stringify(sonuc.ajanlar[a].bolum.test) + ' | ' + JSON.stringify(sonuc.ajanlar[a].nedenler));
  });
  // Havuz: 4 ajan birlikte, en fazla 2 açık işlem (Profesör havuz kuralı), ajan zaman dilimleri farklı olduğundan 4S adımla yaklaşık
  var hepsi = [].concat(sinyal.kirilim, sinyal.guc, sinyal.trend.map(function (s) { return s; }));
  var hk = simule(hepsi.filter(function (s) { return s.trader !== 'trend'; }), mum.kirilim, S4, 2);
  sonuc.havuz = { not: 'kirilim+guc birlikte, en fazla 2 açık işlem (trend 1G ve funding 1S adımı farklı, dahil değil)', hepsi: ozet(hk), bolum: bol(hk, sinir) };
  console.log('havuz(2): ' + JSON.stringify(sonuc.havuz.hepsi) + ' | TRAIN ' + JSON.stringify(sonuc.havuz.bolum.train) + ' | TEST ' + JSON.stringify(sonuc.havuz.bolum.test));
  if (CIKTI) fs.writeFileSync(CIKTI, JSON.stringify(sonuc, null, 1));
  return sonuc;
}
module.exports = { simule: simule, ozet: ozet };
if (require.main === module) calistir().catch(function (e) { console.error('Hata:', e.stack || e.message); process.exit(1); });
