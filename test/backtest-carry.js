// test/backtest-carry.js — funding/basis carry: spot AL + vadeli SHORT (delta-nötr), pozitif funding'i toplar.
// Emir yok, anahtar yok; MEXC açık verisi (vadeli funding geçmişi + vadeli 8s mum + spot 8s mum). GitHub Actions'ta çalışır.
// Kural: son 21 periyodun (7 gün) ortalama funding'i yıllık eşik T üstündeyse gir, T/2 altına inerse çık (histerezis). Karar mum kapanışında, geleceğe bakmaz.
// PnL / periyot = funding (kapanıştaki ödeme) + spot getirisi - vadeli getirisi (bazis değişimi) ; giriş/çıkışta maliyet.
// Maliyet (notional başına, bir gidiş-dönüş): spot taker %0,05x2 + vadeli taker %0,02+kayma %0,05 x2 = %0,24 (baz), x2 stres. Spot ücreti doğrulanmalı.
// Sermaye: notional N spot + N/4 vadeli teminat = 1,25N (4x kaldıraç); getiri 1,25N üzerinden. Likidasyon riski: en kötü tek periyot vadeli yükselişi raporlanır.
// Portföy: sermaye coinlere eşit bölünür, kural kapalı coinde sermaye boşta (getiri 0). Dilimler: %60 / %20 / %20 (TRAIN seçim, VAL ve TEST dokunulmaz).
// Kullanım: node test/backtest-carry.js [gün=900]
'use strict';
var GUN = Number(process.argv[2]) || 900;
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'TIA', 'INJ', 'XMR', 'WLD', 'ENA', 'HYPE', 'NEAR', 'SUI'];
var P8 = 28800;
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) { for (var d = 0; d < 3; d++) { await bekle(200); try { var r = await fetch(url); if (r.ok) return await r.json(); console.log('HTTP', r.status, url.slice(0, 120)); } catch (e) { /* tekrar */ } await bekle(1500); } return null; }
async function vadeliMum(coin, bas, bit) {
  var o = {};
  for (var s = bas; s < bit; s += P8 * 400) {
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Hour8&start=' + s + '&end=' + Math.min(bit, s + P8 * 400));
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { o[Math.floor(t / P8) * P8] = +d.close[i]; });
  }
  return o;
}
async function spotMum(coin, bas, bit) {
  var o = {};
  for (var s = bas; s < bit; s += P8 * 500) {
    var j = await getJson('https://api.mexc.com/api/v3/klines?symbol=' + coin + 'USDT&interval=8h&limit=500&startTime=' + (s * 1000) + '&endTime=' + (Math.min(bit, s + P8 * 500) * 1000));
    if (!Array.isArray(j)) continue;
    j.forEach(function (k) { o[Math.floor(k[0] / 1000 / P8) * P8] = +k[4]; });
  }
  return o;
}
async function fundingGecmis(coin) {
  var o = {}, sayfa = 1, toplam = 1;
  while (sayfa <= toplam && sayfa < 80) {
    var j = await getJson('https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=' + coin + '_USDT&page_num=' + sayfa + '&page_size=100');
    var d = j && j.data; if (!d || !Array.isArray(d.resultList)) break;
    toplam = d.totalPage || 1;
    d.resultList.forEach(function (x) { o[Math.round(x.settleTime / 1000 / P8) * P8 - P8] = +x.fundingRate; }); // periyot başlangıcı
    sayfa++;
  }
  return o;
}
function sentetik(bas, bit) {
  var m = { f: {}, v: {}, s: {} }, pv = 100, ps = 100;
  for (var t = bas; t < bit; t += P8) { var r = (Math.random() - 0.5) * 0.02; pv *= 1 + r; ps *= 1 + r + (Math.random() - 0.5) * 0.001; m.v[t] = pv; m.s[t] = ps; m.f[t] = 0.0001 + (Math.random() - 0.5) * 0.0002; }
  return m;
}
function ist(a) { var n = a.length; if (n < 3) return { n: n }; var m = a.reduce(function (x, y) { return x + y; }, 0) / n, v = a.reduce(function (x, y) { return x + Math.pow(y - m, 2); }, 0) / (n - 1); return { n: n, ort: m, t: m / Math.sqrt(v / n) }; }
(async function () {
  var son = Math.floor(Date.now() / 1000 / P8) * P8, bas = son - GUN * 86400, veri = {};
  for (var c = 0; c < COINLER.length; c++) {
    var coin = COINLER[c];
    if (process.env.SENTETIK) { veri[coin] = sentetik(bas, son); continue; }
    var f = await fundingGecmis(coin), v = await vadeliMum(coin, bas, son), s = await spotMum(coin, bas, son);
    console.log(coin + ': funding ' + Object.keys(f).length + ' | vadeli mum ' + Object.keys(v).length + ' | spot mum ' + Object.keys(s).length);
    if (Object.keys(f).length > 100 && Object.keys(v).length > 100 && Object.keys(s).length > 100) veri[coin] = { f: f, v: v, s: s };
  }
  var coinler = Object.keys(veri);
  if (!coinler.length) { console.log('Veri yok: funding geçmişi veya spot mum açık değil.'); return; }
  var t1 = bas + (son - bas) * 0.6, t2 = bas + (son - bas) * 0.8, zamanlar = [];
  for (var t = bas + 22 * P8; t < son; t += P8) zamanlar.push(t);
  console.log('Coin: ' + coinler.length + ' | ' + new Date(bas * 1000).toISOString().slice(0, 10) + ' → ' + new Date(son * 1000).toISOString().slice(0, 10));
  var ham = coinler.map(function (c0) { var x = veri[c0], a = 0, w = 0; for (var k in x.v) if (x.v[k - P8] && x.v[k] / x.v[k - P8] - 1 > w) w = x.v[k] / x.v[k - P8] - 1; return c0 + ' en kötü 8s vadeli yükseliş %' + (w * 100).toFixed(1); });
  console.log(ham.join(' | '));
  [[5, 0.0024], [10, 0.0024], [20, 0.0024], [10, 0.0048]].forEach(function (cfg) {
    var T = cfg[0] / 100 / (3 * 365), mal = cfg[1], seri = [], aktifSay = 0, toplamSay = 0;
    var durum = {}; coinler.forEach(function (c0) { durum[c0] = false; });
    zamanlar.forEach(function (t) {
      var topPnl = 0;
      coinler.forEach(function (c0) {
        var x = veri[c0], ort = 0, n = 0;
        for (var k = 1; k <= 21; k++) { var fr = x.f[t - k * P8]; if (fr !== undefined) { ort += fr; n++; } }
        if (n < 15) return;
        ort /= n;
        var once = durum[c0], simdi = once ? ort >= T / 2 : ort >= T; // karar t öncesi kapanışlara dayanır
        var pnl = 0;
        if (simdi) {
          var s0 = x.s[t - P8], s1 = x.s[t], v0 = x.v[t - P8], v1 = x.v[t], fr0 = x.f[t];
          if (s0 && s1 && v0 && v1 && fr0 !== undefined) pnl = fr0 + (s1 / s0 - 1) - (v1 / v0 - 1);
          aktifSay++;
        }
        toplamSay++;
        if (simdi !== once) pnl -= mal / 2; // giriş ya da çıkış yarım gidiş-dönüş
        durum[c0] = simdi;
        topPnl += pnl;
      });
      seri.push({ t: t, r: topPnl / coinler.length / 1.25 }); // sermayeye (1,25N) oran, coinlere eşit bölünmüş
    });
    var yilla = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length * 3 * 365 * 100 : NaN; };
    var dil = function (lo, hi) { return seri.filter(function (x) { return x.t >= lo && x.t < hi; }).map(function (x) { return x.r; }); };
    var g = function (a) { var out = [], i = 0; for (; i + 3 <= a.length; i += 3) out.push(a[i] + a[i + 1] + a[i + 2]); return out; };
    var tr = dil(0, t1), va = dil(t1, t2), te = dil(t2, 1e12), eq = 1, mdd = 0, pk = 1;
    seri.forEach(function (x) { eq *= 1 + x.r; pk = Math.max(pk, eq); mdd = Math.min(mdd, eq / pk - 1); });
    var fmt = function (a) { var s = ist(g(a)); return 'yıllık %' + yilla(a).toFixed(1) + ' (günlük t=' + (s.t === undefined ? 'n/a' : s.t.toFixed(1)) + ')'; };
    console.log('\nEşik yıllık %' + cfg[0] + ' | maliyet gidiş-dönüş %' + (mal * 100).toFixed(2) + ' | aktif oran %' + (aktifSay / toplamSay * 100).toFixed(0) + ' | TRAIN ' + fmt(tr) + ' | VAL ' + fmt(va) + ' | TEST ' + fmt(te) + ' | tüm dönem en büyük düşüş %' + (mdd * 100).toFixed(1));
  });
})().catch(function (e) { console.error(e); process.exit(1); });
