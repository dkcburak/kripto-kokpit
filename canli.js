// dKc canlı fiyat: MEXC futures açık WebSocket akışı (anahtar yok, yalnızca okuma).
// Coin başına abonelik (tüm piyasa akışı telefonda çok veri harcar). Sayfa arka plandayken bağlantı kapanır.
(function () {
  'use strict';
  var ADRES = 'wss://contract.mexc.com/edge';
  var ARALIK = { m15: 'Min15', h1: 'Min60', h4: 'Hour4', d: 'Day1' };
  var ws = null, coinler = [], mum = null, bekleme = 2000, yenidenZaman = null, pingZaman = null, sonMesaj = 0;
  var fiyat = {}, dinleyenler = { fiyat: [], mum: [], durum: [] }, durum = 'kapali', istenen = false;

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
        var k = m.data; yay('mum', { coin: mum.coin, tf: mum.tf, time: k.t, open: k.o, high: k.h, low: k.l, close: k.c, vol: k.q });
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
    on: function (tur, fn) { dinleyenler[tur].push(fn); }
  };
})();
