(function () {
  'use strict';
  var AYAR = window.KOKPIT_AYAR || {};
  var durum = { veri: null, filtre: 'hepsi', tf: 'h4', grafik: null, yuklemeHata: '' };
  var ADI = { long: 'Long hazırlığı', short: 'Short hazırlığı', bekle: 'Bekle', uzak: 'Uzak dur' };
  var SIRA = { long: 0, short: 0, bekle: 1, uzak: 2 };
  var TF_ADI = { d: '1 gün', h4: '4 saat', h1: '1 saat' };
  var YON = { yukari: ['Yukarı', 'var(--long)'], asagi: ['Aşağı', 'var(--short)'], yatay: ['Yatay', 'var(--bekle)'], onay: ['Onay var', 'var(--long)'], bekliyor: ['Onay bekleniyor', 'var(--bekle)'], yok: ['Sinyal yok', 'var(--uzak)'] };
  var ALARM_ADI = { giris: 'Giriş bölgesi', stop: 'Stop', tp1: 'Hedef 1', tp2: 'Hedef 2', ani: 'Ani hareket' };
  var $ = function (id) { return document.getElementById(id); };
  var MASA = window.matchMedia('(min-width:1100px)');
  var TAM_IKON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var KUCUK_IKON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- Biçim ----------
  function basamak(x) { x = Math.abs(x); return x >= 1000 ? 0 : x >= 100 ? 1 : x >= 10 ? 2 : x >= 1 ? 3 : x >= 0.1 ? 4 : 5; }
  function f(x, d) { if (x == null || isNaN(x)) return '–'; d = d == null ? basamak(x) : d; return Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function yuzde(x, isaret) { if (x == null || isNaN(x)) return '–'; return (isaret && x > 0 ? '+' : '') + f(x, Math.abs(x) < 10 ? 1 : 0) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rozet(d) { return '<span class="durum d-' + d + '">' + ADI[d] + '</span>'; }

  // ---------- Plan hesapları (%1 risk, en fazla 5x) ----------
  function planHesap(p) {
    var giris = (p.giris[0] + p.giris[1]) / 2, risk = Math.abs(giris - p.stop), stopYuzde = risk / giris;
    var r1 = Math.abs(p.tp1 - giris) / risk, r2 = Math.abs(p.tp2 - giris) / risk;
    var poz = 0.01 / stopYuzde * 100;
    var maxKal = Math.min(5, Math.floor(1 / (2 * stopYuzde)));
    var kal = Math.max(1, Math.ceil(poz / 100));
    return { giris: giris, stopYuzde: stopYuzde * 100, r1: r1, r2: r2, poz: poz, kal: kal, kalUygun: kal <= maxKal, maxKal: maxKal };
  }
  function giriseUzaklik(c) {
    if (!c.plan) return null;
    var g = c.plan.yon === 'short' ? c.plan.giris[0] : c.plan.giris[1];
    return (c.fiyat - g) / g * 100 * (c.plan.yon === 'short' ? -1 : 1);
  }

  // ---------- Veri ----------
  function api(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(AYAR.api + '?k=' + encodeURIComponent(AYAR.anahtar) + '&' + q).then(function (r) { if (!r.ok) throw new Error('Sunucu ' + r.status); return r.json(); })
      .then(function (j) { if (j.hata) throw new Error(j.hata); return j; });
  }
  function ozetYukle() {
    if (!AYAR.api) { durum.veri = window.KOKPIT_ORNEK; return Promise.resolve(); }
    return api({ f: 'ozet' }).then(function (j) { durum.veri = j; durum.yuklemeHata = ''; try { localStorage.setItem('kokpit-son', JSON.stringify(j)); } catch (e) {} })
      .catch(function (e) { durum.yuklemeHata = e.message; if (!durum.veri) { try { durum.veri = JSON.parse(localStorage.getItem('kokpit-son')); } catch (x) {} } });
  }
  function mumYukle(coin, tf, fiyat) {
    if (!AYAR.api) return Promise.resolve(window.KOKPIT_ORNEK_MUM(coin, tf, fiyat));
    return api({ f: 'mum', coin: coin, tf: tf }).then(function (j) { return j.mumlar; });
  }

  // ---------- Ekranlar ----------
  function ustBilgi() {
    var v = durum.veri; if (!v) return;
    $('zaman').innerHTML = 'Analiz: ' + esc(v.analizZamani || '–') + (v.fiyatZamani ? '<br>Fiyat: ' + esc(v.fiyatZamani) : '');
    var n = (v.tetiklenen || []).filter(function (t) { return t.yeni; }).length;
    $('zilSayi').hidden = !n; $('zilSayi').textContent = n;
  }
  function piyasaHtml(p) {
    if (!p) return '';
    var renk = p.mod === 'Risk açık' ? 'var(--long)' : p.mod === 'Riskten kaçış' ? 'var(--short)' : 'var(--bekle)';
    return '<section class="piyasa" aria-label="Piyasa durumu"><span class="mod"><span class="isik" style="background:' + renk + '"></span>Piyasa: ' + esc(p.mod) + '</span>' +
      '<span class="kv">BTC yönü <b>' + esc(p.btc) + '</b></span>' +
      (p.korku ? '<span class="kv">Korku/Açgözlülük <b>' + esc(p.korku.deger) + ' · ' + esc(p.korku.etiket) + '</b></span>' : '') +
      (p.not ? '<span class="kv" style="flex-basis:100%">' + esc(p.not) + '</span>' : '') + '</section>';
  }
  function kartHtml(c) {
    var u = giriseUzaklik(c), alt;
    if (c.plan && u != null) alt = u <= 0 ? 'Giriş bölgesinde' : 'Girişe ' + yuzde(u) + ' kaldı';
    else alt = c.islemYok || c.ozet || '';
    var bar = '';
    if (c.plan && u != null) { var dol = Math.max(4, Math.min(100, 100 - u * 12)); bar = '<span class="yakinlik" title="Girişe yakınlık" aria-hidden="true"><i style="width:' + dol + '%;background:' + (c.durum === 'short' ? 'var(--short)' : 'var(--long)') + '"></i></span>'; }
    return '<a class="kart" href="#/coin/' + encodeURIComponent(c.coin) + '" aria-label="' + esc(c.coin) + ' ayrıntı">' +
      '<span class="rozet">' + esc(c.coin.slice(0, 4)) + '</span>' +
      '<span class="orta"><span class="ad">' + esc(c.coin) + '</span><span class="alt">' + esc(alt) + '</span></span>' +
      '<span class="sag"><span class="fiyat sayi">' + f(c.fiyat) + '</span><span class="degisim sayi ' + (c.deg24 >= 0 ? 'art' : 'eks') + '">' + yuzde(c.deg24, true) + '</span></span>' +
      '<span class="kart-alt">' + rozet(c.durum) + bar + '</span></a>';
  }
  function sirali(coinler) {
    return coinler.slice().sort(function (a, b) {
      return (SIRA[a.durum] - SIRA[b.durum]) || ((giriseUzaklik(a) == null ? 99 : giriseUzaklik(a)) - (giriseUzaklik(b) == null ? 99 : giriseUzaklik(b)));
    });
  }
  function anaEkran() {
    var v = durum.veri;
    var liste = sirali(v.coinler);
    var say = function (d) { return v.coinler.filter(function (c) { return d === 'hazir' ? (c.durum === 'long' || c.durum === 'short') : c.durum === d; }).length; };
    if (durum.filtre !== 'hepsi') liste = liste.filter(function (c) { return durum.filtre === 'hazir' ? (c.durum === 'long' || c.durum === 'short') : c.durum === durum.filtre; });
    var filtreler = [['hepsi', 'Tümü (' + v.coinler.length + ')'], ['hazir', 'Hazırlık (' + say('hazir') + ')'], ['bekle', 'Bekle (' + say('bekle') + ')'], ['uzak', 'Uzak dur (' + say('uzak') + ')']];
    return (v.ornek ? '<div class="ornek-bant">Taslak görünüm: rakamlar örnektir, gerçek veri bağlanınca değişecek.</div>' : '') +
      (durum.yuklemeHata ? '<div class="ornek-bant">Güncel veri alınamadı, son kayıtlı veri gösteriliyor.</div>' : '') +
      piyasaHtml(v.piyasa) +
      '<div class="filtre" role="group" aria-label="Filtre">' + filtreler.map(function (x) { return '<button data-filtre="' + x[0] + '" aria-pressed="' + (durum.filtre === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<section class="izgara">' + (liste.map(kartHtml).join('') || '<p class="bos">Bu filtrede coin yok.</p>') + '</section>' +
      '<p class="uyari">Yatırım tavsiyesi değildir. Analiz günde 2 kez yenilenir. Emirleri MEXC’de siz verirsiniz; kaldıraçta likidasyon riski vardır.</p>';
  }
  // ---------- Masaüstü: sol coin listesi ----------
  function yanListeHtml(aktif) {
    var q = (durum.ara || '').trim().toUpperCase();
    var liste = sirali(durum.veri.coinler).filter(function (c) { return !q || c.coin.indexOf(q) >= 0; });
    return liste.map(function (c) {
      var u = giriseUzaklik(c), alt = ADI[c.durum] + (c.plan && u != null ? (u <= 0 ? ' · girişte' : ' · girişe ' + yuzde(u)) : '');
      return '<a class="yan-satir' + (c.coin === aktif ? ' aktif' : '') + '" href="#/coin/' + encodeURIComponent(c.coin) + '"' + (c.coin === aktif ? ' aria-current="page"' : '') + '>' +
        '<span class="ys-nokta" style="background:var(--' + c.durum + ')"></span><span class="ys-ad">' + esc(c.coin) + '</span>' +
        '<span class="ys-fiyat sayi">' + f(c.fiyat) + '</span><span class="ys-alt">' + esc(alt) + '</span>' +
        '<span class="ys-deg sayi ' + (c.deg24 >= 0 ? 'art' : 'eks') + '">' + yuzde(c.deg24, true) + '</span></a>';
    }).join('') || '<p class="bos" style="padding:8px 14px">Eşleşen coin yok.</p>';
  }
  function yanHtml(aktif) {
    return '<div class="yan-ust"><input id="ara" type="search" placeholder="Coin ara" autocomplete="off" aria-label="Coin ara" value="' + esc(durum.ara || '') + '"></div>' +
      '<div class="yan-baslik"><span>Coin</span><span>Fiyat · 24s</span></div><div class="yan-liste" id="yanListe">' + yanListeHtml(aktif) + '</div>';
  }
  function aktifCoin() { var m = location.hash.match(/^#\/coin\/([^/]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function yanGuncelle() {
    if (!MASA.matches) { $('yan').innerHTML = ''; return; }
    var l = $('yanListe');
    if (l) l.innerHTML = yanListeHtml(aktifCoin()); else $('yan').innerHTML = yanHtml(aktifCoin());
  }

  // ---------- Masaüstü: genel bakış ----------
  function sinyalNoktalari(tf) {
    tf = tf || {};
    return '<span class="sinyal">' + ['d', 'h4', 'h1'].map(function (k) { var y = YON[tf[k]] || YON.yok; return '<i title="' + TF_ADI[k] + ': ' + y[0] + '" style="background:' + y[1] + '"></i>'; }).join('') + '</span>';
  }
  function anaEkranMasa() {
    var v = durum.veri, al = v.alarmlar || [], tet = v.tetiklenen || [];
    var hazir = v.coinler.filter(function (c) { return c.plan && (c.durum === 'long' || c.durum === 'short'); });
    var yakin = sirali(hazir)[0], yu = yakin ? giriseUzaklik(yakin) : null;
    var kutu = function (etiket, deger, alt, renk) { return '<div class="kutu"><span class="k-et">' + etiket + '</span><span class="k-deger"' + (renk ? ' style="color:' + renk + '"' : '') + '>' + deger + '</span><span class="k-alt">' + alt + '</span></div>'; };
    var son = tet[0];
    var kutular = '<div class="kutular">' +
      kutu('Hazır plan', hazir.length + ' coin', hazir.length ? hazir.map(function (c) { return esc(c.coin); }).join(', ') : 'Şu an kurulum yok', hazir.length ? 'var(--long)' : '') +
      kutu('Girişe en yakın', yakin ? esc(yakin.coin) : '–', yakin ? (yu <= 0 ? 'Giriş bölgesinde' : 'Girişe ' + yuzde(yu) + ' kaldı') : 'Aktif plan yok') +
      kutu('Bekleyen alarm', String(al.length), 'Telefonunuza bildirim gelir') +
      kutu('Son çalan alarm', son ? esc(son.coin) : 'Yok', son ? esc(ALARM_ADI[son.tur] || son.tur) + ' · ' + esc(son.zaman) : 'Henüz alarm çalmadı', son ? 'var(--vurgu)' : '') + '</div>';

    var liste = sirali(v.coinler);
    var say = function (d) { return v.coinler.filter(function (c) { return d === 'hazir' ? (c.durum === 'long' || c.durum === 'short') : c.durum === d; }).length; };
    if (durum.filtre !== 'hepsi') liste = liste.filter(function (c) { return durum.filtre === 'hazir' ? (c.durum === 'long' || c.durum === 'short') : c.durum === durum.filtre; });
    var filtreler = [['hepsi', 'Tümü (' + v.coinler.length + ')'], ['hazir', 'Hazırlık (' + say('hazir') + ')'], ['bekle', 'Bekle (' + say('bekle') + ')'], ['uzak', 'Uzak dur (' + say('uzak') + ')']];
    var tablo = '<section class="blok tablo-blok"><div class="blok-ust"><h2>Piyasa tablosu</h2><div class="filtre" role="group" aria-label="Filtre">' +
      filtreler.map(function (x) { return '<button data-filtre="' + x[0] + '" aria-pressed="' + (durum.filtre === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<table class="tablo"><thead><tr><th>Coin</th><th class="sag-h">Fiyat</th><th class="sag-h">24s</th><th>Durum</th><th title="1 gün · 4 saat · 1 saat">Yön 1G·4S·1S</th><th class="sag-h">Girişe</th><th>Ne yapmalı</th></tr></thead><tbody>' +
      liste.map(function (c) {
        var u = giriseUzaklik(c);
        return '<tr data-git="#/coin/' + encodeURIComponent(c.coin) + '"><td><a href="#/coin/' + encodeURIComponent(c.coin) + '" class="t-coin"><span class="rozet kucuk">' + esc(c.coin.slice(0, 4)) + '</span>' + esc(c.coin) + '</a></td>' +
          '<td class="sayi sag-h">' + f(c.fiyat) + '</td><td class="sayi sag-h ' + (c.deg24 >= 0 ? 'art' : 'eks') + '">' + yuzde(c.deg24, true) + '</td>' +
          '<td>' + rozet(c.durum) + '</td><td>' + sinyalNoktalari(c.tf) + '</td>' +
          '<td class="sayi sag-h">' + (c.plan && u != null ? (u <= 0 ? '<b class="art">Girişte</b>' : yuzde(u)) : '<span class="soluk">–</span>') + '</td>' +
          '<td class="t-ozet">' + esc(c.ozet || c.islemYok || '') + '</td></tr>';
      }).join('') + '</tbody></table>' + (liste.length ? '' : '<p class="bos">Bu filtrede coin yok.</p>') + '</section>';

    var planlar = '<section class="blok"><h2>Hazır planlar</h2>' + (hazir.length ? '<div class="plan-kartlar">' + sirali(hazir).map(function (c) {
      var p = c.plan, h = planHesap(p), u = giriseUzaklik(c);
      return '<a class="plan-kart" href="#/coin/' + encodeURIComponent(c.coin) + '"><span class="pk-ust"><b>' + esc(c.coin) + '</b>' + rozet(c.durum) + '<span class="sayi pk-fiyat">' + f(c.fiyat) + '</span></span>' +
        '<span class="pk-satir"><span>Giriş</span><span class="sayi">' + f(p.giris[0]) + ' – ' + f(p.giris[1]) + '</span></span>' +
        '<span class="pk-satir"><span>Stop</span><span class="sayi eks">' + f(p.stop) + '</span></span>' +
        '<span class="pk-satir"><span>Hedef 1 · 2</span><span class="sayi art">' + f(p.tp1) + ' · ' + f(p.tp2) + '</span></span>' +
        '<span class="pk-satir"><span>Kazanç/risk</span><span class="sayi">' + f(h.r1, 1) + ' · ' + f(h.r2, 1) + '</span></span>' +
        '<span class="pk-alt">' + (u <= 0 ? 'Fiyat giriş bölgesinde' : 'Girişe ' + yuzde(u) + ' kaldı') + '</span></a>';
    }).join('') + '</div>' : '<p class="bos">Şu an hazır plan yok. Analiz günde 2 kez yenilenir.</p>') + '</section>';

    var renk = function (t) { return t === 'stop' ? 'var(--short)' : t === 'giris' ? 'var(--mavi)' : t === 'ani' ? 'var(--bekle)' : 'var(--long)'; };
    var alarmlar = '<section class="blok"><div class="blok-ust"><h2>Son çalan alarmlar</h2><a class="link" href="#/alarmlar">Tümü →</a></div><div class="liste">' + (tet.length ? tet.slice(0, 5).map(function (t) {
      return '<a class="satir" href="#/coin/' + encodeURIComponent(t.coin) + '"><span class="nokta" style="background:' + renk(t.tur) + '"></span><span class="ust-yazi">' + esc(t.coin) + ' · ' + esc(ALARM_ADI[t.tur] || t.tur) + '</span><span class="sag sayi">' + f(t.fiyat) + '</span><span class="alt-yazi">' + esc(t.zaman) + '</span></a>';
    }).join('') : '<p class="bos">Henüz çalan alarm yok.</p>') + '</div></section>';

    var haberler = [];
    v.coinler.forEach(function (c) { (c.haberler || []).forEach(function (h) { haberler.push({ coin: c.coin, h: h }); }); });
    var etkiSira = { 'Yüksek': 0, 'Orta': 1, 'Düşük': 2 };
    haberler.sort(function (a, b) { return (etkiSira[a.h.etki] == null ? 3 : etkiSira[a.h.etki]) - (etkiSira[b.h.etki] == null ? 3 : etkiSira[b.h.etki]); });
    var haber = '<section class="blok"><h2>Haber akışı</h2>' + (haberler.length ? haberler.slice(0, 6).map(function (x) {
      var h = x.h;
      return '<div class="haber"><a href="' + esc(h.url) + '" target="_blank" rel="noopener"><span class="h-coin">' + esc(x.coin) + '</span>' + esc(h.baslik) + '</a>' +
        '<span class="etiketler"><span>Etki: ' + esc(h.etki) + '</span><span>' + esc(h.yon) + '</span><span>' + esc(h.kaynak) + ' · ' + esc(h.zaman) + '</span></span></div>';
    }).join('') : '<p class="bos">Son 24 saatte önemli haber yok.</p>') + '</section>';

    return (v.ornek ? '<div class="ornek-bant">Taslak görünüm: rakamlar örnektir, gerçek veri bağlanınca değişecek.</div>' : '') +
      (durum.yuklemeHata ? '<div class="ornek-bant">Güncel veri alınamadı, son kayıtlı veri gösteriliyor.</div>' : '') +
      piyasaHtml(v.piyasa) + kutular +
      planlar + tablo + '<div class="masa-iki">' + alarmlar + haber + '</div>' +
      '<p class="uyari">Yatırım tavsiyesi değildir. Analiz günde 2 kez yenilenir. Emirleri MEXC’de siz verirsiniz; kaldıraçta likidasyon riski vardır.</p>';
  }

  function tfSatir(tf) {
    return '<div class="zd">' + ['d', 'h4', 'h1'].map(function (k) { var y = YON[tf[k]] || YON.yok; return '<span><span class="isik" style="background:' + y[1] + ';margin:0"></span>' + TF_ADI[k] + ': <b style="color:var(--yazi);font-weight:600">' + y[0] + '</b></span>'; }).join('') + '</div>';
  }
  function planHtml(c) {
    if (!c.plan) return '<section class="blok"><h2>İşlem planı</h2><p class="islem-yok"><b style="color:var(--yazi)">Şu an işlem yok.</b> ' + esc(c.islemYok || 'Uygun kurulum bekleniyor.') + '</p></section>';
    var p = c.plan, h = planHesap(p), yon = p.yon === 'short' ? 'Short' : 'Long';
    return '<section class="blok"><h2>' + yon + ' planı</h2><dl class="plan">' +
      '<dt>Giriş bölgesi</dt><dd class="sayi">' + f(p.giris[0]) + ' – ' + f(p.giris[1]) + '</dd>' +
      '<dt>Stop</dt><dd class="sayi eks">' + f(p.stop) + ' <span style="color:var(--sonuk)">(' + yuzde(h.stopYuzde) + ')</span></dd>' +
      '<dt>Hedef 1 · yarısını kapat, stopu girişe çek</dt><dd class="sayi art">' + f(p.tp1) + '</dd>' +
      '<dt>Hedef 2</dt><dd class="sayi art">' + f(p.tp2) + '</dd>' +
      '<span class="sep"></span>' +
      '<dt>Kazanç / risk (Hedef 1 · Hedef 2)</dt><dd class="sayi">' + f(h.r1, 1) + ' · ' + f(h.r2, 1) + '</dd>' +
      '<dt>Pozisyon (%1 risk)</dt><dd class="sayi">sermayenin %' + f(h.poz, 0) + '’i</dd>' +
      '<dt>Kaldıraç</dt><dd class="sayi">' + (h.kalUygun ? (h.kal === 1 ? 'gerekmez (1x)' : h.kal + 'x yeterli') : 'pozisyonu küçültün') + '</dd>' +
      '</dl><p class="plan-not">' + esc(p.gecersiz) + ' Emir kararı sizindir.</p></section>';
  }
  function haberHtml(c) {
    var hs = (c.haberler || []).slice(0, 3);
    return '<section class="blok"><h2>Haberler</h2>' + (hs.length ? hs.map(function (h) {
      return '<div class="haber"><a href="' + esc(h.url) + '" target="_blank" rel="noopener">' + esc(h.baslik) + '</a><span style="font-size:13px;color:var(--sonuk)">' + esc(h.ozet) + '</span>' +
        '<span class="etiketler"><span>Etki: ' + esc(h.etki) + '</span><span>' + esc(h.yon) + '</span><span>' + esc(h.kaynak) + ' · ' + esc(h.zaman) + '</span></span></div>';
    }).join('') : '<p class="bos">Son 24 saatte önemli haber yok.</p>') + '</section>';
  }
  function detayEkran(coin) {
    var c = durum.veri.coinler.filter(function (x) { return x.coin === coin; })[0];
    if (!c) return '<a class="geri" href="#/">← Coinler</a><p class="bos">' + esc(coin) + ' listede yok.</p>';
    return '<a class="geri" href="#/">← Coinler</a>' +
      '<div class="baslik"><h1>' + esc(c.coin) + '</h1><span class="fiyat sayi">' + f(c.fiyat) + '</span><span class="degisim sayi ' + (c.deg24 >= 0 ? 'art' : 'eks') + '">' + yuzde(c.deg24, true) + ' (24s)</span></div>' +
      '<div class="detay"><section class="blok ne-yap">' + rozet(c.durum) + '<p>' + esc(c.ozet) + '</p>' + tfSatir(c.tf || {}) + '</section>' +
      '<section class="blok grafik-blok"><div class="grafik-ust"><h2 style="margin:0">Grafik<span class="tam-baslik"> · ' + esc(c.coin) + ' <span class="sayi">' + f(c.fiyat) + '</span></span></h2><div class="grafik-arac"><div class="sekmeler" role="group" aria-label="Zaman dilimi">' +
      ['d', 'h4', 'h1'].map(function (k) { return '<button data-tf="' + k + '" aria-pressed="' + (durum.tf === k) + '">' + { d: '1G', h4: '4S', h1: '1S' }[k] + '</button>'; }).join('') +
      '</div><button class="tam-dugme" id="tamEkran" title="Tam ekran (F)">' + TAM_IKON + '<span>Tam ekran</span></button></div></div><div id="grafik" role="img" aria-label="' + esc(c.coin) + ' mum grafiği, destek, direnç ve plan çizgileriyle"></div>' +
      '<div class="lejant"><span><i style="background:var(--mavi)"></i>Destek</span><span><i style="background:var(--bekle)"></i>Direnç</span><span><i style="background:var(--ema)"></i>Ortalama (EMA50)</span>' +
      (c.plan ? '<span><i style="background:var(--short)"></i>Stop</span><span><i style="background:var(--long)"></i>Hedefler</span>' : '') + '</div></section>' +
      '<div class="detay-sag">' + planHtml(c) + haberHtml(c) + '</div></div>' +
      '<p class="uyari">Yatırım tavsiyesi değildir. Seviyeler ' + esc(durum.veri.analizZamani || '') + ' analizinden. Fiyat girişten önce stopu geçerse plan iptal olur.</p>';
  }
  function alarmEkran() {
    var v = durum.veri, al = v.alarmlar || [], tet = v.tetiklenen || [];
    var renk = function (t) { return t === 'stop' ? 'var(--short)' : t === 'giris' ? 'var(--mavi)' : t === 'ani' ? 'var(--bekle)' : 'var(--long)'; };
    var bildirimDurumu = window.KOKPIT_BILDIRIM ? window.KOKPIT_BILDIRIM.durum() : 'kapali';
    return '<section class="blok bildirim"><div><h2 style="margin:0">Telefon bildirimleri</h2><p>' +
      (bildirimDurumu === 'acik' ? 'Açık. Alarm çaldığında telefonunuza bildirim gelir.' : bildirimDurumu === 'kurulmadi' ? 'Bildirim servisi kurulunca buradan açabileceksiniz.' : bildirimDurumu === 'desteklenmiyor' ? 'Bildirim için uygulamayı önce ana ekrana ekleyin, sonra oradan açın.' : 'Kapalı. Açınca alarm çaldığında telefonunuza bildirim gelir.') + '</p></div>' +
      (bildirimDurumu === 'acik' ? '<span class="durum d-long">Açık</span>' : '<button class="dugme" id="bildirimAc"' + (bildirimDurumu === 'desteklenmiyor' || bildirimDurumu === 'kurulmadi' ? ' disabled style="opacity:.5"' : '') + '>Bildirimleri aç</button>') + '</section>' +
      '<div class="alarm-iki"><section class="blok"><h2>Bekleyen alarmlar (' + al.length + ')</h2><div class="liste">' + (al.length ? al.map(function (a) {
        return '<a class="satir" href="#/coin/' + encodeURIComponent(a.coin) + '"><span class="nokta" style="background:' + renk(a.tur) + '"></span><span class="ust-yazi">' + esc(a.coin) + ' · ' + esc(ALARM_ADI[a.tur] || a.tur) + '</span>' +
          '<span class="sag sayi">' + (a.tur === 'ani' ? '1 saatte ±%' + f(a.seviye, 0) : f(a.seviye)) + '</span><span class="alt-yazi">' + (a.tur === 'ani' ? 'Sert hareket olursa haber verir' : 'Fiyat bu seviyeye gelince haber verir') + '</span></a>';
      }).join('') : '<p class="bos">Aktif plan olmadığı için alarm yok.</p>') + '</div></section>' +
      '<section class="blok"><h2>Son çalan alarmlar</h2><div class="liste">' + (tet.length ? tet.map(function (t) {
        return '<a class="satir" href="#/coin/' + encodeURIComponent(t.coin) + '"><span class="nokta" style="background:' + renk(t.tur) + '"></span><span class="ust-yazi">' + esc(t.coin) + ' · ' + esc(ALARM_ADI[t.tur] || t.tur) + '</span>' +
          '<span class="sag sayi">' + f(t.fiyat) + '</span><span class="alt-yazi">' + esc(t.zaman) + '</span></a>';
      }).join('') : '<p class="bos">Henüz çalan alarm yok.</p>') + '</div></section></div>' +
      '<p class="uyari">Alarmlar bilgi amaçlıdır. Gerçek koruma için stop emrinizi MEXC’de verin.</p>';
  }

  // ---------- Grafik ----------
  function ema(veri, n) { var k = 2 / (n + 1), e = null; return veri.map(function (m) { e = e == null ? m.close : m.close * k + e * (1 - k); return { time: m.time, value: e }; }); }
  function grafikKur(c) {
    var kutu = $('grafik'); if (!kutu || !window.LightweightCharts) return;
    if (durum.grafik) { try { durum.grafik.grafik.remove(); } catch (e) {} durum.grafik = null; }
    kutu.innerHTML = '';
    var css = getComputedStyle(document.documentElement), r = function (n) { return css.getPropertyValue(n).trim(); };
    var g = LightweightCharts.createChart(kutu, {
      autoSize: true, layout: { background: { color: 'transparent' }, textColor: r('--sonuk'), fontFamily: 'IBM Plex Sans, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: r('--cizgi') }, timeScale: { borderColor: r('--cizgi'), timeVisible: durum.tf !== 'd' },
      crosshair: { mode: 0 }, localization: { locale: 'tr-TR', priceFormatter: function (x) { return f(x); } }
    });
    var cz = c.cizim || {}, seviyeler = [];
    if (c.plan) seviyeler.push(c.plan.stop, c.plan.tp1, c.plan.tp2);
    (cz.destek || []).concat(cz.direnc || []).forEach(function (b) { seviyeler.push(b[0], b[1]); });
    var mum = g.addCandlestickSeries({
      autoscaleInfoProvider: function (asil) { var a = asil(); if (!a || !a.priceRange) return a; var lo = a.priceRange.minValue, hi = a.priceRange.maxValue, ara = hi - lo;
        seviyeler.forEach(function (v) { if (v < lo && lo - v < ara * 1.5) lo = v; if (v > hi && v - hi < ara * 1.5) hi = v; }); return { priceRange: { minValue: lo, maxValue: hi }, margins: { above: 8, below: 8 } }; }, upColor: r('--long'), downColor: r('--short'), wickUpColor: r('--long'), wickDownColor: r('--short'), borderVisible: false, priceFormat: { type: 'price', precision: basamak(c.fiyat), minMove: Math.pow(10, -basamak(c.fiyat)) } });
    var ort = g.addLineSeries({ color: r('--ema'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    var cizgi = function (fiyat, renk, baslik, kesik) { mum.createPriceLine({ price: fiyat, color: renk, lineWidth: kesik ? 1 : 2, lineStyle: kesik ? 2 : 0, axisLabelVisible: true, title: baslik }); };
    (cz.destek || []).forEach(function (b) { cizgi(b[1], r('--mavi'), 'Destek', true); cizgi(b[0], r('--mavi'), '', true); });
    (cz.direnc || []).forEach(function (b) { cizgi(b[1], r('--bekle'), 'Direnç', true); cizgi(b[0], r('--bekle'), '', true); });
    if (c.plan) { cizgi(c.plan.stop, r('--short'), 'Stop', false); cizgi(c.plan.tp1, r('--long'), 'Hedef 1', false); cizgi(c.plan.tp2, r('--long'), 'Hedef 2', false); }
    var kayit = { grafik: g }; durum.grafik = kayit;
    var bolgeler = [];
    (cz.destek || []).forEach(function (b) { bolgeler.push([b, 'rgba(90,169,255,0.13)']); });
    (cz.direnc || []).forEach(function (b) { bolgeler.push([b, 'rgba(230,176,74,0.13)']); });
    var katman = document.createElement('div'); katman.style.cssText = 'position:absolute;left:0;top:0;right:0;overflow:hidden;pointer-events:none;z-index:2';
    kutu.appendChild(katman);
    function bolgeCiz() {
      if (durum.grafik !== kayit) return;
      var gen = kutu.clientWidth - g.priceScale('right').width();
      katman.style.height = (kutu.clientHeight - g.timeScale().height()) + 'px';
      katman.innerHTML = bolgeler.map(function (z) {
        var y1 = mum.priceToCoordinate(z[0][1]), y2 = mum.priceToCoordinate(z[0][0]);
        if (y1 == null || y2 == null) return '';
        return '<div style="position:absolute;left:0;width:' + gen + 'px;top:' + Math.min(y1, y2) + 'px;height:' + Math.max(2, Math.abs(y2 - y1)) + 'px;background:' + z[1] + '"></div>';
      }).join('');
    }
    var bekliyor = false; function planla() { if (bekliyor) return; bekliyor = true; requestAnimationFrame(function () { bekliyor = false; bolgeCiz(); }); }
    mumYukle(c.coin, durum.tf, c.fiyat).then(function (veri) {
      if (!veri || !veri.length) return;
      mum.setData(veri); ort.setData(ema(veri, 50).slice(49));
      (cz.trend || []).forEach(function (t) {
        var s = g.addLineSeries({ color: r('--bekle'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([{ time: t.t1, value: t.p1 }, { time: t.t2, value: t.p2 }]);
      });
      g.timeScale().setVisibleLogicalRange({ from: veri.length - (durum.tf === 'h1' ? 72 : 60), to: veri.length + 4 });
      planla();
    }).catch(function () { kutu.insertAdjacentHTML('beforeend', '<p class="bos" style="position:absolute;inset:40% 0 auto;text-align:center">Grafik verisi alınamadı.</p>'); });
    g.timeScale().subscribeVisibleLogicalRangeChange(planla);
    g.subscribeCrosshairMove(planla);
    new ResizeObserver(planla).observe(kutu);
    kutu.addEventListener('wheel', planla, { passive: true });
    kutu.addEventListener('pointermove', planla, { passive: true });
  }

  // ---------- Tam ekran grafik ----------
  function tamAcikMi() { var b = document.querySelector('.grafik-blok'); return !!b && (document.fullscreenElement === b || b.classList.contains('tam-ekran')); }
  function tamDugmeGuncelle() {
    var d = $('tamEkran'); if (!d) return; var acik = tamAcikMi();
    d.innerHTML = (acik ? KUCUK_IKON : TAM_IKON) + '<span>' + (acik ? 'Küçült' : 'Tam ekran') + '</span>';
    d.setAttribute('aria-label', acik ? 'Tam ekrandan çık' : 'Grafiği tam ekran aç');
    document.body.classList.toggle('kilit', acik);
  }
  function tamEkran(ac) {
    var b = document.querySelector('.grafik-blok'); if (!b) return;
    if (ac == null) ac = !tamAcikMi();
    if (ac) {
      // iPhone Safari öğe tam ekranını desteklemez; orada sayfayı kaplayan görünüm kullanılır
      if (b.requestFullscreen) b.requestFullscreen().catch(function () { b.classList.add('tam-ekran'); tamDugmeGuncelle(); });
      else b.classList.add('tam-ekran');
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      b.classList.remove('tam-ekran');
    }
    tamDugmeGuncelle();
  }
  document.addEventListener('fullscreenchange', tamDugmeGuncelle);
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'Escape' && tamAcikMi()) tamEkran(false);
    else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && document.querySelector('.grafik-blok')) tamEkran();
  });

  // ---------- Yönlendirme ----------
  function goster() {
    if (!durum.veri) { $('ekran').innerHTML = '<div class="iskelet"></div><div class="iskelet"></div><div class="iskelet"></div>'; return; }
    ustBilgi();
    document.body.classList.remove('kilit');
    yanGuncelle();
    var h = location.hash.replace(/^#\/?/, ''), parca = h.split('/');
    var sekme = parca[0] === 'alarmlar' ? 'alarm' : 'ana';
    document.querySelectorAll('.alt-menu a, .ust-menu a').forEach(function (a) { if (a.dataset.sekme === sekme && parca[0] !== 'coin') a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (durum.grafik) { try { durum.grafik.grafik.remove(); } catch (e) {} durum.grafik = null; }
    if (parca[0] === 'coin' && parca[1]) {
      var coin = decodeURIComponent(parca[1]);
      $('ekran').innerHTML = detayEkran(coin);
      var c = durum.veri.coinler.filter(function (x) { return x.coin === coin; })[0];
      if (c) grafikKur(c);
      document.title = coin + ' · Kripto Kokpit';
    } else if (parca[0] === 'alarmlar') { $('ekran').innerHTML = alarmEkran(); document.title = 'Alarmlarım · Kripto Kokpit'; }
    else { $('ekran').innerHTML = MASA.matches ? anaEkranMasa() : anaEkran(); document.title = 'Kripto Kokpit'; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filtre]'); if (b) { durum.filtre = b.dataset.filtre; goster(); return; }
    var t = e.target.closest('[data-tf]'); if (t) { durum.tf = t.dataset.tf; var coin = decodeURIComponent(location.hash.split('/')[2] || ''); document.querySelectorAll('[data-tf]').forEach(function (x) { x.setAttribute('aria-pressed', x === t); }); var c = durum.veri.coinler.filter(function (x) { return x.coin === coin; })[0]; if (c) grafikKur(c); return; }
    if (e.target.closest('#tamEkran')) { tamEkran(); return; }
    var satir = e.target.closest('tr[data-git]'); if (satir && !e.target.closest('a')) { location.hash = satir.dataset.git; return; }
    if (e.target.closest('#bildirimAc') && window.KOKPIT_BILDIRIM) { window.KOKPIT_BILDIRIM.ac().then(goster); }
  });
  window.addEventListener('hashchange', function () { if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); goster(); window.scrollTo(0, 0); });
  document.addEventListener('input', function (e) { if (e.target.id === 'ara') { durum.ara = e.target.value; var l = $('yanListe'); if (l) l.innerHTML = yanListeHtml(aktifCoin()); } });
  MASA.addEventListener('change', goster);

  goster();
  ozetYukle().then(goster);
  // Ana sayfa ve alarm ekranı açıkken her dakika yenile (grafik ekranını bölmemek için detayda yalnızca üst bilgi yenilenir)
  setInterval(function () { if (document.hidden || !AYAR.api) return; ozetYukle().then(function () { if (/^#\/coin\//.test(location.hash)) { ustBilgi(); yanGuncelle(); } else goster(); }); }, 60000);
})();
