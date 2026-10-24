// KasaNot ekranları. Veri yalnız bu cihazda (IndexedDB); metinler textContent ile yazılır.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = { cariler: [], hareketler: [], fiyatlar: [], bekleyen: [], personel: [], mesai: [], avans: [] };
  var AYAR_ANAHTAR = 'kn_ayar';
  var TUR_AD = { alis: 'Alış', satis: 'Satış', odeme: 'Ödeme', tahsilat: 'Tahsilat' };

  // ---------- yardımcılar ----------
  function h(tag, at) {
    var e = document.createElement(tag);
    if (at) Object.keys(at).forEach(function (k) {
      var v = at[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) ekle(e, arguments[i]);
    return e;
  }
  function ekle(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { ekle(e, x); });
    else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function ayar() {
    try { return JSON.parse(localStorage.getItem(AYAR_ANAHTAR)) || {}; } catch (e) { return {}; }
  }
  function ayarKaydet(a) { try { localStorage.setItem(AYAR_ANAHTAR, JSON.stringify(a)); } catch (e) { bildir('Ayar kaydedilemedi (tarayıcı depolaması kapalı).'); } }
  function sayi(s) { var n = parseFloat(String(s == null ? '' : s).replace(/\./g, function (m, i, t) { return /,/.test(t) ? '' : m; }).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function bugun() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function tarihTr(t) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (t || '—'); }
  var para = KN.para;
  var tmr;
  function bildir(m) {
    var b = $('bildirim'); b.textContent = m; b.classList.add('goster');
    clearTimeout(tmr); tmr = setTimeout(function () { b.classList.remove('goster'); }, 3200);
  }
  function pencere(icerik) {
    var d = $('pencere'); d.textContent = '';
    ekle(d, icerik);
    if (!d.open) d.showModal();
    return d;
  }
  function kapat() { var d = $('pencere'); if (d.open) d.close(); }
  function onay(soru, evet, tehlike) {
    pencere([h('p', null, soru), h('div', { class: 'yan' },
      h('button', { class: tehlike ? 'tehlike' : 'birinci', onclick: function () { kapat(); evet(); } }, 'Evet'),
      h('button', { onclick: kapat }, 'Vazgeç'))]);
  }
  function bakiyeEtiket(b) {
    if (Math.abs(b) < 0.005) return h('span', { class: 'etiket i' }, 'Kapalı');
    return h('span', { class: b > 0 ? 'pozitif' : 'negatif' }, para(Math.abs(b)) + (b > 0 ? ' borcumuz' : ' alacağımız'));
  }
  function indir(ad, icerik) {
    var url = URL.createObjectURL(new Blob([icerik], { type: 'text/csv;charset=utf-8' }));
    var l = h('a', { href: url, download: ad }); document.body.appendChild(l); l.click(); l.remove();
  }
  function ekstreCsv(liste) {
    var sat = [['Tarih', 'Cari', 'İşlem', 'Belge no', 'Açıklama', 'Tutar', 'Bakiye etkisi']];
    liste.forEach(function (x) { sat.push([tarihTr(x.tarih), cariAd(x.cariId), TUR_AD[x.tur], x.belgeNo || '', x.aciklama || '', x.tutar, KN.bakiyeEtkisi(x.tur, x.tutar)]); });
    return KN.csv(sat);
  }
  function yukle() {
    return Promise.all(Object.keys(S).map(function (k) { return DB.hepsi(k).then(function (x) { S[k] = x; }); }));
  }
  function cariBakiye(id) { return KN.bakiye(S.hareketler, id); }
  function cariAd(id) { var c = S.cariler.filter(function (x) { return x.id === id; })[0]; return c ? c.unvan : '—'; }
  function git(yol) { location.hash = yol; }

  // ---------- yönlendirme ----------
  var GORUNUM = { ana: ana, ekle: ekleSayfa, bekleyen: bekleyenSayfa, cariler: cariler, cari: cariDetay, urunler: urunler, urun: urunDetay, personel: personelSayfa, p: personelDetay, ayar: ayarSayfa };
  function yonlendir() {
    var p = (location.hash || '#/ana').replace(/^#\//, '').split('/');
    var ad = GORUNUM[p[0]] ? p[0] : 'ana';
    var sekme = { bekleyen: 'ekle', cari: 'cariler', urun: 'urunler', p: 'personel', ayar: '' }[ad];
    sekme = sekme === undefined ? ad : sekme;
    [].forEach.call($('alt').querySelectorAll('a'), function (a) { a.classList.toggle('aktif', a.getAttribute('data-s') === sekme); });
    var kutu = $('icerik'); kutu.textContent = '';
    yukle().then(function () {
      var arg = p.slice(1).map(decodeURIComponent);
      ekle(kutu, GORUNUM[ad].apply(null, arg));
      window.scrollTo(0, 0);
    }).catch(function (e) {
      ekle(kutu, h('div', { class: 'not k' }, 'Veri açılamadı: ' + (e && e.message || e) + '. Gizli sekmede olabilirsiniz; normal tarayıcıda açın.'));
    });
  }

  // ---------- ANA ----------
  function ana() {
    $('baslik').textContent = 'KasaNot';
    var borc = 0, alacak = 0;
    S.cariler.forEach(function (c) { var b = cariBakiye(c.id); if (b > 0) borc += b; else alacak -= b; });
    var bek = S.bekleyen.length, a = ayar();
    var sinir = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    var uyarilar = S.fiyatlar.filter(function (f) { return f.degisim && f.tarih >= sinir; })
      .sort(function (x, y) { return y.tarih < x.tarih ? -1 : 1; }).slice(0, 6);
    var son = S.hareketler.slice().sort(function (x, y) { return y.tarih < x.tarih ? -1 : y.tarih > x.tarih ? 1 : y.id - x.id; }).slice(0, 6);
    return h('div', null,
      !a.gemini ? h('div', { class: 'not b' }, 'Fotoğraf ve PDF okumak için ', h('a', { href: '#/ayar' }, 'Ayarlar'), '\'dan ücretsiz Gemini anahtarını girin. E-fatura XML dosyaları anahtarsız okunur.') : null,
      bek ? h('a', { class: 'kart satir', href: '#/ekle' }, h('div', { class: 'orta' }, h('b', null, bek + ' belge onayınızı bekliyor'), h('span', { class: 'soluk' }, 'Kontrol edip onaylayın')), h('span', { class: 'etiket u' }, 'Onayla')) : null,
      h('div', { class: 'izgara' },
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Ödenecek (borcumuz)'), h('div', { class: 'sayi pozitif' }, para(borc))),
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Alacağımız'), h('div', { class: 'sayi negatif' }, para(alacak)))),
      h('a', { class: 'dugme birinci buyuk', href: '#/ekle' }, '＋ Fatura / fiş / dekont ekle'),
      h('h2', null, 'Fiyat değişimi uyarıları'),
      h('div', { class: 'kart' }, uyarilar.length ? uyarilar.map(function (f) {
        return h('a', { class: 'satir', href: '#/urun/' + encodeURIComponent(f.urun) },
          h('div', { class: 'orta' }, h('b', null, f.ad), h('span', { class: 'soluk' }, cariAd(f.cariId) + ' · ' + tarihTr(f.tarih))),
          h('div', { class: 'sag ' + (f.degisim > 0 ? 'pozitif' : 'negatif') }, (f.degisim > 0 ? '▲ %' : '▼ %') + Math.abs(f.degisim).toLocaleString('tr-TR'), h('div', { class: 'soluk' }, para(f.onceki) + ' → ' + para(f.birimFiyat))));
      }) : h('div', { class: 'bos' }, 'Henüz fiyat değişimi yok. Alış faturaları eklendikçe burada görünür.')),
      h('h2', null, 'Son hareketler'),
      h('div', { class: 'kart' }, son.length ? son.map(hareketSatiri) : h('div', { class: 'bos' }, 'Henüz hareket yok. İlk belgenizi ekleyin.')));
  }
  function hareketSatiri(x) {
    return h('a', { class: 'satir', href: '#/cari/' + x.cariId },
      h('div', { class: 'orta' }, h('b', null, cariAd(x.cariId)), h('span', { class: 'soluk' }, TUR_AD[x.tur] + ' · ' + tarihTr(x.tarih) + (x.belgeNo ? ' · ' + x.belgeNo : ''))),
      h('div', { class: 'sag ' + (KN.bakiyeEtkisi(x.tur, 1) > 0 ? 'pozitif' : 'negatif') }, (KN.bakiyeEtkisi(x.tur, 1) > 0 ? '+' : '−') + para(x.tutar)));
  }

  // ---------- BELGE EKLE ----------
  function ekleSayfa() {
    $('baslik').textContent = 'Belge ekle';
    var durum = h('div');
    function sec(e) {
      var dosyalar = [].slice.call(e.target.files); e.target.value = '';
      if (!dosyalar.length) return;
      durum.textContent = '';
      var liste = dosyalar.map(function (d) { var s = h('div', { class: 'soluk' }, '⏳ ' + d.name + ' okunuyor…'); durum.appendChild(s); return s; });
      dosyalar.reduce(function (p, d, i) {
        return p.then(function () { return isle(d); }).then(function (r) {
          liste[i].textContent = (r.hata ? '⚠ ' : '✓ ') + d.name + (r.hata ? ': ' + r.hata : ' okundu');
        });
      }, Promise.resolve()).then(function () { return yukle(); }).then(function () {
        var ilk = S.bekleyen.filter(function (b) { return b.durum === 'hazir'; })[0];
        if (ilk && dosyalar.length === 1) git('#/bekleyen/' + ilk.id); else yonlendir();
      });
    }
    var a = ayar();
    return h('div', null,
      h('div', { class: 'kart' },
        h('label', { class: 'dugme birinci buyuk', style: 'margin:0 0 10px' }, '📷 Fotoğraf çek',
          h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none', onchange: sec })),
        h('label', { class: 'dugme buyuk', style: 'margin:0' }, '📄 Dosya seç (resim, PDF, e-fatura XML)',
          h('input', { type: 'file', accept: 'image/*,.pdf,application/pdf,.xml,text/xml', multiple: true, style: 'display:none', onchange: sec })),
        h('p', { class: 'soluk' }, 'Okunan bilgiler önce size gösterilir; siz onaylamadan kayıt girilmez.')),
      !a.gemini ? h('div', { class: 'not' }, 'Fotoğraf/PDF okuması için Gemini anahtarı gerekir (Ayarlar). XML dosyaları anahtarsız okunur.') : null,
      durum,
      h('h2', null, 'Onay bekleyenler'),
      h('div', { class: 'kart' }, S.bekleyen.length ? S.bekleyen.slice().reverse().map(function (b) {
        return h('a', { class: 'satir', href: '#/bekleyen/' + b.id },
          h('div', { class: 'orta' }, h('b', null, b.durum === 'hata' ? 'Okunamadı: ' + b.ad : (b.belge.karsiUnvan || b.ad)),
            h('span', { class: 'soluk' }, b.durum === 'hata' ? b.hata : (tarihTr(b.belge.tarih) + ' · ' + para(b.belge.toplam, b.belge.para)))),
          h('span', { class: 'etiket ' + (b.durum === 'hata' ? 'k' : 'u') }, b.durum === 'hata' ? 'Elle gir' : 'Kontrol et'));
      }) : h('div', { class: 'bos' }, 'Bekleyen belge yok.')));
  }
  function bosBelge() {
    return { kaynak: 'elle', tur: 'fatura', yon: 'alis', belgeNo: '', tarih: bugun(), karsiUnvan: '', karsiVkn: '', araToplam: 0, kdv: 0, toplam: 0, para: 'TRY', kalemler: [], guven: 0 };
  }
  function isle(dosya) {
    var a = ayar(), id;
    return DB.koy('dosyalar', { blob: dosya, ad: dosya.name, tip: dosya.type }).then(function (k) {
      id = k;
      return OKU.oku(dosya, a).then(function (belge) {
        return DB.koy('bekleyen', { dosyaId: id, ad: dosya.name, durum: 'hazir', belge: belge });
      }, function (err) {
        return DB.koy('bekleyen', { dosyaId: id, ad: dosya.name, durum: 'hata', hata: String(err && err.message || err), belge: bosBelge() }).then(function () { throw err; });
      });
    }).then(function () { return {}; }, function (err) { return { hata: String(err && err.message || err) }; });
  }

  // ---------- ONAY EKRANI ----------
  function bekleyenSayfa(id) {
    $('baslik').textContent = 'Belgeyi onayla';
    var bk = S.bekleyen.filter(function (x) { return x.id === +id; })[0];
    if (!bk) return h('div', { class: 'bos' }, 'Bu belge bulunamadı. ', h('a', { href: '#/ekle' }, 'Geri dön'));
    var b = JSON.parse(JSON.stringify(bk.belge));
    var hTur = b.tur === 'dekont' ? b.yon : b.yon === 'satis' ? 'satis' : 'alis';
    var kap = h('div'), uyarilarKutu = h('div'), kalemKutu = h('div'), cariNot = h('div');
    var secCari, kopya = h('input', { type: 'checkbox' }), pesin = h('input', { type: 'checkbox' });
    pesin.checked = b.tur === 'fis';
    var eslesme = KN.cariBul(S.cariler, { vkn: b.karsiVkn, unvan: b.karsiUnvan });
    var yeniSecim = '__yeni';
    var cariSec = h('select', { onchange: function () { cariNotYaz(); } },
      h('option', { value: yeniSecim }, '＋ Yeni cari aç'),
      S.cariler.map(function (c) { return h('option', { value: c.id }, c.unvan); }));
    cariSec.value = eslesme ? String(eslesme.cari.id) : yeniSecim;
    var unvanG = h('input', { value: b.karsiUnvan, oninput: function () { b.karsiUnvan = this.value; cariNotYaz(); } });
    var vknG = h('input', { value: b.karsiVkn, inputmode: 'numeric', oninput: function () { b.karsiVkn = this.value; } });
    var belgeNoG = h('input', { value: b.belgeNo, oninput: function () { b.belgeNo = this.value; hesapla(); } });
    var tarihG = h('input', { type: 'date', value: /^\d{4}-\d{2}-\d{2}$/.test(b.tarih) ? b.tarih : '', oninput: function () { b.tarih = this.value; hesapla(); } });
    var toplamG = h('input', { value: b.toplam ? String(b.toplam).replace('.', ',') : '', inputmode: 'decimal', oninput: function () { b.toplam = sayi(this.value); hesapla(); } });
    var turG = h('select', { onchange: function () { hTur = this.value; pesinKutu.style.display = (hTur === 'alis' || hTur === 'satis') ? 'flex' : 'none'; b.tur = (hTur === 'odeme' || hTur === 'tahsilat') ? 'dekont' : (b.tur === 'fis' ? 'fis' : 'fatura'); b.yon = hTur; kalemleriCiz(); hesapla(); } },
      [['alis', 'Alış (fatura/fiş aldık)'], ['satis', 'Satış (fatura kestik)'], ['odeme', 'Ödeme yaptık (dekont)'], ['tahsilat', 'Tahsilat aldık (dekont)']].map(function (x) { return h('option', { value: x[0] }, x[1]); }));
    turG.value = hTur;

    function secilenCari() { return cariSec.value === yeniSecim ? null : S.cariler.filter(function (c) { return c.id === +cariSec.value; })[0]; }
    function cariNotYaz() {
      cariNot.textContent = '';
      var c = secilenCari();
      ekle(cariNot, c ? h('div', { class: 'not i' }, 'Mevcut cari: ' + c.unvan + ' (bakiye: ' + (cariBakiye(c.id) > 0 ? para(cariBakiye(c.id)) + ' borcumuz' : para(Math.abs(cariBakiye(c.id))) + ' alacağımız') + ')')
        : h('div', { class: 'not b' }, 'Bu cari kayıtlı değil; onaylayınca "' + (b.karsiUnvan || 'adsız') + '" adıyla otomatik açılacak.'));
      var gor = c ? 'none' : '';
      unvanKutu.style.display = gor;
    }
    var unvanKutu = h('div', null, h('label', null, 'Cari ünvanı'), unvanG, h('label', null, 'Vergi / TC no (varsa)'), vknG);

    function kalemleriCiz() {
      kalemKutu.textContent = '';
      if (hTur === 'odeme' || hTur === 'tahsilat') return;
      ekle(kalemKutu, h('h2', null, 'Ürün / kalemler'));
      b.kalemler.forEach(function (k, i) {
        var uyar = h('div');
        function fiyatKontrol() {
          uyar.textContent = '';
          if (hTur !== 'alis') return;
          var c = secilenCari();
          var d = KN.fiyatDegisim(S.fiyatlar, k.ad, c ? c.id : null, k.birimFiyat, b.tarih);
          if (d) ekle(uyar, h('div', { class: 'not' + (d.yuzde < 0 ? ' i' : '') }, (d.yuzde > 0 ? '▲ Zam: ' : '▼ İndirim: ') + '%' + Math.abs(d.yuzde).toLocaleString('tr-TR') + ' (önceki ' + para(d.onceki) + ', ' + tarihTr(d.oncekiTarih) + (d.ayniCari ? '' : ', başka tedarikçi') + ')'));
        }
        ekle(kalemKutu, h('div', { class: 'kalem' },
          h('input', { value: k.ad, placeholder: 'Ürün adı', oninput: function () { k.ad = this.value; fiyatKontrol(); } }),
          h('div', { class: 'uc' },
            h('div', null, h('label', null, 'Miktar'), h('input', { value: String(k.miktar).replace('.', ','), inputmode: 'decimal', oninput: function () { k.miktar = sayi(this.value); } })),
            h('div', null, h('label', null, 'Birim fiyat'), h('input', { value: k.birimFiyat ? String(k.birimFiyat).replace('.', ',') : '', inputmode: 'decimal', oninput: function () { k.birimFiyat = sayi(this.value); fiyatKontrol(); } })),
            h('div', null, h('label', null, 'Tutar'), h('input', { value: k.tutar ? String(k.tutar).replace('.', ',') : '', inputmode: 'decimal', oninput: function () { k.tutar = sayi(this.value); hesapla(); } }))),
          uyar,
          h('button', { class: 'tehlike', style: 'margin-top:8px;min-height:36px;padding:4px 10px', onclick: function () { b.kalemler.splice(i, 1); kalemleriCiz(); hesapla(); } }, 'Satırı sil')));
        fiyatKontrol();
      });
      ekle(kalemKutu, h('button', { onclick: function () { b.kalemler.push({ ad: '', miktar: 1, birim: '', birimFiyat: 0, tutar: 0 }); kalemleriCiz(); } }, '＋ Kalem ekle'));
    }
    var pesinKutu = h('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px;color:inherit;font-size:15px' }, pesin, 'Peşin ödendi (cariye borç yazılmasın)');
    var mukerrerVar = null;
    function hesapla() {
      uyarilarKutu.textContent = '';
      var u = hTur === 'alis' || hTur === 'satis' ? KN.tutarlilik(b) : KN.tutarlilik({ toplam: b.toplam, tarih: b.tarih });
      u.forEach(function (m) { ekle(uyarilarKutu, h('div', { class: 'not' }, '⚠ ' + m)); });
      var c = secilenCari();
      mukerrerVar = c ? KN.mukerrer(S.hareketler, c.id, b.belgeNo, b.toplam) : null;
      if (mukerrerVar) ekle(uyarilarKutu, h('div', { class: 'not k' }, '⚠ Bu belge daha önce eklenmiş olabilir (aynı cari, belge no ve tutar: ' + tarihTr(mukerrerVar.tarih) + ').'));
      if (b.guven && b.guven < 0.7) ekle(uyarilarKutu, h('div', { class: 'not' }, 'Okuma güveni düşük; tüm alanları belgeyle karşılaştırın.'));
    }
    cariSec.addEventListener('change', hesapla);

    function kaydet() {
      b.toplam = Math.abs(b.toplam);
      if (!(b.toplam > 0)) return bildir('Toplam tutar girin.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.tarih)) return bildir('Tarih seçin.');
      var c = secilenCari();
      if (!c && !String(b.karsiUnvan).trim()) return bildir('Cari ünvanı girin.');
      if (mukerrerVar && !kopya.checked) return bildir('Mükerrer olabilir: "yine de kaydet" kutusunu işaretleyin.');
      var carip = c ? Promise.resolve(c.id) : DB.koy('cariler', { unvan: String(b.karsiUnvan).trim(), vkn: String(b.karsiVkn).replace(/\D/g, ''), tel: '', not: '', olusturma: bugun() });
      carip.then(function (cid) {
        return DB.koy('hareketler', { cariId: cid, tarih: b.tarih, tur: hTur, tutar: b.toplam, belgeNo: b.belgeNo, dosyaId: bk.dosyaId, aciklama: b.aciklama || '', kalemSayisi: b.kalemler.length, kdv: b.kdv || 0 }).then(function (hid) {
          if (pesin.checked && (hTur === 'alis' || hTur === 'satis')) return DB.koy('hareketler', { cariId: cid, tarih: b.tarih, tur: hTur === 'alis' ? 'odeme' : 'tahsilat', tutar: b.toplam, belgeNo: b.belgeNo, dosyaId: 0, aciklama: 'Peşin', kalemSayisi: 0, pesinDe: hid }).then(function () { return hid; });
          return hid;
        }).then(function (hid) {
          var gecmis = S.fiyatlar.slice(), kayitlar = [];
          if (hTur === 'alis') b.kalemler.forEach(function (k) {
            var bf = k.birimFiyat > 0 ? k.birimFiyat : (k.miktar > 0 && k.tutar > 0 ? Math.round(k.tutar / k.miktar * 100) / 100 : 0);
            var key = KN.urunAnahtar(k.ad);
            if (!key || !(bf > 0)) return;
            var d = KN.fiyatDegisim(gecmis, k.ad, cid, bf, b.tarih);
            var kayit = { urun: key, ad: k.ad.trim(), cariId: cid, tarih: b.tarih, birimFiyat: bf, birim: k.birim || '', hareketId: hid, degisim: d ? d.yuzde : 0, onceki: d ? d.onceki : 0 };
            kayitlar.push(kayit); gecmis.push(kayit);
          });
          return kayitlar.reduce(function (p, k) { return p.then(function () { return DB.koy('fiyatlar', k); }); }, Promise.resolve());
        }).then(function () { return DB.sil('bekleyen', bk.id); }).then(function () {
          bildir('Kaydedildi'); git('#/cari/' + cid);
        });
      }).catch(function (e) { bildir('Kaydedilemedi: ' + (e && e.message || e)); });
    }

    var onizleme = h('div');
    DB.al('dosyalar', bk.dosyaId).then(function (d) {
      if (!d || !d.blob) return;
      var url = URL.createObjectURL(d.blob);
      if (/^image\//.test(d.tip)) onizleme.appendChild(h('img', { class: 'onizle', src: url, alt: 'Belge', onclick: function () { pencere([h('img', { src: url, alt: 'Belge' }), h('div', { class: 'yan' }, h('button', { onclick: kapat }, 'Kapat'))]); } }));
      else onizleme.appendChild(h('a', { class: 'dugme', href: url, target: '_blank', rel: 'noopener' }, '📄 Belgeyi aç (' + (d.ad || 'dosya') + ')'));
    });

    kap.appendChild(h('div', null,
      bk.durum === 'hata' ? h('div', { class: 'not k' }, bk.hata + ' Bilgileri elle girebilirsiniz.') : h('div', { class: 'not b' }, (b.kaynak === 'xml' ? 'E-fatura XML\'den okundu (kesin).' : b.kaynak === 'yz' ? 'Yapay zekâ ile okundu; hata olabilir, lütfen kontrol edin.' : 'Elle giriş.')),
      onizleme,
      h('div', { class: 'kart' },
        h('label', null, 'İşlem türü'), turG,
        h('label', null, 'Cari'), cariSec, cariNot, unvanKutu,
        h('div', { class: 'iki' }, h('div', null, h('label', null, 'Belge / işlem no'), belgeNoG), h('div', null, h('label', null, 'Tarih'), tarihG)),
        h('label', null, 'Toplam tutar (' + (b.para || 'TRY') + ')'), toplamG,
        kalemKutu, uyarilarKutu,
        pesinKutu,
        h('label', { style: 'display:flex;gap:8px;align-items:center' }, kopya, 'Mükerrer olsa da yine de kaydet')),
      h('div', { class: 'yan' },
        h('button', { class: 'birinci', style: 'flex:1', onclick: kaydet }, '✓ Onayla ve kaydet'),
        h('button', { class: 'tehlike', onclick: function () { onay('Bu belge silinsin mi?', function () { DB.sil('bekleyen', bk.id).then(function () { return DB.sil('dosyalar', bk.dosyaId); }).then(function () { git('#/ekle'); }); }, true); } }, 'Sil'))));
    cariNotYaz(); kalemleriCiz(); hesapla();
    return kap;
  }

  // ---------- CARİLER ----------
  function cariler() {
    $('baslik').textContent = 'Cariler';
    var liste = h('div', { class: 'kart' }), ara = h('input', { type: 'search', placeholder: 'Cari ara…', oninput: ciz });
    function ciz() {
      var q = KN.norm(ara.value);
      liste.textContent = '';
      var s = S.cariler.filter(function (c) { return !q || KN.norm(c.unvan).indexOf(q) >= 0 || String(c.vkn).indexOf(q) >= 0; })
        .sort(function (a, b) { return Math.abs(cariBakiye(b.id)) - Math.abs(cariBakiye(a.id)); });
      ekle(liste, s.length ? s.map(function (c) {
        return h('a', { class: 'satir', href: '#/cari/' + c.id }, h('div', { class: 'orta' }, h('b', null, c.unvan), h('span', { class: 'soluk' }, c.vkn || 'VKN yok')), h('div', { class: 'sag' }, bakiyeEtiket(cariBakiye(c.id))));
      }) : h('div', { class: 'bos' }, S.cariler.length ? 'Eşleşen cari yok.' : 'Henüz cari yok. Belge ekleyince otomatik açılır; elle de ekleyebilirsiniz.'));
    }
    ciz();
    return h('div', null, ara, h('div', { class: 'yan' }, h('button', { onclick: function () { cariForm(null); } }, '＋ Cari ekle')), liste);
  }
  function cariForm(c) {
    var un = h('input', { value: c ? c.unvan : '' }), vk = h('input', { value: c ? c.vkn : '', inputmode: 'numeric' }), tl = h('input', { value: c ? c.tel : '', inputmode: 'tel' }), nt = h('input', { value: c ? c.not : '' });
    pencere([h('h2', null, c ? 'Cariyi düzenle' : 'Yeni cari'), h('label', null, 'Ünvan'), un, h('label', null, 'Vergi / TC no'), vk, h('label', null, 'Telefon'), tl, h('label', null, 'Not'), nt,
      h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () {
        if (!un.value.trim()) return bildir('Ünvan girin.');
        var k = c || { olusturma: bugun() };
        k.unvan = un.value.trim(); k.vkn = vk.value.replace(/\D/g, ''); k.tel = tl.value.trim(); k.not = nt.value.trim();
        DB.koy('cariler', k).then(function () { kapat(); bildir('Kaydedildi'); yonlendir(); });
      } }, 'Kaydet'), h('button', { onclick: kapat }, 'Vazgeç'))]);
  }
  function cariDetay(id) {
    var c = S.cariler.filter(function (x) { return x.id === +id; })[0];
    if (!c) return h('div', { class: 'bos' }, 'Cari bulunamadı. ', h('a', { href: '#/cariler' }, 'Cariler'));
    $('baslik').textContent = 'Cari';
    var hr = S.hareketler.filter(function (x) { return x.cariId === c.id; }).sort(function (a, b) { return a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : b.id - a.id; });
    var b = cariBakiye(c.id);
    function manuel() {
      var tur = h('select', null, h('option', { value: 'odeme' }, 'Ödeme yaptık'), h('option', { value: 'tahsilat' }, 'Tahsilat aldık'), h('option', { value: 'alis' }, 'Alış (borç ekle)'), h('option', { value: 'satis' }, 'Satış (alacak ekle)'));
      var tu = h('input', { inputmode: 'decimal' }), ta = h('input', { type: 'date', value: bugun() }), no = h('input', { placeholder: 'Açıklama / belge no' });
      if (b < 0) tur.value = 'tahsilat';
      pencere([h('h2', null, c.unvan), h('label', null, 'İşlem'), tur, h('label', null, 'Tutar'), tu, h('label', null, 'Tarih'), ta, h('label', null, 'Açıklama'), no,
        h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () {
          var t = Math.abs(sayi(tu.value)); if (!(t > 0)) return bildir('Tutar girin.');
          DB.koy('hareketler', { cariId: c.id, tarih: ta.value || bugun(), tur: tur.value, tutar: t, belgeNo: no.value.trim(), dosyaId: 0, aciklama: no.value.trim(), kalemSayisi: 0 }).then(function () { kapat(); bildir('Kaydedildi'); yonlendir(); });
        } }, 'Kaydet'), h('button', { onclick: kapat }, 'Vazgeç'))]);
    }
    function goster(x) {
      var ic = [h('h2', null, TUR_AD[x.tur] + ' · ' + para(x.tutar)), h('p', { class: 'soluk' }, tarihTr(x.tarih) + (x.belgeNo ? ' · ' + x.belgeNo : '') + (x.aciklama ? ' · ' + x.aciklama : ''))];
      var ek = h('div');
      ic.push(ek);
      if (x.dosyaId) DB.al('dosyalar', x.dosyaId).then(function (d) {
        if (!d || !d.blob) return;
        var url = URL.createObjectURL(d.blob);
        ek.appendChild(/^image\//.test(d.tip) ? h('img', { src: url, alt: 'Belge' }) : h('a', { class: 'dugme', href: url, target: '_blank', rel: 'noopener' }, '📄 Belgeyi aç'));
      });
      ic.push(h('div', { class: 'yan' }, h('button', { class: 'tehlike', onclick: function () {
        onay('Bu hareket silinsin mi? Bakiye ve fiyat kayıtları da güncellenir.', function () {
          var fs = S.fiyatlar.filter(function (f) { return f.hareketId === x.id; });
          Promise.all(fs.map(function (f) { return DB.sil('fiyatlar', f.id); }).concat(S.hareketler.filter(function (e) { return e.pesinDe === x.id; }).map(function (e) { return DB.sil('hareketler', e.id); }))).then(function () { return DB.sil('hareketler', x.id); }).then(function () { bildir('Silindi'); yonlendir(); });
        }, true);
      } }, 'Hareketi sil'), h('button', { onclick: kapat }, 'Kapat')));
      pencere(ic);
    }
    return h('div', null,
      h('div', { class: 'kart' }, h('b', null, c.unvan), h('div', { class: 'soluk' }, [c.vkn, c.tel, c.not].filter(Boolean).join(' · ') || 'Ek bilgi yok'),
        h('div', { class: 'sayi' }, bakiyeEtiket(b)),
        h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: manuel }, 'Ödeme / tahsilat gir'), h('button', { onclick: function () { cariForm(c); } }, 'Düzenle'),
          hr.length ? h('button', { onclick: function () { indir('ekstre-' + KN.norm(c.unvan).replace(/ /g, '-').slice(0, 30) + '.csv', ekstreCsv(hr.slice().reverse())); } }, 'Ekstre (Excel)') : null,
          !hr.length ? h('button', { class: 'tehlike', onclick: function () { onay('Cari silinsin mi?', function () { DB.sil('cariler', c.id).then(function () { git('#/cariler'); }); }, true); } }, 'Sil') : null)),
      h('h2', null, 'Hareketler'),
      h('div', { class: 'kart' }, hr.length ? hr.map(function (x) {
        return h('div', { class: 'satir', style: 'cursor:pointer', onclick: function () { goster(x); } },
          h('div', { class: 'orta' }, h('b', null, TUR_AD[x.tur]), h('span', { class: 'soluk' }, tarihTr(x.tarih) + (x.belgeNo ? ' · ' + x.belgeNo : ''))),
          h('div', { class: 'sag ' + (KN.bakiyeEtkisi(x.tur, 1) > 0 ? 'pozitif' : 'negatif') }, (KN.bakiyeEtkisi(x.tur, 1) > 0 ? '+' : '−') + para(x.tutar)));
      }) : h('div', { class: 'bos' }, 'Bu cariye ait hareket yok.')));
  }

  // ---------- ÜRÜNLER ----------
  function urunler() {
    $('baslik').textContent = 'Ürün alış fiyatları';
    var gruplar = {};
    S.fiyatlar.forEach(function (f) { (gruplar[f.urun] = gruplar[f.urun] || []).push(f); });
    var anahtarlar = Object.keys(gruplar).sort();
    var ara = h('input', { type: 'search', placeholder: 'Ürün ara…', oninput: ciz }), liste = h('div', { class: 'kart' });
    function ciz() {
      var q = KN.norm(ara.value);
      liste.textContent = '';
      var s = anahtarlar.filter(function (k) { return !q || k.indexOf(q) >= 0; });
      ekle(liste, s.length ? s.map(function (k) {
        var g = gruplar[k].slice().sort(function (a, b) { return a.tarih < b.tarih ? 1 : -1; }), son = g[0];
        return h('a', { class: 'satir', href: '#/urun/' + encodeURIComponent(k) },
          h('div', { class: 'orta' }, h('b', null, son.ad), h('span', { class: 'soluk' }, cariAd(son.cariId) + ' · ' + tarihTr(son.tarih) + ' · ' + g.length + ' alım')),
          h('div', { class: 'sag' }, para(son.birimFiyat), son.degisim ? h('div', { class: son.degisim > 0 ? 'pozitif' : 'negatif', style: 'font-size:13px' }, (son.degisim > 0 ? '▲ %' : '▼ %') + Math.abs(son.degisim).toLocaleString('tr-TR')) : null));
      }) : h('div', { class: 'bos' }, anahtarlar.length ? 'Eşleşen ürün yok.' : 'Alış faturası eklendikçe ürün fiyatları burada birikir.'));
    }
    ciz();
    return h('div', null, ara, h('div', { style: 'height:10px' }), liste);
  }
  function urunDetay(key) {
    var g = S.fiyatlar.filter(function (f) { return f.urun === key; }).sort(function (a, b) { return a.tarih < b.tarih ? 1 : -1; });
    if (!g.length) return h('div', { class: 'bos' }, 'Ürün bulunamadı. ', h('a', { href: '#/urunler' }, 'Ürünler'));
    $('baslik').textContent = g[0].ad;
    var min = Math.min.apply(null, g.map(function (f) { return f.birimFiyat; })), maks = Math.max.apply(null, g.map(function (f) { return f.birimFiyat; }));
    return h('div', null,
      h('div', { class: 'izgara' },
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Son fiyat'), h('div', { class: 'sayi' }, para(g[0].birimFiyat))),
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'En düşük / yüksek'), h('div', { class: 'sayi', style: 'font-size:17px' }, para(min) + ' / ' + para(maks)))),
      h('h2', null, 'Alış geçmişi'),
      h('div', { class: 'kart' }, g.map(function (f) {
        return h('a', { class: 'satir', href: '#/cari/' + f.cariId }, h('div', { class: 'orta' }, h('b', null, cariAd(f.cariId)), h('span', { class: 'soluk' }, tarihTr(f.tarih))),
          h('div', { class: 'sag' }, para(f.birimFiyat) + (f.birim ? ' / ' + f.birim : ''), f.degisim ? h('div', { class: f.degisim > 0 ? 'pozitif' : 'negatif', style: 'font-size:13px' }, (f.degisim > 0 ? '▲ %' : '▼ %') + Math.abs(f.degisim).toLocaleString('tr-TR')) : null));
      })));
  }

  // ---------- PERSONEL ----------
  var secAy = bugun().slice(0, 7);
  function ayAraci() {
    return h('input', { type: 'month', value: secAy, onchange: function () { secAy = this.value || secAy; yonlendir(); } });
  }
  function personelAyar() { var a = ayar(); return { gunlukSaat: a.gunlukSaat || 8, fmCarpan: a.fmCarpan || 1.5, aylikSaat: a.aylikSaat || 225 }; }
  function personelSayfa() {
    $('baslik').textContent = 'Personel';
    var pa = personelAyar();
    return h('div', null, ayAraci(), h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () { personelForm(null); } }, '＋ Çalışan ekle')),
      h('div', { class: 'kart' }, S.personel.length ? S.personel.map(function (p) {
        var o = KN.personelAyOzeti(p, S.mesai, S.avans, secAy, pa);
        return h('a', { class: 'satir', href: '#/p/' + p.id }, h('div', { class: 'orta' }, h('b', null, p.ad), h('span', { class: 'soluk' }, (p.gorev || 'Görev yok') + ' · ' + o.gun + ' gün · avans ' + para(o.avans))), h('div', { class: 'sag' }, para(o.odenecek), h('div', { class: 'soluk', style: 'font-size:12px' }, 'tahmini ödenecek')));
      }) : h('div', { class: 'bos' }, 'Henüz çalışan yok.')),
      h('div', { class: 'not b' }, 'Personel bilgileri yalnız bu cihazda tutulur ve yapay zekâ okumasına gönderilmez. Kimlik numarası gibi gereksiz kişisel veri girmeyin.'));
  }
  function personelForm(p) {
    var ad = h('input', { value: p ? p.ad : '' }), gv = h('input', { value: p ? p.gorev : '' }), tl = h('input', { value: p ? p.tel : '', inputmode: 'tel' }),
      gt = h('input', { type: 'date', value: p ? p.giris : '' }), ms = h('input', { value: p && p.maas ? String(p.maas).replace('.', ',') : '', inputmode: 'decimal' }), nt = h('input', { value: p ? p.not : '' });
    pencere([h('h2', null, p ? 'Çalışanı düzenle' : 'Yeni çalışan'), h('label', null, 'Ad soyad'), ad, h('label', null, 'Görev'), gv, h('label', null, 'Telefon'), tl, h('label', null, 'İşe giriş tarihi'), gt, h('label', null, 'Aylık net maaş (₺)'), ms, h('label', null, 'Not'), nt,
      h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () {
        if (!ad.value.trim()) return bildir('Ad girin.');
        var k = p || {}; k.ad = ad.value.trim(); k.gorev = gv.value.trim(); k.tel = tl.value.trim(); k.giris = gt.value; k.maas = sayi(ms.value); k.not = nt.value.trim();
        DB.koy('personel', k).then(function () { kapat(); bildir('Kaydedildi'); yonlendir(); });
      } }, 'Kaydet'), h('button', { onclick: kapat }, 'Vazgeç'))]);
  }
  function personelDetay(id) {
    var p = S.personel.filter(function (x) { return x.id === +id; })[0];
    if (!p) return h('div', { class: 'bos' }, 'Çalışan bulunamadı. ', h('a', { href: '#/personel' }, 'Personel'));
    $('baslik').textContent = p.ad;
    var pa = personelAyar(), o = KN.personelAyOzeti(p, S.mesai, S.avans, secAy, pa);
    var ms = S.mesai.filter(function (m) { return m.personelId === p.id && m.tarih.slice(0, 7) === secAy; }).sort(function (a, b) { return a.tarih < b.tarih ? 1 : -1; });
    var av = S.avans.filter(function (a) { return a.personelId === p.id && a.tarih.slice(0, 7) === secAy; }).sort(function (a, b) { return a.tarih < b.tarih ? 1 : -1; });
    function mesaiForm() {
      var ta = h('input', { type: 'date', value: bugun() }), gi = h('input', { type: 'time', value: '09:00' }), ci = h('input', { type: 'time', value: '18:00' }), nt = h('input', { placeholder: 'Not (isteğe bağlı)' });
      pencere([h('h2', null, 'Mesai kaydı'), h('label', null, 'Tarih'), ta, h('div', { class: 'iki' }, h('div', null, h('label', null, 'Giriş'), gi), h('div', null, h('label', null, 'Çıkış'), ci)), h('label', null, 'Not'), nt,
        h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () {
          if (!ta.value || !gi.value || !ci.value) return bildir('Tarih ve saatleri girin.');
          DB.koy('mesai', { personelId: p.id, tarih: ta.value, giris: gi.value, cikis: ci.value, not: nt.value.trim() }).then(function () { kapat(); secAy = ta.value.slice(0, 7); bildir('Kaydedildi'); yonlendir(); });
        } }, 'Kaydet'), h('button', { onclick: kapat }, 'Vazgeç'))]);
    }
    function avansForm() {
      var ta = h('input', { type: 'date', value: bugun() }), tu = h('input', { inputmode: 'decimal' }), nt = h('input', { placeholder: 'Not (isteğe bağlı)' });
      pencere([h('h2', null, 'Avans'), h('label', null, 'Tarih'), ta, h('label', null, 'Tutar (₺)'), tu, h('label', null, 'Not'), nt,
        h('div', { class: 'yan' }, h('button', { class: 'birinci', onclick: function () {
          var t = Math.abs(sayi(tu.value)); if (!(t > 0) || !ta.value) return bildir('Tarih ve tutar girin.');
          DB.koy('avans', { personelId: p.id, tarih: ta.value, tutar: t, not: nt.value.trim() }).then(function () { kapat(); secAy = ta.value.slice(0, 7); bildir('Kaydedildi'); yonlendir(); });
        } }, 'Kaydet'), h('button', { onclick: kapat }, 'Vazgeç'))]);
    }
    function sil(depo, kayit) { onay('Kayıt silinsin mi?', function () { DB.sil(depo, kayit.id).then(function () { yonlendir(); }); }, true); }
    return h('div', null,
      h('div', { class: 'kart' }, h('b', null, p.ad), h('div', { class: 'soluk' }, [p.gorev, p.tel, p.giris ? 'Giriş: ' + tarihTr(p.giris) : '', p.not].filter(Boolean).join(' · ') || 'Ek bilgi yok'),
        h('div', { class: 'soluk' }, 'Aylık maaş: ' + para(p.maas)),
        h('div', { class: 'yan' }, h('button', { onclick: function () { personelForm(p); } }, 'Düzenle'), h('button', { class: 'tehlike', onclick: function () {
          onay('Çalışan ve tüm mesai/avans kayıtları silinsin mi?', function () {
            var hepsi = S.mesai.filter(function (m) { return m.personelId === p.id; }).map(function (m) { return DB.sil('mesai', m.id); })
              .concat(S.avans.filter(function (a) { return a.personelId === p.id; }).map(function (a) { return DB.sil('avans', a.id); }));
            Promise.all(hepsi).then(function () { return DB.sil('personel', p.id); }).then(function () { git('#/personel'); });
          }, true);
        } }, 'Sil'))),
      ayAraci(),
      h('div', { class: 'izgara', style: 'margin-top:10px' },
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Çalışılan gün / saat'), h('div', { class: 'sayi' }, o.gun + ' gün · ' + o.calisilan.toLocaleString('tr-TR') + ' sa')),
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Fazla mesai (günlük ' + pa.gunlukSaat + ' sa üstü)'), h('div', { class: 'sayi' }, o.fazla.toLocaleString('tr-TR') + ' sa')),
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Avans toplamı'), h('div', { class: 'sayi pozitif' }, para(o.avans))),
        h('div', { class: 'kart' }, h('div', { class: 'soluk' }, 'Tahmini ödenecek'), h('div', { class: 'sayi' }, para(o.odenecek)))),
      h('div', { class: 'not b' }, 'Hesap: maaş + fazla mesai (' + para(o.fazlaMesaiUcret) + ', ×' + pa.fmCarpan + ' ve aylık ' + pa.aylikSaat + ' sa varsayımıyla) − avans. Tahmindir; oranlar Ayarlar\'dan değişir, bordro yerine geçmez.'),
      h('h2', null, 'Mesailer'), h('div', { class: 'yan' }, h('button', { onclick: mesaiForm }, '＋ Mesai ekle')),
      h('div', { class: 'kart' }, ms.length ? ms.map(function (m) {
        return h('div', { class: 'satir' }, h('div', { class: 'orta' }, h('b', null, tarihTr(m.tarih)), h('span', { class: 'soluk' }, m.giris + ' – ' + m.cikis + (m.not ? ' · ' + m.not : ''))),
          h('div', { class: 'sag' }, KN.saatFarki(m.giris, m.cikis).toLocaleString('tr-TR') + ' sa'), h('button', { 'aria-label': 'Sil', style: 'min-height:36px;padding:4px 10px', onclick: function () { sil('mesai', m); } }, '✕'));
      }) : h('div', { class: 'bos' }, 'Bu ay mesai kaydı yok.')),
      h('h2', null, 'Avanslar'), h('div', { class: 'yan' }, h('button', { onclick: avansForm }, '＋ Avans ekle')),
      h('div', { class: 'kart' }, av.length ? av.map(function (a) {
        return h('div', { class: 'satir' }, h('div', { class: 'orta' }, h('b', null, tarihTr(a.tarih)), h('span', { class: 'soluk' }, a.not || '—')), h('div', { class: 'sag' }, para(a.tutar)),
          h('button', { 'aria-label': 'Sil', style: 'min-height:36px;padding:4px 10px', onclick: function () { sil('avans', a); } }, '✕'));
      }) : h('div', { class: 'bos' }, 'Bu ay avans yok.')));
  }

  // ---------- AYARLAR ----------
  function ayarSayfa() {
    $('baslik').textContent = 'Ayarlar';
    var a = ayar();
    var un = h('input', { value: a.unvan || '', placeholder: 'Örn. Benim Restoran' }), vk = h('input', { value: a.vkn || '', inputmode: 'numeric', placeholder: 'e-fatura yönü için' }),
      gm = h('input', { type: 'password', value: a.gemini || '', placeholder: 'AIza…', autocomplete: 'off' }),
      gs = h('input', { value: a.gunlukSaat || 8, inputmode: 'decimal' }), fc = h('input', { value: String(a.fmCarpan || 1.5).replace('.', ','), inputmode: 'decimal' }), as = h('input', { value: a.aylikSaat || 225, inputmode: 'decimal' });
    var dosya = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: function (e) {
      var f = e.target.files[0]; e.target.value = ''; if (!f) return;
      f.text().then(function (t) { var j = JSON.parse(t); onay('Mevcut tüm veri silinip yedekteki veri yüklensin mi?', function () { DB.iceAktar(j).then(function () { bildir('Yedek yüklendi'); yonlendir(); }, function (er) { bildir(er.message); }); }, true); }).catch(function () { bildir('Geçersiz yedek dosyası.'); });
    } });
    return h('div', null,
      h('div', { class: 'kart' }, h('b', null, 'İşletme'), h('label', null, 'Ünvan'), un, h('label', null, 'Vergi no (VKN)'), vk),
      h('div', { class: 'kart' }, h('b', null, 'Belge okuma (Gemini)'), h('label', null, 'Gemini API anahtarı'), gm,
        h('p', { class: 'soluk' }, 'Anahtar yalnız bu cihazda saklanır, sadece Google\'a okuma isteğiyle gider. Ücretsiz katmanda gönderilen belgeler Google tarafından ürün geliştirmede kullanılabilir (ai.google.dev/gemini-api/docs/pricing). Gerçek müşteri belgeleri için ücretli katman önerilir.')),
      h('div', { class: 'kart' }, h('b', null, 'Personel hesabı (tahmini)'), h('div', { class: 'uc' }, h('div', null, h('label', null, 'Günlük saat'), gs), h('div', null, h('label', null, 'Mesai çarpanı'), fc), h('div', null, h('label', null, 'Aylık saat'), as)),
        h('p', { class: 'soluk' }, 'Varsayılanlar (8 saat, ×1,5, 225 saat) genel kabuldür; iş sözleşmenize göre doğrulayın.')),
      h('button', { class: 'birinci buyuk', onclick: function () {
        ayarKaydet({ unvan: un.value.trim(), vkn: vk.value.replace(/\D/g, ''), gemini: gm.value.trim(), gunlukSaat: sayi(gs.value) || 8, fmCarpan: sayi(fc.value) || 1.5, aylikSaat: sayi(as.value) || 225 });
        bildir('Ayarlar kaydedildi');
      } }, 'Kaydet'),
      h('div', { class: 'kart' }, h('b', null, 'Yedek'),
        h('p', { class: 'soluk' }, 'Verileriniz yalnız bu telefonda/tarayıcıda durur. Düzenli yedek alın (belge fotoğrafları yedeğe dahil değildir).'),
        h('div', { class: 'yan' }, h('button', { onclick: function () {
          DB.disaAktar().then(function (j) {
            var url = URL.createObjectURL(new Blob([JSON.stringify(j)], { type: 'application/json' }));
            var l = h('a', { href: url, download: 'kasanot-yedek-' + bugun() + '.json' }); document.body.appendChild(l); l.click(); l.remove();
          });
        } }, 'Yedeği indir'), h('label', { class: 'dugme' }, 'Yedekten yükle', dosya),
          h('button', { onclick: function () { indir('kasanot-hareketler-' + bugun() + '.csv', ekstreCsv(S.hareketler.slice().sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; }))); } }, 'Tüm hareketler (Excel)'),
          h('button', { onclick: function () { indir('kasanot-urun-fiyatlari-' + bugun() + '.csv', KN.csv([['Tarih', 'Ürün', 'Cari', 'Birim fiyat', 'Değişim %']].concat(S.fiyatlar.slice().sort(function (a, b) { return a.tarih < b.tarih ? -1 : 1; }).map(function (f) { return [tarihTr(f.tarih), f.ad, cariAd(f.cariId), f.birimFiyat, f.degisim || 0]; })))); } }, 'Ürün fiyatları (Excel)'),
          h('button', { class: 'tehlike', onclick: function () { onay('TÜM veriler silinsin mi? Geri alınamaz.', function () { Promise.all(DB.depolar.map(function (d) { return DB.temizle(d); })).then(function () { bildir('Tüm veri silindi'); git('#/ana'); }); }, true); } }, 'Tüm veriyi sil'))));
  }

  // ---------- başlangıç ----------
  window.addEventListener('hashchange', yonlendir);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  yonlendir();
})();
