// test/backtest-yon.js — tek yön kuralının (piyasa pusulası) geçmiş veriyle karşılaştırması.
// Strateji tarayıcının kuralıdır (tarayici/tara.js planUret): 4S EMA20 geri çekilme bölgesi, 1 ATR stop, ücret sonrası 1,51R hedef.
// Üç kural aynı veride denenir:
//   eski  : her coin kendi 1G/4S trendine bakar (long ve short aynı anda açılabilir), yön başına %5 (en fazla 5+5 işlem)
//   yeni  : piyasa yönü BTC'nin 1G ve 4S trendi; BTC yatay/karışıkken işlem yok; ters yönde açık işlem varken yeni işlem yok; toplam %3 (en fazla 3 işlem)
//   esnek : yeni ile aynı, ama BTC yatay/karışıkken coinin kendi trendi geçerli (dominans geçmiş verisi yok, bu yüzden denenemedi)
// Basitleştirmeler (sonuçlar tahmindir): 1S onayı yok (bölgeye değince EMA20'den girilir), Hedef 1'de pozisyonun tamamı kapanır,
// aynı mumda hem stop hem hedef görülürse stop sayılır, funding dahil değil, ücret ve kayma hesap.js UCRET.
// Kullanım: node test/backtest-yon.js [gün=180]  (MEXC açık verisi; konteynerde erişim yok, GitHub Actions'ta çalışır)
'use strict';
var H = require('../hesap.js');
var T = require('../tarayici/tara.js');

var GUN = Number(process.argv[2]) || 180;
var COINLER = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK', 'TIA', 'INJ', 'XMR', 'WLD', 'ENA', 'HYPE', 'NEAR', 'SUI'];
var S4 = 14400, SG = 86400;

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function getJson(url) {
  for (var d = 0; d < 3; d++) {
    await bekle(200);
    try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ }
    await bekle(1500);
  }
  throw new Error('MEXC erişilemedi: ' + url);
}
// Kapanmış mumlar, parça parça (istek başına en fazla 400 mum)
async function mumlar(coin, aralik, adim, bas, bit) {
  var out = [], seen = {};
  for (var s = bas; s < bit; s += adim * 400) {
    var e = Math.min(bit, s + adim * 400);
    var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=' + aralik + '&start=' + s + '&end=' + e);
    var d = j && j.data; if (!d || !Array.isArray(d.time)) continue;
    d.time.forEach(function (t, i) { if (seen[t] || t + adim > bit) return; seen[t] = 1; out.push({ time: t, open: +d.open[i], high: +d.high[i], low: +d.low[i], close: +d.close[i] }); });
  }
  return out.sort(function (a, b) { return a.time - b.time; });
}

// Her 4S kapanışında (zaman t = mum.time + S4) o ana kadar kapanmış mumlarla trend ve plan
function hazirla(veri) {
  var o = {};
  Object.keys(veri).forEach(function (coin) {
    var h4 = veri[coin].h4, d = veri[coin].d, k = 0, adimlar = {};
    for (var i = 60; i < h4.length; i++) {
      var t = h4[i].time + S4;
      while (k < d.length && d[k].time + SG <= t) k++;
      var gunluk = d.slice(Math.max(0, k - 120), k), dort = h4.slice(Math.max(0, i - 199), i + 1);
      if (gunluk.length < 50) continue;
      var p = T.planUret(coin, { d: gunluk, h4: dort }, h4[i].close, undefined, true);
      adimlar[t] = { tf: p.tf, plan: p.plan || null, i: i };
    }
    o[coin] = adimlar;
  });
  return o;
}

function pusulaBtc(tf) {
  if (!tf || !tf.d || tf.d !== tf.h4 || tf.d === 'yatay') return null;
  return tf.d === 'yukari' ? 'long' : 'short';
}

function simule(veri, adim, kural) {
  var zamanlar = Object.keys(adim.BTC || {}).map(Number).sort(function (a, b) { return a - b; });
  var acik = [], biten = [], tersAyniAnda = 0, maxAcik = 0, coinler = Object.keys(veri);
  zamanlar.forEach(function (t) {
    // t: 4S kapanış zamanı; az önce kapanan mumun açılışı t - S4
    // 1) Açık işlemleri az önce kapanan mumla ilerlet
    acik = acik.filter(function (a) {
      var m = veri[a.coin].h4[a.i]; if (!m || m.time !== t - S4) return true;
      a.i++;
      var lng = a.yon === 'long', stop = lng ? m.low <= a.stop : m.high >= a.stop, tp = lng ? m.high >= a.tp1 : m.low <= a.tp1;
      if (stop) { biten.push({ coin: a.coin, yon: a.yon, r: a.kayipR, t: t }); return false; }
      if (tp) { biten.push({ coin: a.coin, yon: a.yon, r: a.kazancR, t: t }); return false; }
      return true;
    });
    // 2) Bekleyen planlar: bu 4S mumunda bölgeye (EMA20) değdiyse giriş
    var btc = adim.BTC[t], pu = btc ? pusulaBtc(btc.tf) : null;
    coinler.forEach(function (coin) {
      var x = adim[coin][t - S4]; if (!x || !x.plan) return; // bir önceki kapanışta yazılan plan az önce kapanan mumda geçerli
      var m = veri[coin].h4[x.i + 1]; if (!m || m.time !== t - S4) return;
      if (acik.some(function (a) { return a.coin === coin; })) return;
      var p = x.plan, lng = p.yon === 'long', g = (p.giris[0] + p.giris[1]) / 2;
      if (kural !== 'eski') {
        var px = adim.BTC[t - S4] ? pusulaBtc(adim.BTC[t - S4].tf) : null;
        if (kural === 'yeni' && px !== p.yon) return;
        if (kural === 'esnek' && px && px !== p.yon) return;
        if (acik.some(function (a) { return a.yon !== p.yon; })) return;
        if (acik.length >= 3) return;
      } else if (acik.filter(function (a) { return a.yon === p.yon; }).length >= 5) return;
      var dokundu = lng ? m.low <= g : m.high >= g; if (!dokundu) return;
      var risk = Math.abs(g - p.stop), u = H.UCRET * g;
      var a = { coin: coin, yon: p.yon, stop: p.stop, tp1: p.tp1, i: x.i + 2, kazancR: (Math.abs(p.tp1 - g) - u) / risk, kayipR: -(risk + u) / risk };
      // giriş mumunda stop da görüldüyse kayıp say (temkinli)
      if (lng ? m.low <= p.stop : m.high >= p.stop) { biten.push({ coin: coin, yon: p.yon, r: a.kayipR, t: t }); return; }
      if (kural === 'eski' && acik.some(function (b) { return b.yon !== p.yon; })) tersAyniAnda++;
      acik.push(a);
    });
    if (acik.length > maxAcik) maxAcik = acik.length;
  });
  var o = ozet(biten, tersAyniAnda, maxAcik); if (process.env.BT_LISTE) o.liste = biten; return o;
}

function ozet(l, ters, maxAcik) {
  var top = 0, tepe = 0, dd = 0, kaz = 0, ay = {};
  l.sort(function (a, b) { return a.t - b.t; }).forEach(function (x) {
    top += x.r; if (top > tepe) tepe = top; if (tepe - top > dd) dd = tepe - top; if (x.r > 0) kaz++;
    var k = new Date(x.t * 1000).toISOString().slice(0, 7); ay[k] = (ay[k] || 0) + x.r;
  });
  var aylar = Object.keys(ay).sort();
  return { islem: l.length, long: l.filter(function (x) { return x.yon === 'long'; }).length, short: l.filter(function (x) { return x.yon === 'short'; }).length,
    isabet: l.length ? Math.round(kaz / l.length * 100) : 0, ortR: l.length ? Math.round(top / l.length * 100) / 100 : 0, toplamR: Math.round(top * 10) / 10,
    maxDususR: Math.round(dd * 10) / 10, artiAy: aylar.filter(function (k) { return ay[k] > 0; }).length + '/' + aylar.length,
    aylar: aylar.map(function (k) { return k + ' ' + (Math.round(ay[k] * 10) / 10); }).join(', '), tersAyniAnda: ters, maxAcik: maxAcik };
}

async function calis() {
  var bit = Math.floor(Date.now() / 1000), bas4 = bit - GUN * SG - 60 * S4, basG = bit - (GUN + 130) * SG, veri = {};
  for (var i = 0; i < COINLER.length; i++) {
    var c = COINLER[i];
    try { veri[c] = { h4: await mumlar(c, 'Hour4', S4, bas4, bit), d: await mumlar(c, 'Day1', SG, basG, bit) }; }
    catch (e) { console.log('ATLANDI ' + c + ': ' + e.message); }
  }
  if (!veri.BTC) throw new Error('BTC verisi yok');
  console.log('Veri: ' + Object.keys(veri).map(function (c) { return c + ' ' + veri[c].h4.length + '/' + veri[c].d.length; }).join(', '));
  var adim = hazirla(veri), sonuc = {};
  ['eski', 'yeni', 'esnek'].forEach(function (k) { sonuc[k] = simule(veri, adim, k); });
  var btcZaman = Object.keys(adim.BTC).map(Number), yonlu = btcZaman.filter(function (t) { return pusulaBtc(adim.BTC[t].tf); }).length;
  console.log('Dönem: ' + GUN + ' gün, ' + Object.keys(veri).length + ' coin. BTC yönlü (1G=4S) zaman: %' + Math.round(yonlu / btcZaman.length * 100));
  console.log('SONUC ' + JSON.stringify(sonuc, null, 1));
}

if (require.main === module) calis().catch(function (e) { console.error('Backtest başarısız: ' + e.message); process.exit(1); });
module.exports = { pusulaBtc: pusulaBtc, simule: simule, hazirla: hazirla, ozet: ozet };
