// Belge okuma: e-fatura XML yerelde; fotoğraf/PDF Gemini ile. window.OKU
(function () {
  'use strict';
  var MODEL = 'gemini-2.5-flash';

  var SEMA = {
    type: 'OBJECT',
    properties: {
      tur: { type: 'STRING', enum: ['fatura', 'fis', 'dekont', 'diger'] },
      yon: { type: 'STRING', enum: ['alis', 'satis'] },
      odemeYonu: { type: 'STRING', enum: ['giden', 'gelen'] },
      belgeNo: { type: 'STRING' }, tarih: { type: 'STRING' },
      karsiUnvan: { type: 'STRING' }, karsiVkn: { type: 'STRING' },
      araToplam: { type: 'NUMBER' }, kdv: { type: 'NUMBER' }, toplam: { type: 'NUMBER' }, para: { type: 'STRING' },
      kalemler: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        ad: { type: 'STRING' }, miktar: { type: 'NUMBER' }, birim: { type: 'STRING' }, birimFiyat: { type: 'NUMBER' }, tutar: { type: 'NUMBER' } } } },
      aciklama: { type: 'STRING' }, guven: { type: 'NUMBER' }
    },
    required: ['tur', 'toplam']
  };

  function istem(isletme) {
    return 'Bu bir Türkiye\'de düzenlenmiş muhasebe belgesi (fatura, fiş veya banka dekontu). Alanları belgede yazdığı gibi çıkar, uydurma; okunamayan alanı boş bırak.\n' +
      '- tur: fatura | fis | dekont.\n' +
      '- Tutarlar nokta ondalıklı sayı (1.250,50 -> 1250.5). tarih YYYY-MM-DD.\n' +
      '- fatura/fis: yon = bizim işletmeye göre "alis" (satıcı karşı taraf) veya "satis" (biz kestik). karsiUnvan/karsiVkn = karşı taraf (alışta satıcı). Fişte VKN genelde mağaza vergi no.\n' +
      '- kalemler: ürün satırları; birimFiyat KDV hariç birim fiyat varsa o, yoksa belgede yazan; tutar satır tutarı. Fişte kalem satırlarını da çıkar.\n' +
      '- araToplam KDV hariç toplam, kdv toplam KDV, toplam ödenecek genel toplam.\n' +
      '- dekont: odemeYonu = bizden çıkan para ise "giden", bize gelen ise "gelen"; karsiUnvan = diğer taraf (alıcı/gönderen); belgeNo = işlem/referans no; toplam = işlem tutarı; aciklama = açıklama alanı.\n' +
      '- guven: 0 ile 1 arası, belgenin okunabilirliğine göre kendi tahminin.\n' +
      (isletme ? 'Bizim işletme: ' + isletme + '\n' : '');
  }

  function b64(buf) {
    var b = new Uint8Array(buf), s = '', n = 0x8000;
    for (var i = 0; i < b.length; i += n) s += String.fromCharCode.apply(null, b.subarray(i, i + n));
    return btoa(s);
  }

  // Görseli küçült (hız, veri tasarrufu, gizlilik)
  function kucult(dosya) {
    return new Promise(function (ok) {
      if (!/^image\//.test(dosya.type)) return ok(dosya);
      var url = URL.createObjectURL(dosya), im = new Image();
      im.onload = function () {
        var o = Math.min(1, 1800 / Math.max(im.width, im.height));
        var c = document.createElement('canvas');
        c.width = Math.round(im.width * o); c.height = Math.round(im.height * o);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b || dosya); }, 'image/jpeg', 0.85);
      };
      im.onerror = function () { URL.revokeObjectURL(url); ok(dosya); };
      im.src = url;
    });
  }

  function geminiCagri(blob, anahtar, isletme) {
    return blob.arrayBuffer().then(function (buf) {
      var gov = {
        contents: [{ parts: [{ text: istem(isletme) }, { inline_data: { mime_type: blob.type || 'image/jpeg', data: b64(buf) } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SEMA, temperature: 0 }
      };
      return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar }, body: JSON.stringify(gov)
      });
    }).then(function (r) {
      if (r.status === 429) throw new Error('Günlük ücretsiz okuma sınırı doldu. Biraz sonra tekrar deneyin ya da belgeyi elle girin.');
      if (r.status === 400 || r.status === 403) throw new Error('Gemini anahtarı geçersiz görünüyor. Ayarlar\'dan kontrol edin.');
      if (!r.ok) throw new Error('Okuma servisi hata verdi (' + r.status + ').');
      return r.json();
    }).then(function (j) {
      var t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
      if (!t || !t[0] || !t[0].text) throw new Error('Belge okunamadı. Daha net bir fotoğraf deneyin.');
      return JSON.parse(t[0].text);
    });
  }

  // Dosya -> ortak belge. ayar: {gemini, vkn, unvan}
  function oku(dosya, ayar) {
    var ad = (dosya.name || '').toLowerCase();
    if (/\.xml$/.test(ad) || dosya.type === 'text/xml' || dosya.type === 'application/xml') {
      if (dosya.size > 5 * 1024 * 1024) return Promise.reject(new Error('XML dosyası çok büyük (en fazla 5 MB).'));
      return dosya.text().then(function (x) { return KN.ublOku(x, ayar.vkn); });
    }
    if (!ayar.gemini) return Promise.reject(new Error('Fotoğraf ve PDF okumak için Ayarlar\'dan Gemini anahtarı girin. E-fatura XML dosyaları anahtarsız okunur.'));
    if (dosya.size > 15 * 1024 * 1024) return Promise.reject(new Error('Dosya çok büyük (en fazla 15 MB).'));
    return kucult(dosya).then(function (b) {
      return geminiCagri(b, ayar.gemini, ayar.unvan || '').then(function (j) {
        if (j.tur === 'diger') throw new Error('Bu belge fatura, fiş ya da dekonta benzemiyor.');
        return KN.geminiBelge(j);
      });
    });
  }
  window.OKU = { oku: oku, kucult: kucult };
})();
