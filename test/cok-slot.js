// Tarayıcı kuralı çok slotlu mu daha iyi? 4S mumlarla yürüyen test (salt okuma, emir yok).
// Kullanım: ANA=<ana dal klasörü> node cok-slot.js <cikti.md>
'use strict';
var path = require('path'), fs = require('fs');
var ANA = path.resolve(process.env.ANA || '.');
var T = require(path.join(ANA, 'tarayici/tara.js'));
var GUN = Number(process.env.GUN || 160), TARAMA_SAAT = 3 * 4;   // plan en çok 12 saat beklenir
var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
async function getJson(url) {
  for (var d = 0; d < 3; d++) { await bekle(150); try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ } await bekle(1000); }
  throw new Error('MEXC erişilemedi');
}
function mumlar(j, adim, sn) {
  var d = j.data;
  return d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n] }; }).filter(function (m) { return m.time + adim <= sn; });
}
// Slot sayısı ve yön kısıtıyla yürüt. Kazanç +tp1R, kayıp -1 (R birimi: risk + ücret).
function yurut(veri, slot, yonler, bas, son, rejim) {
  var btc = veri.filter(function (c) { return c.ad === 'BTC'; })[0];
  var tp = T.AYAR.tp1R, acik = [], bekleyen = [], islem = [];
  var zamanlar = {};
  veri.forEach(function (c) { c.h4.forEach(function (m) { zamanlar[m.time] = 1; }); });
  var ts = Object.keys(zamanlar).map(Number).sort(function (a, b) { return a - b; }).filter(function (t) { return t >= bas && t <= son; });
  ts.forEach(function (t) {
    // 1) Açık işlemleri bu mumda izle
    acik = acik.filter(function (p) {
      var m = p.coin.byTime[t]; if (!m) return true;
      var lng = p.plan.yon === 'long';
      if (lng ? m.low <= p.plan.stop : m.high >= p.plan.stop) { islem.push({ t: p.giris, yon: p.plan.yon, r: -1, coin: p.coin.ad }); return false; }
      if (lng ? m.high >= p.plan.tp1 : m.low <= p.plan.tp1) { islem.push({ t: p.giris, yon: p.plan.yon, r: tp, coin: p.coin.ad }); return false; }
      return true;
    });
    // 2) Bekleyen planlar bölgeye değdi mi (hacim sırası = veri sırası)
    bekleyen = bekleyen.filter(function (p) {
      var m = p.coin.byTime[t]; if (!m || t <= p.t) return true;
      if (t > p.t + 14400 * 3) return false;
      var lng = p.plan.yon === 'long';
      if (!(lng ? m.low <= p.plan.giris[1] : m.high >= p.plan.giris[0])) return true;
      if (acik.length >= slot) return false;                    // slot yok: fırsat kaçtı
      if (lng ? m.low <= p.plan.stop : m.high >= p.plan.stop) { islem.push({ t: t, yon: p.plan.yon, r: -1, coin: p.coin.ad }); return false; }
      if (lng ? m.high >= p.plan.tp1 : m.low <= p.plan.tp1) { islem.push({ t: t, yon: p.plan.yon, r: tp, coin: p.coin.ad }); return false; }
      acik.push({ coin: p.coin, plan: p.plan, giris: t }); return false;
    });
    // 3) Bu mumun kapanışında yeni plan (coin başına tek açık/bekleyen)
    veri.forEach(function (c, i) {
      var k = c.idx[t]; if (k === undefined) return;
      if (acik.some(function (p) { return p.coin === c; }) || bekleyen.some(function (p) { return p.coin === c; })) return;
      var kesit = c.h4.slice(0, k + 1), gun = c.d.filter(function (m) { return m.time + 86400 <= t + 14400; });
      var o = T.planUret(c.ad, { d: gun, h4: kesit }, kesit[k].close, undefined, i < T.AYAR.shortIlk);
      if (o.plan && rejim && btc) {
        var tr = T.trend(btc.d.filter(function (m) { return m.time + 86400 <= t + 14400; }));
        if (!((o.plan.yon === 'long' && tr === 'yukari') || (o.plan.yon === 'short' && tr === 'asagi'))) return;
      }
      if (o.plan && yonler.indexOf(o.plan.yon) >= 0) bekleyen.push({ coin: c, plan: o.plan, t: t });
    });
  });
  return islem;
}
function ozet(islem) {
  if (!islem.length) return { n: 0, kazan: 0, toplam: 0, ort: 0, dd: 0, gunluk: 0 };
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
      var d = mumlar(await getJson('https://contract.mexc.com/api/v1/contract/kline/' + liste[i].coin + '_USDT?interval=Day1&start=' + (sn - 86400 * (GUN + 130)) + '&end=' + sn), 86400, sn);
      var h4 = mumlar(await getJson('https://contract.mexc.com/api/v1/contract/kline/' + liste[i].coin + '_USDT?interval=Hour4&start=' + (sn - 86400 * (GUN + 40)) + '&end=' + sn), 14400, sn);
      if (h4.length < 300 || d.length < 60) continue;
      var c = { ad: liste[i].coin, d: d, h4: h4, idx: {}, byTime: {} };
      h4.forEach(function (m, k) { c.idx[m.time] = k; c.byTime[m.time] = m; });
      veri.push(c);
    } catch (e) { /* coin atlanır */ }
  }
  var bas = sn - 86400 * GUN, orta = bas + (sn - bas) * 0.6, md = '# Çok slotlu tarayıcı testi\n\n' + new Date(simdi).toISOString() + ', ' + veri.length + ' coin, ' + GUN + ' gün 4S. Plan = tarayıcı kuralı (tp1R ' + T.AYAR.tp1R + ' net). R birimi: risk+ücret. Filtre yok (1S onay, BTC farkı, skor YOK). Aynı mumda stop ve hedef = stop. Slipaj/funding yok. Coin listesi bugünün hacim listesi (hayatta kalma yanlılığı var).\n\n';
  md += '| Slot | Yön | Dilim | İşlem | Kazanç % | Toplam R | Ort R | MaxDD R |\n|---|---|---|---|---|---|---|---|\n';
  [[1, ['long', 'short'], true], [3, ['long', 'short'], true], [5, ['long', 'short'], true], [1, ['long', 'short']]].forEach(function (cfg) {
    var tum = yurut(veri, cfg[0], cfg[1], bas, sn, cfg[2]);
    [['hepsi', tum], ['TRAIN (ilk %60)', tum.filter(function (x) { return x.t < orta; })], ['TEST (son %40)', tum.filter(function (x) { return x.t >= orta; })]].forEach(function (b) {
      var s = ozet(b[1]);
      md += '| ' + cfg[0] + ' | ' + cfg[1].join('+') + (cfg[2] ? ' +BTC1G rejim' : '') + ' | ' + b[0] + ' | ' + s.n + ' | ' + s.kazan.toFixed(0) + ' | ' + s.toplam.toFixed(1) + ' | ' + s.ort.toFixed(2) + ' | ' + s.dd.toFixed(1) + ' |\n';
    });
  });
  fs.writeFileSync(process.argv[2] || 'cok-slot.md', md); console.log(md);
})().catch(function (e) { console.error(e); process.exit(1); });
