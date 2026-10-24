// KasaNot veri katmanı: IndexedDB (veri yalnız bu cihazda). window.DB
(function () {
  'use strict';
  var ADI = 'kasanot', SURUM = 2;
  var DEPOLAR = ['cariler', 'hareketler', 'fiyatlar', 'bekleyen', 'dosyalar', 'personel', 'mesai', 'avans'];
  var dbp = null;

  function ac() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, hata) {
      var r = indexedDB.open(ADI, SURUM);
      r.onupgradeneeded = function () {
        DEPOLAR.forEach(function (d) {
          if (!r.result.objectStoreNames.contains(d)) r.result.createObjectStore(d, { keyPath: 'id', autoIncrement: true });
        });
        if (!r.result.objectStoreNames.contains('cikis')) r.result.createObjectStore('cikis', { keyPath: 'k' });
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { hata(r.error); };
    });
    return dbp;
  }
  function islem(depo, mod, f) {
    return ac().then(function (db) {
      return new Promise(function (ok, hata) {
        var tx = db.transaction(depo, mod), st = tx.objectStore(depo), sonuc;
        var r = f(st);
        if (r) r.onsuccess = function () { sonuc = r.result; };
        tx.oncomplete = function () { ok(sonuc); };
        tx.onerror = tx.onabort = function () { hata(tx.error); };
      });
    });
  }
  // Cihazlar arası çakışmayı önlemek için kimlik cihazda üretilir (güvenli tamsayı)
  function yeniId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); }
  var DB = {
    // Eşitleme: yazma/silme sonrası çağrılır (bulut.js bağlar)
    degisimde: null,
    hepsi: function (d) { return islem(d, 'readonly', function (s) { return s.getAll(); }); },
    al: function (d, id) { return islem(d, 'readonly', function (s) { return s.get(id); }); },
    // Yerel yazma (eşitlemeyi tetiklemez): bulut verisini uygularken kullanılır
    koyYerel: function (d, kayit) { return islem(d, 'readwrite', function (s) { return s.put(kayit); }); },
    silYerel: function (d, id) { return islem(d, 'readwrite', function (s) { return s.delete(id); }); },
    koy: function (d, kayit) {
      if (kayit.id == null) kayit.id = yeniId();
      return DB.koyYerel(d, kayit).then(function (id) { if (DB.degisimde) DB.degisimde(d, id, false); return id; });
    },
    sil: function (d, id) {
      return DB.silYerel(d, id).then(function () { if (DB.degisimde) DB.degisimde(d, id, true); });
    },
    temizle: function (d) {
      return DB.hepsi(d).then(function (x) { return x.reduce(function (p, k) { return p.then(function () { return DB.sil(d, k.id); }); }, Promise.resolve()); });
    },
    // Çıkış kuyruğu (henüz buluta gitmemiş değişiklikler)
    kuyrukEkle: function (d, id, sil) { return islem('cikis', 'readwrite', function (s) { return s.put({ k: d + ':' + id, depo: d, id: id, sil: !!sil }); }); },
    kuyrukHepsi: function () { return islem('cikis', 'readonly', function (s) { return s.getAll(); }); },
    kuyrukSil: function (k) { return islem('cikis', 'readwrite', function (s) { return s.delete(k); }); },
    // Belge dosyası: yerelde yoksa buluttan indirir
    dosyaAl: function (id) {
      return DB.al('dosyalar', id).then(function (d) {
        if (!d || d.blob || !window.BULUT) return d;
        return BULUT.dosyaIndir(id).then(function (blob) {
          if (!blob) return d;
          d.blob = blob; return DB.koyYerel('dosyalar', d).then(function () { return d; });
        }, function () { return d; });
      });
    },
    depolar: DEPOLAR,
    // Yedek: dosyalar (fotoğraflar) hariç tüm veri
    disaAktar: function () {
      var cikti = { surum: 1, tarih: new Date().toISOString() };
      return Promise.all(DEPOLAR.filter(function (d) { return d !== 'dosyalar' && d !== 'bekleyen'; }).map(function (d) {
        return DB.hepsi(d).then(function (x) { cikti[d] = x; });
      })).then(function () { return cikti; });
    },
    iceAktar: function (j) {
      if (!j || j.surum !== 1) return Promise.reject(new Error('Geçersiz yedek dosyası.'));
      var liste = DEPOLAR.filter(function (d) { return d !== 'dosyalar' && d !== 'bekleyen'; });
      return liste.reduce(function (p, d) {
        return p.then(function () { return DB.temizle(d); }).then(function () {
          return (Array.isArray(j[d]) ? j[d] : []).reduce(function (q, k) { return q.then(function () { return DB.koy(d, k); }); }, Promise.resolve());
        });
      }, Promise.resolve());
    }
  };
  window.DB = DB;
})();
