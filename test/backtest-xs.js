// test/backtest-xs.js — günlük mumlarla coinler arası momentum / ters dönüş (long üst 3, short alt 3), haftalık yeniden dengeleme.
// Emir yok, anahtar yok; MEXC vadeli açık verisi. GitHub Actions'ta çalışır.
// Maliyet: her hafta tüm bacaklar kapanıp açılır; gidiş-dönüş taker %0,02x2 + kayma %0,05x2 = %0,14 (baz), %0,28 (stres). Funding long/short dengeli olduğu için net ~0 varsayıldı (doğrulanmalı).
// Önyargı: coin listesi bugünün likit coinleri (hayatta kalma yanlılığı) — sonuçlar iyimser olabilir. Ayarlar TRAIN ile seçilir, VAL/TEST dokunulmaz.
// Kullanım: node test/backtest-xs.js [gün=900]
'use strict';
var GUN = Number(process.argv[2]) || 900;
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'TIA', 'INJ', 'XMR', 'WLD', 'ENA', 'HYPE', 'NEAR', 'SUI'];
var G = 86400;
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) { for (var d = 0; d < 3; d++) { await bekle(200); try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ } await bekle(1500); } throw new Error('MEXC erişilemedi: ' + url); }
async function gunluk(coin, bas, bit) {
  var out = {}, n = 0;
  if (process.env.SENTETIK) { var p = 100; for (var t = bas; t < bit; t += G) { p *= 1 + (Math.random() - 0.5) * 0.06; out[t] = p; n++; } return out; }
  for (var s = bas; s < bit; s += G * 400) {
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Day1&start=' + s + '&end=' + Math.min(bit, s + G * 400));
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { out[Math.floor(t / G) * G] = +d.close[i]; });
  }
  return out;
}
function ist(a) { var n = a.length; if (n < 3) return { n: n, ort: NaN, t: NaN, kz: NaN }; var m = a.reduce(function (x, y) { return x + y; }, 0) / n, v = a.reduce(function (x, y) { return x + Math.pow(y - m, 2); }, 0) / (n - 1); return { n: n, ort: m, t: m / Math.sqrt(v / n), kz: a.filter(function (x) { return x > 0; }).length / n }; }
function f(o) { return o.n < 3 ? 'n=' + o.n : 'n=' + o.n + ' haftalık ort=' + (o.ort * 100).toFixed(2) + '% t=' + o.t.toFixed(1) + ' kz=' + (o.kz * 100).toFixed(0) + '%'; }
(async function () {
  var son = Math.floor(Date.now() / 1000 / G) * G, bas = son - GUN * G, fiyat = {};
  for (var c = 0; c < COINLER.length; c++) { try { fiyat[COINLER[c]] = await gunluk(COINLER[c], bas, son); } catch (e) { console.log('atlandı', COINLER[c]); } }
  var t1 = bas + (son - bas) * 0.6, t2 = bas + (son - bas) * 0.8;
  console.log('Veri: ' + Object.keys(fiyat).length + ' coin, ' + new Date(bas * 1000).toISOString().slice(0, 10) + ' → ' + new Date(son * 1000).toISOString().slice(0, 10) + '; TRAIN →' + new Date(t1 * 1000).toISOString().slice(0, 10) + ' VAL →' + new Date(t2 * 1000).toISOString().slice(0, 10) + ' TEST →son');
  var sonuc = [];
  [7, 14, 28, 56].forEach(function (L) { ['momentum', 'ters'].forEach(function (yon) { [3].forEach(function (K) {
    var seri = [];
    for (var d = bas + L * G; d + 7 * G <= son; d += 7 * G) {
      var r = [];
      Object.keys(fiyat).forEach(function (coin) { var p = fiyat[coin]; if (p[d] && p[d - L * G] && p[d + 7 * G]) r.push({ geri: p[d] / p[d - L * G] - 1, ileri: p[d + 7 * G] / p[d] - 1 }); });
      if (r.length < 8) continue;
      r.sort(function (a, b) { return b.geri - a.geri; });
      var ust = r.slice(0, K), alt = r.slice(-K), ort = function (x) { return x.reduce(function (a, b) { return a + b.ileri; }, 0) / x.length; };
      var spread = (ort(ust) - ort(alt)) / 2 * (yon === 'momentum' ? 1 : -1); // brüt notional başına
      seri.push({ t: d, b: spread });
    }
    sonuc.push({ ad: yon + ' L' + L + ' K' + K, seri: seri });
  }); }); });
  [0.0014, 0.0028].forEach(function (mal) {
    console.log('\n=== Haftalık maliyet ' + (mal * 100).toFixed(2) + '% (brüt notional) ===');
    var satir = sonuc.map(function (s) {
      var net = s.seri.map(function (x) { return { t: x.t, r: x.b - mal }; }); // getiri brüt notional başına; maliyet de brüt notional başına (haftalık gidiş-dönüş)
      var tr = net.filter(function (x) { return x.t < t1; }).map(function (x) { return x.r; }), va = net.filter(function (x) { return x.t >= t1 && x.t < t2; }).map(function (x) { return x.r; }), te = net.filter(function (x) { return x.t >= t2; }).map(function (x) { return x.r; });
      return { ad: s.ad, tr: ist(tr), va: ist(va), te: ist(te) };
    }).sort(function (a, b) { return (isNaN(b.tr.ort) ? -9 : b.tr.ort) - (isNaN(a.tr.ort) ? -9 : a.tr.ort); });
    satir.forEach(function (s) { console.log(s.ad.padEnd(16) + ' TRAIN ' + f(s.tr) + ' | VAL ' + f(s.va) + ' | TEST ' + f(s.te)); });
  });
})().catch(function (e) { console.error(e); process.exit(1); });
