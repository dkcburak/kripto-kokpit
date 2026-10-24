// KasaNot bulut eşitleme (Supabase: Auth + PostgREST + Storage, doğrudan fetch). window.BULUT
// Anahtar "publishable" türündedir: herkese açık olması tasarım gereğidir; erişimi RLS kuralları sınırlar.
(function () {
  'use strict';
  var URL_ = 'https://olzrmonvwhckufctblak.supabase.co';
  var ANAHTAR = 'sb_publishable_IT1WZIvH-50LIOHFjAv6kw_xzGCQhnW';
  var K_OTURUM = 'kn_oturum', K_ISLETME = 'kn_isletme', K_IMLEC = 'kn_imlec';
  var APP_URL = location.origin + location.pathname.replace(/[^\/]*$/, '');

  function oku(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function yaz(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var durum = { ad: 'bagsiz', son: null, hata: '', kuyruk: 0 };
  var dinleyen = [];
  function bildir() { dinleyen.forEach(function (f) { try { f(durum); } catch (e) {} }); }
  function ayarla(ad, hata) { durum.ad = ad; durum.hata = hata || ''; bildir(); }

  function hataMetni(r, j) {
    var m = (j && (j.msg || j.message || j.error_description || j.error)) || '';
    var kod = (j && (j.error_code || j.code)) || '';
    if (kod === 'invalid_credentials') return 'E-posta veya şifre hatalı.';
    if (kod === 'email_not_confirmed') return 'E-postanızı henüz onaylamadınız. Gelen kutunuzdaki bağlantıya basın.';
    if (kod === 'user_already_exists') return 'Bu e-posta zaten kayıtlı; Giriş yapın.';
    if (kod === 'weak_password') return 'Şifre çok zayıf (en az 8 karakter, harf ve rakam).';
    if (kod === 'over_email_send_rate_limit' || r.status === 429) return 'Çok sık deneme; birkaç dakika sonra tekrar deneyin.';
    return m || ('Sunucu hatası (' + r.status + ').');
  }

  function oturum() { return oku(K_OTURUM); }
  function oturumKaydet(j) {
    var o = { access: j.access_token, refresh: j.refresh_token, bitis: Date.now() + (j.expires_in || 3600) * 1000 - 60000, kullanici: { id: j.user.id, email: j.user.email } };
    yaz(K_OTURUM, o); return o;
  }
  function yenile() {
    var o = oturum(); if (!o || !o.refresh) return Promise.reject(new Error('Oturum yok'));
    return fetch(URL_ + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: ANAHTAR, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: o.refresh }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { yaz(K_OTURUM, null); throw new Error('Oturum süresi doldu, yeniden giriş yapın.'); } return oturumKaydet(j); }); });
  }
  function jeton() {
    var o = oturum(); if (!o) return Promise.reject(new Error('Giriş yapılmamış'));
    return o.bitis > Date.now() ? Promise.resolve(o.access) : yenile().then(function (n) { return n.access; });
  }
  // Kimlikli istek; 401'de bir kez jeton yeniler
  function istek(yol, sec, deneme) {
    return jeton().then(function (t) {
      var h = Object.assign({ apikey: ANAHTAR, Authorization: 'Bearer ' + t }, sec.headers || {});
      return fetch(URL_ + yol, { method: sec.method || 'GET', headers: h, body: sec.body });
    }).then(function (r) {
      if (r.status === 401 && !deneme) { var o = oturum(); if (o) o.bitis = 0; yaz(K_OTURUM, o); return istek(yol, sec, true); }
      return r;
    });
  }
  function json(r) {
    return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} if (!r.ok) throw new Error(hataMetni(r, j)); return j; });
  }

  // ---- hesap ----
  function giris(email, sifre) {
    return fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: ANAHTAR, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: sifre }) })
      .then(json).then(oturumKaydet);
  }
  function kayitOl(email, sifre) {
    return fetch(URL_ + '/auth/v1/signup?redirect_to=' + encodeURIComponent(APP_URL), { method: 'POST', headers: { apikey: ANAHTAR, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: sifre }) })
      .then(json).then(function (j) { return j && j.access_token ? { oturum: oturumKaydet(j) } : { onayGerekli: true }; });
  }
  function cikis() { yaz(K_OTURUM, null); yaz(K_ISLETME, null); yaz(K_IMLEC, null); ayarla('bagsiz'); return Promise.resolve(); }

  // ---- işletme ----
  function isletmem() {
    return istek('/rest/v1/uye?select=isletme,rol', {}).then(json).then(function (u) {
      if (!u || !u.length) return null;
      return istek('/rest/v1/isletme?select=id,ad&id=eq.' + u[0].isletme, {}).then(json).then(function (i) { return { id: u[0].isletme, rol: u[0].rol, ad: i && i[0] ? i[0].ad : '' }; });
    });
  }
  function isletmeOlustur(ad) {
    return istek('/rest/v1/rpc/isletme_olustur', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ad: ad }) }).then(json);
  }
  function uyeEkle(email) {
    return istek('/rest/v1/rpc/uye_ekle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_isletme: oku(K_ISLETME).id, p_email: email }) }).then(json);
  }
  function uyeler() {
    return istek('/rest/v1/rpc/uyeler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_isletme: oku(K_ISLETME).id }) }).then(json);
  }
  function baglan(is) { yaz(K_ISLETME, is); yaz(K_IMLEC, null); }
  function bulutSayisi() {
    return istek('/rest/v1/kayit?select=id&limit=1&isletme=eq.' + oku(K_ISLETME).id, {}).then(json).then(function (x) { return x.length; });
  }
  function yerelleriKuyrugaAl() {
    return Promise.all(DB.depolar.filter(function (d) { return d !== 'bekleyen'; }).map(function (d) { return DB.hepsi(d).then(function (x) { return x.map(function (k) { return DB.kuyrukEkle(d, k.id, false); }); }).then(function (p) { return Promise.all(p); }); })).then(function () { planla(100); });
  }
  function yerelSayisi() {
    return Promise.all(DB.depolar.filter(function (d) { return d !== 'bekleyen'; }).map(function (d) { return DB.hepsi(d); })).then(function (l) { return l.reduce(function (t, x) { return t + x.length; }, 0); });
  }
  function yerelleriSil() {
    return Promise.all(DB.depolar.filter(function (d) { return d !== 'bekleyen'; }).map(function (d) { return DB.hepsi(d).then(function (x) { return Promise.all(x.map(function (k) { return DB.silYerel(d, k.id); })); }); }));
  }

  // ---- dosya ----
  function dosyaIndir(id) {
    var is = oku(K_ISLETME); if (!is || !navigator.onLine) return Promise.resolve(null);
    return istek('/storage/v1/object/authenticated/belgeler/' + is.id + '/' + id, {}).then(function (r) { return r.ok ? r.blob() : null; });
  }
  function dosyaYukle(id, blob) {
    var is = oku(K_ISLETME);
    return istek('/storage/v1/object/belgeler/' + is.id + '/' + id, { method: 'POST', headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-upsert': 'true' }, body: blob }).then(function (r) { if (!r.ok) throw new Error('Belge yüklenemedi (' + r.status + ')'); });
  }

  // ---- eşitleme ----
  var calisiyor = false, tekrar = false, tmr = null;
  function planla(ms) { clearTimeout(tmr); tmr = setTimeout(esitle, ms == null ? 1500 : ms); }
  function hazir() { return !!(oturum() && oku(K_ISLETME)); }

  function it() {
    var is = oku(K_ISLETME).id;
    return DB.kuyrukHepsi().then(function (kuyruk) {
      durum.kuyruk = kuyruk.length;
      if (!kuyruk.length) return;
      var parti = kuyruk.slice(0, 80), satirlar = [], yuklemeler = [];
      return Promise.all(parti.map(function (q) {
        if (q.sil) { satirlar.push({ isletme: is, depo: q.depo, id: q.id, veri: {}, sil: true }); return; }
        return DB.al(q.depo, q.id).then(function (k) {
          if (!k) { satirlar.push({ isletme: is, depo: q.depo, id: q.id, veri: {}, sil: true }); return; }
          var v = Object.assign({}, k);
          if (q.depo === 'dosyalar') { if (v.blob) yuklemeler.push(dosyaYukle(q.id, v.blob)); delete v.blob; }
          satirlar.push({ isletme: is, depo: q.depo, id: q.id, veri: v, sil: false });
        });
      })).then(function () { return Promise.all(yuklemeler); }).then(function () {
        if (!satirlar.length) return;
        return istek('/rest/v1/kayit?on_conflict=isletme,depo,id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(satirlar) }).then(json);
      }).then(function () { return Promise.all(parti.map(function (q) { return DB.kuyrukSil(q.k); })); })
        .then(function () { if (kuyruk.length > parti.length) return it(); });
    });
  }

  function cek() {
    var is = oku(K_ISLETME).id, degisti = false;
    function sayfa() {
      var im = oku(K_IMLEC);
      var yol = '/rest/v1/kayit?select=depo,id,veri,sil,guncelleme&isletme=eq.' + is + (im ? '&guncelleme=gt.' + encodeURIComponent(im) : '') + '&order=guncelleme.asc&limit=500';
      return istek(yol, {}).then(json).then(function (satirlar) {
        if (!satirlar.length) return;
        return satirlar.reduce(function (p, s) {
          return p.then(function () {
            degisti = true;
            if (s.sil) return DB.silYerel(s.depo, s.id);
            var v = s.veri || {}; v.id = s.id;
            if (s.depo === 'dosyalar') return DB.al('dosyalar', s.id).then(function (eski) { if (eski && eski.blob) v.blob = eski.blob; return DB.koyYerel('dosyalar', v); });
            return DB.koyYerel(s.depo, v);
          });
        }, Promise.resolve()).then(function () {
          yaz(K_IMLEC, satirlar[satirlar.length - 1].guncelleme);
          if (satirlar.length === 500) return sayfa();
        });
      });
    }
    return sayfa().then(function () { return degisti; });
  }

  function esitle() {
    if (!hazir()) return Promise.resolve();
    if (!navigator.onLine) { ayarla('cevrimdisi'); return Promise.resolve(); }
    if (calisiyor) { tekrar = true; return Promise.resolve(); }
    calisiyor = true; ayarla('esitleniyor');
    return it().then(cek).then(function (degisti) {
      durum.son = Date.now(); return DB.kuyrukHepsi().then(function (k) { durum.kuyruk = k.length; ayarla(k.length ? 'bekliyor' : 'tamam'); if (degisti && BULUT.degisti) BULUT.degisti(); });
    }).catch(function (e) { ayarla('hata', e && e.message || String(e)); })
      .then(function () { calisiyor = false; if (tekrar) { tekrar = false; planla(500); } });
  }

  var BULUT = {
    durum: durum, dinle: function (f) { dinleyen.push(f); }, degisti: null,
    oturum: oturum, isletme: function () { return oku(K_ISLETME); }, hazir: hazir,
    giris: giris, kayitOl: kayitOl, cikis: cikis, isletmem: isletmem, isletmeOlustur: isletmeOlustur,
    uyeEkle: uyeEkle, uyeler: uyeler, baglan: baglan, bulutSayisi: bulutSayisi, yerelSayisi: yerelSayisi,
    yerelleriKuyrugaAl: yerelleriKuyrugaAl, yerelleriSil: yerelleriSil,
    esitle: esitle, planla: planla, dosyaIndir: dosyaIndir
  };
  window.BULUT = BULUT;

  DB.degisimde = function (depo, id, sil) {
    if (!hazir() || depo === 'bekleyen') return;
    DB.kuyrukEkle(depo, id, sil).then(function () { durum.kuyruk++; ayarla(navigator.onLine ? 'bekliyor' : 'cevrimdisi'); planla(); });
  };
  window.addEventListener('online', function () { planla(300); });
  window.addEventListener('offline', function () { if (hazir()) ayarla('cevrimdisi'); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) planla(300); });
  setInterval(function () { if (!document.hidden) planla(100); }, 45000);
  if (hazir()) planla(500);
  else if (oturum()) ayarla('bagsiz');
})();
