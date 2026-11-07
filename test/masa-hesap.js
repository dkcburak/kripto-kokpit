// test/masa-hesap.js — "100 USDT ile N gün önce Profesör açık olsaydı ne olurdu?" hesap simülasyonu.
// Canlı traderlar (Kırılım 3×, Güç) + Profesör kararı (sert kurallar + puan) + gerçek emir boyutu (emir.js boyut: 5-10x, en küçük kontrat kuralı)
// + kağıt dolum modeli (limit giriş, 12 mumda iptal) + ücret. Özkaynak işlem işlem birikir, günlük zarar sınırı %20.
// MEXC açık verisi (konteynerde erişim yok; GitHub Actions: .github/workflows/masa-hesap.yml).
// Modellenmeyen: funding ödemesi, Haberci (geçmiş haber yok), funding -15 puanı, kayma ücretin içinde (%0,1). Sonuç TAHMİNDİR.
// Kullanım: node test/masa-hesap.js [gün=30] [usdt=100] [coin=40] [cikti.json]
'use strict';
var fs = require('fs');
var A = require('../trader-masasi/ajanlar.js'), P = require('../trader-masasi/profesor.js'), E = require('../trader-masasi/emir.js'), T = require('../tarayici/tara.js'), H = require('../hesap.js');
var GUN = Number(process.argv[2]) || 30, USDT = Number(process.argv[3]) || 100, COIN = Number(process.argv[4]) || 40, CIKTI = process.argv[5] || '';
var S4 = 14400, SG = 86400, RISK = 0.25, CANLI = { kirilim: true, guc: true };

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
function gunStr(sn) { return new Date(sn * 1000).toISOString().slice(0, 16).replace('T', ' '); }

// ---- Simülasyon ----
// sinyaller: [{ t (giriş mumu zamanı sn), coin, trader, plan, fiyat (tetik mum kapanışı) }]; h4: coin -> 4S dizi; btcD: BTC günlük; detay: coin -> kontrat detayı
function simuleHesap(sinyaller, h4, btcD, detay, usdt, bas) {
  sinyaller.sort(function (a, b) { return a.t - b.t || a.coin.localeCompare(b.coin); });
  var oz = usdt, acik = [], kapali = [], kararlar = {}, atlanan = [], gunBas = { t: -1, oz: usdt }, tepe = usdt, maxDD = 0, egri = [];
  var idx = {};
  function ozGuncelle(sn) { tepe = Math.max(tepe, oz); maxDD = Math.min(maxDD, oz - tepe); egri.push([sn, +oz.toFixed(2)]); }
  function ilerletHepsi(kadar) {
    acik = acik.filter(function (p) {
      var m = h4[p.coin], i = idx[p.id] || 0;
      for (; i < m.length && m[i].time + S4 <= kadar; i++) {
        var c = m[i]; if (c.time < p.t) continue;
        if (!p.dolum) {
          p.bekleme = (p.bekleme || 0) + 1;
          var ust = Math.max(p.planGiris[0], p.planGiris[1]);
          if (c.low <= ust) { p.dolum = Math.min(c.open, ust); p.giris = p.dolum; p.stop0 = p.stop; if (p.giris <= p.stop) { kapat(p, { r: 0, neden: 'iptal' }, c); return false; } continue; }
          if (p.bekleme >= 12) { kapat(p, { r: 0, neden: 'dolmadı' }, c); return false; }
          continue;
        }
        var s = A.ilerlet(p, c);
        if (s) { kapat(p, s, c); return false; }
      }
      idx[p.id] = i; return true;
    });
  }
  function gunKontrol(sn) { var g = sn - (sn % SG); if (gunBas.t !== g) gunBas = { t: g, oz: oz }; }
  function kapat(p, s, c) {
    var pnl = 0;
    gunKontrol(c.time + S4);
    if (p.dolum && s.r) { var u = A.UCRET * p.giris, risk = p.giris - p.stop0; pnl = s.r * (risk + u) * p.vol * p.cs; }
    oz += pnl;
    kapali.push({ coin: p.coin, trader: p.trader, acilis: gunStr(p.t), kapanis: gunStr(c.time + S4), giris: p.giris || null, stop: p.stop0 || p.stop, tp1: p.tp1, vol: p.vol, kal: p.kal, riskUsdt: +p.riskUsdt.toFixed(2), r: +Number(s.r).toFixed(2), pnl: +pnl.toFixed(2), neden: s.neden, ozkaynak: +oz.toFixed(2) });
    if (s.neden === 'stop') sonStop[p.coin] = (c.time + S4) * 1000;
    ozGuncelle(c.time + S4);
  }
  var sonStop = {};
  sinyaller.forEach(function (s) {
    ilerletHepsi(s.t);
    var m = h4[s.coin], g = null;
    for (var i = 0; i < m.length; i++) if (m[i].time === s.t) { g = m[i]; break; }
    if (!g) return;
    gunKontrol(s.t);
    // BTC 1G yönü: önceki günlük kapanışa kadar
    var bd = btcD.filter(function (x) { return x.time + SG <= s.t; }).slice(-60);
    var btcYon = H.trendEma(bd) || 'yatay';
    var karne = {}; var son = kapali.filter(function (k) { return k.trader === s.trader && k.r !== 0; }).slice(-30);
    karne[s.trader] = { n: son.length, toplamR: son.reduce(function (t, k) { return t + k.r; }, 0) };
    var d = { simdi: s.t * 1000, acik: acik.map(function (p) { return { coin: p.coin, trader: p.trader, yon: 'long', riskYuzde: RISK }; }), sonStop: sonStop, gunSonuc: oz - gunBas.oz, gunBaslangic: gunBas.oz, karne: karne, gozlem: {}, btcYon: btcYon, funding: {}, fiyat: {}, atr: {}, olay: false, haber: {} };
    d.fiyat[s.coin] = s.fiyat;
    var sin = { trader: s.trader, coin: s.coin, yon: 'long', giris: s.plan.giris, stop: s.plan.stop, tp1: s.plan.tp1, rr: s.plan.rr, zaman: s.t * 1000, veriZamani: s.t * 1000 };
    var k = P.karar(sin, d);
    var kod = k.karar === 'onay' ? 'onay' : k.karar === 'bekle' ? 'bekle' : k.puan === 0 ? (k.kural[0] || 'ret') : 'ret (puan)';
    kararlar[kod] = (kararlar[kod] || 0) + 1;
    if (k.karar !== 'onay') return;
    // Gerçek boyut
    var limit = Math.max(s.plan.giris[0], s.plan.giris[1]), dt = detay[s.coin];
    var hb = E.boyut({ stop: s.plan.stop, tp1: s.plan.tp1 }, limit, oz, RISK, dt);
    if (hb.hata) { atlanan.push({ coin: s.coin, trader: s.trader, t: gunStr(s.t), neden: hb.hata, ozkaynak: +oz.toFixed(2) }); return; }
    acik.push({ id: s.coin + s.trader + s.t, coin: s.coin, trader: s.trader, t: s.t, planGiris: s.plan.giris, stop: s.plan.stop, tp1: s.plan.tp1, rr: s.plan.rr, tutma: s.plan.tutma, say: 0, vol: hb.vol, kal: hb.kal, cs: Number(dt.contractSize), riskUsdt: hb.riskUsdt, mini: hb.mini });
  });
  ilerletHepsi(Infinity);
  var dolu = kapali.filter(function (k) { return k.r !== 0; }), kz = dolu.filter(function (k) { return k.pnl > 0; }).length;
  return {
    baslangicUsdt: usdt, bitisUsdt: +oz.toFixed(2), kar: +(oz - usdt).toFixed(2), karYuzde: +((oz / usdt - 1) * 100).toFixed(1), maxDDUsdt: +maxDD.toFixed(2),
    islem: dolu.length, dolmayan: kapali.length - dolu.length, isabet: dolu.length ? Math.round(kz / dolu.length * 100) : 0, toplamR: +dolu.reduce(function (t, k) { return t + k.r; }, 0).toFixed(1),
    acikKalan: acik.map(function (p) { return { coin: p.coin, trader: p.trader, t: gunStr(p.t), dolum: p.dolum || null }; }),
    kararlar: kararlar, boyutAtlanan: atlanan, islemler: kapali, egri: egri
  };
}

async function calistir() {
  var sn = Math.floor(Date.now() / 1000), bit = sn - (sn % S4), bas = bit - GUN * SG;
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker');
  var tradfi = {}, detay = {};
  var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail');
  if (dt && dt.success) dt.data.forEach(function (d) { if (T.tradfiMi(d)) tradfi[d.symbol] = true; if (/_USDT$/.test(d.symbol)) detay[d.symbol.replace(/_USDT$/, '')] = d; });
  var liste = T.evren(t.data, tradfi).slice(0, COIN).map(function (x) { return x.coin; });
  if (liste.indexOf('BTC') < 0) liste.unshift('BTC');
  console.log('Evren (' + liste.length + '): ' + liste.join(' ') + ' | ' + GUN + ' gün, ' + USDT + ' USDT, risk %' + RISK + ', ' + gunStr(bas) + ' → ' + gunStr(bit));
  var V = {}, hata = [];
  for (var i = 0; i < liste.length; i++) {
    var c = liste[i];
    try {
      V[c] = { d: await mumlar(c, 'Day1', SG, bas - 70 * SG, bit), h4: await mumlar(c, 'Hour4', S4, bas - 60 * S4, bit) };
      if (V[c].d.length < 60 || V[c].h4.length < 60 || !detay[c]) { hata.push(c + ': az veri (' + V[c].d.length + ' gün)' + (detay[c] ? '' : ', kontrat detayı yok')); delete V[c]; }
    } catch (e) { hata.push(c + ': ' + e.message.slice(0, 50)); delete V[c]; }
  }
  var coinler = Object.keys(V);
  console.log('Veri: ' + coinler.length + ' coin' + (hata.length ? ', hata: ' + hata.join(' | ') : ''));
  if (!V.BTC) throw new Error('BTC verisi yok');
  var btc = V.BTC.d, gunluk = {};
  coinler.forEach(function (c) { var m = {}; V[c].d.forEach(function (x) { m[x.time] = x; }); gunluk[c] = btc.map(function (b) { return m[b.time] || null; }); });
  var liderGun = {};
  for (var kb = 50; kb < btc.length; kb++) { if (btc[kb].time < bas - SG) continue; liderGun[btc[kb].time + SG] = A.gucLiderler(gunluk, btc, kb, 5); }
  var sinyal = [], h4 = {};
  coinler.forEach(function (c) {
    var m = V[c].h4; h4[c] = m;
    for (var k = 30; k < m.length - 1; k++) {
      if (m[k].time < bas) continue;
      var p = CANLI.kirilim ? A.kirilim(m, k) : null; if (p) sinyal.push({ t: m[k + 1].time, coin: c, trader: 'kirilim', plan: p, fiyat: m[k].close });
      var gb = m[k].time - (m[k].time % SG), l = liderGun[gb];
      if (CANLI.guc && l && l.indexOf(c) >= 0) { p = A.guc(m, k); if (p) sinyal.push({ t: m[k + 1].time, coin: c, trader: 'guc', plan: p, fiyat: m[k].close }); }
    }
  });
  console.log('Sinyal: ' + sinyal.length + ' (kirilim ' + sinyal.filter(function (s) { return s.trader === 'kirilim'; }).length + ', guc ' + sinyal.filter(function (s) { return s.trader === 'guc'; }).length + ')');
  var sonuc = simuleHesap(sinyal, h4, btc, detay, USDT, bas);
  sonuc.gun = GUN; sonuc.coin = coinler.length; sonuc.baslangic = gunStr(bas); sonuc.bitis = gunStr(bit); sonuc.hatalar = hata; sonuc.sinyal = sinyal.length;
  console.log('HESAP: ' + JSON.stringify({ baslangic: sonuc.baslangicUsdt, bitis: sonuc.bitisUsdt, kar: sonuc.kar, karYuzde: sonuc.karYuzde, maxDD: sonuc.maxDDUsdt, islem: sonuc.islem, dolmayan: sonuc.dolmayan, isabet: sonuc.isabet, toplamR: sonuc.toplamR }));
  console.log('KARARLAR: ' + JSON.stringify(sonuc.kararlar));
  console.log('BOYUT ATLANAN: ' + sonuc.boyutAtlanan.length + ' ' + JSON.stringify(sonuc.boyutAtlanan.slice(0, 10)));
  sonuc.islemler.forEach(function (k) { console.log('ISLEM ' + JSON.stringify(k)); });
  console.log('ACIK KALAN: ' + JSON.stringify(sonuc.acikKalan));
  if (CIKTI) fs.writeFileSync(CIKTI, JSON.stringify(sonuc, null, 1));
  return sonuc;
}
module.exports = { simuleHesap: simuleHesap };
if (require.main === module) calistir().catch(function (e) { console.error('Hata:', e.stack || e.message); process.exit(1); });
