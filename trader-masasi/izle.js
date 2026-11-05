// Trader Masası saatlik izleme (KAĞIT MOD): 5 trader sinyal arar, Profesör karar verir, kağıt işlemler ilerletilir.
// Gerçek emir YOK, anahtar yok (MEXC açık veri + tarayici-veri dalındaki dKc çıktısı). Durum masa.json (masa-veri dalı).
// Kullanım: node trader-masasi/izle.js <onceki.json|-> <cikti.json>   Testi: node test/masa-izle.test.js
'use strict';
var A = require('./ajanlar.js'), P = require('./profesor.js'), T = require('../tarayici/tara.js'), H = require('../hesap.js');
var S1 = 3600, S4 = 14400, SG = 86400, MAX_KAPALI = 300, MAX_KARAR = 60, GOZLEM_GUN = 28;
var TRADER = { dkc: { tf: '4S', adim: S4 }, kirilim: { tf: '4S', adim: S4 }, trend: { tf: '1G', adim: SG }, funding: { tf: '1S', adim: S1 }, guc: { tf: '4S', adim: S4 } };
var DKC_URL = 'https://raw.githubusercontent.com/dkcburak/kripto-kokpit/tarayici-veri/tarayici.json';

function bos() { return { surum: 1, mod: 'kagit', baslangic: Date.now(), acik: [], kapali: [], kararlar: [], sonMum: {}, gorulen: {}, sonStop: {} }; }
function y(x) { return Number(Number(x).toPrecision(6)); }
function kapanmis(d, adim, sn) {
  if (!d || !Array.isArray(d.time)) return null;
  return d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n], vol: +d.vol[n] }; }).filter(function (m) { return m.time + adim <= sn; });
}
function karne(kapali, trader) {
  var k = kapali.filter(function (x) { return x.trader === trader; }), s30 = k.slice(-30);
  function oz(l) { var t = 0, kz = 0; l.forEach(function (x) { t += x.r; if (x.r > 0) kz++; }); return { n: l.length, toplamR: +t.toFixed(2), isabet: l.length ? Math.round(kz / l.length * 100) : 0 }; }
  return { hepsi: oz(k), son30: oz(s30) };
}
function profKarne(kararlar, kapali) {
  var o = { onay: 0, ret: 0, bekle: 0 }, bugun = new Date().toISOString().slice(0, 10);
  kararlar.forEach(function (k) { if (new Date(k.zaman).toISOString().slice(0, 10) === bugun) o[k.karar] = (o[k.karar] || 0) + 1; });
  var ret = kapali.filter(function (x) { return x.sanal; }), retDogru = ret.filter(function (x) { return x.r <= 0; }).length;
  o.retIsabet = ret.length ? Math.round(retDogru / ret.length * 100) : null; o.retOrnek = ret.length;
  return o;
}
// Açık işlemleri yeni kapanmış mumlarla ilerlet
function ilerletAcik(durum, coin, trader, mumlar, kapaliEkle) {
  durum.acik = durum.acik.filter(function (p) {
    if (p.coin !== coin || p.trader !== trader) return true;
    for (var i = 0; i < mumlar.length; i++) {
      var m = mumlar[i];
      if (m.time <= (p.sonKontrol || 0)) continue;
      if (!p.dolum) { if (m.time < p.t) continue; p.dolum = m.open; p.giris = m.open; p.stop0 = p.stop; p.sonKontrol = m.time; if (p.giris <= p.stop) { kapaliEkle(p, { r: 0, neden: 'iptal' }, m); return false; } continue; }
      p.sonKontrol = m.time;
      var s = A.ilerlet(p, m);
      if (s) { kapaliEkle(p, s, m); return false; }
    }
    return true;
  });
}
async function izle(getJson, onceki, simdi) {
  simdi = simdi || Date.now();
  var durum = onceki && Array.isArray(onceki.acik) ? onceki : bos();
  durum.sonMum = durum.sonMum || {}; durum.gorulen = durum.gorulen || {}; durum.sonStop = durum.sonStop || {}; durum.kararlar = durum.kararlar || [];
  var sn = Math.floor(simdi / 1000), hatalar = [], adaylar = [];
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker');
  if (!t || !t.success || !Array.isArray(t.data)) throw new Error('MEXC ticker yanıtı beklenmedik');
  var tradfi = {};
  try { var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail'); if (dt && dt.success) dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; }); } catch (e) { /* devam */ }
  var evren = T.evren(t.data, tradfi).slice(0, T.AYAR.coinSayisi), fiyat = {}, fund = {}, liste = evren.map(function (x) { fiyat[x.coin] = x.fiyat; fund[x.coin] = x.funding; return x.coin; });
  if (liste.indexOf('BTC') < 0) liste.unshift('BTC');
  var V = {}, gunluk = {};
  function kapaliEkle(p, s, m) {
    durum.kapali.push({ coin: p.coin, trader: p.trader, t: p.t, bitis: m.time, giris: p.giris, stop: p.stop0, r: Math.round(s.r * 100) / 100, neden: s.neden, sanal: !!p.sanal, gozlem: !!p.gozlem });
    if (s.neden === 'stop' && !p.sanal) durum.sonStop[p.coin] = m.time * 1000;
  }
  for (var i = 0; i < liste.length; i++) {
    var coin = liste[i];
    try {
      var h4 = kapanmis((await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Hour4&start=' + (sn - S4 * 80) + '&end=' + sn)).data, S4, sn);
      var d1 = kapanmis((await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Day1&start=' + (sn - SG * 270) + '&end=' + sn)).data, SG, sn);
      var h1 = kapanmis((await getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=Min60&start=' + (sn - S1 * 48) + '&end=' + sn)).data, S1, sn);
      if (!h4 || h4.length < 30 || !d1 || d1.length < 60 || !h1 || h1.length < 30) throw new Error('az mum');
      var fo = null;
      try { var fj = await getJson('https://contract.mexc.com/api/v1/contract/funding_rate/history?symbol=' + coin + '_USDT&page_num=1&page_size=3'); var fl = fj && fj.data && fj.data.resultList; if (Array.isArray(fl) && fl.length === 3) fo = (Number(fl[0].fundingRate) + Number(fl[1].fundingRate) + Number(fl[2].fundingRate)) / 3; } catch (e) { fo = fund[coin]; }
      V[coin] = { h4: h4, d1: d1, h1: h1, fo: fo }; gunluk[coin] = d1;
      ilerletAcik(durum, coin, 'kirilim', h4, kapaliEkle); ilerletAcik(durum, coin, 'guc', h4, kapaliEkle); ilerletAcik(durum, coin, 'dkc', h4, kapaliEkle);
      ilerletAcik(durum, coin, 'trend', d1, kapaliEkle); ilerletAcik(durum, coin, 'funding', h1, kapaliEkle);
    } catch (e) { hatalar.push(coin + ': ' + String(e.message || e).slice(0, 50)); }
  }
  if (liste.length && hatalar.length > liste.length / 2) throw new Error('MEXC mumları okunamadı: ' + hatalar.length + '/' + liste.length);
  if (!V.BTC) throw new Error('BTC verisi yok');
  var btcYon = H.trendEma(V.BTC.d1.slice(-60)), btcK = V.BTC.d1.length - 1;
  // Günlük dizileri BTC takvimine hizala (güç sıralaması)
  var hiza = {}; Object.keys(gunluk).forEach(function (c) { var m = {}; gunluk[c].forEach(function (x) { m[x.time] = x; }); hiza[c] = V.BTC.d1.map(function (b) { return m[b.time] || null; }); });
  var liderler = A.gucLiderler(hiza, V.BTC.d1, btcK, 5);
  // Yeni kapanan mumlarda sinyal ara (her trader+coin+mum bir kez)
  Object.keys(V).forEach(function (coin) {
    var v = V[coin], sm = durum.sonMum[coin] || {};
    function yeni(ad, mumlar, adim, fn) {
      var son = sm[ad] || (mumlar[mumlar.length - 1].time - adim);
      for (var k = 0; k < mumlar.length; k++) {
        if (mumlar[k].time <= son) continue;
        var p = fn(k); if (p) adaylar.push({ trader: ad, coin: coin, plan: p, tetik: mumlar[k].time, t: mumlar[k].time + adim, zaman: (mumlar[k].time + adim) * 1000 });
      }
      sm[ad] = mumlar[mumlar.length - 1].time;
    }
    yeni('kirilim', v.h4, S4, function (k) { return A.kirilim(v.h4, k); });
    yeni('trend', v.d1, SG, function (k) { return A.trend(v.d1, k); });
    yeni('funding', v.h1, S1, function (k) { var hi = v.h4.length; return A.funding(v.h1, k, v.fo, A.ema(v.h4.slice(Math.max(0, hi - 60), hi).map(function (x) { return x.close; }), 20)); });
    if (liderler.indexOf(coin) >= 0) yeni('guc', v.h4, S4, function (k) { return A.guc(v.h4, k); });
    durum.sonMum[coin] = sm;
  });
  // T1 dKc: mevcut tarayıcı planları (tarayici-veri dalı), coin+analiz zamanı başına bir kez
  try {
    var dj = await getJson(DKC_URL + '?t=' + sn);
    if (dj && Array.isArray(dj.coinler) && simdi - dj.zaman < 2 * 3600000) dj.coinler.forEach(function (c) {
      var id = 'dkc-' + c.coin + '-' + c.analizZamani; if (durum.gorulen[id] || !c.plan || !V[c.coin]) return;
      durum.gorulen[id] = simdi; var p = c.plan, mid = (p.giris[0] + p.giris[1]) / 2;
      adaylar.push({ trader: 'dkc', coin: c.coin, plan: { trader: 'dkc', yon: p.yon, giris: p.giris, stop: p.stop, tp1: p.tp1, tp2: p.tp2, rr: T.AYAR.tp1R, tutma: 12, tf: '4S', gerekce: c.ozet || 'dKc tarayıcı planı' }, tetik: V[c.coin].h4[V[c.coin].h4.length - 1].time, t: V[c.coin].h4[V[c.coin].h4.length - 1].time + S4, zaman: simdi, mid: mid });
    });
  } catch (e) { hatalar.push('dKc: ' + String(e.message || e).slice(0, 50)); }
  // Gözlem: Trend/Funding/Güç ilk 28 gün kağıt karne (havuza sayılmaz)
  var gozlem = {}; ['trend', 'funding', 'guc'].forEach(function (a) { gozlem[a] = simdi - (durum.baslangic || simdi) < GOZLEM_GUN * 86400000; });
  // Geriye dönük test (5 Kas 2026, 300 gün): Funding TRAIN eksi -> elendi (süresiz gözlem, havuza girmez); Trend 5 işlem -> yetersiz veri, gözlem sürer
  var ELENDI = { funding: 'geriye dönük testte avantaj yok (TRAIN -5R)' }; Object.keys(ELENDI).forEach(function (a) { gozlem[a] = true; });
  Object.keys(durum.gorulen).forEach(function (id) { if (simdi - durum.gorulen[id] > 3 * 86400000) delete durum.gorulen[id]; });
  // Profesör
  var kr = {}; Object.keys(TRADER).forEach(function (a) { kr[a] = karne(durum.kapali, a).son30; });
  var gun = durum.kapali.filter(function (x) { return !x.sanal && !x.gozlem && x.bitis * 1000 > simdi - 86400000; }).reduce(function (s, x) { return s + x.r; }, 0);
  adaylar.sort(function (a, b) { return a.zaman - b.zaman; }).forEach(function (c) {
    var p = c.plan, s = { trader: c.trader, coin: c.coin, yon: p.yon, giris: p.giris, stop: p.stop, tp1: p.tp1, rr: p.rr, veriZamani: Math.min(simdi, c.zaman + 3600000) };
    var havuz = durum.acik.filter(function (x) { return !x.sanal && !x.gozlem; });
    var d = { simdi: simdi, acik: gozlem[c.trader] ? [] : havuz, sonStop: durum.sonStop, gunSonuc: gun * 0.25, gunBaslangic: 100, karne: kr, gozlem: gozlem, btcYon: btcYon, funding: fund, fiyat: fiyat, atr: {} };
    d.atr[c.coin] = A.atr(V[c.coin].h4, V[c.coin].h4.length - 1, 14);
    var k = P.karar(s, d);
    durum.kararlar.push({ id: c.trader + '-' + c.coin + '-' + c.tetik, zaman: c.zaman, trader: c.trader, coin: c.coin, yon: p.yon, giris: p.giris, stop: p.stop, tp1: p.tp1, tp2: p.tp2, rr: p.rr, tf: p.tf, gerekce: p.gerekce, karar: k.karar, puan: k.puan, neden: k.neden, gozlem: !!gozlem[c.trader] });
    if (p.yon !== 'long') return; // short yalnız kayıt
    // onay: kağıt işlem; ret/bekle: sanal takip (Profesör karnesi için)
    var poz = { coin: c.coin, trader: c.trader, t: c.t, tetik: c.tetik, stop: p.stop, tp1: p.tp1, tp2: p.tp2, rr: p.rr, tutma: p.tutma, say: 0, takipAtr: p.takipAtr, atr: p.atr, planGiris: p.giris, yon: 'long', zaman: c.zaman, karar: k.karar, sanal: k.karar !== 'onay', gozlem: !!gozlem[c.trader] };
    if (durum.acik.some(function (x) { return x.coin === c.coin && x.trader === c.trader; })) return;
    durum.acik.push(poz);
  });
  if (durum.kararlar.length > MAX_KARAR) durum.kararlar = durum.kararlar.slice(-MAX_KARAR);
  if (durum.kapali.length > MAX_KAPALI) durum.kapali = durum.kapali.slice(-MAX_KAPALI);
  // Çıktı özeti (panel bunu okur)
  var ajanlar = {};
  Object.keys(TRADER).forEach(function (a) {
    var ac = durum.acik.filter(function (x) { return x.trader === a && !x.sanal; });
    ajanlar[a] = { tf: TRADER[a].tf, karne: karne(durum.kapali, a), gozlem: !!gozlem[a], elendi: ELENDI[a] || null, acik: ac.map(function (x) { return { coin: x.coin, giris: x.giris || null, stop: x.stop, tp1: x.tp1, r: x.giris ? y((fiyat[x.coin] - x.giris) / (x.giris - x.stop0)) : null }; }), durum: ac.length ? 'pozisyonda' : 'tariyor' };
  });
  var onayli = durum.acik.filter(function (x) { return !x.sanal; }).sort(function (a, b) { return b.zaman - a.zaman; }).map(function (x) {
    var m = x.trader === 'trend' ? V[x.coin].d1 : x.trader === 'funding' ? V[x.coin].h1 : V[x.coin].h4;
    return { coin: x.coin, trader: x.trader, tf: TRADER[x.trader].tf, yon: 'long', giris: x.planGiris, dolum: x.giris || null, stop: x.stop, stop0: x.stop0 || x.stop, tp1: x.tp1, tp2: x.tp2, rr: x.rr, zaman: x.zaman, tetik: x.tetik, gozlem: x.gozlem, fiyat: fiyat[x.coin], mumlar: m.slice(-60).map(function (q) { return [q.time, y(q.open), y(q.high), y(q.low), y(q.close)]; }) };
  });
  durum.zaman = simdi; durum.hatalar = hatalar; durum.taranan = liste.length; durum.btcYon = btcYon; durum.liderler = liderler;
  durum.ozet = { ajanlar: ajanlar, profesor: profKarne(durum.kararlar, durum.kapali), havuz: { acik: durum.acik.filter(function (x) { return !x.sanal && !x.gozlem; }).length, maxAcik: P.AYAR.maxAcik, risk: y(durum.acik.filter(function (x) { return !x.sanal && !x.gozlem; }).length * P.AYAR.riskIslem), riskTavan: P.AYAR.riskTavan, gun: y(gun) }, onayli: onayli };
  return durum;
}
module.exports = { izle: izle, karne: karne, TRADER: TRADER };

if (require.main === module) {
  var fs = require('fs'), onceki = null;
  if (process.argv[2] && process.argv[2] !== '-' && fs.existsSync(process.argv[2])) { try { onceki = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch (e) { console.error('Önceki durum okunamadı, sıfırdan başlanır'); } }
  var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var getJson = async function (url) {
    for (var d = 0; d < 2; d++) { await bekle(120); try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar */ } await bekle(1000); }
    throw new Error('erişilemedi');
  };
  izle(getJson, onceki).then(function (s) {
    fs.writeFileSync(process.argv[3] || 'masa.json', JSON.stringify(s));
    console.log('Masa: ' + s.taranan + ' coin, BTC ' + s.btcYon + ', açık ' + s.acik.length + ' (kağıt ' + s.ozet.havuz.acik + '), kapanan ' + s.kapali.length + ', karar ' + s.kararlar.length + ', liderler ' + s.liderler.join(',') + ', hata ' + s.hatalar.length);
  }, function (e) { console.error('Hata:', e.stack || e.message); process.exit(1); });
}
