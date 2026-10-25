// Belge okuma: e-fatura XML yerelde; fotoğraf/PDF Gemini ile. window.OKU
(function () {
  'use strict';
  var MODEL = 'gemini-3.8-flash';
  var SABIT = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];

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

  function istem(isletme, ekstra) {
    return 'Bu bir Türkiye\'de düzenlenmiş muhasebe belgesi (fatura, fiş veya banka dekontu). Alanları belgede yazdığı gibi çıkar, uydurma; okunamayan alanı boş bırak.\n' +
      '- Sipariş/irsaliye/sevk fişi türü el yazısı belgelerde ADET sütunu çuval/paket/sepet sayısıdır; asıl miktar genelde açıklamadaki "10x" gibi kg değeridir ve fiyat birim (kg) fiyatıdır. Satırı miktar x fiyat = tutar olacak şekilde yaz (örn. 10 kg x 47 = 470). Eski bakiye ve Devir önceki borçtur: kalem veya toplam DEĞİL, aciklama alanına yaz. Toplam = bu belgedeki kalemlerin toplamı; G.Toplam (genel toplam) eski bakiyeyi içerir, toplam alanına yazma. Sayın yanındaki isim alıcıdır (biz, yani alış belgesidir); satıcı unvanı belgenin başlığındaki/kaşedeki firmadır, yoksa boş bırak.\n' +
      '- Belge ELLE YAZILMIŞ olabilir (el yazısı fiş, adisyon, ufak defter/kağıt notu). Bu durumda el yazısını elinden geldiğince oku: rakamları ve ürün adlarını tahmin ederek yaz, belge basılı değilse tur = fis olsun, VKN/belgeNo yoksa boş bırak. Toplam yazılı değilse kalem tutarlarını toplayarak toplam ver. Hiçbir şey okuyamazsan bile toplam = 0 yerine en az görebildiğin kalemleri döndür ve guven değerini düşük ver.\n' +
      '- tur: fatura | fis | dekont.\n' +
      '- Tutarlar nokta ondalıklı sayı (1.250,50 -> 1250.5). tarih YYYY-MM-DD.\n' +
      '- fatura/fis: yon = bizim işletmeye göre "alis" (satıcı karşı taraf) veya "satis" (biz kestik). karsiUnvan/karsiVkn = karşı taraf (alışta satıcı). Fişte VKN genelde mağaza vergi no.\n' +
      '- kalemler (ÇOK ÖNEMLİ): belgedeki HER ürün/hizmet satırını ayrı ayrı kalemler dizisine yaz (ad, miktar, birim, birimFiyat, tutar); asla boş bırakma, yalnızca toplamı döndürme. Toplam, Genel toplam, Bakiye, Devir satırları kalem DEĞİLDİR. Satırda sadece ad ve tutar varsa miktar=1, birimFiyat=tutar yaz. birimFiyat KDV hariç birim fiyat varsa o, yoksa belgede yazan; tutar satır tutarı. Fişte kalem satırlarını da çıkar.\n' +
      '- araToplam KDV hariç toplam, kdv toplam KDV, toplam ödenecek genel toplam.\n' +
      '- dekont: odemeYonu = bizden çıkan para ise "giden", bize gelen ise "gelen"; karsiUnvan = diğer taraf (alıcı/gönderen); belgeNo = işlem/referans no; toplam = işlem tutarı; aciklama = açıklama alanı.\n' +
      '- guven: 0 ile 1 arası, belgenin okunabilirliğine göre kendi tahminin.\n' +
      (isletme ? 'Bizim işletme: ' + isletme + '\n' : '') + (ekstra || '');
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
        var o = Math.min(1, 2400 / Math.max(im.width, im.height));
        var c = document.createElement('canvas');
        c.width = Math.round(im.width * o); c.height = Math.round(im.height * o);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { ok(b || dosya); }, 'image/jpeg', 0.9);
      };
      im.onerror = function () { URL.revokeObjectURL(url); ok(dosya); };
      im.src = url;
    });
  }

  var YEDEK_MODEL = 'gemini-2.5-flash-lite';
  var ONBELLEK = 'kn_model';
  function bekle(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function surum(ad) { var m = /gemini-(\d+(?:\.\d+)?)-flash/.exec(ad); return m ? parseFloat(m[1]) : 0; }
  function oku_(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function yaz_(k, v) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) {} }

  // Model adı kapatılmışsa (404) anahtarın görebildiği en yeni kararlı flash modelini seç
  function modelSec(anahtar) {
    return fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': anahtar } })
      .then(function (r) { if (!r.ok) throw new Error('liste ' + r.status); return r.json(); })
      .then(function (j) {
        var ad = (j.models || []).filter(function (m) {
          return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 &&
            /^models\/gemini-[\d.]+-flash(-lite)?$/.test(m.name);
        }).map(function (m) { return m.name.replace('models/', ''); });
        ad.sort(function (a, b) { return (surum(b) - surum(a)) || ((/lite/.test(a) ? 1 : 0) - (/lite/.test(b) ? 1 : 0)); });
        if (!ad.length) throw new Error('model yok');
        return ad;
      });
  }

  function geminiCagri(blob, anahtar, isletme, ekstra) {
    return blob.arrayBuffer().then(function (buf) {
      var gov = {
        contents: [{ parts: [{ text: istem(isletme, ekstra) }, { inline_data: { mime_type: blob.type || 'image/jpeg', data: b64(buf) } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SEMA, temperature: 0 }
      };
      function istek(model) {
        return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': anahtar }, body: JSON.stringify(gov)
        });
      }
      var son = '', sonKod = 0;
      // Sırayla dene: önbellekteki/varsayılan model, 404 ise anahtarın gördüğü modeller (en yeni önce)
      function sirada(liste, i) {
        if (i >= liste.length) return Promise.reject(new Error(sonKod === 429 ? 'Günlük ücretsiz okuma sınırı doldu. Biraz sonra tekrar deneyin ya da belgeyi elle girin.' : 'Okuma servisi hata verdi (' + sonKod + '). Denenen modeller: ' + son));
        var m = liste[i];
        return istek(m).then(function (r) {
          if (r.status >= 500) return bekle(1500).then(function () { return istek(m); });
          return r;
        }).then(function (r) {
          if (r.status === 404 || r.status === 429 || r.status >= 500) { sonKod = r.status; son += (son ? ', ' : '') + m + ' (' + r.status + ')'; return sirada(liste, i + 1); }
          if (r.ok) yaz_(ONBELLEK, { ana: m });
          return r;
        });
      }
      var kayitli = oku_(ONBELLEK);
      var ilk = kayitli && kayitli.ana ? [kayitli.ana].concat(SABIT) : SABIT;
      return sirada(ilk, 0).catch(function (e) {
        if (!/\(404\)|\(5\d\d\)/.test(e.message)) throw e;
        yaz_(ONBELLEK, null);
        return modelSec(anahtar).then(function (liste) { return sirada(liste.filter(function (x) { return SABIT.indexOf(x) < 0; }).slice(0, 4), 0); }, function () { throw e; });
      });
    }).then(function (r) {
      if (r.status === 429) throw new Error('Günlük ücretsiz okuma sınırı doldu. Biraz sonra tekrar deneyin ya da belgeyi elle girin.');
      if (r.ok) return r.json();
      return r.text().then(function (t) {
        var ayrinti = ''; try { ayrinti = JSON.parse(t).error.message; } catch (e) {}
        ayrinti = String(ayrinti || '').slice(0, 160);
        if (/API key/i.test(ayrinti) || r.status === 403) throw new Error('Gemini anahtarı geçersiz görünüyor. Ayarlar\'dan kontrol edin.');
        throw new Error('Okuma servisi hata verdi (' + r.status + ').' + (ayrinti ? ' ' + ayrinti : ''));
      });
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
      var EK = 'DİKKAT: Önceki okumada ürün satırları boş geldi. Belgedeki tüm ürün/hizmet satırlarını tek tek kalemler dizisine yaz; yalnızca son bakiye veya toplamı döndürme.\n';
      return geminiCagri(b, ayar.gemini, ayar.unvan || '').then(function (j) {
        if (j && j.tur !== 'diger' && !(j.kalemler && j.kalemler.length)) {
          return geminiCagri(b, ayar.gemini, ayar.unvan || '', EK).then(function (j2) { return (j2 && j2.kalemler && j2.kalemler.length) ? j2 : j; }, function () { return j; });
        }
        return j;
      }).then(function (j) {
        if (j.tur === 'diger') throw new Error('Bu belge fatura, fiş ya da dekonta benzemiyor.');
        var b = KN.geminiBelge(j);
        if (!b.toplam && b.kalemler.length) b.toplam = Math.round(b.kalemler.reduce(function (t, k) { return t + (k.tutar || k.miktar * k.birimFiyat || 0); }, 0) * 100) / 100;
        return b;
      });
    });
  }
  window.OKU = { oku: oku, kucult: kucult };
})();
