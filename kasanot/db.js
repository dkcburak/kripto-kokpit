// KasaNot veri katmanı: IndexedDB (veri yalnız bu cihazda). window.DB
(function () {
  'use strict';
  var ADI = 'kasanot', SURUM = 1;
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
  var DB = {
    hepsi: function (d) { return islem(d, 'readonly', function (s) { return s.getAll(); }); },
    al: function (d, id) { return islem(d, 'readonly', function (s) { return s.get(id); }); },
    koy: function (d, kayit) { return islem(d, 'readwrite', function (s) { return s.put(kayit); }); },
    sil: function (d, id) { return islem(d, 'readwrite', function (s) { return s.delete(id); }); },
    temizle: function (d) { return islem(d, 'readwrite', function (s) { return s.clear(); }); },
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
