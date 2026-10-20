// dKc tarayıcı: MEXC vadelide hacmi en yüksek coinleri 15 dakikada bir tarar, analizle aynı kurallarla plan adayı üretir.
// GitHub Actions'ta çalışır (.github/workflows/tarayici.yml), sonucu tarayici.json olarak yazar; Apps Script okur.
// Emir vermez, anahtar kullanmaz (MEXC açık veri). Testi: node test/tarayici.test.js
// Kullanım: node tarayici/tara.js <cikti.json>
'use strict';
var H = require('../hesap.js');

var AYAR = {
  coinSayisi: 40,          // hacme göre ilk 40 coin taranır
  minHacim: 10e6,          // 24 saatlik işlem hacmi en az 10 milyon USDT (short yine yalnız ilk 20)
  shortIlk: 20,            // short yalnızca hacimde ilk 20'deki coinlerde (analiz kuralı)
  analizListesi: 30,       // Claude analizine önerilen coin sayısı (Coinler sekmesiyle birlikte)
  bolgeAtr: 0.25,          // giriş bölgesi: 4S EMA20 ± 0,25 ATR
  minBolge: 0.006,         // giriş bölgesi en az %0,6 genişlikte
  stopAtr: 1,              // stop: bölgenin 1 ATR (4S) ötesi
  maxStop: 0.08,           // stop mesafesi en fazla %8
  maxUzaklik: 2,           // fiyat bölgeye en fazla 2 ATR (4S) uzaktaysa plan yazılır
  tp1R: 1.51, tp2R: 2.5    // ücret sonrası kazanç/risk (1,51: yuvarlamadan sonra da 1,5'in altına düşmesin)
};
// Kripto olmayan ya da sabit fiyatlı semboller taranmaz
var HARIC = /^(USDC|USDE|FDUSD|TUSD|DAI|USDD|PYUSD|USD1|BUSD|EUR|GBP|JPY|XAUT|PAXG|XAU|XAG|SILVER|GOLD|USOIL|UKOIL|SPX500|NAS100|US30)$|STOCK$/;
// MEXC kontrat detayında hisse, ETF, emtia ve endeks kontratları (tradfi) işaretli; bunlar kripto değil
var TRADFI = /tradfi|stock|etf|commodit|forex|metal|index/i;
function tradfiMi(d) { return d && (d.type === 2 || (Array.isArray(d.conceptPlate) && d.conceptPlate.some(function (x) { return TRADFI.test(String(x)); }))); }

// EMA ve trend tanımı hesap.js'den gelir: uygulama, sunucu ve tarayıcı aynı formülü kullanır
var ema = H.emaSon, trend = H.trendEma;

function yuvarla(x) { return Number(x.toPrecision(6)); }
// Ücret sonrası kazanç/risk = r olacak hedef uzaklığı (hesap.js planHesap r1Net formülünün tersi)
function netHedef(risk, giris, r) { var u = H.UCRET * giris; return r * (risk + u) + u; }

// Tek coin için plan adayı. mumlar: { d, h4 } kapanmış mumlar (eskiden yeniye). Plan yoksa { neden } döner.
function planUret(coin, mumlar, fiyat, funding, shortIzin) {
  var tf = { d: trend(mumlar.d || []), h4: trend(mumlar.h4 || []), h1: 'bekliyor' };
  var o = { coin: coin, tf: tf };
  if (!tf.d || !tf.h4) { o.neden = 'yeterli mum yok'; return o; }
  var yon = tf.h4 === 'yukari' && tf.d !== 'asagi' ? 'long' : tf.h4 === 'asagi' && tf.d !== 'yukari' ? 'short' : null;
  if (!yon) { o.neden = '4S ve 1G aynı yönü göstermiyor'; return o; }
  if (yon === 'short' && !shortIzin) { o.neden = 'hacimde ilk ' + AYAR.shortIlk + ' dışı, short verilmez'; return o; }
  if (typeof funding === 'number' && (yon === 'short' ? funding <= -0.0003 : funding >= 0.001)) { o.neden = 'funding aşırı'; return o; }
  var h4 = mumlar.h4, atr = H.atrHesap(h4.slice(-60), 14), orta = ema(h4.map(function (m) { return m.close; }), 20);
  if (!atr || !orta || !(fiyat > 0)) { o.neden = 'gösterge hesaplanamadı'; return o; }
  var yari = Math.max(atr * AYAR.bolgeAtr, orta * AYAR.minBolge / 2);
  var alt = orta - yari, ust = orta + yari, lng = yon === 'long';
  // Fiyat bölgenin stop tarafındaysa (geri çekilme bölgeyi geçmiş) plan yok
  if (lng ? fiyat < alt : fiyat > ust) { o.neden = 'fiyat giriş bölgesinin ' + (lng ? 'altında' : 'üstünde'); return o; }
  if (Math.abs(fiyat - orta) > AYAR.maxUzaklik * atr) { o.neden = 'fiyat giriş bölgesine uzak'; return o; }
  var giris = orta, stop = lng ? alt - atr * AYAR.stopAtr : ust + atr * AYAR.stopAtr, risk = Math.abs(giris - stop);
  if (risk / giris > AYAR.maxStop) { o.neden = 'stop %8\'den uzak'; return o; }
  var tp1 = lng ? giris + netHedef(risk, giris, AYAR.tp1R) : giris - netHedef(risk, giris, AYAR.tp1R);
  var tp2 = lng ? giris + netHedef(risk, giris, AYAR.tp2R) : giris - netHedef(risk, giris, AYAR.tp2R);
  var plan = { yon: yon, giris: [yuvarla(alt), yuvarla(ust)], stop: yuvarla(stop), tp1: yuvarla(tp1), tp2: yuvarla(tp2),
    gecersiz: '4 saatlik kapanış ' + yuvarla(stop) + (lng ? ' altında' : ' üstünde') + ' olursa plan iptal.' };
  // Yuvarlama sonrası kural kontrolü: hesap.js ile aynı (stop < bölge < hedef, net R:R ≥ 1,5, 5x)
  var h = H.planGecerli(plan) ? H.planHesap(plan) : null;
  if (!h || h.r1Net < 1.5 - 1e-6 || !h.kalUygun) { o.neden = 'plan kurala uymadı'; return o; }
  o.durum = yon; o.plan = plan; o.fiyat = fiyat;
  if (typeof funding === 'number') o.funding = funding;
  return o;
}

// MEXC ticker listesinden taranacak coinler: USDT vadeli, kripto, hacim eşiğinin üstünde, hacme göre sıralı
function evren(tickerlar, tradfi) {
  tradfi = tradfi || {};
  return tickerlar.filter(function (t) { return /^[A-Z0-9]{2,15}_USDT$/.test(t.symbol) && !HARIC.test(t.symbol.replace('_USDT', '')) && !tradfi[t.symbol] && Number(t.amount24) >= AYAR.minHacim && Number(t.lastPrice) > 0; })
    .sort(function (a, b) { return Number(b.amount24) - Number(a.amount24); })
    .map(function (t) { return { coin: t.symbol.replace('_USDT', ''), fiyat: Number(t.lastPrice), funding: Number(t.fundingRate), hacim: Number(t.amount24) }; });
}

// "19 Eki 22:30" (İstanbul saati)
var AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function trZaman(ms) {
  var d = new Date(ms + 3 * 3600000);
  return d.getUTCDate() + ' ' + AY[d.getUTCMonth()] + ' ' + ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
}

function ozetYaz(c) {
  var ad = { yukari: 'yukarı', asagi: 'aşağı', yatay: 'yatay' }, p = c.plan;
  return 'Tarayıcı: 4S ' + ad[c.tf.h4] + ', 1G ' + ad[c.tf.d] + '. Fiyat ' + p.giris[0] + '–' + p.giris[1] +
    ' bölgesine (4S EMA20) gelir ve 1 saatlikte onay olursa ' + p.yon + '.';
}

// Tüm tarama: getJson(url) -> Promise<json>. Dönüş: tarayici.json içeriği
async function tara(getJson, simdi) {
  simdi = simdi || Date.now();
  var t = await getJson('https://contract.mexc.com/api/v1/contract/ticker');
  if (!t || !t.success || !Array.isArray(t.data)) throw new Error('MEXC ticker yanıtı beklenmedik');
  // Kontrat detayı alınamazsa yalnızca ad listesiyle elenir (tarama durmaz)
  var tradfi = {}, detayVar = false;
  try {
    var dt = await getJson('https://contract.mexc.com/api/v1/contract/detail');
    if (dt && dt.success && Array.isArray(dt.data)) { detayVar = true; dt.data.forEach(function (d) { if (tradfiMi(d)) tradfi[d.symbol] = true; }); }
  } catch (e) { detayVar = false; }
  var liste = evren(t.data, tradfi), taranan = liste.slice(0, AYAR.coinSayisi), sn = Math.floor(simdi / 1000);
  var coinler = [], hatalar = [];
  for (var i = 0; i < taranan.length; i++) {
    var c = taranan[i], mumlar = {};
    try {
      for (var k of [['d', 'Day1', 86400, 120], ['h4', 'Hour4', 14400, 200]]) {
        var j = await getJson('https://contract.mexc.com/api/v1/contract/kline/' + c.coin + '_USDT?interval=' + k[1] + '&start=' + (sn - k[2] * k[3]) + '&end=' + sn);
        var d = j && j.data;
        if (!d || !Array.isArray(d.time)) throw new Error('mum yok');
        // Yalnızca kapanmış mumlar: açık (son) mum plan hesabına girmez, plan 4 saat boyunca sabit kalır
        mumlar[k[0]] = d.time.map(function (x, n) { return { time: x, open: +d.open[n], high: +d.high[n], low: +d.low[n], close: +d.close[n] }; })
          .filter(function (m) { return m.time + k[2] <= sn; });
      }
      var o = planUret(c.coin, mumlar, c.fiyat, isFinite(c.funding) ? c.funding : undefined, i < AYAR.shortIlk);
      if (o.plan) { o.ozet = ozetYaz(o); o.kaynak = 'tarayici'; o.analizZamani = trZaman(simdi); o.cizim = { destek: o.plan.yon === 'long' ? [o.plan.giris] : [], direnc: o.plan.yon === 'short' ? [o.plan.giris] : [], trend: [] }; o.haberler = []; o.islemYok = ''; coinler.push(o); }
    } catch (e) { hatalar.push(c.coin + ': ' + String(e.message || e).slice(0, 60)); }
  }
  // Coinlerin yarısından fazlası okunamadıysa tarama başarısız sayılır (boş "taze" veri yayınlanmaz, iş kırmızı görünür)
  if (taranan.length && hatalar.length > taranan.length / 2) throw new Error('MEXC mumları okunamadı: ' + hatalar.length + '/' + taranan.length);
  // Kontrat detayı yoksa hisse/emtia ayıklanamadı: analiz listesi önerilmez (sunucu son listeyi kullanır)
  return { surum: 1, zaman: simdi, analizZamani: trZaman(simdi), taranan: taranan.length, hacimListesi: detayVar ? liste.slice(0, AYAR.analizListesi).map(function (x) { return x.coin; }) : [], coinler: coinler, hatalar: hatalar,
    elenenTradfi: detayVar ? Object.keys(tradfi).length : null };
}

module.exports = { AYAR: AYAR, tradfiMi: tradfiMi, ema: ema, trend: trend, planUret: planUret, evren: evren, trZaman: trZaman, tara: tara };

if (require.main === module) {
  var fs = require('fs'), hedef = process.argv[2] || 'tarayici.json';
  var bekle = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // MEXC açık veri sınırı için istekler arasında kısa bekleme; geçici hatada bir kez daha dene
  var getJson = async function (url) {
    for (var d = 0; d < 2; d++) {
      await bekle(150);
      try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* tekrar dene */ }
      await bekle(1000);
    }
    throw new Error('MEXC erişilemedi');
  };
  tara(getJson).then(function (s) {
    fs.writeFileSync(hedef, JSON.stringify(s));
    console.log('Tarandı: ' + s.taranan + ' coin, plan: ' + s.coinler.length + ' (' + s.coinler.map(function (c) { return c.coin + ' ' + c.plan.yon; }).join(', ') + '), hata: ' + s.hatalar.length);
  }).catch(function (e) { console.error('Tarama başarısız: ' + e.message); process.exit(1); });
}
