(function () {
  'use strict';
  var AYAR = window.KOKPIT_AYAR || {}, H = window.DKC_HESAP;
  var $ = function (id) { return document.getElementById(id); };
  var MASA = window.matchMedia('(min-width:1100px)');

  // ---------- Cihazda saklanan bilgiler (yalnızca bu telefonda/bilgisayarda) ----------
  function oku(k, vars) { try { var v = localStorage.getItem(k); return v == null ? vars : JSON.parse(v); } catch (e) { return vars; } }
  function yaz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* gizli mod: sessizce geç */ } }

  var durum = {
    veri: null, sonBasari: 0, hata: '', yukleniyor: false, onbellek: false,
    filtre: 'hepsi', ara: '', araAcik: false,
    tf: oku('dkc-tf', 'h1'), katman: oku('dkc-katman', {}), uzakAcik: false, grafik: null, form: '',
    favori: oku('dkc-favori', []), poz: oku('dkc-pozisyon', []), sermaye: oku('dkc-sermaye', null),
    cihaz: oku('dkc-cihaz', ''), pozEsit: '', alarmForm: '', esleme: { adim: '', hata: '', mesgul: false }
  };
  var CANLI = AYAR.api ? window.DKC_CANLI : null;
  var KARAR_SIRA = { yesil: 0, sari: 1, kirmizi: 2 }, KARAR_RENK = { yesil: 'var(--long)', sari: 'var(--bekle)', kirmizi: 'var(--uzak)' };
  var TF = [['m15', '15dk', '15 dakika'], ['h1', '1S', '1 saat'], ['h4', '4S', '4 saat'], ['d', '1G', '1 gün']];
  var TF_ADI = { d: '1 gün', h4: '4 saat', h1: '1 saat' };
  var YON = { yukari: ['Yukarı', 'var(--long)'], asagi: ['Aşağı', 'var(--short)'], yatay: ['Yatay', 'var(--bekle)'], onay: ['Onay var', 'var(--long)'], bekliyor: ['Onay bekleniyor', 'var(--bekle)'], yok: ['Sinyal yok', 'var(--uzak)'] };
  var ALARM_ADI = { giris: 'Giriş bölgesi', stop: 'Stop', tp1: 'Hedef 1', tp2: 'Hedef 2', ani: 'Ani hareket', alarm: 'Fiyat alarmı' };
  var TAM_IKON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var KUCUK_IKON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var YILDIZ = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/></svg>';
  var ARA_IKON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // ---------- Biçim ----------
  function basamak(x) { x = Math.abs(x); return x >= 1000 ? 0 : x >= 100 ? 1 : x >= 10 ? 2 : x >= 1 ? 3 : x >= 0.1 ? 4 : 5; }
  function f(x, d) { if (x == null || isNaN(x)) return '–'; d = d == null ? basamak(x) : d; return Number(x).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function yuzde(x, isaret) { if (x == null || isNaN(x)) return '–'; return (isaret && x > 0 ? '+' : '') + '%' + f(Math.abs(x) < 10 ? x : Math.round(x), Math.abs(x) < 10 ? 1 : 0).replace('-', '−'); }
  function degisim(x) { if (x == null || isNaN(x)) return '–'; return (x > 0 ? '+' : x < 0 ? '−' : '') + '%' + f(Math.abs(x), Math.abs(x) < 10 ? 1 : 0); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function saat(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  // Canlı fiyatla güncellenecek yerler: data-cf (fiyat) ve data-cd (24s değişim)
  function cf(c) { return ' data-cf="' + esc(c.coin) + '"'; }
  function cd(c) { return ' data-cd="' + esc(c.coin) + '"'; }
  function kararRozet(k) { return '<span class="durum d-' + k.renk + '">' + k.ad + '</span>'; }
  function kararBul(c) { var v = durum.veri; return H.karar(c, v && v.piyasa, { analizSaat: H.analizYasi(v && v.analizZamani) }); }
  // İşlem tipi: long yeşil ▲, short mor ▼ (kırmızı yalnız stop ve "Uzak dur" için)
  function yonRozet(yon, kucuk) { return '<span class="yon yon-' + (yon === 'short' ? 'short' : 'long') + (kucuk ? ' kucuk' : '') + '">' + (yon === 'short' ? '▼ SHORT' : '▲ LONG') + '</span>'; }
  function planSatir(p) { var h = H.planHesap(p); return 'Giriş ' + f(p.giris[0]) + '–' + f(p.giris[1]) + ' · Stop ' + f(p.stop) + ' (' + yuzde(h.stopYuzde) + ')'; }
  function oran(x) { return x == null || !isFinite(x) ? '–' : f(Math.floor(x * 10) / 10, 1); }
  function kararSira(c) { var k = kararBul(c); return (pozBul(c.coin) ? -1 : KARAR_SIRA[k.renk]) * 1000 + (k.g && k.g.tur === 'uzak' ? Math.min(k.g.girise, 999) : 0); }
  function uyari() { return '<p class="uyari">Yatırım tavsiyesi değildir. Analiz günde 2 kez yenilenir. Kazanç/risk ücret payı dahil, funding hariç; kâr/zarar ücret ve funding hariçtir. Emirleri MEXC’de siz verirsiniz.</p>'; }

  // ---------- Veri ----------
  function api(params, deneme) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    var ctrl = window.AbortController ? new AbortController() : null, zaman = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
    return fetch(AYAR.api + '?k=' + encodeURIComponent(AYAR.anahtar) + '&' + q, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (!r.ok) throw new Error('Sunucu ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(zaman); if (j && j.hata) { var e = new Error(j.hata); e.sunucu = true; throw e; } return j; },
        function (e) { clearTimeout(zaman); if (!deneme && navigator.onLine !== false) return api(params, 1); throw e; });
  }
  function veriHazirla(j) {
    j.coinler = (Array.isArray(j.coinler) ? j.coinler : []).map(H.coinTemizle).filter(Boolean);
    j.alarmlar = Array.isArray(j.alarmlar) ? j.alarmlar : [];
    j.tetiklenen = Array.isArray(j.tetiklenen) ? j.tetiklenen : [];
    if (CANLI) j.coinler.forEach(canliUygula);
    return j;
  }
  function ozetYukle() {
    if (!AYAR.api) { durum.veri = veriHazirla(window.KOKPIT_ORNEK); durum.sonBasari = Date.now(); return Promise.resolve(); }
    durum.yukleniyor = true; tazelikGuncelle();
    return api({ f: 'ozet' }).then(function (j) {
      durum.veri = veriHazirla(j); durum.sonBasari = Date.now(); durum.hata = ''; durum.onbellek = false;
      yaz('dkc-son', { t: durum.sonBasari, veri: j });
      if (CANLI) CANLI.baslat(durum.veri.coinler.map(function (c) { return c.coin; }));
    }).catch(function (e) {
      durum.hata = navigator.onLine === false ? 'internet' : e && e.sunucu ? 'sunucu: ' + e.message : 'baglanti';
    }).then(function () { durum.yukleniyor = false; });
  }
  function mumYukle(coin, tf, fiyat) {
    if (!AYAR.api) return Promise.resolve(window.KOKPIT_ORNEK_MUM(coin, tf, fiyat));
    var k = coin + '-' + tf;
    if (mumYolda[k]) return mumYolda[k];
    mumYolda[k] = api({ f: 'mum', coin: coin, tf: tf }).then(function (j) { delete mumYolda[k]; if (j.mumlar && j.mumlar.length) { mumSakla(coin, tf, j.mumlar); if (tf === 'm15' && CANLI && CANLI.m15Tohum) CANLI.m15Tohum(coin, j.mumlar); } return j.mumlar; },
      function (e) { delete mumYolda[k]; throw e; });
    return mumYolda[k];
  }
  // Grafik önbelleği: son mumlar cihazda saklanır, grafik anında açılır, arkada yenilenir
  var mumYolda = {}, MUM_ONBELLEK = 30;
  function mumOnbellek(coin, tf) { var o = oku('dkc-mum-' + coin + '-' + tf, null); return o && Array.isArray(o.m) && o.m.length ? o : null; }
  function mumSakla(coin, tf, mumlar) {
    var k = coin + '-' + tf, sira = oku('dkc-mum-sira', []).filter(function (x) { return x !== k; });
    sira.unshift(k);
    sira.slice(MUM_ONBELLEK).forEach(function (x) { try { localStorage.removeItem('dkc-mum-' + x); } catch (e) { /* yok say */ } });
    yaz('dkc-mum-' + k, { t: Date.now(), m: mumlar }); yaz('dkc-mum-sira', sira.slice(0, MUM_ONBELLEK));
  }
  // Ana ekran açılınca grafikler önceden iner: önce işlemdeki, girişe uygun, bekleyen ve favori coinler
  var onYukZaman = null;
  function grafikOnYukle() {
    if (!AYAR.api || !durum.veri || navigator.onLine === false) return;
    clearTimeout(onYukZaman);
    onYukZaman = setTimeout(function () {
      var tf = durum.tf, liste = durum.veri.coinler.slice()
        .sort(function (a, b) { return ((kararSira(a) - kararSira(b)) || (favoriMi(b.coin) - favoriMi(a.coin))); }).map(function (c) { return c.coin; })
        .filter(function (c) { var o = mumOnbellek(c, tf); return !o || Date.now() - o.t > 15 * 60000; }).slice(0, 20);
      var sira = 0;
      function sonraki() { if (sira >= liste.length) return; var c = liste[sira++]; mumYukle(c, tf).catch(function () { /* sessiz */ }).then(sonraki); }
      sonraki(); sonraki(); // aynı anda en fazla 2 istek
    }, 1500);
  }
  // Yazma istekleri (alarm kurma, eşleme): düz metin gövdeli POST, tarayıcı ön kontrol istemez
  function apiYaz(govde) {
    var ctrl = window.AbortController ? new AbortController() : null, zaman = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(AYAR.api, { method: 'POST', body: JSON.stringify(Object.assign({ k: AYAR.anahtar }, govde)), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('Sunucu ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(zaman); if (j && j.hata) { if (j.hata === 'Cihaz eşli değil') { durum.cihaz = ''; yaz('dkc-cihaz', ''); } throw new Error(j.hata); } return j; },
        function (e) { clearTimeout(zaman); throw e && e.name === 'AbortError' ? new Error('Sunucu yanıt vermedi') : e; });
  }

  // ---------- Canlı fiyat (MEXC akışı) ----------
  function canliUygula(c) { var l = CANLI && CANLI.fiyat(c.coin); if (l && isFinite(l.fiyat) && l.fiyat > 0) { c.fiyat = l.fiyat; c.deg24 = l.deg24; if (isFinite(l.funding)) c.funding = l.funding; } if (CANLI && CANLI.m15) c.m15 = CANLI.m15(c.coin); }
  var boyanacak = {}, boyaZaman = null, sonDetay = 0, sonGrup = 0;
  // Sinyal bildirimi kontrolü: skor A+/A ve fiyat giriş bölgesindeyse (cooldown bildirim.js'te)
  function sinyalKontrol(c) {
    var B = window.DKC_BILDIRIM, v = durum.veri;
    if (!B || !B.sinyalBildir || !H.sinyalSkoru || !c || !c.plan || B.durum() !== 'acik') return;
    var skor = H.sinyalSkoru(c, v && v.piyasa, { analizSaat: H.analizYasi(v && v.analizZamani) });
    if (!skor || (skor.sinif !== 'A+' && skor.sinif !== 'A') || skor.detay.fiyat !== 'bolgede') return;
    var p = skor.planAyarli || c.plan;
    B.sinyalBildir({ coin: c.coin, yon: skor.yon, sinif: skor.sinif, skor: f(skor.skor), maks: skor.maks, giris: f(p.giris[0]) + '–' + f(p.giris[1]), stop: f(p.stop), tp1: f(p.tp1) });
  }
  function canliBoya() {
    boyaZaman = null; var liste = Object.keys(boyanacak); boyanacak = {};
    if (!durum.veri) return;
    liste.forEach(function (k) {
      var c = coinBul(k); if (!c) return; canliUygula(c); sinyalKontrol(c);
      var ks = window.CSS && CSS.escape ? CSS.escape(k) : k;
      document.querySelectorAll('[data-cf="' + ks + '"]').forEach(function (el) { el.textContent = f(c.fiyat); });
      document.querySelectorAll('[data-cd="' + ks + '"]').forEach(function (el) { el.textContent = degisim(c.deg24); el.classList.toggle('art', c.deg24 >= 0); el.classList.toggle('eks', c.deg24 < 0); });
    });
    var simdi = Date.now();
    // Kâr/zarar ve "girişe %" yazıları birkaç saniyede bir yenilenir (yazarken veya form açıkken dokunulmaz)
    var yaziyor = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (liste.indexOf(aktifCoin()) >= 0 && simdi - sonDetay > 3000 && !durum.form && !durum.alarmForm && !yaziyor) { sonDetay = simdi; detayGuncelle(); }
    var gr = $('gruplar');
    if (gr && !yaziyor && simdi - sonGrup > 5000) { sonGrup = simdi; gr.innerHTML = grupHtml(gruplar()); }
  }
  if (CANLI) {
    CANLI.on('fiyat', function (coin) { boyanacak[coin] = 1; if (!boyaZaman) boyaZaman = setTimeout(canliBoya, 1000); });
    CANLI.on('durum', function () { tazelikGuncelle(); });
    CANLI.on('mum', function (k) { grafikCanli(k); });
  }

  function coinBul(coin) { return durum.veri ? durum.veri.coinler.filter(function (x) { return x.coin === coin; })[0] : null; }
  function pozBul(coin) { return durum.poz.filter(function (p) { return p.coin === coin; })[0]; }
  function fiyatlar() { var o = {}; (durum.veri ? durum.veri.coinler : []).forEach(function (c) { o[c.coin] = c.fiyat; }); return o; }
  function favoriMi(coin) { return durum.favori.indexOf(coin) >= 0; }

  // ---------- Üst bilgi: veri tazeliği ve zil ----------
  function tazelikGuncelle() {
    var el = $('tazelik'); if (!el) return;
    var t = durum.sonBasari, cls = 'iyi', yazi;
    if (!durum.veri) { yazi = durum.hata ? 'Veri alınamadı' : 'Yükleniyor…'; cls = durum.hata ? 'kotu' : 'bekle'; }
    else if (navigator.onLine === false) { yazi = 'İnternet yok · veri ' + saat(t); cls = 'kotu'; }
    else if (durum.hata) { yazi = 'Bağlantı sorunu · veri ' + saat(t); cls = 'orta'; }
    else if (CANLI && CANLI.durum() === 'bagli') yazi = 'Canlı fiyat';
    else if (Date.now() - t > 3 * 60000) { yazi = 'Veri ' + saat(t) + ' · yenile'; cls = 'orta'; }
    else yazi = (durum.yukleniyor ? 'Yenileniyor… ' : 'Güncel · ') + saat(t);
    if (durum.veri && durum.veri.ornek) { yazi = 'Örnek veri'; cls = 'orta'; }
    el.className = 'tazelik t-' + cls; el.innerHTML = '<i aria-hidden="true"></i>' + esc(yazi);
    el.setAttribute('aria-label', yazi + '. Dokunarak yenileyin.');
    var v = durum.veri, n = 0;
    if (v) {
      var son = oku('dkc-okundu', ''), tet = v.tetiklenen;
      for (var i = 0; i < tet.length; i++) { if (tetAnahtar(tet[i]) === son) break; if (tet[i].yeni !== false) n++; }
    }
    $('zilSayi').hidden = !n; $('zilSayi').textContent = n;
  }
  function tetAnahtar(t) { return t.zaman + '|' + t.coin + '|' + t.tur; }

  // ---------- Coin satırı metni (ana ekran, yan liste, tablo aynı dili konuşur) ----------
  function coinDurumu(c) {
    var p = pozBul(c.coin), k = kararBul(c);
    if (p) {
      var h = H.pozisyonHesap(p, c.fiyat, durum.sermaye);
      return { grup: 'islem', k: k, renk: 'var(--mavi)', yazi: (p.yon === 'short' ? 'Short' : 'Long') + ' ' + h.kaldirac + 'x · giriş ' + f(p.giris) + ' · ' + degisim(h.hareket) + (h.stopa != null ? (h.stopa <= 0 ? ' · stop seviyesi geçildi' : ' · stopa ' + yuzde(h.stopa)) : ''), yaziRenk: h.hareket >= 0 ? 'art' : 'eks' };
    }
    if (k.renk === 'yesil') return { grup: 'uygun', k: k, renk: KARAR_RENK.yesil, yazi: planSatir(c.plan), not: 'Bölgede · stopa ' + yuzde(k.g.stopa), notRenk: 'art', yaziRenk: '', girise: 0 };
    if (k.renk === 'sari') return { grup: 'bekle', k: k, renk: KARAR_RENK.sari, yazi: planSatir(c.plan), not: k.eksik.slice(0, 2).join(', '), notRenk: '', yaziRenk: '', girise: k.g && k.g.tur === 'uzak' ? k.g.girise : 0 };
    return { grup: 'uzak', k: k, renk: KARAR_RENK.kirmizi, yazi: k.neden || '', yaziRenk: 'soluk' };
  }
  function durumRozet(d) { return d.grup === 'islem' ? '<span class="durum d-islem">İşlemde</span>' : kararRozet(d.k); }
  // Girişe yakınlık çubuğu: bölgedeyse dolu, %8 ve üstü uzaksa neredeyse boş
  function yakinlik(d) {
    if (!d.k || !d.k.g || d.grup === 'uzak' || d.grup === 'islem') return '';
    var dol = d.k.g.tur === 'uzak' ? Math.max(4, Math.min(100, 100 - d.k.g.girise * 12)) : 100;
    return '<span class="yakinlik" title="Girişe yakınlık" aria-hidden="true"><i style="width:' + dol + '%;background:' + d.renk + '"></i></span>';
  }

  // ---------- Telefon ana ekranı ----------
  function ozetSayilar() {
    var v = durum.veri, girisSay = 0;
    v.coinler.forEach(function (c) { if (!pozBul(c.coin) && kararBul(c).renk === 'yesil') girisSay++; });
    var r = H.toplamRisk(durum.poz.filter(function (p) { return coinBul(p.coin); }), fiyatlar(), durum.sermaye);
    return { islem: durum.poz.length, giris: girisSay, risk: r };
  }
  function riskYazi(r) {
    if (!durum.poz.length) return { deger: '%0', alt: 'tavan %' + r.tavan };
    if (!durum.sermaye) return { deger: '–', alt: 'sermaye girin' };
    var y = r.yonler || {}, iki = y.long > 0 && y.short > 0;
    return { deger: '%' + f(r.yuzde, 1), alt: (iki ? 'L %' + f(y.long, 1) + ' · S %' + f(y.short, 1) + ' · ' : '') + 'yön başına tavan %' + r.tavan + (r.bilinmeyen ? ' · ' + r.bilinmeyen + ' stopsuz' : '') };
  }
  function kutucuklar() {
    var s = ozetSayilar(), ry = riskYazi(s.risk);
    return '<div class="kutucuk">' +
      '<a href="#/islemler" class="kc' + (s.islem ? ' kc-yesil' : '') + '"><span>İşlemde</span><b>' + s.islem + '</b></a>' +
      '<a href="#/" class="kc' + (s.giris ? ' kc-yesil' : '') + '"><span>Girişe uygun</span><b>' + s.giris + '</b></a>' +
      '<a href="#/islemler" class="kc' + (s.risk.asildi ? ' kc-kirmizi' : '') + '"><span>Açık risk</span><b>' + ry.deger + '</b><small>' + esc(ry.alt) + '</small></a></div>';
  }
  function piyasaHtml(p) {
    if (!p || !p.mod) return '';
    var renk = p.mod === 'Risk açık' ? 'var(--long)' : p.mod === 'Riskten kaçış' ? 'var(--short)' : 'var(--bekle)';
    return '<details class="piyasa"><summary><span class="mod"><span class="isik" style="background:' + renk + '"></span>Piyasa: ' + esc(p.mod) + '</span>' +
      (p.btc ? '<span class="kv">BTC <b>' + esc(p.btc) + '</b></span>' : '') +
      (p.korku ? '<span class="kv">Korku/Açgözlülük <b>' + esc(p.korku.deger) + '</b></span>' : '') + '</summary>' +
      (p.not ? '<p>' + esc(p.not) + '</p>' : '') + '</details>';
  }
  function satirHtml(c, d) {
    return '<a class="cs" href="#/coin/' + encodeURIComponent(c.coin) + '"><span class="cs-serit" style="background:' + d.renk + '"></span>' +
      '<span class="cs-orta"><span class="cs-ad">' + esc(c.coin) + (favoriMi(c.coin) ? '<span class="cs-yildiz" aria-label="Favori">' + YILDIZ + '</span>' : '') + (d.grup !== 'islem' && d.grup !== 'uzak' && d.k.yon ? yonRozet(d.k.yon, true) : '') + durumRozet(d) + '</span>' +
      '<span class="cs-alt ' + d.yaziRenk + (d.not != null ? ' sayi-satir' : '') + '">' + esc(d.yazi) + '</span>' + (d.not ? '<span class="cs-alt cs-not ' + d.notRenk + '">' + esc(d.not) + '</span>' : '') + yakinlik(d) + '</span>' +
      '<span class="cs-sag"><span class="sayi"' + cf(c) + '>' + f(c.fiyat) + '</span><span class="sayi ' + (c.deg24 >= 0 ? 'art' : 'eks') + '"' + cd(c) + '>' + degisim(c.deg24) + '</span></span></a>';
  }
  function filtrele(liste) {
    var q = durum.ara.trim().toUpperCase();
    return liste.filter(function (c) { return (!q || c.coin.indexOf(q) >= 0) && (durum.filtre !== 'favori' || favoriMi(c.coin)); });
  }
  function gruplar() {
    var g = { islem: [], uygun: [], bekle: [], uzak: [] };
    filtrele(durum.veri.coinler).forEach(function (c) { var d; try { d = coinDurumu(c); } catch (e) { d = { grup: 'uzak', k: { renk: 'kirmizi', ad: 'Uzak dur' }, renk: 'var(--uzak)', yazi: 'Veri okunamadı', yaziRenk: 'soluk' }; } g[d.grup].push([c, d]); });
    var sirala = durum.filtre === 'degisen' ? function (a, b) { return Math.abs(b[0].deg24 || 0) - Math.abs(a[0].deg24 || 0); }
      : function (a, b) { return ((a[1].girise || 0) - (b[1].girise || 0)) || (favoriMi(b[0].coin) - favoriMi(a[0].coin)); };
    g.uygun.sort(sirala); g.bekle.sort(sirala); g.uzak.sort(sirala);
    return g;
  }
  function bantlar() {
    var v = durum.veri;
    return (v.ornek ? '<div class="bant">Örnek veri: rakamlar gerçek değil.</div>' : '') +
      (durum.hata && durum.veri ? '<div class="bant">' + (durum.hata === 'internet' ? 'İnternet yok.' : 'Sunucuya ulaşılamadı.') + ' Gösterilen veri ' + saat(durum.sonBasari) + ' saatinden. <button class="bant-dugme" data-yenile>Tekrar dene</button></div>' : '');
  }
  function anaEkran() {
    var g = gruplar(), bolum = function (baslik, l, bos) {
      return '<section class="grup"><h2>' + baslik + (l.length ? ' <span>' + l.length + '</span>' : '') + '</h2>' +
        (l.length ? '<div class="cs-liste">' + l.map(function (x) { return satirHtml(x[0], x[1]); }).join('') + '</div>' : (bos ? '<p class="bos">' + bos + '</p>' : '')) + '</section>';
    };
    var cipler = [['hepsi', 'Tümü'], ['favori', 'Favoriler'], ['degisen', 'En çok değişen']];
    return bantlar() + kutucuklar() + piyasaHtml(durum.veri.piyasa) +
      '<div class="cipler" role="group" aria-label="Liste seçenekleri">' + cipler.map(function (x) { return '<button data-filtre="' + x[0] + '" aria-pressed="' + (durum.filtre === x[0]) + '">' + x[1] + '</button>'; }).join('') +
      '<button class="cip-ara" data-ara-ac aria-label="Coin ara" aria-expanded="' + durum.araAcik + '">' + ARA_IKON + '</button></div>' +
      (durum.araAcik ? '<input id="ara" class="ara-kutu" type="search" placeholder="Coin ara (ör. SOL)" autocomplete="off" aria-label="Coin ara" value="' + esc(durum.ara) + '">' : '') +
      '<div id="gruplar">' + grupHtml(g, bolum) + '</div>' + uyari();
  }
  function grupHtml(g, bolum) {
    bolum = bolum || function (baslik, l, bos) {
      return '<section class="grup"><h2>' + baslik + (l.length ? ' <span>' + l.length + '</span>' : '') + '</h2>' +
        (l.length ? '<div class="cs-liste">' + l.map(function (x) { return satirHtml(x[0], x[1]); }).join('') + '</div>' : (bos ? '<p class="bos">' + bos + '</p>' : '')) + '</section>';
    };
    var araniyor = durum.ara.trim() || durum.filtre === 'favori';
    var hic = !g.islem.length && !g.uygun.length && !g.bekle.length && !g.uzak.length;
    return (g.islem.length ? bolum('İşlemdeyim', g.islem) : '') +
      bolum('<span class="g-isik" style="background:var(--long)"></span>Girişe uygun', g.uygun, araniyor ? '' : 'Şu an girişe uygun coin yok. Analiz günde 2 kez yenilenir.') +
      (g.bekle.length ? bolum('<span class="g-isik" style="background:var(--bekle)"></span>Bekle', g.bekle) : '') +
      (g.uzak.length ? '<details class="grup grup-uzak"' + (durum.uzakAcik || araniyor ? ' open' : '') + '><summary><h2><span class="g-isik" style="background:var(--uzak)"></span>Uzak dur <span>' + g.uzak.length + '</span><em class="ac-yazi">' + (durum.uzakAcik ? 'gizle' : 'göster') + '</em></h2></summary>' +
        '<div class="cs-liste">' + g.uzak.map(function (x) { return satirHtml(x[0], x[1]); }).join('') + '</div></details>' : '') +
      (hic && araniyor ? '<p class="bos">Eşleşen coin yok.</p>' : '');
  }

  // ---------- Masaüstü: sol coin listesi ----------
  function yanListeHtml(aktif) {
    var liste = filtrele(durum.veri.coinler.slice().sort(function (a, b) { return (kararSira(a) - kararSira(b)) || (favoriMi(b.coin) - favoriMi(a.coin)); }));
    return liste.map(function (c) {
      var d = coinDurumu(c);
      return '<a class="yan-satir' + (c.coin === aktif ? ' aktif' : '') + '" href="#/coin/' + encodeURIComponent(c.coin) + '"' + (c.coin === aktif ? ' aria-current="page"' : '') + '>' +
        '<span class="ys-nokta" style="background:' + d.renk + '"></span><span class="ys-ad">' + esc(c.coin) + (favoriMi(c.coin) ? ' <span class="cs-yildiz">' + YILDIZ + '</span>' : '') + '</span>' +
        '<span class="ys-fiyat sayi"' + cf(c) + '>' + f(c.fiyat) + '</span><span class="ys-alt">' + (d.grup !== 'islem' && d.grup !== 'uzak' && d.k.yon ? (d.k.yon === 'short' ? '▼ ' : '▲ ') : '') + esc(d.not || d.yazi) + '</span>' +
        '<span class="ys-deg sayi ' + (c.deg24 >= 0 ? 'art' : 'eks') + '"' + cd(c) + '>' + degisim(c.deg24) + '</span></a>';
    }).join('') || '<p class="bos" style="padding:8px 14px">Eşleşen coin yok.</p>';
  }
  function yanHtml(aktif) {
    return '<div class="yan-ust"><input id="araYan" type="search" placeholder="Coin ara" autocomplete="off" aria-label="Coin ara" value="' + esc(durum.ara) + '"></div>' +
      '<div class="yan-baslik"><span>Coin</span><span>Fiyat · 24s</span></div><div class="yan-liste" id="yanListe">' + yanListeHtml(aktif) + '</div>';
  }
  function aktifCoin() { var m = location.hash.match(/^#\/coin\/([^/]+)/); return m ? decodeURIComponent(m[1]) : ''; }
  function yanGuncelle() {
    if (!MASA.matches || !durum.veri) { $('yan').innerHTML = ''; return; }
    var l = $('yanListe');
    if (l) l.innerHTML = yanListeHtml(aktifCoin()); else $('yan').innerHTML = yanHtml(aktifCoin());
  }

  // ---------- Masaüstü: genel bakış ----------
  function sinyalNoktalari(tf) {
    tf = tf || {};
    return '<span class="sinyal">' + ['d', 'h4', 'h1'].map(function (k) { var y = YON[tf[k]] || YON.yok; return '<i title="' + TF_ADI[k] + ': ' + y[0] + '" style="background:' + y[1] + '"></i>'; }).join('') + '</span>';
  }
  function anaEkranMasa() {
    var v = durum.veri, tet = v.tetiklenen, s = ozetSayilar(), ry = riskYazi(s.risk), son = tet[0];
    var kutu = function (etiket, deger, alt, renk, link) { return '<a class="kutu" href="' + (link || '#/') + '"><span class="k-et">' + etiket + '</span><span class="k-deger"' + (renk ? ' style="color:' + renk + '"' : '') + '>' + deger + '</span><span class="k-alt">' + alt + '</span></a>'; };
    var g = gruplar();
    var kutular = '<div class="kutular">' +
      kutu('İşlemde', s.islem + ' coin', s.islem ? durum.poz.map(function (p) { return esc(p.coin); }).join(', ') : 'Açık işlem yok', s.islem ? 'var(--long)' : '', '#/islemler') +
      kutu('Girişe uygun', s.giris + ' coin', g.uygun.map(function (x) { return esc(x[0].coin); }).join(', ') || 'Şu an uygun coin yok', s.giris ? 'var(--long)' : '') +
      kutu('Açık risk', ry.deger, esc(ry.alt), s.risk.asildi ? 'var(--short)' : '', '#/islemler') +
      kutu('Son çalan alarm', son ? esc(son.coin) : 'Yok', son ? esc(ALARM_ADI[son.tur] || son.tur) + ' · ' + esc(son.zaman) : 'Henüz alarm çalmadı', son ? 'var(--vurgu)' : '', '#/alarmlar') + '</div>';

    var islemler = g.islem.length ? '<section class="blok"><h2>İşlemdeyim</h2><div class="plan-kartlar">' + g.islem.map(function (x) { return pozKartHtml(x[0], pozBul(x[0].coin), true); }).join('') + '</div></section>' : '';

    var hazir = g.uygun.concat(g.bekle);
    var planlar = '<section class="blok"><h2>Planı olan coinler</h2>' + (hazir.length ? '<div class="plan-kartlar">' + hazir.map(function (x) {
      var c = x[0], p = c.plan, k = x[1].k, h = k.h || H.planHesap(p);
      return '<a class="plan-kart" href="#/coin/' + encodeURIComponent(c.coin) + '"><span class="pk-ust"><b>' + esc(c.coin) + '</b>' + yonRozet(p.yon, true) + kararRozet(k) + '<span class="sayi pk-fiyat"' + cf(c) + '>' + f(c.fiyat) + '</span></span>' +
        '<span class="pk-satir"><span>Giriş</span><span class="sayi">' + f(p.giris[0]) + ' – ' + f(p.giris[1]) + '</span></span>' +
        '<span class="pk-satir"><span>Stop</span><span class="sayi eks">' + f(p.stop) + ' <span class="soluk-yazi">(' + yuzde(h.stopYuzde) + ')</span></span></span>' +
        '<span class="pk-satir"><span>Hedef 1 · 2</span><span class="sayi art">' + f(p.tp1) + (p.tp2 ? ' · ' + f(p.tp2) : '') + '</span></span>' +
        '<span class="pk-satir"><span>Kazanç/risk · poz.</span><span class="sayi">' + oran(h.r1Net) + 'R · %' + f(h.poz, 0) + '</span></span>' +
        '<span class="pk-alt">' + esc(x[1].not || '') + '</span>' + yakinlik(x[1]) + '</a>';
    }).join('') + '</div>' : '<p class="bos">Şu an işlem planı olan coin yok. Analiz günde 2 kez yenilenir.</p>') + '</section>';

    var cipler = [['hepsi', 'Tümü'], ['favori', 'Favoriler'], ['degisen', 'En çok değişen']];
    var liste = filtrele(v.coinler.slice());
    if (durum.filtre === 'degisen') liste.sort(function (a, b) { return Math.abs(b.deg24 || 0) - Math.abs(a.deg24 || 0); });
    else liste.sort(function (a, b) { return kararSira(a) - kararSira(b); });
    var tablo = '<section class="blok tablo-blok"><div class="blok-ust"><h2>Piyasa tablosu</h2><div class="cipler" role="group" aria-label="Liste seçenekleri">' +
      cipler.map(function (x) { return '<button data-filtre="' + x[0] + '" aria-pressed="' + (durum.filtre === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<table class="tablo"><thead><tr><th>Coin</th><th class="sag-h">Fiyat</th><th class="sag-h">24s</th><th>Durum</th><th title="Yeşil yukarı, sarı yatay/bekliyor, kırmızı aşağı, gri sinyal yok">Yön 1G · 4S · 1S</th><th>Ne durumda</th><th>Analiz özeti</th></tr></thead><tbody>' +
      liste.map(function (c) {
        var d = coinDurumu(c);
        return '<tr data-git="#/coin/' + encodeURIComponent(c.coin) + '"><td><a href="#/coin/' + encodeURIComponent(c.coin) + '" class="t-coin"><span class="rozet kucuk">' + esc(c.coin.slice(0, 4)) + '</span>' + esc(c.coin) + (favoriMi(c.coin) ? ' <span class="cs-yildiz">' + YILDIZ + '</span>' : '') + '</a></td>' +
          '<td class="sayi sag-h"' + cf(c) + '>' + f(c.fiyat) + '</td><td class="sayi sag-h ' + (c.deg24 >= 0 ? 'art' : 'eks') + '"' + cd(c) + '>' + degisim(c.deg24) + '</td>' +
          '<td>' + durumRozet(d) + '</td><td>' + sinyalNoktalari(c.tf) + '</td>' +
          '<td class="t-durum ' + d.yaziRenk + '">' + (d.grup !== 'islem' && d.grup !== 'uzak' && d.k.yon ? yonRozet(d.k.yon, true) + ' ' : '') + esc(d.not || d.yazi) + '</td>' +
          '<td class="t-ozet">' + esc(c.ozet || c.islemYok || '') + '</td></tr>';
      }).join('') + '</tbody></table>' + (liste.length ? '' : '<p class="bos">Eşleşen coin yok.</p>') +
      '<p class="lejant-not">Yön noktaları: <i style="background:var(--long)"></i>yukarı <i style="background:var(--bekle)"></i>yatay / bekliyor <i style="background:var(--short)"></i>aşağı <i style="background:var(--uzak)"></i>sinyal yok</p></section>';

    var alarmlar = '<section class="blok"><div class="blok-ust"><h2>Son çalan alarmlar</h2><a class="link" href="#/alarmlar">Tümü →</a></div><div class="liste">' + (tet.length ? tet.slice(0, 5).map(tetSatir).join('') : '<p class="bos">Henüz çalan alarm yok.</p>') + '</div></section>';

    var haberler = [];
    v.coinler.forEach(function (c) { c.haberler.forEach(function (h) { if (h) haberler.push({ coin: c.coin, h: h }); }); });
    var etkiSira = { 'Yüksek': 0, 'Orta': 1, 'Düşük': 2 };
    haberler.sort(function (a, b) { return (etkiSira[a.h.etki] == null ? 3 : etkiSira[a.h.etki]) - (etkiSira[b.h.etki] == null ? 3 : etkiSira[b.h.etki]); });
    var haber = '<section class="blok"><h2>Haber akışı</h2>' + (haberler.length ? haberler.slice(0, 6).map(function (x) { return haberSatir(x.h, x.coin); }).join('') : '<p class="bos">Son 24 saatte önemli haber yok.</p>') + '</section>';

    return bantlar() + piyasaHtml(v.piyasa) + kutular + islemler + planlar + tablo + '<div class="masa-iki">' + alarmlar + haber + '</div>' + uyari();
  }
  function haberSatir(h, coin) {
    var url = H.guvenliUrl(h.url), baslik = (coin ? '<span class="h-coin">' + esc(coin) + '</span>' : '') + esc(h.baslik);
    return '<div class="haber">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + baslik + '</a>' : '<b>' + baslik + '</b>') +
      (h.ozet && !coin ? '<span class="h-ozet">' + esc(h.ozet) + '</span>' : '') +
      '<span class="etiketler"><span>Etki: ' + esc(h.etki) + '</span><span>' + esc(h.yon) + '</span><span>' + esc(h.kaynak) + ' · ' + esc(h.zaman) + '</span></span></div>';
  }
  function alarmRenk(t) { return t === 'stop' ? 'var(--short)' : t === 'giris' ? 'var(--mavi)' : t === 'ani' ? 'var(--bekle)' : t === 'alarm' ? 'var(--vurgu)' : 'var(--long)'; }
  function tetSatir(t) {
    return '<a class="satir" href="#/coin/' + encodeURIComponent(t.coin) + '"><span class="nokta" style="background:' + alarmRenk(t.tur) + '"></span><span class="ust-yazi">' + esc(t.coin) + ' · ' + esc(ALARM_ADI[t.tur] || t.tur) + '</span><span class="sag sayi">' + f(t.fiyat) + '</span><span class="alt-yazi">' + esc(t.zaman) + '</span></a>';
  }

  // ---------- Pozisyon (elle girilir, yalnızca bu cihazda) ----------
  function pozKartHtml(c, p, link) {
    var h = H.pozisyonHesap(p, c.fiyat, durum.sermaye), yon = p.yon === 'short' ? 'Short' : 'Long';
    var ic = '<span class="pk-ust"><b>' + esc(c.coin) + '</b><span class="durum d-' + (p.yon === 'short' ? 'short' : 'long') + '">' + yon + ' · ' + h.kaldirac + 'x</span><span class="sayi pk-fiyat ' + (h.hareket >= 0 ? 'art' : 'eks') + '">' + degisim(h.hareket) + '</span></span>' +
      '<span class="pk-satir"><span>Giriş · şimdi</span><span class="sayi">' + f(p.giris) + ' · ' + f(c.fiyat) + '</span></span>' +
      (h.kz != null ? '<span class="pk-satir"><span>Kâr/zarar (ücretsiz)</span><span class="sayi ' + (h.kz >= 0 ? 'art' : 'eks') + '">' + (h.kz >= 0 ? '+' : '−') + f(Math.abs(h.kz), 2) + ' USDT</span></span>' : '') +
      (p.stop ? '<span class="pk-satir"><span>Stop</span><span class="sayi eks">' + f(p.stop) + ' · ' + (h.stopa != null && h.stopa <= 0 ? 'geçildi' : yuzde(h.stopa) + ' uzakta') + '</span></span>' : '<span class="pk-satir"><span>Stop</span><span class="eks">Girilmedi</span></span>') +
      (p.hedef ? '<span class="pk-satir"><span>Hedef</span><span class="sayi art">' + f(p.hedef) + ' · ' + yuzde(h.hedefe) + '</span></span>' : '') +
      '<span class="pk-satir"><span>Likidasyon (yaklaşık)</span><span class="sayi">' + f(h.likidasyon) + '</span></span>' +
      (h.riskYuzde != null ? '<span class="pk-satir"><span>Risk</span><span class="sayi">sermayenin %' + f(h.riskYuzde, 1) + '’i</span></span>' : '') +
      (c.funding != null ? '<span class="pk-satir"><span>Funding (8 saat)</span><span class="sayi">%' + f(c.funding * 100, 4) + '</span></span>' : '');
    return link ? '<a class="plan-kart poz-kart" href="#/coin/' + encodeURIComponent(c.coin) + '">' + ic + '</a>' : '<div class="plan-kart poz-kart">' + ic + '</div>';
  }
  function pozFormHtml(c) {
    var p = pozBul(c.coin) || {}, pl = c.plan, varsay = {
      yon: p.yon || (pl ? pl.yon : 'long'), giris: p.giris || c.fiyat || '', buyukluk: p.buyukluk || '', kaldirac: p.kaldirac || 3,
      stop: p.stop || (pl ? pl.stop : ''), hedef: p.hedef || (pl ? pl.tp1 : '') };
    var alan = function (ad, etiket, deger, ek) { return '<label class="alan"><span>' + etiket + '</span><input name="' + ad + '" inputmode="decimal" autocomplete="off" value="' + esc(deger) + '"' + (ek || '') + '></label>'; };
    return '<form id="pozForm" class="blok poz-form" data-coin="' + esc(c.coin) + '"><h2>' + esc(c.coin) + ' işlemim</h2>' +
      '<div class="yon-sec" role="radiogroup" aria-label="Yön"><label><input type="radio" name="yon" value="long"' + (varsay.yon !== 'short' ? ' checked' : '') + '> Long</label><label><input type="radio" name="yon" value="short"' + (varsay.yon === 'short' ? ' checked' : '') + '> Short</label></div>' +
      '<div class="alanlar">' + alan('giris', 'Giriş fiyatı', varsay.giris, ' required') + alan('buyukluk', 'Pozisyon büyüklüğü (USDT, kaldıraçlı)', varsay.buyukluk) +
      alan('kaldirac', 'Kaldıraç (x)', varsay.kaldirac) + alan('stop', 'Stop', varsay.stop) + alan('hedef', 'Hedef', varsay.hedef) + '</div>' +
      '<p class="form-hata" id="formHata" role="alert"></p>' +
      '<div class="form-dugmeler"><button class="dugme" type="submit">Kaydet</button><button class="dugme ikincil" type="button" data-form-iptal>Vazgeç</button></div>' +
      '<p class="plan-not poz-not">' + esc(pozNot()) + '</p></form>';
  }
  function sayiOku(v) { v = String(v || '').trim().replace(/\s/g, ''); if (!v) return null; if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.'); var n = Number(v); return isFinite(n) && n > 0 ? n : NaN; }
  function pozKaydet(form) {
    var al = function (ad) { return sayiOku(form.elements[ad].value); }, yon = form.querySelector('input[name=yon]:checked').value;
    var p = { coin: form.getAttribute('data-coin'), yon: yon, giris: al('giris'), buyukluk: al('buyukluk'), kaldirac: al('kaldirac') || 1, stop: al('stop'), hedef: al('hedef'), zaman: Date.now() };
    var hata = '';
    if (!p.giris || isNaN(p.giris)) hata = 'Giriş fiyatını yazın.';
    else if ([p.buyukluk, p.kaldirac, p.stop, p.hedef].some(function (x) { return x !== null && isNaN(x); })) hata = 'Sayıları rakamla yazın (ör. 82400 ya da 5,15).';
    else if (p.kaldirac > 125) hata = 'Kaldıraç 125x’ten büyük olamaz.';
    else if (p.stop && (yon === 'long' ? p.stop >= p.giris : p.stop <= p.giris)) hata = yon === 'long' ? 'Long işlemde stop girişin altında olmalı.' : 'Short işlemde stop girişin üstünde olmalı.';
    else if (p.hedef && (yon === 'long' ? p.hedef <= p.giris : p.hedef >= p.giris)) hata = yon === 'long' ? 'Long işlemde hedef girişin üstünde olmalı.' : 'Short işlemde hedef girişin altında olmalı.';
    if (hata) { $('formHata').textContent = hata; return; }
    durum.poz = durum.poz.filter(function (x) { return x.coin !== p.coin; }).concat([p]);
    durum.form = ''; goster(); pozDegisti({ tur: 'kaydet', p: p });
  }

  // ---------- İşlemlerim eşitleme: eşli cihazlarda aynı işlemler ----------
  function pozNot() {
    if (!AYAR.api || !durum.cihaz) return 'Bilgiler yalnızca bu cihazda saklanır, MEXC’ye bağlanmaz.' + (AYAR.api ? ' Diğer cihazlarınızda da görmek için bu cihazı eşleyin.' : '');
    return 'Eşli cihazlarınızın hepsinde görünür (Google hesabınızdaki alarm motorunda saklanır), MEXC’ye bağlanmaz.' + (durum.pozEsit === 'hata' ? ' Son değişiklik gönderilemedi; bağlantı gelince tekrar denenir.' : '');
  }
  function pozNotYenile() { document.querySelectorAll('.poz-not').forEach(function (el) { el.textContent = pozNot(); }); }
  // Değişiklikler sıraya yazılır ve tek tek gönderilir; internet yoksa sırada bekler, sonra gider.
  var pozSurum = 0; // yoldaki eski sunucu cevabı yeni girişi ezmesin
  function pozDegisti(islem) {
    pozSurum++; yaz('dkc-pozisyon', durum.poz); yaz('dkc-sermaye', durum.sermaye);
    if (!durum.cihaz || !AYAR.api) return;
    yaz('dkc-poz-kuyruk', oku('dkc-poz-kuyruk', []).concat([islem]).slice(-50));
    pozGonder();
  }
  function pozUygula(k) {
    var once = JSON.stringify([durum.poz, durum.sermaye]);
    durum.poz = Array.isArray(k.poz) ? k.poz : []; durum.sermaye = k.sermaye == null ? null : k.sermaye; durum.pozEsit = 'ok';
    yaz('dkc-pozisyon', durum.poz); yaz('dkc-sermaye', durum.sermaye);
    if (JSON.stringify([durum.poz, durum.sermaye]) !== once) pozEkranYenile(); else pozNotYenile();
  }
  var pozYolda = null;
  function pozGonder() {
    if (!durum.cihaz || !AYAR.api) return Promise.resolve();
    if (pozYolda) return pozYolda.then(function () { if (oku('dkc-poz-kuyruk', []).length) return pozGonder(); });
    var giden = oku('dkc-poz-kuyruk', []); if (!giden.length) return Promise.resolve();
    var surum = pozSurum;
    pozYolda = apiYaz({ f: 'pozIslem', t: durum.cihaz, islemler: giden }).then(function (k) {
      yaz('dkc-poz-kuyruk', oku('dkc-poz-kuyruk', []).slice(giden.length));
      if (surum === pozSurum) pozUygula(k);
    }, function () { durum.pozEsit = 'hata'; pozNotYenile(); }).then(function () { pozYolda = null; });
    return pozYolda;
  }
  function pozEkranYenile() {
    pozNotYenile();
    var yaziyor = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (yaziyor || durum.form || !durum.veri) return;
    if (/^#\/coin\//.test(location.hash) && $('grafik')) detayGuncelle(); else goster();
  }
  // Açılışta ve uygulama öne gelince çağrılır. Eşlemeden sonraki ilk seferde bu cihazdaki işlemler sunucudakilere eklenir.
  function pozEsitle() {
    if (!durum.cihaz || !AYAR.api) return Promise.resolve();
    if (!oku('dkc-poz-aktarildi', false)) {
      yaz('dkc-poz-kuyruk', [{ tur: 'birlestir', poz: durum.poz, sermaye: durum.sermaye }].concat(oku('dkc-poz-kuyruk', [])));
      yaz('dkc-poz-aktarildi', true);
    }
    if (oku('dkc-poz-kuyruk', []).length) return pozGonder();
    var surum = pozSurum;
    return apiYaz({ f: 'pozGetir', t: durum.cihaz }).then(function (k) { if (surum === pozSurum && !pozYolda) pozUygula(k); }, function () { /* bağlantı yoksa kayıtlı kopyayla devam */ });
  }

  // ---------- Coin detayı: grafik önde ----------
  function tfSatir(tf) {
    return '<div class="zd">' + ['d', 'h4', 'h1'].map(function (k) { var y = YON[tf[k]] || YON.yok; return '<span><span class="isik" style="background:' + y[1] + ';margin:0"></span>' + TF_ADI[k] + ': <b>' + y[0] + '</b></span>'; }).join('') + '</div>';
  }
  // Özet şeridi: grafiğin üstünde işlem tipi, giriş, stop, hedef, kazanç/risk ve pozisyon tek bakışta
  function ozetSeritHtml(c) {
    var k = kararBul(c), p = c.plan;
    if (!p || !k.yon) return '<section class="blok serit serit-kirmizi" id="dOzet"><div class="serit-ust">' + kararRozet(k) + '<span class="serit-neden">' + esc(c.islemYok || k.neden || 'İşlem planı yok') + '</span></div></section>';
    var h = k.h, kut = function (et, deger, alt, cls) { return '<div class="sk"><span class="sk-et">' + et + '</span><b class="sayi ' + (cls || '') + '">' + deger + '</b>' + (alt ? '<small>' + alt + '</small>' : '') + '</div>'; };
    return '<section class="blok serit serit-' + k.renk + '" id="dOzet"><div class="serit-ust">' + yonRozet(k.yon) + kararRozet(k) +
      '<span class="serit-sinif" title="A: 1G ve 4S aynı yönde. B: 1G yatay, 4S aynı yönde (yarım risk).">Sınıf ' + esc(k.sinif) + ' · risk %' + f(k.riskYuzde, 1) + '</span></div>' +
      '<div class="serit-izgara">' +
      kut('Giriş', f(p.giris[0]) + ' – ' + f(p.giris[1]), k.g && k.g.tur === 'uzak' ? 'girişe ' + yuzde(k.g.girise) : k.g && k.g.tur === 'bolgede' ? 'fiyat bölgede' : '', '') +
      kut('Stop', f(p.stop), yuzde(h.stopYuzde) + ' uzakta', 'eks') +
      kut('Hedef 1 · 2', f(p.tp1) + (p.tp2 ? ' · ' + f(p.tp2) : ''), 'Hedef 1 ' + yuzde(Math.abs(p.tp1 - h.giris) / h.giris * 100) + ' kazanç', 'art') +
      kut('Kazanç / risk', oran(h.r1Net) + (h.r2 ? ' · ' + oran(h.r2) : '') + 'R', 'ücret sonrası', h.r1Net >= 1.5 ? '' : 'vurgu') +
      kut('Pozisyon', '%' + f(h.poz, 0), 'sermayenin · ' + (h.kalUygun ? (h.kal > 1 ? h.kal + 'x' : '1x') : 'küçültün'), '') +
      '</div></section>';
  }
  // Karar kartı: üç koşul ve plan ayrıntısı. Emir değildir, planın koşul durumudur.
  function kararKartHtml(c) {
    var k = kararBul(c), p = c.plan;
    var kosul = function (tamam, ad, yazi) { return '<li class="' + (tamam ? 'k-tamam' : 'k-eksik') + '"><span class="k-isaret" aria-hidden="true">' + (tamam ? '✓' : '✕') + '</span><b>' + ad + '</b><span>' + esc(yazi) + '</span></li>'; };
    var govde = '';
    if (k.yon && k.renk !== 'kirmizi') {
      govde = '<ul class="kosullar">' +
        kosul(k.teknik, 'Teknik', k.teknik ? (k.sinif === 'B' ? '1G yatay, 4S plan yönünde, 1S onayı var' : '1G ve 4S plan yönünde, 1S onayı var') : k.eksikTeknik.join(', ')) +
        kosul(k.temel, 'Temel', k.temel ? 'Ters yönde önemli haber ve piyasa engeli yok' : k.eksikTemel.join(', ')) +
        kosul(k.fiyat, 'Fiyat', k.fiyat ? 'Giriş bölgesinde · stopa ' + yuzde(k.g.stopa) : k.eksikFiyat.join(', ')) + '</ul>';
    } else govde = '<p class="karar-neden">' + esc(k.neden || '') + '</p>' + (!p && c.islemYok ? '<p class="karar-ozet">' + esc(c.islemYok) + '</p>' : '');
    var plan = '';
    if (p) {
      var h = k.h || H.planHesap(p);
      plan = '<dl class="plan">' +
        '<dt>Hedef 1’de</dt><dd>yarısını kapat, stopu girişe çek</dd>' +
        '<dt>Kaldıraç</dt><dd class="sayi">' + (h.kalUygun ? (h.kal === 1 ? 'gerekmez (1x)' : h.kal + 'x yeterli') : 'pozisyonu küçültün') + '</dd>' +
        (c.funding != null ? '<dt>Funding (8 saat)</dt><dd class="sayi">%' + f(c.funding * 100, 4) + '</dd>' : '') +
        '</dl>' + (p.gecersiz ? '<p class="plan-not">' + esc(p.gecersiz) + '</p>' : '');
    }
    return '<section class="blok karar karar-' + k.renk + '"><h2 class="karar-baslik">Koşullar</h2>' + govde + (c.ozet ? '<p class="karar-ozet">' + esc(c.ozet) + '</p>' : '') + tfSatir(c.tf) + plan +
      '<p class="karar-not">Emir değildir; analiz planının koşul durumunu gösterir. Kararı siz verirsiniz. Analiz: ' + esc(durum.veri.analizZamani || '–') + '.</p></section>';
  }
  // ---------- Türev verisi (Binance açık verisi, doğrudan telefondan) ----------
  var turev = {}, TUREV_SURE = 5 * 60000;
  function turevYukle(coin) {
    var k = turev[coin];
    if (k && (k.yolda || Date.now() - k.t < TUREV_SURE)) return;
    turev[coin] = { yolda: true, t: k ? k.t : 0, v: k && k.v, hata: k && k.hata };
    var s = H.binanceSembol(coin), b = 'https://fapi.binance.com';
    var al = function (u) {
      var ctrl = window.AbortController ? new AbortController() : null, z = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
      return fetch(b + u, ctrl ? { signal: ctrl.signal } : {}).then(function (r) { clearTimeout(z); if (r.status === 400) throw new Error('yok'); if (!r.ok) throw new Error('Binance ' + r.status); return r.json(); });
    };
    // 7 günlük saatlik açık pozisyon, long/short oranı ve mumlar: son 24 saat türev özeti, tamamı tahmini likidasyon için
    Promise.all([al('/futures/data/openInterestHist?symbol=' + s + '&period=1h&limit=168'), al('/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=1h&limit=168'), al('/fapi/v1/premiumIndex?symbol=' + s), al('/fapi/v1/klines?symbol=' + s + '&interval=1h&limit=168')])
      .then(function (x) {
        var c = coinBul(coin);
        turev[coin] = { t: Date.now(), v: H.turevHesap(x[0].slice(-25), x[1].slice(-1), x[2], c && c.deg24), lik: H.likidasyonHesap(x[0], x[3], x[1], c && c.fiyat) };
        if (!turev[coin].v) turev[coin].hata = 'Veri yok';
        var g = durum.grafik; if (g && g.coin === coin && g.liqKatman && g.liqKatman.istek) g.liqKatman.istek();
      },
        function (e) { turev[coin] = { t: Date.now(), hata: e && e.message === 'yok' ? 'Bu coin Binance vadelide yok.' : navigator.onLine === false ? 'İnternet yok.' : 'Binance verisi alınamadı.' }; })
      .then(function () { var bl = $('turevBlok'), c = coinBul(coin); if (bl && c && aktifCoin() === coin) bl.outerHTML = turevHtml(c); });
  }
  function dolar(x) { return x >= 1e9 ? f(x / 1e9, 2) + ' milyar $' : x >= 1e6 ? f(x / 1e6, 1) + ' milyon $' : f(x, 0) + ' $'; }
  function cizgiSvg(seri, renk) {
    var lo = Math.min.apply(null, seri), hi = Math.max.apply(null, seri), ara = hi - lo || 1, w = 120, h = 30;
    return '<svg class="kucuk-cizgi" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><polyline fill="none" stroke="' + renk + '" stroke-width="1.6" stroke-linejoin="round" points="' +
      seri.map(function (v, i) { return (i / (seri.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - lo) / ara * (h - 4)).toFixed(1); }).join(' ') + '"/></svg>';
  }
  function turevHtml(c) {
    var k = turev[c.coin], d = k && k.v, ic;
    if (!k || (k.yolda && !d && !k.hata)) ic = '<p class="plan-not" style="margin:0">Yükleniyor…</p>';
    else if (!d) ic = '<p class="plan-not" style="margin:0">' + esc(k.hata || 'Veri yok') + '</p>';
    else {
      var oiRenk = d.oiDeg24 >= 0 ? 'var(--long)' : 'var(--short)';
      ic = '<div class="turev-ust"><div><span class="sk-et">Açık pozisyon (OI)</span><b class="sayi">' + dolar(d.oi) + '</b><small class="sayi ' + (d.oiDeg24 >= 0 ? 'art' : 'eks') + '">24s ' + degisim(d.oiDeg24) + '</small></div>' + cizgiSvg(d.seri, oiRenk) + '</div>' +
        '<dl class="plan">' +
        (d.ls != null ? '<dt>Long / short hesap oranı</dt><dd class="sayi">' + f(d.ls, 2) + ' <span class="soluk-yazi">(long %' + f(d.longYuzde, 0) + ')</span></dd>' : '') +
        (d.funding != null ? '<dt>Funding (Binance · MEXC)</dt><dd class="sayi">%' + f(d.funding * 100, 4) + (c.funding != null ? ' · %' + f(c.funding * 100, 4) : '') + '</dd>' : '') +
        likSatir(k.lik) + '</dl>' +
        '<ul class="okuma">' + d.okuma.concat(likOkuma(c, k.lik)).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    }
    return '<section class="blok turev" id="turevBlok"><h2>Türev verisi</h2>' + ic +
      '<p class="karar-not">Kaynak: Binance vadeli, ' + (k && k.t ? saat(k.t) : '–') + '. MEXC’teki pozisyonları göstermez. Likidasyon kümeleri son 7 günün açık pozisyon artışından tahmindir, kesin değildir. Hepsi bilgi amaçlıdır, “Girişe uygun” kararına girmez.</p></section>';
  }
  // Tahmini likidasyon: en yoğun küme üstte (short likidasyonu) ve altta (long likidasyonu)
  function likSatir(l) {
    if (!l || (!l.ust && !l.alt)) return '';
    var y = function (e) { return e ? f(e.p) + ' <span class="soluk-yazi">(' + (e.uzak >= 0 ? '+' : '−') + '%' + f(Math.abs(e.uzak), 1) + ')</span>' : '–'; };
    return '<dt>Tahmini likidasyon kümesi</dt><dd class="sayi">▲ ' + y(l.ust) + '<br>▼ ' + y(l.alt) + '</dd>';
  }
  // Stop bir kümenin hemen önündeyse not düşer (karar değişmez)
  function likOkuma(c, l) {
    var p = c.plan; if (!l || !p || !p.stop) return [];
    var lng = p.yon !== 'short', e = lng ? l.alt : l.ust; if (!e) return [];
    var fark = Math.abs(p.stop / e.p - 1) * 100;
    if (fark > 1) return [];
    var once = lng ? p.stop > e.p : p.stop < e.p;
    return [once ? 'Plan stopu tahmini bir likidasyon kümesinin hemen önünde: iğne stopu alıp dönebilir, kümenin ötesi daha güvenli olabilir.' : 'Plan stopu tahmini likidasyon kümesinin ötesinde.'];
  }
  // Ana düğme duruma göre: girişe uygunsa "İşleme girdim", beklerken giriş alarmı bilgisi
  function eylemHtml(c) {
    var k = kararBul(c), girdim = function (ana) { return '<button class="dugme genis' + (ana ? '' : ' ikincil') + '" data-form-ac>İşleme girdim</button>'; };
    if (k.renk === 'yesil') return girdim(true);
    if (k.renk === 'sari' && k.g && k.g.tur === 'uzak') {
      var var_ = (durum.veri.alarmlar || []).some(function (a) { return a.coin === c.coin && (a.tur === 'giris' || (a.kaynak === 'uygulama' && /Giriş/.test(a.not || ''))); });
      return '<div class="eylem">' + (var_ ? '<p class="eylem-bilgi">🔔 Fiyat giriş bölgesine gelince bildirim gelir.</p>' : '<button class="dugme genis" data-giris-alarm="' + esc(c.coin) + '">Girişe gelince haber ver</button>') + girdim(false) + '</div>';
    }
    return girdim(false);
  }
  function detaySagHtml(c) {
    var p = pozBul(c.coin);
    var poz = durum.form === c.coin ? pozFormHtml(c) :
      p ? '<section class="blok poz-blok"><div class="blok-ust"><h2>Pozisyonum</h2><span class="dugme-grup"><button class="dugme ikincil kucuk" data-form-ac>Düzenle</button><button class="dugme ikincil kucuk" data-poz-sil="' + esc(c.coin) + '">Kapattım</button></span></div>' + pozKartHtml(c, p, false) + '</section>' :
      eylemHtml(c);
    turevYukle(c.coin);
    return kararKartHtml(c) + poz + turevHtml(c) + alarmBlokHtml(c) +
      '<section class="blok"><h2>Haberler</h2>' + (c.haberler.length ? c.haberler.slice(0, 3).map(function (h) { return haberSatir(h); }).join('') : '<p class="bos">Son 24 saatte önemli haber yok.</p>') + '</section>';
  }
  // ---------- Uygulamadan fiyat alarmı ----------
  function benimAlarmlarim(coin) { return (durum.veri.alarmlar || []).filter(function (a) { return a.kaynak === 'uygulama' && (!coin || a.coin === coin); }); }
  function alarmYonYazi(c, seviye) {
    if (!seviye || isNaN(seviye) || !c.fiyat) return 'Seviyeyi yazın.';
    if (seviye === c.fiyat) return 'Seviye şu anki fiyatla aynı olamaz.';
    return 'Fiyat ' + f(seviye) + (seviye > c.fiyat ? ' üstüne çıkınca' : ' altına inince') + ' bildirim gelir (şu an ' + f(c.fiyat) + ', ' + yuzde(Math.abs(seviye - c.fiyat) / c.fiyat * 100) + ' uzakta).';
  }
  function alarmBlokHtml(c) {
    var l = benimAlarmlarim(c.coin), ic;
    var liste = l.length ? '<div class="liste">' + l.map(function (a) {
      return '<div class="satir"><span class="nokta" style="background:var(--vurgu)"></span><span class="ust-yazi sayi">' + f(a.seviye) + '</span>' +
        '<button class="dugme ikincil kucuk alarm-sil" data-alarm-sil="' + esc(a.coin + '|' + a.kosul + '|' + a.seviye) + '" aria-label="' + esc(f(a.seviye)) + ' alarmını sil">Sil</button>' +
        '<span class="alt-yazi">' + (a.kosul === 'ustune' ? 'Üstüne çıkınca' : 'Altına inince') + (a.not ? ' · ' + esc(a.not) : '') + '</span></div>';
    }).join('') + '</div>' : '';
    if (!AYAR.api) ic = '<p class="plan-not">Örnek veriyle alarm kurulamaz.</p>';
    else if (durum.alarmForm === c.coin) ic = durum.cihaz ? alarmFormHtml(c) : eslemeHtml();
    else ic = '<button class="dugme ikincil genis" data-alarm-ac>Fiyat alarmı kur</button>';
    return '<section class="blok alarm-blok"><h2>Fiyat alarmlarım</h2>' + liste + ic + '</section>';
  }
  function alarmFormHtml(c) {
    var b = basamak(c.fiyat || 1), v = c.fiyat ? Number(c.fiyat).toFixed(b).replace('.', ',') : '';
    return '<form id="alarmForm" class="poz-form" data-coin="' + esc(c.coin) + '">' +
      '<label class="alan"><span>Alarm seviyesi</span><input name="seviye" inputmode="decimal" autocomplete="off" value="' + esc(v) + '" required></label>' +
      '<p class="plan-not" id="alarmYon">' + esc(alarmYonYazi(c, c.fiyat)) + '</p>' +
      '<label class="alan"><span>Not (isteğe bağlı)</span><input name="not" maxlength="120" autocomplete="off" placeholder="ör. direnç kırılırsa bak"></label>' +
      '<p class="form-hata" id="alarmHata" role="alert"></p>' +
      '<div class="form-dugmeler"><button class="dugme" type="submit">Alarmı kur</button><button class="dugme ikincil" type="button" data-alarm-iptal>Vazgeç</button></div></form>';
  }
  function eslemeHtml(iptal) {
    var e = durum.esleme;
    return '<div class="esleme"><p class="plan-not">Bu cihazı bir kez eşleyin; kod Telegram hesabınıza gelir. Eşlenince bu cihazdan alarm kurabilir, işlemlerinizi tüm eşli cihazlarınızda görürsünüz. Bildirimler de yalnızca eşli cihazlarınıza gider.</p>' +
      (e.adim === 'kod' ? '<form id="eslemeForm" class="poz-form"><label class="alan"><span>Telegram’a gelen 6 haneli kod</span><input name="kod" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>' +
        '<div class="form-dugmeler"><button class="dugme" type="submit"' + (e.mesgul ? ' disabled' : '') + '>' + (e.mesgul ? 'Bekleyin…' : 'Eşle') + '</button><button class="dugme ikincil" type="button" data-kod-iste>Yeni kod</button></div></form>'
        : '<div class="form-dugmeler"><button class="dugme" data-kod-iste' + (e.mesgul ? ' disabled' : '') + '>' + (e.mesgul ? 'Gönderiliyor…' : 'Telegram’a kod gönder') + '</button>' + (iptal === false ? '' : '<button class="dugme ikincil" data-alarm-iptal>Vazgeç</button>') + '</div>') +
      '<p class="form-hata" id="eslemeHata" role="alert">' + esc(e.hata) + '</p></div>';
  }
  function alarmBlokYenile() { var c = coinBul(aktifCoin()); var b = document.querySelector('.alarm-blok'); if (c && b) b.outerHTML = alarmBlokHtml(c); }
  function eslemeBlokHtml() { return '<section class="blok esleme-blok"><h2>Diğer cihazlarla eşitle</h2>' + eslemeHtml(false) + '</section>'; }
  function eslemeYenile() {
    alarmBlokYenile();
    var eb = document.querySelector('.esleme-blok'); if (!eb) return;
    if (durum.cihaz) goster(); else eb.outerHTML = eslemeBlokHtml();
  }
  function kodIste() {
    durum.esleme.mesgul = true; durum.esleme.hata = ''; eslemeYenile();
    apiYaz({ f: 'kodIste' }).then(function () { durum.esleme.adim = 'kod'; }, function (e) { durum.esleme.hata = e.message; if (/bekleyin/.test(e.message)) durum.esleme.adim = 'kod'; })
      .then(function () { durum.esleme.mesgul = false; eslemeYenile(); var i = document.querySelector('#eslemeForm input'); if (i) i.focus(); });
  }
  function eslestir(form) {
    var kod = form.kod.value.replace(/\D/g, '');
    if (kod.length !== 6) { $('eslemeHata').textContent = '6 haneli kodu yazın.'; return; }
    durum.esleme.mesgul = true; eslemeYenile();
    var abone = window.KOKPIT_BILDIRIM && window.KOKPIT_BILDIRIM.aboneId ? window.KOKPIT_BILDIRIM.aboneId() : Promise.resolve('');
    abone.then(function (id) { return apiYaz({ f: 'esles', kod: kod, abone: id || '' }); }).then(function (j) {
      durum.cihaz = j.t; yaz('dkc-cihaz', j.t); durum.esleme = { adim: '', hata: '', mesgul: false };
      yaz('dkc-poz-aktarildi', false); yaz('dkc-poz-kuyruk', []); pozEsitle();
    }, function (e) { durum.esleme.mesgul = false; durum.esleme.hata = e.message; if (/süresi doldu|Çok fazla/.test(e.message)) durum.esleme.adim = ''; })
      .then(eslemeYenile);
  }
  function alarmKur(form) {
    var c = coinBul(form.dataset.coin), sv = sayiOku(form.seviye.value), hata = $('alarmHata');
    if (!c || !sv || isNaN(sv)) { hata.textContent = 'Geçerli bir seviye yazın.'; return; }
    if (sv === c.fiyat) { hata.textContent = 'Seviye şu anki fiyatla aynı olamaz.'; return; }
    var a = { coin: c.coin, kosul: sv > c.fiyat ? 'ustune' : 'altina', seviye: sv, not: form.not.value.trim().slice(0, 120) };
    var dugme = form.querySelector('[type=submit]'); dugme.disabled = true; dugme.textContent = 'Kuruluyor…'; hata.textContent = '';
    apiYaz({ f: 'alarmEkle', t: durum.cihaz, coin: a.coin, kosul: a.kosul, seviye: a.seviye, not: a.not }).then(function (j) {
      if (!j.zaten) durum.veri.alarmlar.push({ coin: a.coin, tur: 'alarm', seviye: a.seviye, kosul: a.kosul, kaynak: 'uygulama', not: a.not, durum: 'bekliyor' });
      durum.alarmForm = ''; detayGuncelle(); grafikKur(c);
    }, function (e) {
      if (!durum.cihaz) { alarmBlokYenile(); return; }
      hata.textContent = e.message; dugme.disabled = false; dugme.textContent = 'Alarmı kur';
    });
  }
  function girisAlarmKur(c, dugme) {
    if (!c || !c.plan) return;
    if (!AYAR.api || !durum.cihaz) { durum.alarmForm = c.coin; alarmBlokYenile(); var b = document.querySelector('.alarm-blok'); if (b) b.scrollIntoView({ block: 'center' }); return; }
    var lng = c.plan.yon !== 'short', sv = lng ? c.plan.giris[1] : c.plan.giris[0], a = { coin: c.coin, kosul: lng ? 'altina' : 'ustune', seviye: sv, not: 'Giriş bölgesi' };
    dugme.disabled = true; dugme.textContent = 'Kuruluyor…';
    apiYaz({ f: 'alarmEkle', t: durum.cihaz, coin: a.coin, kosul: a.kosul, seviye: a.seviye, not: a.not }).then(function (j) {
      if (!j.zaten) durum.veri.alarmlar.push({ coin: a.coin, tur: 'alarm', seviye: a.seviye, kosul: a.kosul, kaynak: 'uygulama', not: a.not, durum: 'bekliyor' });
      detayGuncelle(); grafikKur(c);
    }, function (e) { dugme.disabled = false; dugme.textContent = 'Girişe gelince haber ver'; window.alert('Alarm kurulamadı: ' + e.message); });
  }
  function alarmSil(anahtar, dugme) {
    var p = anahtar.split('|'), sv = Number(p[2]);
    if (!window.confirm(p[0] + ' ' + f(sv) + ' alarmını silmek istiyor musunuz?')) return;
    if (!durum.cihaz) { durum.alarmForm = p[0]; alarmBlokYenile(); return; }
    dugme.disabled = true; dugme.textContent = '…';
    apiYaz({ f: 'alarmSil', t: durum.cihaz, coin: p[0], kosul: p[1], seviye: sv }).then(function () {
      durum.veri.alarmlar = durum.veri.alarmlar.filter(function (a) { return !(a.kaynak === 'uygulama' && a.coin === p[0] && a.kosul === p[1] && a.seviye === sv); });
      goster();
    }, function (e) { dugme.disabled = false; dugme.textContent = 'Sil'; window.alert('Silinemedi: ' + e.message); if (!durum.cihaz) { durum.alarmForm = p[0]; alarmBlokYenile(); } });
  }

  function detayEkran(coin) {
    var c = coinBul(coin);
    if (!c) return '<a class="geri" href="#/">← Kokpit</a><p class="bos">' + esc(coin) + ' listede yok.</p>';
    var fav = favoriMi(c.coin), seviye = katman('seviye'), plan = katman('plan') && c.plan, gos = katman('gosterge');
    var yr = c.plan && c.plan.yon === 'short' ? 'var(--short-yon)' : 'var(--long)';
    var cip = function (k, ad) { return '<button class="katman" data-katman="' + k + '" aria-pressed="' + katman(k) + '">' + ad + '</button>'; };
    return '<div class="d-ust"><a class="geri-ikon" href="#/" aria-label="Geri"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
      '<h1>' + esc(c.coin) + '</h1><span class="sayi d-fiyat" id="dFiyat"' + cf(c) + '>' + f(c.fiyat) + '</span><span class="sayi d-deg ' + (c.deg24 >= 0 ? 'art' : 'eks') + '" id="dDeg">' + degisim(c.deg24) + '</span>' +
      '<button class="yildiz-dugme' + (fav ? ' acik' : '') + '" data-favori="' + esc(c.coin) + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Favorilerden çıkar' : 'Favorilere ekle') + '">' + YILDIZ + '</button></div>' +
      ozetSeritHtml(c) +
      '<div class="detay"><section class="blok grafik-blok"><div class="grafik-ust"><div class="sekmeler" role="group" aria-label="Zaman dilimi">' +
      TF.map(function (t) { return '<button data-tf="' + t[0] + '" aria-pressed="' + (durum.tf === t[0]) + '" aria-label="' + t[2] + '">' + t[1] + '</button>'; }).join('') +
      '</div><div class="grafik-arac"><button class="tam-dugme" id="tamEkran" title="Tam ekran (F)">' + TAM_IKON + '<span>Tam ekran</span></button></div></div>' +
      '<div class="katmanlar" role="group" aria-label="Grafik katmanları">' + cip('plan', 'Plan') + cip('seviye', 'Seviyeler') + cip('gosterge', 'RSI · Hacim') + cip('likidasyon', 'Likidasyon') + '</div>' +
      '<span class="tam-baslik">' + esc(c.coin) + ' <span class="sayi"' + cf(c) + '>' + f(c.fiyat) + '</span></span>' +
      '<div id="grafik" role="img" aria-label="' + esc(c.coin) + ' mum grafiği"></div>' +
      (gos ? '<div class="rsi-kutu"><span class="rsi-et">RSI 14 <b id="rsiDeger">–</b></span><div id="rsiGrafik" aria-hidden="true"></div></div>' : '') +
      '<div class="lejant">' + (pozBul(c.coin) ? '<span><i style="background:var(--mavi)"></i>Girişim</span>' : '') +
      (plan ? '<span><i class="kare" style="background:' + yr + '"></i>Giriş bölgesi</span><span><i class="kare" style="background:var(--short)"></i>Stop alanı</span><span><i class="kare" style="background:var(--long)"></i>Hedef alanı</span>' : '') +
      (seviye ? '<span><i class="kare" style="background:var(--gri-bant)"></i>Destek / direnç</span><span>▾▴ Tepe / dip</span>' : '') +
      (katman('likidasyon') ? '<span><i class="kare" style="background:var(--liq)"></i>Tahmini likidasyon (Binance)</span>' : '') + '<span><i style="background:var(--ema)"></i>EMA50</span><span class="lejant-saat">Türkiye saati</span></div></section>' +
      '<div class="detay-sag" id="detaySag">' + detaySagHtml(c) + '</div></div>' +
      '<p class="uyari">Yatırım tavsiyesi değildir. Seviyeler ' + esc(durum.veri.analizZamani || '') + ' analizinden. Kazanç/risk ücret payı dahil, funding hariçtir.</p>';
  }
  // Grafik katmanları: telefonda varsayılan yalnız Plan, masaüstünde hepsi açık; seçim cihazda saklanır
  function katman(k) { return durum.katman[k] != null ? !!durum.katman[k] : k === 'plan' || MASA.matches; }
  function detayGuncelle() {
    var c = coinBul(aktifCoin()); if (!c) return;
    if ($('dFiyat')) { $('dFiyat').textContent = f(c.fiyat); $('dDeg').textContent = degisim(c.deg24); $('dDeg').className = 'sayi d-deg ' + (c.deg24 >= 0 ? 'art' : 'eks'); }
    if ($('dOzet')) $('dOzet').outerHTML = ozetSeritHtml(c);
    if ($('detaySag') && !durum.form && !durum.alarmForm) $('detaySag').innerHTML = detaySagHtml(c);
  }

  // ---------- İşlemlerim ----------
  function islemEkran() {
    var r = H.toplamRisk(durum.poz.filter(function (p) { return coinBul(p.coin); }), fiyatlar(), durum.sermaye), ry = riskYazi(r);
    var dol = durum.sermaye ? Math.min(100, Math.max(r.yonler.long, r.yonler.short) / r.tavan * 100) : 0;
    return '<section class="blok"><h2>Sermaye ve toplam risk</h2>' +
      '<label class="alan"><span>Futures sermayeniz (USDT)</span><input id="sermaye" inputmode="decimal" autocomplete="off" placeholder="ör. 1000" value="' + esc(durum.sermaye || '') + '"></label>' +
      '<div class="risk-cubuk' + (r.asildi ? ' asildi' : '') + '" role="img" aria-label="Açık risk ' + ry.deger + ', yön başına tavan yüzde ' + r.tavan + '"><i style="width:' + dol + '%"></i></div>' +
      '<p class="risk-yazi">Açık risk <b>' + ry.deger + '</b> · ' + esc(ry.alt) + (r.asildi ? ' · <span class="eks">Bir yönde tavan aşıldı: o yönde yeni işlem açmayın, pozisyon küçültmeyi düşünün.</span>' : '') + '</p>' +
      '<p class="plan-not">Risk = stop olursa kaybedilecek tutar. Aynı yöndeki kripto işlemleri birlikte hareket ettiği için tavan long ve short için ayrı ayrı %5’tir. Ücret ve funding hariçtir.</p></section>' +
      '<section class="blok"><h2>Açık işlemlerim</h2>' + (durum.poz.length ? '<div class="plan-kartlar">' + durum.poz.map(function (p) {
        var c = coinBul(p.coin) || { coin: p.coin, fiyat: null };
        return '<div>' + pozKartHtml(c, p, true) + '<button class="dugme ikincil kucuk poz-sil" data-poz-sil="' + esc(p.coin) + '">Kapattım, listeden çıkar</button></div>';
      }).join('') + '</div>' : '<p class="bos">Açık işlem yok. Bir coinin sayfasında “İşleme girdim”e basarak ekleyin.</p>') +
      '<p class="plan-not poz-not">' + esc(pozNot()) + '</p></section>' + (AYAR.api && !durum.cihaz ? eslemeBlokHtml() : '');
  }

  // ---------- Alarmlar ----------
  function alarmEkran() {
    var v = durum.veri, al = v.alarmlar, tet = v.tetiklenen;
    if (tet[0]) { yaz('dkc-okundu', tetAnahtar(tet[0])); }
    var bd = window.KOKPIT_BILDIRIM ? window.KOKPIT_BILDIRIM.durum() : 'kapali';
    return '<section class="blok bildirim"><div><h2 style="margin:0">Telefon bildirimleri</h2><p>' +
      (bd === 'acik' ? 'Açık. Alarm çaldığında telefonunuza bildirim gelir; bildirime basınca grafik açılır.' : bd === 'kurulmadi' ? 'Bildirim servisi kurulunca buradan açabileceksiniz.' : bd === 'desteklenmiyor' ? 'Bildirim için uygulamayı önce ana ekrana ekleyin, sonra oradan açın.' : 'Kapalı. Açınca alarm çaldığında telefonunuza bildirim gelir.') + '</p></div>' +
      (bd === 'acik' ? '<span class="durum d-long">Açık</span>' : '<button class="dugme" id="bildirimAc"' + (bd === 'desteklenmiyor' || bd === 'kurulmadi' ? ' disabled' : '') + '>Bildirimleri aç</button>') + '</section>' +
      '<div class="alarm-iki"><section class="blok"><h2>Son çalan alarmlar</h2><div class="liste">' + (tet.length ? tet.map(tetSatir).join('') : '<p class="bos">Henüz çalan alarm yok.</p>') + '</div></section>' +
      '<section class="blok"><h2>Bekleyen alarmlar (' + al.length + ')</h2><div class="liste">' + (al.length ? al.map(function (a) {
        return '<a class="satir" href="#/coin/' + encodeURIComponent(a.coin) + '"><span class="nokta" style="background:' + alarmRenk(a.tur) + '"></span><span class="ust-yazi">' + esc(a.coin) + ' · ' + esc(ALARM_ADI[a.tur] || a.tur) + '</span>' +
          '<span class="sag sayi">' + (a.tur === 'ani' ? '1 saatte ±%' + f(a.seviye, 0) : f(a.seviye)) + '</span><span class="alt-yazi">' + (a.tur === 'ani' ? 'Sert hareket olursa haber verir' : a.kaynak === 'uygulama' ? 'Sizin alarmınız · ' + (a.kosul === 'ustune' ? 'üstüne çıkınca' : 'altına inince') + (a.not ? ' · ' + esc(a.not) : '') : 'Fiyat bu seviyeye gelince haber verir') + '</span></a>';
      }).join('') : '<p class="bos">Bekleyen alarm yok. Coin sayfasından fiyat alarmı kurabilirsiniz.</p>') + '</div></section></div>' +
      '<p class="uyari">Kendi fiyat alarmınızı coin sayfasındaki “Fiyat alarmı kur” ile kurar, orada silersiniz. Alarmlar bilgi amaçlıdır; gerçek koruma için stop emrinizi MEXC’de verin.</p>';
  }

  // ---------- Grafik ----------
  var TR_OFS = 3 * 3600; // grafikte Türkiye saati (UTC+3, yaz saati yok)
  function ema(veri, n) { var k = 2 / (n + 1), e = null; return veri.map(function (m) { e = e == null ? m.close : m.close * k + e * (1 - k); return { time: m.time, value: e }; }); }
  function grafikKaldir() {
    if (CANLI) CANLI.mumIzle(null);
    if (durum.grafik) { try { durum.grafik.izle.disconnect(); if (durum.grafik.rsiGrafik) durum.grafik.rsiGrafik.remove(); durum.grafik.grafik.remove(); } catch (e) { /* zaten kaldırılmış */ } durum.grafik = null; }
  }
  var HACIM_RENK = { art: 'rgba(47,191,128,0.32)', eks: 'rgba(239,90,82,0.32)' };
  function hacimNokta(m) { return { time: m.time, value: Number(m.vol) || 0, color: m.close >= m.open ? HACIM_RENK.art : HACIM_RENK.eks }; }
  // RSI çizgisi ilk 14 mumda boş nokta alır: iki grafiğin mum sıraları aynı kalsın (kaydırma eşlemesi için)
  function rsiNoktalar(veri) {
    var r = H.rsiSeri(veri.map(function (m) { return m.close; }), 14);
    return veri.map(function (m, i) { return r[i] == null ? { time: m.time } : { time: m.time, value: r[i] }; });
  }
  function rsiYaz(deger) { var el = $('rsiDeger'); if (el) { el.textContent = deger == null ? '–' : f(deger, 0); el.className = deger >= 70 ? 'eks' : deger <= 30 ? 'art' : ''; } }
  // Canlı mum: açık mumu günceller, yeni mum gelince ekler
  function grafikCanli(k) {
    var g = durum.grafik; if (!g || !g.veri || g.coin !== k.coin || g.tf !== k.tf) return;
    var m = { time: k.time + TR_OFS, open: k.open, high: k.high, low: k.low, close: k.close, vol: k.vol }, v = g.veri, son = v[v.length - 1];
    if (!son || m.time < son.time) return;
    if (m.time === son.time) v[v.length - 1] = m; else { v.push(m); if (v.length > 400) v.shift(); }
    try {
      g.mum.update({ time: m.time, open: m.open, high: m.high, low: m.low, close: m.close });
      if (g.hacim) g.hacim.update(hacimNokta(m));
      var e = ema(v, 50); if (v.length >= 50) g.ort.update(e[e.length - 1]);
      if (g.rsi) { var r = rsiNoktalar(v), sonR = r[r.length - 1]; if (sonR.value != null) { g.rsi.update(sonR); rsiYaz(sonR.value); } }
    } catch (x) { /* grafik kapanırken gelen mum */ }
  }
  // Grafik üstüne tuvalle çizilen katman (Lightweight Charts primitive): her yeniden çizimde DOM kurmaz
  // alt: mumların altına (alanlar), ust: mumların üstüne (yazılar)
  function Katman(alt, ust) {
    var gor = function (sira, ciz) { return { zOrder: function () { return sira; }, renderer: function () { return { draw: function (hedef) { hedef.useMediaCoordinateSpace(function (s) { try { ciz(s.context, s.mediaSize); } catch (e) { /* grafik kapanırken */ } }); } }; } }; };
    this.gorunum = [gor('bottom', alt)]; if (ust) this.gorunum.push(gor('top', ust));
  }
  Katman.prototype.paneViews = function () { return this.gorunum; };
  Katman.prototype.attached = function (p) { this.istek = p.requestUpdate; };
  Katman.prototype.updateAllViews = function () {};
  function yaziCiz(ctx, metin, x, y, renk, sag) {
    ctx.font = '600 11px IBM Plex Sans, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(metin).width + 10, x0 = sag ? x - w : x;
    ctx.fillStyle = 'rgba(14,17,23,0.72)'; ctx.fillRect(x0, y - 9, w, 18);
    ctx.fillStyle = renk; ctx.fillText(metin, x0 + 5, y);
  }
  // Tepe ve dipler: iki yanında n mumdan yüksek/alçak olan mumlar, son 3'er tane
  function tepeDip(veri, n) {
    var t = [], d = [];
    for (var i = n; i < veri.length - n; i++) {
      var tp = true, dp = true;
      for (var j = i - n; j <= i + n; j++) { if (j === i) continue; if (j < i ? veri[j].high >= veri[i].high : veri[j].high > veri[i].high) tp = false; if (j < i ? veri[j].low <= veri[i].low : veri[j].low < veri[i].low) dp = false; }
      if (tp) t.push(veri[i]); if (dp) d.push(veri[i]);
    }
    var gri = 'rgba(175,183,198,0.85)';
    return t.slice(-3).map(function (m) { return { time: m.time, position: 'aboveBar', color: gri, shape: 'arrowDown', size: 0.6, text: f(m.high) }; })
      .concat(d.slice(-3).map(function (m) { return { time: m.time, position: 'belowBar', color: gri, shape: 'arrowUp', size: 0.6, text: f(m.low) }; }))
      .sort(function (a, b) { return a.time - b.time; });
  }
  function grafikKur(c) {
    var kutu = $('grafik'); if (!kutu || !window.LightweightCharts) return;
    grafikKaldir(); kutu.innerHTML = '';
    var css = getComputedStyle(document.documentElement), r = function (n) { return css.getPropertyValue(n).trim(); };
    var cz = c.cizim || {}, seviye = katman('seviye'), gos = katman('gosterge'), liq = katman('likidasyon'), p = katman('plan') ? c.plan : null, poz = pozBul(c.coin), seviyeler = [], sart = [];
    var g = LightweightCharts.createChart(kutu, {
      autoSize: true, layout: { background: { color: 'transparent' }, textColor: r('--sonuk'), fontFamily: 'IBM Plex Sans, system-ui, sans-serif' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderColor: r('--cizgi'), minimumWidth: 64, scaleMargins: { top: 0.06, bottom: gos ? 0.2 : 0.06 } }, timeScale: { borderColor: r('--cizgi'), timeVisible: durum.tf !== 'd' },
      crosshair: { mode: 0 }, localization: { locale: 'tr-TR', priceFormatter: function (x) { return f(x); } }
    });
    if (p) { sart.push(p.stop, p.tp1, p.giris[0], p.giris[1]); if (p.tp2) seviyeler.push(p.tp2); }
    if (poz) seviyeler.push(poz.giris);
    if (seviye) (cz.destek || []).concat(cz.direnc || []).forEach(function (b) { seviyeler.push(b[0], b[1]); });
    var mum = g.addCandlestickSeries({
      autoscaleInfoProvider: function (asil) { var a = asil(); if (!a || !a.priceRange) return a; var lo = a.priceRange.minValue, hi = a.priceRange.maxValue, ara = hi - lo;
        seviyeler.forEach(function (v) { if (v < lo && lo - v < ara * 0.6) lo = v; if (v > hi && v - hi < ara * 0.6) hi = v; }); sart.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); return { priceRange: { minValue: lo, maxValue: hi }, margins: { above: 8, below: 8 } }; },
      upColor: r('--long'), downColor: r('--short'), wickUpColor: r('--long'), wickDownColor: r('--short'), borderVisible: false, priceFormat: { type: 'price', precision: basamak(c.fiyat || 1), minMove: Math.pow(10, -basamak(c.fiyat || 1)) } });
    var ort = g.addLineSeries({ color: r('--ema'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    var hacim = null;
    if (gos) { hacim = g.addHistogramSeries({ priceScaleId: 'hacim', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }); g.priceScale('hacim').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } }); }
    var kayit = { grafik: g, izle: { disconnect: function () {} }, coin: c.coin, tf: durum.tf, mum: mum, ort: ort, hacim: hacim }; durum.grafik = kayit;
    // Fiyat ekseninde yalnız etiket; çizgileri ve alanları katman çizer
    var etiket = function (fiyat, renk, baslik) { mum.createPriceLine({ price: fiyat, color: renk, lineWidth: 1, lineVisible: false, axisLabelVisible: true, title: baslik }); };
    var cizgi = function (fiyat, renk, baslik, kesik) { mum.createPriceLine({ price: fiyat, color: renk, lineWidth: kesik ? 1 : 2, lineStyle: kesik ? 2 : 0, axisLabelVisible: true, title: baslik }); };
    (durum.veri.alarmlar || []).forEach(function (a) { if (a.kaynak === 'uygulama' && a.coin === c.coin) cizgi(a.seviye, r('--vurgu'), 'Alarm', true); });
    if (poz) { cizgi(poz.giris, r('--mavi'), 'Girişim', false); if (poz.stop && (!p || poz.stop !== p.stop)) cizgi(poz.stop, r('--short'), 'Stopum', true); }
    // Destek / direnç: gri bant
    if (seviye && ((cz.destek || []).length || (cz.direnc || []).length)) {
      var bantlar = (cz.destek || []).map(function (b) { return [b, 'Destek']; }).concat((cz.direnc || []).map(function (b) { return [b, 'Direnç']; }));
      mum.attachPrimitive(new Katman(function (ctx, boy) {
        bantlar.forEach(function (z) {
          var y1 = mum.priceToCoordinate(z[0][1]), y2 = mum.priceToCoordinate(z[0][0]); if (y1 == null || y2 == null) return;
          var ust = Math.min(y1, y2), yuk = Math.max(2, Math.abs(y2 - y1));
          ctx.fillStyle = 'rgba(150,160,180,0.11)'; ctx.fillRect(0, ust, boy.width, yuk);
          ctx.fillStyle = 'rgba(150,160,180,0.38)'; ctx.fillRect(0, ust, boy.width, 1); ctx.fillRect(0, ust + yuk - 1, boy.width, 1);
          ctx.font = '500 10.5px IBM Plex Sans, system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillStyle = 'rgba(190,197,210,0.7)'; ctx.fillText(z[1], 6, ust - 2);
        });
      }));
    }
    // Plan: TradingView pozisyon aracı gibi; giriş bölgesi yön renginde, stop alanı kırmızı, hedef alanı yeşil
    if (p) {
      var lng = p.yon !== 'short', yr = lng ? r('--long') : r('--short-yon'), h = H.planHesap(p), orta = (p.giris[0] + p.giris[1]) / 2;
      var rgba = function (hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };
      mum.attachPrimitive(new Katman(function (ctx, boy) {
        var y = function (v) { return mum.priceToCoordinate(v); }, gy1 = y(p.giris[1]), gy0 = y(p.giris[0]), ys = y(p.stop), yt1 = y(p.tp1), yt2 = p.tp2 ? y(p.tp2) : null, ym = y(orta);
        if (gy1 == null || gy0 == null || ys == null || yt1 == null) return;
        var son = kayit.veri && kayit.veri[kayit.veri.length - 1], xs = son ? g.timeScale().timeToCoordinate(son.time) : null;
        var x0 = Math.max(0, Math.min(boy.width * 0.72, (xs == null ? boy.width * 0.7 : xs) - boy.width * 0.3)), w = boy.width - x0;
        // giriş bölgesi: tüm genişlikte soluk, kutuda belirgin
        ctx.fillStyle = rgba(yr, 0.08); ctx.fillRect(0, Math.min(gy0, gy1), boy.width, Math.max(2, Math.abs(gy0 - gy1)));
        ctx.fillStyle = rgba(yr, 0.26); ctx.fillRect(x0, Math.min(gy0, gy1), w, Math.max(2, Math.abs(gy0 - gy1)));
        ctx.fillStyle = yr; ctx.fillRect(0, gy1, boy.width, 1); ctx.fillRect(0, gy0, boy.width, 1);
        // stop alanı ve hedef alanı (orta girişten)
        ctx.fillStyle = rgba(r('--short'), 0.14); ctx.fillRect(x0, Math.min(ym, ys), w, Math.abs(ys - ym));
        ctx.fillStyle = rgba(r('--long'), 0.13); ctx.fillRect(x0, Math.min(ym, yt1), w, Math.abs(yt1 - ym));
        if (yt2 != null) { ctx.fillStyle = rgba(r('--long'), 0.06); ctx.fillRect(x0, Math.min(yt1, yt2), w, Math.abs(yt2 - yt1)); }
        ctx.fillStyle = r('--short'); ctx.fillRect(x0, ys - 1, w, 2);
        ctx.fillStyle = r('--long'); ctx.fillRect(x0, yt1 - 1, w, 2); if (yt2 != null) { ctx.globalAlpha = 0.6; ctx.fillRect(x0, yt2, w, 1); ctx.globalAlpha = 1; }
      }, function (ctx, boy) {
        var y = function (v) { return mum.priceToCoordinate(v); }, gy1 = y(p.giris[1]), gy0 = y(p.giris[0]), ys = y(p.stop), yt1 = y(p.tp1), yt2 = p.tp2 ? y(p.tp2) : null;
        if (gy1 == null || gy0 == null || ys == null || yt1 == null) return;
        var son = kayit.veri && kayit.veri[kayit.veri.length - 1], xs = son ? g.timeScale().timeToCoordinate(son.time) : null;
        var x0 = Math.max(0, Math.min(boy.width * 0.72, (xs == null ? boy.width * 0.7 : xs) - boy.width * 0.3));
        var yaz = function (m, yy, renk, alt) { yaziCiz(ctx, m, x0 + 6, yy + (alt ? 11 : -11), renk); };
        yaz('Stop ' + yuzde(h.stopYuzde), ys, r('--short'), !lng);
        yaz('Hedef 1 · ' + oran(h.r1Net) + 'R', yt1, r('--long'), lng ? false : true);
        if (yt2 != null) yaz('Hedef 2 · ' + oran(h.r2) + 'R', yt2, r('--long'), lng ? false : true);
        yaziCiz(ctx, (lng ? '▲ LONG' : '▼ SHORT') + ' giriş', x0 > 120 ? x0 - 6 : 6, (gy0 + gy1) / 2, yr, x0 > 120);
      }));
      etiket(p.giris[1], yr, ''); etiket(p.giris[0], yr, ''); etiket(p.stop, r('--short'), 'Stop'); etiket(p.tp1, r('--long'), 'H1'); if (p.tp2) etiket(p.tp2, r('--long'), 'H2');
    }
    // Tahmini likidasyon: fiyat ekseninin yanında dar ısı şeridi; mumların üstüne boyanmaz
    if (liq) {
      turevYukle(c.coin);
      var liqRenk = r('--liq');
      kayit.liqKatman = new Katman(function () {}, function (ctx, boy) {
        var k = turev[c.coin], d = k && k.lik, x = boy.width - 13, sw = 11;
        ctx.font = '500 10px IBM Plex Sans, system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(14,17,23,0.72)'; var bas = d ? 'Tahmini liq · Binance verisi' : k && !k.yolda ? 'Likidasyon verisi yok' : 'Likidasyon yükleniyor…', bw = ctx.measureText(bas).width + 8;
        ctx.fillRect(boy.width - bw - 2, 4, bw, 15); ctx.fillStyle = 'rgba(190,197,210,0.85)'; ctx.fillText(bas, boy.width - 6, 6); ctx.textAlign = 'left';
        if (!d) return;
        var son = kayit.veri && kayit.veri[kayit.veri.length - 1], fy = son ? son.close : d.fiyat;
        var hi = mum.coordinateToPrice(22), lo = mum.coordinateToPrice(boy.height); if (hi == null || lo == null) return;
        var kume = d.kume.filter(function (z) { return z.yon === 'long' ? z.p < fy : z.p > fy; });
        var n = Math.max(20, Math.floor((boy.height - 22) / 3)), dil = H.likidasyonDilim(kume, lo, hi, n), en = Math.max.apply(null, dil), h = (boy.height - 22) / n;
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x, 22, sw, boy.height - 22);
        if (!(en > 0)) return;
        dil.forEach(function (v, i) {
          if (!v) return; var oran_ = v / en;
          ctx.globalAlpha = 0.15 + 0.85 * Math.pow(oran_, 0.7); ctx.fillStyle = liqRenk; ctx.fillRect(x, boy.height - (i + 1) * h, sw, Math.max(1, h));
        });
        ctx.globalAlpha = 1;
        // en yoğun küme (üstte ve altta): şeridin solunda küçük üçgen; sayılar Türev verisi bölümünde
        ['ust', 'alt'].forEach(function (z) {
          var e = d[z]; if (!e) return; var yy = mum.priceToCoordinate(e.p); if (yy == null || yy < 24 || yy > boy.height - 4) return;
          ctx.fillStyle = liqRenk; ctx.beginPath(); ctx.moveTo(x - 1, yy); ctx.lineTo(x - 7, yy - 4); ctx.lineTo(x - 7, yy + 4); ctx.closePath(); ctx.fill();
        });
      });
      mum.attachPrimitive(kayit.liqKatman);
    }
    // RSI: ayrı küçük grafik, kaydırma ve yakınlaştırma ana grafikle eş
    var rsiKutu = gos ? $('rsiGrafik') : null;
    if (rsiKutu) {
      var rg = LightweightCharts.createChart(rsiKutu, {
        autoSize: true, layout: { background: { color: 'transparent' }, textColor: r('--sonuk'), fontFamily: 'IBM Plex Sans, system-ui, sans-serif', fontSize: 10 },
        grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { visible: false } },
        rightPriceScale: { borderColor: r('--cizgi'), minimumWidth: 64, scaleMargins: { top: 0.1, bottom: 0.1 } }, timeScale: { visible: false },
        crosshair: { mode: 0, horzLine: { visible: false } }, handleScroll: false, handleScale: false, localization: { locale: 'tr-TR' }
      });
      var rs = rg.addLineSeries({ color: r('--mavi'), lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        autoscaleInfoProvider: function () { return { priceRange: { minValue: 0, maxValue: 100 } }; }, priceFormat: { type: 'price', precision: 0, minMove: 1 } });
      [70, 30].forEach(function (x) { rs.createPriceLine({ price: x, color: 'rgba(255,255,255,0.25)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }); });
      kayit.rsiGrafik = rg; kayit.rsi = rs;
      g.timeScale().subscribeVisibleLogicalRangeChange(function (ar) { if (ar && durum.grafik === kayit) rg.timeScale().setVisibleLogicalRange(ar); });
    }
    var tf = durum.tf, cizildi = false, uzunluk = 0;
    function ciz(veri) {
      veri = veri.map(function (m) { return { time: m.time + TR_OFS, open: m.open, high: m.high, low: m.low, close: m.close, vol: m.vol }; });
      mum.setData(veri.map(function (m) { return { time: m.time, open: m.open, high: m.high, low: m.low, close: m.close }; })); ort.setData(ema(veri, 50).slice(49));
      if (hacim && veri[0].vol != null) hacim.setData(veri.map(hacimNokta));
      if (kayit.rsi) { var rn = rsiNoktalar(veri); kayit.rsi.setData(rn); rsiYaz(rn[rn.length - 1].value); }
      if (seviye) mum.setMarkers(tepeDip(veri, MASA.matches ? 5 : 4));
      kayit.veri = veri;
      if (CANLI) CANLI.mumIzle(c.coin, tf);
      if (seviye && !cizildi) (cz.trend || []).forEach(function (t) {
        var s = g.addLineSeries({ color: 'rgba(175,183,198,0.8)', lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([{ time: t.t1 + TR_OFS, value: t.p1 }, { time: t.t2 + TR_OFS, value: t.p2 }]);
      });
      if (veri.length !== uzunluk) g.timeScale().setVisibleLogicalRange({ from: veri.length - (MASA.matches ? 90 : 48), to: veri.length + (p ? (MASA.matches ? 14 : 9) : 3) + (liq ? 3 : 0) });
      cizildi = true; uzunluk = veri.length;
    }
    var eski = AYAR.api ? mumOnbellek(c.coin, tf) : null;
    if (eski) { try { ciz(eski.m); } catch (x) { cizildi = false; } if (tf === 'm15' && CANLI && CANLI.m15Tohum) CANLI.m15Tohum(c.coin, eski.m); }
    if (!eski || Date.now() - eski.t >= 60000) mumYukle(c.coin, tf, c.fiyat).then(function (veri) {
      if (durum.grafik !== kayit) return; // bu sırada başka grafik açıldı: eski yanıtı at
      if (!veri || !veri.length) throw new Error('bos');
      ciz(veri);
    }).catch(function (e) {
      if (durum.grafik !== kayit || cizildi) return; // önbellekten çizildiyse eski grafik kalır
      var msg = e && /Geçersiz/.test(e.message) && tf === 'm15' ? '15 dakikalık grafik sunucu güncellenince açılacak.' : 'Grafik verisi alınamadı.';
      kutu.insertAdjacentHTML('beforeend', '<div class="grafik-hata"><p>' + msg + '</p><button class="dugme ikincil kucuk" data-grafik-yenile>Tekrar dene</button></div>');
    });
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
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.key === 'Escape' && tamAcikMi()) tamEkran(false);
    else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && document.querySelector('.grafik-blok')) tamEkran();
  });

  // ---------- Hata ekranı ----------
  function hataEkran() {
    var neden = durum.hata === 'internet' ? 'Telefonunuz internete bağlı değil.' : durum.hata.indexOf('sunucu') === 0 ? 'Veri servisi hata verdi (' + esc(durum.hata.slice(8)) + ').' : 'Veri servisine ulaşılamadı. Biraz sonra tekrar deneyin.';
    return '<section class="hata-ekran"><svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v5M12 18v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '<h1>Veriler alınamadı</h1><p>' + neden + '</p><button class="dugme" data-yenile>Tekrar dene</button>' +
      '<p class="plan-not">Alarmlarınız bu ekrandan bağımsız çalışır; bildirimler gelmeye devam eder.</p></section>';
  }

  // ---------- Yönlendirme ----------
  function goster() {
    tazelikGuncelle();
    var h = location.hash.replace(/^#\/?/, ''), parca = h.split('/');
    var sekme = parca[0] === 'alarmlar' ? 'alarm' : parca[0] === 'islemler' ? 'islem' : parca[0] === 'coin' ? '' : 'ana';
    document.querySelectorAll('.alt-menu a, .ust-menu a').forEach(function (a) { if (a.dataset.sekme === sekme) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!durum.veri) {
      grafikKaldir();
      $('ekran').innerHTML = durum.hata && !durum.yukleniyor ? hataEkran() : '<div class="iskelet"></div><div class="iskelet"></div><div class="iskelet"></div>';
      return;
    }
    document.body.classList.remove('kilit');
    yanGuncelle();
    grafikKaldir();
    try {
      if (parca[0] === 'coin' && parca[1]) {
        var coin = decodeURIComponent(parca[1]);
        $('ekran').innerHTML = detayEkran(coin);
        var c = coinBul(coin); if (c) grafikKur(c);
        document.title = coin + ' · dKc';
      } else if (parca[0] === 'alarmlar') { $('ekran').innerHTML = alarmEkran(); document.title = 'Alarmlar · dKc'; tazelikGuncelle(); }
      else if (parca[0] === 'islemler') { $('ekran').innerHTML = islemEkran(); document.title = 'İşlemlerim · dKc'; }
      else { $('ekran').innerHTML = MASA.matches ? anaEkranMasa() : anaEkran(); document.title = 'dKc'; }
    } catch (e) {
      $('ekran').innerHTML = '<section class="hata-ekran"><h1>Bu ekran açılamadı</h1><p>Gelen veride beklenmeyen bir alan var.</p><a class="dugme" href="#/">Ana sayfaya dön</a></section>';
      if (window.console) console.error(e);
    }
  }
  function yenile() {
    pozEsitle();
    return ozetYukle().then(function () {
      if (/^#\/coin\//.test(location.hash) && $('grafik')) { tazelikGuncelle(); yanGuncelle(); detayGuncelle(); }
      else if (durum.form) tazelikGuncelle();
      else if (document.activeElement && document.activeElement.id === 'sermaye') tazelikGuncelle();
      else goster();
      grafikOnYukle();
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var b = t.closest('[data-filtre]'); if (b) { durum.filtre = b.dataset.filtre === durum.filtre ? 'hepsi' : b.dataset.filtre; goster(); return; }
    var tf = t.closest('[data-tf]'); if (tf) { durum.tf = tf.dataset.tf; yaz('dkc-tf', durum.tf); document.querySelectorAll('[data-tf]').forEach(function (x) { x.setAttribute('aria-pressed', x === tf); }); var c = coinBul(aktifCoin()); if (c) grafikKur(c); return; }
    var km = t.closest('[data-katman]'); if (km) { var kk = km.dataset.katman; durum.katman[kk] = !katman(kk); yaz('dkc-katman', durum.katman); goster(); return; }
    var ga = t.closest('[data-giris-alarm]'); if (ga) { girisAlarmKur(coinBul(ga.dataset.girisAlarm), ga); return; }
    if (t.closest('[data-grafik-yenile]')) { var g = coinBul(aktifCoin()); if (g) grafikKur(g); return; }
    if (t.closest('#tamEkran')) { tamEkran(); return; }
    if (t.closest('[data-yenile]') || t.closest('#tazelik')) { durum.hata = durum.veri ? durum.hata : ''; if (!durum.veri) goster(); yenile(); return; }
    if (t.closest('[data-ara-ac]')) { durum.araAcik = !durum.araAcik; if (!durum.araAcik) durum.ara = ''; goster(); if (durum.araAcik && $('ara')) $('ara').focus(); return; }
    var fv = t.closest('[data-favori]'); if (fv) { var k = fv.dataset.favori; durum.favori = favoriMi(k) ? durum.favori.filter(function (x) { return x !== k; }) : durum.favori.concat([k]); yaz('dkc-favori', durum.favori);
      fv.classList.toggle('acik', favoriMi(k)); fv.setAttribute('aria-pressed', favoriMi(k)); fv.setAttribute('aria-label', favoriMi(k) ? 'Favorilerden çıkar' : 'Favorilere ekle'); yanGuncelle(); return; }
    if (t.closest('[data-form-ac]')) { durum.form = aktifCoin(); $('detaySag').innerHTML = detaySagHtml(coinBul(durum.form)); var i = document.querySelector('#pozForm input[name=giris]'); if (i) i.focus(); return; }
    if (t.closest('[data-form-iptal]')) { durum.form = ''; detayGuncelle(); return; }
    if (t.closest('[data-alarm-ac]')) { durum.alarmForm = aktifCoin(); alarmBlokYenile(); var ai = document.querySelector('#alarmForm input[name=seviye]'); if (ai) { ai.focus(); ai.select(); } return; }
    if (t.closest('[data-alarm-iptal]')) { durum.alarmForm = ''; durum.esleme = { adim: '', hata: '', mesgul: false }; alarmBlokYenile(); return; }
    if (t.closest('[data-kod-iste]')) { e.preventDefault(); kodIste(); return; }
    var as = t.closest('[data-alarm-sil]'); if (as) { alarmSil(as.dataset.alarmSil, as); return; }
    var sil = t.closest('[data-poz-sil]'); if (sil) { e.preventDefault(); var sc = sil.dataset.pozSil; if (!window.confirm(sc + ' işlemini listeden çıkarmak istiyor musunuz?')) return; durum.poz = durum.poz.filter(function (x) { return x.coin !== sc; }); goster(); pozDegisti({ tur: 'sil', coin: sc }); return; }
    var satir = t.closest('tr[data-git]'); if (satir && !t.closest('a')) { location.hash = satir.dataset.git; return; }
    if (t.closest('#bildirimAc') && window.KOKPIT_BILDIRIM) { window.KOKPIT_BILDIRIM.ac().then(goster); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'pozForm') { e.preventDefault(); pozKaydet(e.target); }
    else if (e.target.id === 'alarmForm') { e.preventDefault(); alarmKur(e.target); }
    else if (e.target.id === 'eslemeForm') { e.preventDefault(); eslestir(e.target); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'sermaye') { var n = sayiOku(e.target.value); durum.sermaye = n && !isNaN(n) ? n : null; goster(); pozDegisti({ tur: 'sermaye', deger: durum.sermaye }); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.name === 'seviye' && e.target.form && e.target.form.id === 'alarmForm') { var ac = coinBul(e.target.form.dataset.coin); if (ac) $('alarmYon').textContent = alarmYonYazi(ac, sayiOku(e.target.value)); return; }
    if (e.target.id === 'ara' || e.target.id === 'araYan') {
      durum.ara = e.target.value;
      var l = $('yanListe'); if (l) l.innerHTML = yanListeHtml(aktifCoin());
      var gr = $('gruplar'); if (gr) gr.innerHTML = grupHtml(gruplar());
      if (e.target.id === 'araYan' && !aktifCoin() && MASA.matches && !location.hash.replace(/^#\/?/, '')) { var y = document.activeElement; goster(); if ($('araYan')) { $('araYan').focus(); $('araYan').setSelectionRange(y.value.length, y.value.length); } }
    }
  });
  document.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('grup-uzak')) { durum.uzakAcik = e.target.open; var a = e.target.querySelector('.ac-yazi'); if (a) a.textContent = e.target.open ? 'gizle' : 'göster'; } }, true);
  window.addEventListener('hashchange', function () { durum.form = ''; durum.alarmForm = ''; durum.esleme = { adim: '', hata: '', mesgul: false }; if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); goster(); window.scrollTo(0, 0); });
  MASA.addEventListener('change', function () { $('yan').innerHTML = ''; goster(); });
  // Uygulama öne gelince ya da internet dönünce hemen yenile
  document.addEventListener('visibilitychange', function () { if (document.hidden || !AYAR.api) return; if (Date.now() - durum.sonBasari > 30000) yenile(); else pozEsitle(); });
  window.addEventListener('online', function () { yenile(); });
  window.addEventListener('offline', tazelikGuncelle);

  // ---------- Başlangıç: kayıtlı veriyle hemen aç, arkada yenile ----------
  (function () {
    var k = oku('dkc-son', null);
    if (!k) { var eski = oku('kokpit-son', null); if (eski) k = { t: 0, veri: eski }; }
    if (k && k.veri && AYAR.api) { try { durum.veri = veriHazirla(k.veri); durum.sonBasari = k.t || 0; durum.onbellek = true; } catch (e) { durum.veri = null; } }
  })();
  goster();
  if (CANLI && durum.veri) CANLI.baslat(durum.veri.coinler.map(function (c) { return c.coin; }));
  yenile();
  setInterval(function () { if (document.hidden || !AYAR.api) return; yenile(); }, 60000);
  setInterval(tazelikGuncelle, 30000);
})();
