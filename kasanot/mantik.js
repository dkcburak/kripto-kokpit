// KasaNot saf hesaplar ve belge okuma (tarayici + node testi). Veri/ekran yok.
(function (root) {
  'use strict';

  function norm(s) {
    return String(s || '').toLocaleLowerCase('tr-TR')
      .replace(/[.,;:()'"\/\\\-_*]/g, ' ')
      .replace(/\b(ltd|sti|şti|san|tic|a ş|aş|as|anonim|limited|şirketi|sirketi|ve|ith|ihr|paz|ticaret|sanayi)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function tokens(s) { return norm(s).split(' ').filter(function (t) { return t.length > 1; }); }
  function benzerlik(a, b) {
    var x = tokens(a), y = tokens(b);
    if (!x.length || !y.length) return 0;
    var set = {}, ort = 0;
    x.forEach(function (t) { set[t] = 1; });
    y.forEach(function (t) { if (set[t]) ort++; });
    return ort / (x.length + y.length - ort);
  }

  // Cari eşleştirme: önce VKN/TCKN, sonra ünvan benzerliği (>= 0.6)
  function cariBul(cariler, aday) {
    var vkn = String(aday.vkn || '').replace(/\D/g, '');
    if (vkn.length >= 10) {
      for (var i = 0; i < cariler.length; i++) {
        if (String(cariler[i].vkn || '').replace(/\D/g, '') === vkn) return { cari: cariler[i], skor: 1, neden: 'vkn' };
      }
    }
    var en = null, skor = 0;
    cariler.forEach(function (c) {
      var s = benzerlik(c.unvan, aday.unvan);
      if (s > skor) { skor = s; en = c; }
    });
    if (en && skor >= 0.6) return { cari: en, skor: skor, neden: 'unvan' };
    return null;
  }

  // Bakiye işareti: + = bizim borcumuz (ödenecek), - = alacağımız.
  var ISARET = { alis: 1, tahsilat: 1, satis: -1, odeme: -1 };
  function bakiyeEtkisi(tur, tutar) { return (ISARET[tur] || 0) * Math.abs(Number(tutar) || 0); }
  function bakiye(hareketler, cariId) {
    return Math.round(hareketler.reduce(function (t, h) {
      return h.cariId === cariId ? t + bakiyeEtkisi(h.tur, h.tutar) : t;
    }, 0) * 100) / 100;
  }

  function urunAnahtar(ad) { return norm(ad); }

  // Önceki alıma göre fiyat değişimi. gecmis: [{urun, cariId, tarih, birimFiyat}]
  function fiyatDegisim(gecmis, ad, cariId, birimFiyat, tarih) {
    var k = urunAnahtar(ad);
    if (!k || !(birimFiyat > 0)) return null;
    var onceki = gecmis.filter(function (f) {
      return f.urun === k && f.birimFiyat > 0 && (!tarih || f.tarih < tarih || (f.tarih === tarih && false));
    });
    if (!onceki.length) return null;
    var ayni = onceki.filter(function (f) { return f.cariId === cariId; });
    var havuz = ayni.length ? ayni : onceki;
    havuz.sort(function (a, b) { return a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0; });
    var son = havuz[0];
    var yuzde = (birimFiyat - son.birimFiyat) / son.birimFiyat * 100;
    if (Math.abs(yuzde) < 0.5) return null;
    return { onceki: son.birimFiyat, oncekiTarih: son.tarih, yuzde: Math.round(yuzde * 10) / 10, ayniCari: ayni.length > 0 };
  }

  function mukerrer(hareketler, cariId, belgeNo, tutar) {
    if (!belgeNo) return null;
    var n = norm(belgeNo);
    for (var i = 0; i < hareketler.length; i++) {
      var h = hareketler[i];
      if (h.cariId === cariId && norm(h.belgeNo) === n && Math.abs(Math.abs(h.tutar) - Math.abs(tutar)) < 0.01) return h;
    }
    return null;
  }

  // Okunan belgenin kendi içinde tutarlılığı (yanlış okuma yakalama)
  function tutarlilik(b) {
    var uyari = [];
    var kal = (b.kalemler || []).reduce(function (t, k) { return t + (Number(k.tutar) || 0); }, 0);
    if (b.kalemler && b.kalemler.length && b.araToplam > 0 && Math.abs(kal - b.araToplam) > Math.max(0.05, b.araToplam * 0.005)) {
      uyari.push('Kalemler toplamı (' + para(kal) + ') ara toplamla (' + para(b.araToplam) + ') uyuşmuyor.');
    }
    if (b.araToplam > 0 && b.kdv >= 0 && b.toplam > 0 && Math.abs(b.araToplam + b.kdv - b.toplam) > Math.max(0.05, b.toplam * 0.005)) {
      uyari.push('Ara toplam + KDV genel toplamla uyuşmuyor.');
    }
    if (!(b.toplam > 0)) uyari.push('Toplam tutar okunamadı.');
    if (!b.tarih || !/^\d{4}-\d{2}-\d{2}$/.test(b.tarih)) uyari.push('Tarih okunamadı.');
    return uyari;
  }

  function para(n, pb) {
    var s = Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s + ' ' + (pb && pb !== 'TRY' ? pb : '₺');
  }

  // ---- Minimal XML ayrıştırıcı (ad alanı önekleri atılır) ----
  function xmlAgac(xml) {
    var kok = { ad: '#', cocuk: [], metin: '' }, yigin = [kok];
    var re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.\-]+)\s*>|<([\w:.\-]+)((?:\s+[\w:.\-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(xml))) {
      var ust = yigin[yigin.length - 1];
      if (m[1] !== undefined) ust.metin += m[1];
      else if (m[2]) { if (yigin.length > 1) yigin.pop(); }
      else if (m[3]) {
        var d = { ad: m[3].split(':').pop(), cocuk: [], metin: '', oz: {} };
        var ar = /([\w:.\-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, a;
        while ((a = ar.exec(m[4] || ''))) d.oz[a[1].split(':').pop()] = a[2] !== undefined ? a[2] : a[3];
        ust.cocuk.push(d);
        if (!m[5]) yigin.push(d);
      } else if (m[6]) ust.metin += m[6].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }
    return kok;
  }
  function bul(d, yol) {
    var p = yol.split('/'), cur = [d];
    p.forEach(function (ad) {
      var yeni = [];
      cur.forEach(function (x) { x.cocuk.forEach(function (c) { if (c.ad === ad) yeni.push(c); }); });
      cur = yeni;
    });
    return cur;
  }
  function metin(d, yol) { var r = bul(d, yol)[0]; return r ? r.metin.trim() : ''; }
  function sayi(s) { var n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? 0 : n; }
  function taraf(p) {
    if (!p) return { unvan: '', vkn: '' };
    var unvan = metin(p, 'PartyName/Name');
    if (!unvan) unvan = (metin(p, 'Person/FirstName') + ' ' + metin(p, 'Person/FamilyName')).trim();
    var vkn = '';
    bul(p, 'PartyIdentification/ID').forEach(function (i) {
      var s = (i.oz && i.oz.schemeID || '').toUpperCase();
      if (s === 'VKN' || s === 'TCKN') vkn = i.metin.trim();
    });
    return { unvan: unvan, vkn: vkn };
  }

  // UBL-TR e-Fatura/e-Arşiv XML -> ortak belge. benimVkn: işletmenin VKN'si (yön için)
  function ublOku(xmlText, benimVkn) {
    var kok = xmlAgac(xmlText);
    var inv = kok.cocuk.filter(function (c) { return c.ad === 'Invoice'; })[0];
    if (!inv) throw new Error('Bu dosya e-fatura (UBL) XML değil.');
    var satici = taraf(bul(inv, 'AccountingSupplierParty/Party')[0]);
    var alici = taraf(bul(inv, 'AccountingCustomerParty/Party')[0]);
    var ben = String(benimVkn || '').replace(/\D/g, '');
    var yon = 'alis', karsi = satici;
    if (ben && alici.vkn === ben) { yon = 'alis'; karsi = satici; }
    else if (ben && satici.vkn === ben) { yon = 'satis'; karsi = alici; }
    var kalemler = bul(inv, 'InvoiceLine').map(function (l) {
      var q = bul(l, 'InvoicedQuantity')[0];
      return {
        ad: metin(l, 'Item/Name') || metin(l, 'Item/Description'),
        miktar: q ? sayi(q.metin) : 1,
        birim: q && q.oz ? q.oz.unitCode || '' : '',
        birimFiyat: sayi(metin(l, 'Price/PriceAmount')),
        tutar: sayi(metin(l, 'LineExtensionAmount'))
      };
    });
    var para0 = metin(inv, 'DocumentCurrencyCode') || 'TRY';
    return {
      kaynak: 'xml', tur: 'fatura', yon: yon,
      belgeNo: metin(inv, 'ID'), tarih: metin(inv, 'IssueDate'),
      karsiUnvan: karsi.unvan, karsiVkn: karsi.vkn,
      araToplam: sayi(metin(inv, 'LegalMonetaryTotal/TaxExclusiveAmount')),
      kdv: sayi(metin(inv, 'TaxTotal/TaxAmount')),
      toplam: sayi(metin(inv, 'LegalMonetaryTotal/PayableAmount')) || sayi(metin(inv, 'LegalMonetaryTotal/TaxInclusiveAmount')),
      para: para0, kalemler: kalemler, guven: 1
    };
  }

  // Gemini çıktısını ortak belgeye çevirir ve temizler
  // El yazısı belgelerde miktar sütunu (paket/sepet adedi) ile kg karışabilir: miktar x fiyat tutara uymuyorsa miktar = tutar / fiyat.
  // Genel toplam kalemlerin çok üstündeyse (eski bakiye dahil) kalem toplamı alınır.
  function kalemDuzelt(r) {
    var top = 0;
    r.kalemler.forEach(function (k) {
      if (k.birimFiyat > 0 && k.tutar > 0) {
        if (Math.abs(k.miktar * k.birimFiyat - k.tutar) / k.tutar > 0.03) k.miktar = Math.round(k.tutar / k.birimFiyat * 100) / 100;
      } else if (!(k.birimFiyat > 0) && k.tutar > 0 && k.miktar > 0) k.birimFiyat = Math.round(k.tutar / k.miktar * 100) / 100;
      else if (k.birimFiyat > 0 && !(k.tutar > 0)) k.tutar = Math.round(k.miktar * k.birimFiyat * 100) / 100;
      top += k.tutar || 0;
    });
    top = Math.round(top * 100) / 100;
    if (top > 0 && r.toplam > top * 1.1) {
      r.aciklama = (r.aciklama ? r.aciklama + ' · ' : '') + 'Belgedeki genel toplam ' + r.toplam + ' (eski bakiye dahil olabilir); bu belgenin tutarı kalem toplamı alındı.';
      r.toplam = top;
    }
    return r;
  }

  function geminiBelge(j) {
    j = j || {};
    var tur = ['fatura', 'fis', 'dekont'].indexOf(j.tur) >= 0 ? j.tur : 'fatura';
    var yon;
    if (tur === 'dekont') yon = j.odemeYonu === 'gelen' ? 'tahsilat' : 'odeme';
    else yon = j.yon === 'satis' ? 'satis' : 'alis';
    var tarih = String(j.tarih || '');
    var m = tarih.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})$/);
    if (m) tarih = m[3] + '-' + m[2] + '-' + m[1];
    var r = {
      kaynak: 'yz', tur: tur, yon: yon, belgeNo: String(j.belgeNo || ''), tarih: tarih,
      karsiUnvan: String(j.karsiUnvan || ''), karsiVkn: String(j.karsiVkn || '').replace(/\D/g, ''),
      araToplam: Number(j.araToplam) || 0, kdv: Number(j.kdv) || 0, toplam: Number(j.toplam) || 0,
      para: j.para || 'TRY',
      kalemler: (j.kalemler || []).map(function (k) {
        return { ad: String(k.ad || ''), miktar: Number(k.miktar) || 1, birim: String(k.birim || ''), birimFiyat: Number(k.birimFiyat) || 0, tutar: Number(k.tutar) || 0 };
      }),
      aciklama: String(j.aciklama || ''), guven: Number(j.guven) || 0
    };
    return kalemDuzelt(r);
  }

  // ---- Personel ----
  function saatFarki(giris, cikis) {
    var a = /^(\d{1,2}):(\d{2})$/.exec(giris || ''), b = /^(\d{1,2}):(\d{2})$/.exec(cikis || '');
    if (!a || !b) return 0;
    var d = (+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]);
    if (d < 0) d += 1440;
    return Math.round(d / 60 * 100) / 100;
  }
  // ay: 'YYYY-MM'. ayar: {gunlukSaat, fmCarpan, aylikSaat}
  function personelAyOzeti(p, mesailer, avanslar, ay, ayar) {
    ayar = ayar || {};
    var gun = ayar.gunlukSaat || 8, carpan = ayar.fmCarpan || 1.5, aylik = ayar.aylikSaat || 225;
    var ms = mesailer.filter(function (m) { return m.personelId === p.id && String(m.tarih).slice(0, 7) === ay; });
    var calisilan = 0, fazla = 0;
    ms.forEach(function (m) {
      var s = saatFarki(m.giris, m.cikis);
      calisilan += s;
      fazla += Math.max(0, s - gun);
    });
    var av = avanslar.filter(function (a) { return a.personelId === p.id && String(a.tarih).slice(0, 7) === ay; })
      .reduce(function (t, a) { return t + (Number(a.tutar) || 0); }, 0);
    var maas = Number(p.maas) || 0;
    var fmUcret = Math.round(fazla * (maas / aylik) * carpan * 100) / 100;
    return {
      gun: ms.length, calisilan: Math.round(calisilan * 100) / 100, fazla: Math.round(fazla * 100) / 100,
      avans: Math.round(av * 100) / 100, maas: maas, fazlaMesaiUcret: fmUcret,
      odenecek: Math.round((maas + fmUcret - av) * 100) / 100
    };
  }

  // CSV (Excel TR): noktalı virgül ayraç, ondalık virgül, UTF-8 BOM
  function csv(satirlar) {
    return '﻿' + satirlar.map(function (r) {
      return r.map(function (v) {
        if (typeof v === 'number') return String(v).replace('.', ',');
        var s = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // formül enjeksiyonu
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(';');
    }).join('\r\n');
  }

  var api = { csv: csv, norm: norm, benzerlik: benzerlik, cariBul: cariBul, bakiyeEtkisi: bakiyeEtkisi, bakiye: bakiye,
    urunAnahtar: urunAnahtar, fiyatDegisim: fiyatDegisim, mukerrer: mukerrer, tutarlilik: tutarlilik, para: para,
    ublOku: ublOku, geminiBelge: geminiBelge, saatFarki: saatFarki, personelAyOzeti: personelAyOzeti };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KN = api;
})(typeof self !== 'undefined' ? self : this);
