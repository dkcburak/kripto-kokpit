// dKc kırılım kuru izleme: 4S kapanış önceki 20 mumun zirvesini hacim patlamasıyla aşarsa (yalnız long) "olsaydı ne olurdu" günlüğü tutar.
// Gerçek emir YOK, anahtar yok (MEXC açık veri). Durum kirilim.json dosyasında (kirilim-veri dalı) saklanır.
// Kullanım: node tarayici/kirilim.js <onceki.json|-> <cikti.json>   Testi: node test/kirilim-izle.test.js
'use strict';
var T = require('./tara.js');
var ADIM = 14400, UCRET = 0.001, MAX_KAPALI = 400;
// İki ayar birlikte izlenir; geriye dönük test (300 gün, ilk 40 coin) en tutarlı ikisi
var AYARLAR = [
  { ad: 'A', volK: 2.5, atrK: 2, tutma: 12, slot: 3 },
  { ad: 'B', volK: 4, atrK: 1.5, tutma: 6, slot: 1 }
];

function atr14(m, k) {
  var s = 0;
  for (var i = k - 13; i <= k; i++) s += Math.max(m[i].high - m[i].low, Math.abs(m[i].high - m[i - 1].close), Math.abs(m[i].low - m[i - 1].close));
  return s / 14;
}
// k. mum kapanışında long kırılım sinyali: kapanış önceki 20 mumun zirvesinin üstünde ve hacim ≥ volK × ortalama
function sinyal(h, k, volK) {
  if (k < 22) return null;
  var yuk = -Infinity, hv = 0;
  for (var i = k - 20; i < k; i++) { yuk = Math.max(yuk, h[i].high); hv += h[i].vol; }
  hv /= 20;
  if (!(hv > 0) || h[k].vol < volK * hv || !(h[k].close > yuk)) return null;
  return { oran: h[k].vol / hv, atr: atr14(h, k) };
}
// Açık işlemi yeni kapanmış mumlarla ilerlet; bitince { r, neden } döner (stop ve hedef aynı mumda ise stop)
function ilerlet(p, mumlar) {
  for (var i = 0; i < mumlar.length; i++) {
    var m = mumlar[i];
    if (m.time < p.t || m.time <= p.sonKontrol) continue;
    p.sonKontrol = m.time; p.say++;
    if (m.low <= p.stop) return { r: -1, neden: 'stop' };
    if (m.high >= p.tp) return { r: 2, neden: 'hedef' };
    if (p.say >= p.tutma) return { r: Math.max(-1, Math.min(2, ((m.close - p.giris) - p.u) / (p.risk + p.u))), neden: 'süre' };
  }
  return null;
}
function ozet(durum) {
  var o = {};
  AYARLAR.forEach(function (a) {
    var k = durum.kapali.filter(function (x) { return x.ayar === a.ad; });
    var top = k.reduce(function (s, x) { return s + x.r; }, 0), kz = k.filter(function (x) { return x.r > 0; }).length;
    o[a.ad] = { kapanan: k.length, kazanan: kz, toplamR: Math.round(top * 100) / 100, ortR: k.length ? Math.round(top / k.length * 100) / 100 : 0, acik: durum.acik.filter(function (x) { return x.ayar === a.ad; }).length };
  });
  return o;
}
// getJson: url -> json. onceki: önceki durum (ya da null). simdi: ms
async function izle(getJson, onceki, simdi) {
  simdi = simdi || Date.now();
  var durum = onceki && Array.isArray(onceki.acik) ? onceki : { surum: 1, acik: [], kapali: [], sonMum: {} };
  durum.sonMum = durum.sonMum || {};
  var sn = Math.floor(simdi / 1000);
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker');
  if (!t || !t.success || !Array.isArray(t.data)) throw new Error('MEXC ticker yanıtı beklenmedik');
  var tradfi = {};
  try { var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail'); if (dt && dt.success) dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; }); } catch (e) { /* ad listesiyle devam */ }
  var liste = T.evren(t.data, tradfi).slice(0, T.AYAR.coinSayisi), hatalar = [], adaylar = [], kapanis = {};
  var okunan = 0;
  for (var i = 0; i < liste.length; i++) {
    var coin = liste[i].coin;
    try {
      var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Hour4&start=' + (sn - ADIM * 70) + '&end=' + sn);
      var d = j && j.data;
      if (!d || !Array.isArray(d.time) || !Array.isArray(d.vol)) throw new Error('mum yok');
      var hepsi = d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n], vol: +d.vol[n] }; });
      var h = hepsi.filter(function (m) { return m.time + ADIM <= sn; });
      if (h.length < 30) throw new Error('az mum');
      okunan++;
      kapanis[coin] = h;
      // Açık işlemleri ilerlet
      var kalan = [];
      durum.acik.forEach(function (p) {
        if (p.coin !== coin) { kalan.push(p); return; }
        var s = ilerlet(p, h);
        if (s) durum.kapali.push({ coin: p.coin, ayar: p.ayar, t: p.t, giris: p.giris, risk: p.risk, r: Math.round(s.r * 100) / 100, neden: s.neden }); else kalan.push(p);
      });
      durum.acik = kalan;
      // Yeni kapanan mumlarda sinyal ara (her mum bir kez)
      var son = durum.sonMum[coin] || (h[h.length - 1].time - ADIM);   // ilk çalışmada yalnız en son kapanan mum
      for (var k = 0; k < h.length; k++) {
        if (h[k].time <= son) continue;
        var giris = hepsi.filter(function (m) { return m.time === h[k].time + ADIM; })[0];
        if (!giris) continue;
        AYARLAR.forEach(function (a) {
          var s = sinyal(h, k, a.volK);
          if (s) adaylar.push({ coin: coin, ayar: a, oran: s.oran, atr: s.atr, t: giris.time, giris: giris.open });
        });
      }
      durum.sonMum[coin] = h[h.length - 1].time;
    } catch (e) { hatalar.push(coin + ': ' + String(e.message || e).slice(0, 60)); }
  }
  if (liste.length && hatalar.length > liste.length / 2) throw new Error('MEXC mumları okunamadı: ' + hatalar.length + '/' + liste.length);
  // Adayları hacim patlamasına göre sırala, ayar başına slot sınırıyla işleme al
  adaylar.sort(function (x, y) { return y.oran - x.oran; }).forEach(function (c) {
    var a = c.ayar;
    var acikSay = durum.acik.filter(function (p) { return p.ayar === a.ad; }).length;
    if (acikSay >= a.slot || durum.acik.some(function (p) { return p.ayar === a.ad && p.coin === c.coin; })) return;
    var risk = a.atrK * c.atr, u = UCRET * c.giris;
    durum.acik.push({ coin: c.coin, ayar: a.ad, t: c.t, giris: c.giris, risk: risk, u: u, stop: c.giris - risk, tp: c.giris + 2 * (risk + u) + u, tutma: a.tutma, say: 0, sonKontrol: 0 });
  });
  if (durum.kapali.length > MAX_KAPALI) durum.kapali = durum.kapali.slice(-MAX_KAPALI);
  durum.zaman = simdi; durum.ozet = ozet(durum); durum.hatalar = hatalar; durum.taranan = liste.length;
  return durum;
}
module.exports = { AYARLAR: AYARLAR, sinyal: sinyal, ilerlet: ilerlet, izle: izle };

if (require.main === module) {
  var fs = require('fs'), onceki = null;
  if (process.argv[2] && process.argv[2] !== '-' && fs.existsSync(process.argv[2])) { try { onceki = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch (e) { console.error('Önceki durum okunamadı, sıfırdan başlanır'); } }
  var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var getJson = async function (url) {
    for (var d = 0; d < 2; d++) { await bekle(150); try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ } await bekle(1000); }
    throw new Error('MEXC erişilemedi');
  };
  izle(getJson, onceki).then(function (s) {
    fs.writeFileSync(process.argv[3] || 'kirilim.json', JSON.stringify(s));
    console.log('İzleme: ' + s.taranan + ' coin, açık ' + s.acik.length + ', kapanan ' + s.kapali.length + ', ' + JSON.stringify(s.ozet) + ', hata ' + s.hatalar.length);
  }, function (e) { console.error('Hata:', e.message); process.exit(1); });
}
