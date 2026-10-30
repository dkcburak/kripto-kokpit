// Son 48 saatin sert hareketlerinde tarayıcı kuralı ne yapardı? (salt okuma, emir yok)
// Kullanım: ANA=<ana dal klasörü> node hareket-analiz.js <cikti.md>
'use strict';
var path = require('path'), fs = require('fs');
var ANA = path.resolve(process.env.ANA || '.');
var T = require(path.join(ANA, 'tarayici/tara.js'));
var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
async function getJson(url) {
  for (var d = 0; d < 3; d++) {
    await bekle(150);
    try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ }
    await bekle(1000);
  }
  throw new Error('MEXC erişilemedi');
}
function mumlar(j, adim, sn) {
  var d = j.data;
  return d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n] }; })
    .filter(function (m) { return m.time + adim <= sn; });
}
// Planı sonraki 4S mumlarda izle: bölgeye girdi mi, stop mu hedef mi (aynı mumda ikisi de olursa stop)
function sonuc(plan, ileri) {
  var lng = plan.yon === 'long', girdi = false, bekleyen = 0;
  for (var i = 0; i < ileri.length; i++) {
    var m = ileri[i];
    if (!girdi) {
      bekleyen++;
      if (bekleyen > 3) return 'girmedi (12 sa doldu)';
      if (lng ? m.low <= plan.giris[1] : m.high >= plan.giris[0]) girdi = true; else continue;
    }
    if (lng ? m.low <= plan.stop : m.high >= plan.stop) return 'STOP';
    if (lng ? m.high >= plan.tp1 : m.low <= plan.tp1) return 'TP1';
  }
  return girdi ? 'açık' : 'girmedi';
}
(async function () {
  var simdi = Date.now(), sn = Math.floor(simdi / 1000);
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker'), tradfi = {};
  try { var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail'); dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; }); } catch (e) { /* ad listesiyle devam */ }
  var liste = T.evren(t.data, tradfi).slice(0, T.AYAR.coinSayisi), satirlar = [], planlar = [];
  for (var i = 0; i < liste.length; i++) {
    var c = liste[i];
    try {
      var d = mumlar(await getJson('https://contract.mexc.com/api/v1/contract/kline/' + c.coin + '_USDT?interval=Day1&start=' + (sn - 86400 * 120) + '&end=' + sn), 86400, sn);
      var h4 = mumlar(await getJson('https://contract.mexc.com/api/v1/contract/kline/' + c.coin + '_USDT?interval=Hour4&start=' + (sn - 14400 * 200) + '&end=' + sn), 14400, sn);
      var son = h4.slice(-12);                       // son 48 saat
      var yuks = Math.max.apply(null, son.map(function (m) { return m.high; })), dus = Math.min.apply(null, son.map(function (m) { return m.low; }));
      var net = (son[son.length - 1].close / son[0].open - 1) * 100;
      var gorulen = {}, plans = [];
      for (var k = h4.length - 12; k < h4.length; k++) {
        var kesit = h4.slice(0, k + 1), gun = d.filter(function (m) { return m.time + 86400 <= kesit[kesit.length - 1].time + 14400; });
        var o = T.planUret(c.coin, { d: gun, h4: kesit }, kesit[k].close, undefined, i < T.AYAR.shortIlk);
        if (!o.plan) continue;
        var anahtar = o.plan.yon + o.plan.giris.join('-');
        if (gorulen[anahtar]) continue; gorulen[anahtar] = 1;
        plans.push({ coin: c.coin, yon: o.plan.yon, sonuc: sonuc(o.plan, h4.slice(k + 1)) });
      }
      planlar = planlar.concat(plans);
      satirlar.push({ coin: c.coin, aralik: (yuks / dus - 1) * 100, net: net, plan: plans.length, ozet: plans.map(function (p) { return p.yon + ':' + p.sonuc; }).join(', ') });
    } catch (e) { satirlar.push({ coin: c.coin, hata: String(e.message).slice(0, 40) }); }
  }
  var ok = satirlar.filter(function (s) { return !s.hata; }).sort(function (a, b) { return b.aralik - a.aralik; });
  var sayim = {}; planlar.forEach(function (p) { sayim[p.sonuc] = (sayim[p.sonuc] || 0) + 1; });
  var md = '# Son 48 saat: sert hareket ve tarayıcı planı\n\nZaman: ' + new Date(simdi).toISOString() + ', ' + ok.length + ' coin, 4S mumlar; plan = tarayıcı kuralı (bot filtreleri YOK: 1S onay, BTC farkı, tek işlem).\n\n';
  md += '| Coin | 48s aralık % | 48s net % | plan | sonuç |\n|---|---|---|---|---|\n';
  ok.forEach(function (s) { md += '| ' + s.coin + ' | ' + s.aralik.toFixed(1) + ' | ' + s.net.toFixed(1) + ' | ' + s.plan + ' | ' + (s.ozet || '-') + ' |\n'; });
  md += '\nBenzersiz plan: ' + planlar.length + ' → ' + JSON.stringify(sayim) + '\n';
  md += '\n48s aralığı ≥%8 olan coin: ' + ok.filter(function (s) { return s.aralik >= 8; }).length + ', bunlardan hiç plan üretilmeyen: ' + ok.filter(function (s) { return s.aralik >= 8 && !s.plan; }).length + '\n';
  fs.writeFileSync(process.argv[2] || 'hareket.md', md); console.log(md);
})().catch(function (e) { console.error(e); process.exit(1); });
