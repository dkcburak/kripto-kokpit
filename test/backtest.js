// test/backtest.js — geçmiş mumlarla sinyal skorunu (sinyalSkoruHaber) deneyen backtest motoru.
// Kullanım:
//   node test/backtest.js SOL m15 2026-09-01 2026-10-15 --indir   (MEXC vadeli public veriyi test/veri/ altına indirir)
//   node test/backtest.js SOL m15 [baslangic] [bitis]             (indirilen veriyle backtest)
// Not: Bu bir simülasyondur. Gerçek uygulamada c.tf, c.plan ve c.haberler analizden gelir;
// burada üst zaman dilimleri 15dk mumlardan üretilir, plan sabit yüzdelerle kurulur, haber yoktur.
'use strict';
var fs = require('fs');
var path = require('path');
var HESAP = require('../hesap.js');

// ---- AYARLAR ----
var arg = process.argv.slice(2).filter(function (a) { return a.indexOf('--') !== 0; });
var AYAR = {
  coin: (arg[0] || 'SOL').toUpperCase(),
  tf: arg[1] || 'm15',
  baslangic: arg[2] || null,  // ISO tarih, örn 2026-10-01
  bitis: arg[3] || null,
  sermaye: 1000,        // USDT
  riskYuzde: 1,         // işlem başına risk
  stopYuzde: 2,         // plan stopu: girişten %2
  tpYuzde: 3,           // plan hedefi (tp1): girişten %3
  ucret: HESAP.UCRET,   // giriş+çıkış ücret ve kayma payı (işlem değerinin oranı, hesap.js ile aynı)
  esikler: ['A+', 'A', 'B'],  // test edilecek sınıflar
  maxIslem: 500,        // maksimum işlem sayısı
  gelistirmeOran: 0.7,  // ilk %70 geliştirme, son %30 test (risk-backtest protokolü)
  isinma: 30            // ilk 30 mum gösterge için gerekli
};
AYAR.veriDosyasi = path.join(__dirname, 'veri', AYAR.coin + '_' + AYAR.tf + '.json');

var DK = { m15: 15, h1: 60, h4: 240, d: 1440 };

// ---- MUM VERİSİ YÜKLE ----
// Beklenen format: [{ time, open, high, low, close, vol }, ...] (time: ms)
function mumYukle(dosya) {
  if (!fs.existsSync(dosya)) {
    console.error('Veri dosyası bulunamadı:', dosya);
    console.error('Önce şu komutla veri indir: node test/backtest.js ' + AYAR.coin + ' ' + AYAR.tf + ' 2026-09-01 2026-10-15 --indir');
    process.exit(1);
  }
  var ham = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  var liste = ham.map(function (m) {
    var d = Array.isArray(m);
    return { time: Number(d ? m[0] : m.time), open: Number(d ? m[1] : m.open), high: Number(d ? m[2] : m.high), low: Number(d ? m[3] : m.low), close: Number(d ? m[4] : m.close), vol: Number(d ? m[5] : m.vol) };
  }).filter(function (m) { return m.time > 0 && m.close > 0 && m.high >= m.low; });
  liste.sort(function (a, b) { return a.time - b.time; });
  // Tarih aralığı verildiyse kırp
  var bas = AYAR.baslangic ? new Date(AYAR.baslangic).getTime() : -Infinity;
  var bit = AYAR.bitis ? new Date(AYAR.bitis).getTime() : Infinity;
  return liste.filter(function (m) { return m.time >= bas && m.time < bit; });
}

// Veri kontrolü: eksik mum (boşluk) ve aşırı sıçrama sayısı
function veriKontrol(mumlar) {
  var adim = DK[AYAR.tf] * 60000, bosluk = 0, sicrama = 0;
  for (var i = 1; i < mumlar.length; i++) {
    if (mumlar[i].time - mumlar[i - 1].time !== adim) bosluk++;
    if (Math.abs(mumlar[i].close / mumlar[i - 1].close - 1) > 0.1) sicrama++;
  }
  return { bosluk: bosluk, sicrama: sicrama };
}

// ---- MEXC'DEN VERİ İNDİR (opsiyonel) ----
// MEXC vadeli kline tek istekte en fazla 2000 mum verir; aralık parça parça indirilir.
async function veriIndir(coin, tf, baslangic, bitis) {
  if (!baslangic || !bitis || isNaN(new Date(baslangic)) || isNaN(new Date(bitis))) throw new Error('İndirme için başlangıç ve bitiş tarihi gerekli, örn: 2026-09-01 2026-10-15');
  var ARALIK = { m15: 'Min15', h1: 'Min60', h4: 'Hour4', d: 'Day1' };
  var sembol = coin + '_USDT', adim = DK[tf] * 60, parca = 2000 * adim;
  var bas = Math.floor(new Date(baslangic).getTime() / 1000), son = Math.floor(new Date(bitis).getTime() / 1000);
  var harita = {};
  for (var t = bas; t < son; t += parca) {
    var url = 'https://contract.mexc.com/api/v1/contract/kline/' + sembol + '?interval=' + (ARALIK[tf] || 'Min15') + '&start=' + t + '&end=' + Math.min(t + parca - adim, son - adim);
    console.log('Veri indiriliyor:', url);
    var yanit = await fetch(url);  // Node 18+ native fetch
    var json = await yanit.json();
    if (!json.success || !json.data || !json.data.time) throw new Error('MEXC yanıtı beklenmedik: ' + JSON.stringify(json).slice(0, 200));
    json.data.time.forEach(function (s, i) {
      harita[s] = { time: s * 1000, open: json.data.open[i], high: json.data.high[i], low: json.data.low[i], close: json.data.close[i], vol: json.data.vol[i] };
    });
  }
  var liste = Object.keys(harita).map(function (k) { return harita[k]; }).sort(function (a, b) { return a.time - b.time; });
  if (!liste.length) throw new Error('MEXC bu aralık için mum döndürmedi');
  var hedef = path.join(__dirname, 'veri');
  if (!fs.existsSync(hedef)) fs.mkdirSync(hedef, { recursive: true });
  fs.writeFileSync(AYAR.veriDosyasi, JSON.stringify(liste));
  console.log('Veri kaydedildi:', AYAR.veriDosyasi, '(' + liste.length + ' mum, kaynak: MEXC vadeli, saat UTC)');
  return liste;
}

// ---- GÖSTERGELER ----
// EMA serisi (geçmişe bakar, ileriye bakmaz): ilk n-1 değer null
function emaSeri(kapanis, n) {
  var out = kapanis.map(function () { return null; }), k = 2 / (n + 1), ema = 0;
  for (var i = 0; i < kapanis.length; i++) {
    if (i < n) { ema += kapanis[i]; if (i === n - 1) { ema /= n; out[i] = ema; } continue; }
    ema = kapanis[i] * k + ema * (1 - k); out[i] = ema;
  }
  return out;
}

// 15dk mumları üst zaman dilimine topla. bitis: o mumun kapanış zamanı (ms)
function grupla(mumlar, dk) {
  var adim = dk * 60000, out = [], son = null;
  mumlar.forEach(function (m) {
    var bas = Math.floor(m.time / adim) * adim;
    if (!son || son.bas !== bas) { son = { bas: bas, bitis: bas + adim, close: m.close }; out.push(son); }
    else son.close = m.close;
  });
  var kap = out.map(function (g) { return g.close; }), e9 = emaSeri(kap, 9), e21 = emaSeri(kap, 21);
  out.forEach(function (g, i) {
    // Trend: kapanış ve EMA9 ikisi EMA21'in üstündeyse yukarı, ikisi altındaysa aşağı, değilse yatay
    if (e21[i] == null) g.trend = null;
    else if (g.close > e21[i] && e9[i] > e21[i]) g.trend = 'yukari';
    else if (g.close < e21[i] && e9[i] < e21[i]) g.trend = 'asagi';
    else g.trend = 'yatay';
  });
  return out;
}

// O ana kadar KAPANMIŞ son üst zaman dilimi mumunun trendi (ileriye bakmaz)
function trendOku(grup, durum, kapanisZaman) {
  while (durum.i + 1 < grup.length && grup[durum.i + 1].bitis <= kapanisZaman) durum.i++;
  return durum.i >= 0 ? grup[durum.i].trend : null;
}

// ---- İSTATİSTİK ----
function istatistik(islemler) {
  var o = { toplam: islemler.length, kazanan: 0, kaybeden: 0, kar: 0, ortR: 0, maxDusus: 0, enUzunKayip: 0 };
  var bakiye = AYAR.sermaye, zirve = bakiye, seri = 0, toplamR = 0;
  islemler.forEach(function (i) {
    if (i.kar > 0) { o.kazanan++; seri = 0; } else { o.kaybeden++; seri++; if (seri > o.enUzunKayip) o.enUzunKayip = seri; }
    toplamR += i.r; o.kar += i.kar; bakiye += i.kar;
    if (bakiye > zirve) zirve = bakiye;
    var dusus = (zirve - bakiye) / zirve * 100; if (dusus > o.maxDusus) o.maxDusus = dusus;
  });
  o.kazanmaOrani = o.toplam ? Math.round(o.kazanan / o.toplam * 1000) / 10 : 0;
  o.ortR = o.toplam ? Math.round(toplamR / o.toplam * 100) / 100 : 0;  // beklenti (R, ücret dahil)
  o.kar = Math.round(o.kar * 100) / 100;
  o.karYuzde = Math.round(o.kar / AYAR.sermaye * 10000) / 100;
  o.maxDusus = Math.round(o.maxDusus * 100) / 100;
  return o;
}

// ---- BACKTEST MOTORU ----
// Her mumda sinyalSkoruHaber()'i çalıştır, sinyal varsa sanal işlem aç, TP/stop'a kadar takip et.
// Giriş: sinyal mumunun kapanışı. Çıkış kontrolü bir sonraki mumdan başlar.
// Aynı mumda hem stop hem hedef görüldüyse stop sayılır (temkinli varsayım).
function backtest(mumlar) {
  var islemler = [], acik = null, siniflar = {}, adim = DK[AYAR.tf] * 60000;
  var kapanis = mumlar.map(function (m) { return m.close; });
  var rsi = HESAP.rsiSeri(kapanis, 14), e9 = emaSeri(kapanis, 9), e21 = emaSeri(kapanis, 21);
  var g1 = grupla(mumlar, 60), g4 = grupla(mumlar, 240), gd = grupla(mumlar, 1440);
  var d1 = { i: -1 }, d4 = { i: -1 }, dd = { i: -1 };
  var hacimTop = 0;

  for (var i = 0; i < mumlar.length; i++) {
    var son = mumlar[i], kapanisZaman = son.time + adim;
    hacimTop += son.vol; if (i >= 20) hacimTop -= mumlar[i - 20].vol;
    var tf1 = trendOku(g1, d1, kapanisZaman), tf4 = trendOku(g4, d4, kapanisZaman), tfd = trendOku(gd, dd, kapanisZaman);
    if (i < AYAR.isinma) continue;

    // Açık işlem varsa önce onu kontrol et
    if (acik) {
      var cikis = null, sebep = null;
      if (acik.yon === 'long') {
        if (son.low <= acik.stop) { cikis = acik.stop; sebep = 'stop'; }
        else if (son.high >= acik.tp1) { cikis = acik.tp1; sebep = 'tp1'; }
      } else {
        if (son.high >= acik.stop) { cikis = acik.stop; sebep = 'stop'; }
        else if (son.low <= acik.tp1) { cikis = acik.tp1; sebep = 'tp1'; }
      }
      if (cikis) {
        var brut = (cikis - acik.giris) / acik.giris * (acik.yon === 'long' ? 1 : -1) * acik.buyukluk;
        var ucret = acik.buyukluk * AYAR.ucret;
        var kar = brut - ucret;
        islemler.push({ girisZaman: acik.zaman, cikisZaman: son.time, yon: acik.yon, sinif: acik.sinif, skor: acik.skor, giris: acik.giris, cikis: cikis, sebep: sebep, brut: brut, ucret: ucret, kar: kar, r: kar / acik.riskTutar, karYuzde: kar / AYAR.sermaye * 100 });
        acik = null;
        if (islemler.length >= AYAR.maxIslem) break;
      }
      continue; // açık işlem varken yeni sinyal aramıyoruz
    }

    // Yeni sinyal ara: yön 15dk EMA'dan, üst zaman dilimleri 15dk mumlardan üretilir
    var yon = e9[i] > e21[i] ? 'long' : 'short', l = yon === 'long';
    var m15 = { rsi: rsi[i], ema9: e9[i], ema21: e21[i], hacim: son.vol, hacimOrt: hacimTop / 20, kapanis: son.close };
    var c = {
      coin: AYAR.coin, fiyat: son.close, durum: yon,
      plan: { yon: yon, giris: [son.close * 0.999, son.close * 1.001], stop: son.close * (1 + (l ? -1 : 1) * AYAR.stopYuzde / 100), tp1: son.close * (1 + (l ? 1 : -1) * AYAR.tpYuzde / 100) },
      // 1S "onay": 1 saatlik trend plan yönünde
      tf: { h4: tf4 || 'yatay', d: tfd || 'yatay', h1: tf1 === (l ? 'yukari' : 'asagi') ? 'onay' : 'bekliyor' },
      haberler: [],
      m15: m15
    };
    var skor = HESAP.sinyalSkoruHaber(c, { mod: 'normal' }, { analizSaat: 0 });
    siniflar[skor.veto ? 'veto' : skor.sinif] = (siniflar[skor.veto ? 'veto' : skor.sinif] || 0) + 1;
    if (skor.sinif === 'yok' || skor.veto) continue;
    if (AYAR.esikler.indexOf(skor.sinif) < 0) continue;

    // Sanal işlem aç: risk tutarı sabit (başlangıç sermayesinin %riskYuzde'si), bileşik değil
    var girisFiyat = son.close, riskTutar = AYAR.sermaye * AYAR.riskYuzde / 100;
    var buyukluk = riskTutar / Math.abs(girisFiyat - c.plan.stop) * girisFiyat;
    acik = { zaman: son.time, yon: yon, sinif: skor.sinif, giris: girisFiyat, stop: c.plan.stop, tp1: c.plan.tp1, buyukluk: buyukluk, riskTutar: riskTutar, skor: skor.skor };
  }

  // Geliştirme / test bölümü: mum zamanına göre ilk %70 ve son %30
  var sinir = mumlar.length ? mumlar[Math.floor(mumlar.length * AYAR.gelistirmeOran)].time : 0;
  var sinifSonuc = {};
  AYAR.esikler.forEach(function (s) { sinifSonuc[s] = istatistik(islemler.filter(function (x) { return x.sinif === s; })); });
  return {
    ayar: AYAR, islemler: islemler, acikKaldi: !!acik, sinyalSayim: siniflar,
    sonuc: istatistik(islemler),
    gelistirme: istatistik(islemler.filter(function (x) { return x.girisZaman < sinir; })),
    test: istatistik(islemler.filter(function (x) { return x.girisZaman >= sinir; })),
    siniflar: sinifSonuc
  };
}

function satir(ad, s) {
  return ad + ' · işlem ' + s.toplam + ' · kazanma %' + s.kazanmaOrani + ' · ort ' + s.ortR + 'R · kâr ' + s.kar + ' USDT (%' + s.karYuzde + ') · maks düşüş %' + s.maxDusus + ' · en uzun kayıp serisi ' + s.enUzunKayip;
}

// ---- ÇALIŞTIR ----
if (require.main === module) {
  (async function () {
    if (process.argv.indexOf('--indir') >= 0) {
      await veriIndir(AYAR.coin, AYAR.tf, AYAR.baslangic, AYAR.bitis);
      return;
    }
    if (AYAR.tf !== 'm15') { console.error('Şimdilik yalnızca m15 destekleniyor'); process.exit(1); }
    var mumlar = mumYukle(AYAR.veriDosyasi);
    var vk = veriKontrol(mumlar);
    console.log('Backtest:', AYAR.coin, AYAR.tf, '· ' + mumlar.length + ' mum');
    if (mumlar.length) console.log('Aralık (UTC):', new Date(mumlar[0].time).toISOString().slice(0, 16), '→', new Date(mumlar[mumlar.length - 1].time).toISOString().slice(0, 16));
    console.log('Veri kontrolü: eksik mum boşluğu', vk.bosluk, '· %10 üstü sıçrama', vk.sicrama);
    var r = backtest(mumlar);
    console.log('Ücret ve kayma: işlem değerinin %' + (AYAR.ucret * 100) + "'i düşüldü (giriş+çıkış). Funding dahil değil.");
    console.log('Sinyal sayımı (her mum):', JSON.stringify(r.sinyalSayim));
    console.log('\n=== SONUÇ ===');
    console.log(satir('Tümü      ', r.sonuc));
    console.log(satir('Geliştirme', r.gelistirme));
    console.log(satir('Test      ', r.test));
    AYAR.esikler.forEach(function (s) { console.log(satir(('Sınıf ' + s + '     ').slice(0, 10), r.siniflar[s])); });
    console.log('Son sermaye:', Math.round((AYAR.sermaye + r.sonuc.kar) * 100) / 100, 'USDT' + (r.acikKaldi ? ' (son işlem açık kaldı, sayılmadı)' : ''));
    if (r.sonuc.toplam < 30) console.log('UYARI: 30\'dan az işlem, sonuç güvenilmez.');
    console.log('\n=== İŞLEMLER (son 10) ===');
    r.islemler.slice(-10).forEach(function (i) {
      console.log(new Date(i.girisZaman).toISOString().slice(0, 16), i.yon, i.sinif, 'giriş', i.giris.toFixed(4), 'çıkış', i.cikis.toFixed(4), i.sebep, 'kâr', i.kar.toFixed(2), '(' + i.r.toFixed(2) + 'R)');
    });
    fs.writeFileSync(path.join(__dirname, 'backtest-sonuc.json'), JSON.stringify(r, null, 2));
    console.log('\nDetay: test/backtest-sonuc.json');
  })().catch(function (e) { console.error('Hata:', e.message); process.exit(1); });
}

module.exports = { backtest: backtest, istatistik: istatistik, grupla: grupla, emaSeri: emaSeri };
