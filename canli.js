// dKc canlı fiyat: MEXC futures açık WebSocket akışı (anahtar yok, yalnızca okuma).
// Coin başına abonelik (tüm piyasa akışı telefonda çok veri harcar). Sayfa arka plandayken bağlantı kapanır.
(function () {
  'use strict';
  var ADRES = 'wss://contract.mexc.com/edge';
  var ARALIK = { m15: 'Min15', h1: 'Min60', h4: 'Hour4', d: 'Day1' };
  var ws = null, coinler = [], mum = null, bekleme = 2000, yenidenZaman = null, pingZaman = null, sonMesaj = 0;
  var fiyat = {}, dinleyenler = { fiyat: [], mum: [], durum: [], m15: [] }, durum = 'kapali', istenen = false;
  var mumTampon = {};  // { 'SOL_m15': [{time, open, high, low, close, vol}, ...] } (time: saniye)
  var m15Hesap = {};   // { 'SOL': { rsi, ema9, ema21, hacim, hacimOrt, kapanis, yon, sonZaman } }
  var MUMLIMIT = 100;  // her coin/tf için saklanan en fazla mum

  function yay(tur, veri) { dinleyenler[tur].forEach(function (f) { try { f(veri); } catch (e) { if (window.console) console.error(e); } }); }
  function durumYap(d) { if (d !== durum) { durum = d; yay('durum', d); } }
  function gonder(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  function abone(c) { gonder({ method: 'sub.ticker', param: { symbol: c + '_USDT' }, gzip: false }); }
  function mumAbone(m, ac) { if (m) gonder({ method: (ac ? 'sub' : 'unsub') + '.kline', param: { symbol: m.coin + '_USDT', interval: ARALIK[m.tf] }, gzip: false }); }

  function baglan() {
    if (ws || !istenen || document.hidden || !window.WebSocket) return;
    durumYap('baglaniyor');
    try { ws = new WebSocket(ADRES); } catch (e) { ws = null; planla(); return; }
    ws.onopen = function () {
      bekleme = 2000; sonMesaj = Date.now(); durumYap('bagli');
      coinler.forEach(abone); mumAbone(mum, true);
      clearInterval(pingZaman);
      pingZaman = setInterval(function () {
        gonder({ method: 'ping' });
        // 40 sn ses yoksa bağlantı ölmüştür (telefon uykudan dönünce olur)
        if (Date.now() - sonMesaj > 40000 && ws) { try { ws.close(); } catch (e) { /* yok say */ } }
      }, 15000);
    };
    ws.onmessage = function (ev) {
      sonMesaj = Date.now();
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.channel === 'push.ticker' && m.data && m.data.symbol) {
        var c = m.data.symbol.replace('_USDT', ''), d = m.data;
        fiyat[c] = { fiyat: Number(d.lastPrice), deg24: Math.round(Number(d.riseFallRate) * 10000) / 100, funding: Number(d.fundingRate), t: Date.now() };
        yay('fiyat', c);
      } else if (m.channel === 'push.kline' && m.data && mum && m.data.symbol === mum.coin + '_USDT' && m.data.interval === ARALIK[mum.tf]) {
        var k = m.data;
        var mumVeri = { time: k.t, open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), vol: Number(k.q) };
        var liste = mumEkle(mum.coin + '_' + mum.tf, mumVeri);
        yay('mum', { coin: mum.coin, tf: mum.tf, time: mumVeri.time, open: mumVeri.open, high: mumVeri.high, low: mumVeri.low, close: mumVeri.close, vol: mumVeri.vol });
        if (mum.tf === 'm15') m15Guncelle(mum.coin, liste);
      }
    };
    ws.onclose = function () { ws = null; clearInterval(pingZaman); durumYap(istenen && !document.hidden ? 'kopuk' : 'kapali'); planla(); };
    ws.onerror = function () { /* onclose ardından gelir */ };
  }
  function planla() {
    clearTimeout(yenidenZaman);
    if (!istenen || document.hidden) return;
    yenidenZaman = setTimeout(baglan, bekleme); bekleme = Math.min(bekleme * 2, 60000);
  }
  function kapat() { clearTimeout(yenidenZaman); if (ws) { var w = ws; ws = null; w.onclose = null; try { w.close(); } catch (e) { /* yok say */ } } clearInterval(pingZaman); durumYap('kapali'); }

  document.addEventListener('visibilitychange', function () { if (document.hidden) kapat(); else { bekleme = 2000; baglan(); } });
  window.addEventListener('online', function () { bekleme = 2000; if (!ws) baglan(); });

  // ---- 15 dakikalık göstergeler (hesap.js sinyalSkoru için c.m15) ----
  // Akış yalnızca açık grafiğin mumunu gönderir; geçmiş mumlar m15Tohum ile grafik verisinden doldurulur.
  // Aynı zamanlı mum güncellenir, yenisi sona eklenir; eski mum (sırası bozuk) atılır
  function mumEkle(anahtar, m) {
    if (!mumTampon[anahtar]) mumTampon[anahtar] = [];
    var liste = mumTampon[anahtar], son = liste[liste.length - 1];
    if (son && son.time === m.time) liste[liste.length - 1] = m;
    else if (!son || m.time > son.time) liste.push(m);
    if (liste.length > MUMLIMIT) liste.shift();
    return liste;
  }
  function m15Guncelle(coin, liste) {
    var g = m15GostergeHesap(liste);
    if (g) { m15Hesap[coin] = g; yay('m15', { coin: coin, gosterge: g }); }
  }

  // EMA serisi: kapanış listesi ve periyot -> aynı uzunlukta liste (ilk n-1 eleman null)
  function emaSeri(kapanis, n) {
    var out = kapanis.map(function () { return null; });
    if (kapanis.length < n) return out;
    var k = 2 / (n + 1), ema = 0;
    // İlk n mumun basit ortalaması ile başla
    for (var i = 0; i < n; i++) ema += kapanis[i];
    ema /= n; out[n - 1] = ema;
    for (var j = n; j < kapanis.length; j++) { ema = kapanis[j] * k + ema * (1 - k); out[j] = ema; }
    return out;
  }

  // 15m mum listesinden göstergeler. Dönüş: { rsi, ema9, ema21, hacim, hacimOrt, kapanis, yon, sonZaman }
  // RSI hesap.js rsiSeri ile (aynı mantık tekrar yazılmaz). EMA'lar yuvarlanmaz: düşük fiyatlı coinde 0 olurdu.
  // Hacim: son KAPANMIŞ mum / ondan önceki 20 kapanmış mumun ortalaması (açık mum yarım olduğu için hep zayıf görünürdü)
  function m15GostergeHesap(liste) {
    var H = window.DKC_HESAP;
    if (!liste || liste.length < 30 || !H || !H.rsiSeri) return null;  // yeterli veri yok
    var kapanis = liste.map(function (m) { return m.close; });
    if (kapanis.some(function (x) { return !(x > 0); })) return null;
    var rsiListe = H.rsiSeri(kapanis, 14), rsi = rsiListe[rsiListe.length - 1];
    if (rsi == null) return null;
    var ema9Liste = emaSeri(kapanis, 9), ema21Liste = emaSeri(kapanis, 21);
    var ema9 = ema9Liste[ema9Liste.length - 1], ema21 = ema21Liste[ema21Liste.length - 1];
    var hacimler = liste.map(function (m) { return Number(m.vol); }), n = hacimler.length;
    var onceki = hacimler.slice(Math.max(0, n - 22), n - 2).filter(function (x) { return x >= 0; });
    var hacimOrt = onceki.length ? onceki.reduce(function (a, b) { return a + b; }, 0) / onceki.length : null;
    var sonHacim = hacimler[n - 2] >= 0 ? hacimler[n - 2] : null;
    // Yön: EMA9 / EMA21 hizası (%0,1 bant)
    var yon = 'yatay';
    if (ema9 > ema21 * 1.001) yon = 'yukari';
    else if (ema9 < ema21 * 0.999) yon = 'asagi';
    return {
      rsi: Math.round(rsi * 10) / 10,
      ema9: ema9,
      ema21: ema21,
      hacim: sonHacim,
      hacimOrt: hacimOrt,
      kapanis: kapanis[kapanis.length - 1],
      yon: yon,
      sonZaman: liste[liste.length - 1].time
    };
  }

  window.DKC_CANLI = {
    baslat: function (liste) {
      istenen = true;
      liste = (liste || []).map(function (c) { return String(c).toUpperCase(); });
      liste.filter(function (c) { return coinler.indexOf(c) < 0; }).forEach(abone);
      coinler = liste;
      baglan();
    },
    mumIzle: function (coin, tf) {
      var yeni = coin && ARALIK[tf] ? { coin: coin, tf: tf } : null;
      if (mum && yeni && mum.coin === yeni.coin && mum.tf === yeni.tf) return;
      mumAbone(mum, false); mum = yeni; mumAbone(mum, true);
    },
    fiyat: function (c) { var f = fiyat[c]; return f && Date.now() - f.t < 60000 ? f : null; },
    durum: function () { return durum; },
    // Son 15m göstergeleri; son mum 30 dakikadan eskiyse null (mum zamanı saniye)
    m15: function (coin) {
      var g = m15Hesap[coin];
      if (!g || Date.now() - g.sonZaman * 1000 > 2 * 15 * 60 * 1000) return null;
      return g;
    },
    // Grafik için inen 15m geçmişiyle tamponu doldurur (akış yalnızca açık mumu gönderir)
    m15Tohum: function (coin, mumlar) {
      if (!coin || !Array.isArray(mumlar)) return;
      // Geçmiş ile akıştan gelen mumlar zamana göre birleşir; aynı zamanda akıştaki (daha yeni) kalır
      var anahtar = coin + '_m15', birlesik = {};
      mumlar.forEach(function (m) {
        var t = Number(m.time); if (!(t > 0)) return;
        birlesik[t] = { time: t, open: Number(m.open), high: Number(m.high), low: Number(m.low), close: Number(m.close), vol: m.vol == null ? NaN : Number(m.vol) };
      });
      (mumTampon[anahtar] || []).forEach(function (m) { birlesik[m.time] = m; });
      mumTampon[anahtar] = Object.keys(birlesik).map(Number).sort(function (x, y) { return x - y; }).slice(-MUMLIMIT).map(function (t) { return birlesik[t]; });
      m15Guncelle(coin, mumTampon[anahtar]);
    },
    on: function (tur, fn) { dinleyenler[tur].push(fn); }
  };
})();
