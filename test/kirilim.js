// Hacimli kırılım fikri: 4S kapanış son 20 mumun en yükseğini (en düşüğünü) hacim patlamasıyla aşarsa sonraki mum açılışında gir.
// Salt okuma, emir yok. Kullanım: ANA=<ana dal klasörü> node kirilim.js <cikti.md>
'use strict';
var path = require('path'), fs = require('fs');
var ANA = path.resolve(process.env.ANA || '.');
var T = require(path.join(ANA, 'tarayici/tara.js'));
var GUN = Number(process.env.GUN || 160), UCRET = 0.001;
var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
async function getJson(url) {
  for (var d = 0; d < 3; d++) { await bekle(150); try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ } await bekle(1000); }
  throw new Error('MEXC erişilemedi');
}
function mumlar(j, adim, sn) {
  var d = j.data;
  return d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n], vol: +d.vol[n] }; }).filter(function (m) { return m.time + adim <= sn; });
}
function atr14(m, k) {
  var s = 0; for (var i = k - 13; i <= k; i++) s += Math.max(m[i].high - m[i].low, Math.abs(m[i].high - m[i - 1].close), Math.abs(m[i].low - m[i - 1].close));
  return s / 14;
}
// Sinyal: k. mumun kapanışı önceki 20 mumun zirvesi/dibini hacim ≥ volK × ortalama ile aşar
function sinyal(c, k, volK) {
  var h = c.h4; if (k < 22) return null;
  var yuk = -Infinity, dus = Infinity, hv = 0;
  for (var i = k - 20; i < k; i++) { yuk = Math.max(yuk, h[i].high); dus = Math.min(dus, h[i].low); hv += h[i].vol; }
  hv /= 20; if (!(hv > 0) || h[k].vol < volK * hv) return null;
  var yon = h[k].close > yuk ? 'long' : h[k].close < dus ? 'short' : null;
  return yon ? { yon: yon, oran: h[k].vol / hv, atr: atr14(h, k) } : null;
}
function yurut(veri, slot, bas, son, volK, atrK, tutma) {
  var acik = [], sin = [], islem = [], zam = {};
  veri.forEach(function (c) { c.h4.forEach(function (m) { zam[m.time] = 1; }); });
  var ts = Object.keys(zam).map(Number).sort(function (a, b) { return a - b; }).filter(function (t) { return t >= bas && t <= son; });
  ts.forEach(function (t) {
    sin.sort(function (a, b) { return b.oran - a.oran; }).forEach(function (s) {
      var m = s.coin.byTime[t]; if (!m || acik.length >= slot || acik.some(function (p) { return p.coin === s.coin; })) return;
      var lng = s.yon === 'long', risk = atrK * s.atr, u = UCRET * m.open;
      acik.push({ coin: s.coin, yon: s.yon, t: t, giris: m.open, risk: risk, u: u, stop: lng ? m.open - risk : m.open + risk, tp: lng ? m.open + 2 * (risk + u) + u : m.open - (2 * (risk + u) + u), say: 0 });
    });
    sin = [];
    acik = acik.filter(function (p) {
      var m = p.coin.byTime[t]; if (!m) return true;
      var lng = p.yon === 'long'; p.say++;
      if (lng ? m.low <= p.stop : m.high >= p.stop) { islem.push({ t: p.t, yon: p.yon, r: -1 }); return false; }
      if (lng ? m.high >= p.tp : m.low <= p.tp) { islem.push({ t: p.t, yon: p.yon, r: 2 }); return false; }
      if (p.say >= tutma) { islem.push({ t: p.t, yon: p.yon, r: Math.max(-1, Math.min(2, (((m.close - p.giris) * (lng ? 1 : -1)) - p.u) / (p.risk + p.u))) }); return false; }
      return true;
    });
    veri.forEach(function (c) {
      var k = c.idx[t]; if (k === undefined) return;
      var s = sinyal(c, k, volK); if (s) { s.coin = c; sin.push(s); }
    });
  });
  return islem;
}
function ozet(islem) {
  if (!islem.length) return { n: 0, kazan: 0, toplam: 0, ort: 0, dd: 0 };
  var top = 0, tepe = 0, dd = 0, kz = 0;
  islem.slice().sort(function (a, b) { return a.t - b.t; }).forEach(function (x) { top += x.r; if (x.r > 0) kz++; tepe = Math.max(tepe, top); dd = Math.max(dd, tepe - top); });
  return { n: islem.length, kazan: kz / islem.length * 100, toplam: top, ort: top / islem.length, dd: dd };
}
(async function () {
  var simdi = Date.now(), sn = Math.floor(simdi / 1000);
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker'), tradfi = {};
  try { var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail'); dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; }); } catch (e) { /* ad listesiyle devam */ }
  var liste = T.evren(t.data, tradfi).slice(0, T.AYAR.coinSayisi), veri = [];
  for (var i = 0; i < liste.length; i++) {
    try {
      var h4 = mumlar(await getJson('https://contract.mexc.com/api/v1/contract/kline/' + liste[i].coin + '_USDT?interval=Hour4&start=' + (sn - 86400 * (GUN + 40)) + '&end=' + sn), 14400, sn);
      if (h4.length < 300) continue;
      var c = { ad: liste[i].coin, h4: h4, idx: {}, byTime: {} };
      h4.forEach(function (m, k) { c.idx[m.time] = k; c.byTime[m.time] = m; });
      veri.push(c);
    } catch (e) { /* coin atlanır */ }
  }
  var bas = sn - 86400 * GUN, orta = bas + (sn - bas) * 0.6;
  var md = '# Hacimli kırılım testi\n\n' + new Date(simdi).toISOString() + ', ' + veri.length + ' coin, ' + GUN + ' gün 4S. Sinyal: 4S kapanış önceki 20 mumun zirvesini/dibini aşar ve hacim ≥ K × 20 mum ortalaması; giriş sonraki mum açılışı; stop = A × ATR14; hedef net 2R; en çok T mum (4S) tutulur. Ücret dahil (R = risk+ücret), slipaj yok, aynı mumda stop ve hedef = stop. Coin listesi bugünün hacim listesi.\n\n';
  md += '| Slot | K | A | T | Dilim | İşlem | Kazanç % | Toplam R | Ort R | MaxDD R |\n|---|---|---|---|---|---|---|---|---|---|\n';
  [[1, 2.5, 1.5, 6], [3, 2.5, 1.5, 6], [1, 4, 1.5, 6], [3, 4, 1.5, 6], [3, 2.5, 2, 12], [3, 4, 2, 12]].forEach(function (cfg) {
    var tum = yurut(veri, cfg[0], bas, sn, cfg[1], cfg[2], cfg[3]);
    [['hepsi', tum], ['TRAIN', tum.filter(function (x) { return x.t < orta; })], ['TEST', tum.filter(function (x) { return x.t >= orta; })]].forEach(function (b) {
      var s = ozet(b[1]);
      md += '| ' + cfg.join(' | ') + ' | ' + b[0] + ' | ' + s.n + ' | ' + s.kazan.toFixed(0) + ' | ' + s.toplam.toFixed(1) + ' | ' + s.ort.toFixed(2) + ' | ' + s.dd.toFixed(1) + ' |\n';
    });
  });
  fs.writeFileSync(process.argv[2] || 'kirilim.md', md); console.log(md);
})().catch(function (e) { console.error(e); process.exit(1); });
