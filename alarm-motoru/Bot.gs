/**
 * dKc Bot v1.8 (Google Apps Script, 2026-10-28) — Faz 2, bot 1: standart trend botu.
 * Kod.gs ile aynı Apps Script projesine ayrı dosya olarak eklenir. Kod.gs sinyalKontrol, A/A+ sinyal bildirdiğinde botSinyal'i çağırır.
 *
 * Kurallar (Burak Bey, 20 Eki):
 * - Bakiye 100 USDT, iki bota yarı yarıya (bot 1 trend, bot 2 15 dakikalık seri işlem). Bot 2 backtest bitene kadar kapalı.
 * - Emri bot kendisi verir; her emirle birlikte stop (ve Hedef 1) gönderilir, stopsuz pozisyon kalmaz.
 * - Aynı anda tek yön (sinyal skoru pusula ve açık işlem vetosunu zaten uygular), toplam açık risk en fazla %3.
 * - Günlük zarar: yalnız botun kendi işlemlerinin sonucu (kapanan + açık), bot bakiyesinin -%20'si (100 USDT'de 20 USDT; Burak Bey, 27 Eki); varınca bot o gün durur, botun bekleyen emirleri iptal edilir.
 * - Burak Bey'in elle açtığı işlem ve emirlere DOKUNMAZ: bot yalnız kendi açtığı sembolleri (BOT_SEMBOLLER) sayar, iptal eder, kapatır.
 *   Tek istisna: elle açılmış ters yönlü pozisyon varsa o yöne yeni işlem açmaz (tek yön kuralı); elle işlem olan coine girmez.
 * - Kaldıraç stopa göre 5x-10x; likidasyon stopun en az 2 katı uzakta.
 * - İlk hafta işlem başı risk %0,25 ve aynı anda 1 işlem (öneri; BOT_RISK ile değişir).
 *
 * Script Properties (Burak Bey girer, koda ve sohbete yazılmaz):
 *   MEXC_API_KEY, MEXC_API_SECRET : yalnız işlem yetkili anahtar (çekim yetkisi KAPALI, IP kısıtı önerilir)
 *   BOT_MODU : 'kapali' (varsayılan) | 'kuru' (emir göndermez, ne yapacağını Telegram'a yazar) | 'acik'
 *   BOT_RISK : işlem başı risk yüzdesi (varsayılan 0.25)
 * Elle çalıştırılacak fonksiyonlar: botApiTest (emir vermez, hesabı okur), botKillSwitch (hepsini kapatır, botu kapatır).
 */
var BOT = {
  taban: 'https://api.mexc.com',
  bakiye: 100,          // bota ayrılan toplam USDT (hesapta daha fazlası olsa da bot bunu aşmaz)
  pay: { trend: 0.5, seri: 0.5 },
  riskVarsayilan: 0.25, // işlem başı risk %, bot payının yüzdesi değil toplam bakiyenin yüzdesi
  riskTavan: 3,         // toplam açık risk %
  gunlukZarar: 20,      // günlük zarar sınırı % (Burak Bey, 27 Eki 2026: 100 USDT bakiyede 20 USDT)
  maxAcik: 1,           // bot 1 aynı anda en fazla 1 işlem
  emirOmruDk: 60,       // dolmayan limit emir 60 dakika sonra iptal
  kalMin: 5, kalMax: 10
};

function botProp() { return PropertiesService.getScriptProperties(); }
function botModu() { var m = botProp().getProperty('BOT_MODU'); return m === 'acik' || m === 'kuru' ? m : 'kapali'; }
function botRisk() { var r = Number(botProp().getProperty('BOT_RISK')); return r > 0 && r <= 1 ? r : BOT.riskVarsayilan; }
// Her bot mesajı 'Bot' sekmesine de yazılır (deneme sonrası inceleme için; yazılamazsa sessizce geçilir).
function botKayit(metin) {
  try {
    var t = tablo(), sh = t.getSheetByName('Bot') || t.insertSheet('Bot');
    sh.appendRow(["'" + Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd HH:mm'), metin]);
  } catch (e) { Logger.log(e); }
}
function botBildir(metin) { botKayit(metin); try { telegramGonder('🤖 dKc Bot: ' + metin); } catch (e) { Logger.log(metin); } }

// ---------- MEXC vadeli imzalı istek ----------
// İmza: HMAC-SHA256(secret, apiKey + zaman + parametre). GET'te parametre sıralı sorgu metni, POST'ta JSON gövdesi.
function mexcImza(secret, metin) {
  return Utilities.computeHmacSha256Signature(metin, secret).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function mexcIstek(yontem, yol, param) {
  var p = botProp(), key = p.getProperty('MEXC_API_KEY'), secret = p.getProperty('MEXC_API_SECRET');
  if (!key || !secret) throw new Error('MEXC API anahtarı girilmemiş (Script Properties)');
  var zaman = String(Date.now()), metin = '', url = BOT.taban + yol, sec = { method: yontem, muteHttpExceptions: true, headers: {} };
  if (yontem === 'get') {
    metin = Object.keys(param || {}).sort().map(function (k) { return k + '=' + encodeURIComponent(param[k]); }).join('&');
    if (metin) url += '?' + metin;
  } else { metin = JSON.stringify(param || {}); sec.payload = metin; sec.contentType = 'application/json'; }
  sec.headers = { ApiKey: key, 'Request-Time': zaman, Signature: mexcImza(secret, key + zaman + metin) };
  var r = UrlFetchApp.fetch(url, sec), j;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('MEXC yanıtı okunamadı (HTTP ' + r.getResponseCode() + ')'); }
  if (!j || j.success !== true) throw new Error('MEXC hata ' + (j && j.code) + ': ' + (j && j.message || 'bilinmiyor'));
  return j.data;
}
function mexcAcik(yol) {
  var r = UrlFetchApp.fetch(BOT.taban + yol, { muteHttpExceptions: true }), j = JSON.parse(r.getContentText());
  if (!j || j.success !== true) throw new Error('MEXC açık veri hatası: ' + yol);
  return j.data;
}

// ---------- Hesap durumu ----------
function botVarlik() {
  var l = mexcIstek('get', '/api/v1/private/account/assets', {}) || [];
  var u = l.filter(function (x) { return x.currency === 'USDT'; })[0] || {};
  return { ozkaynak: Number(u.equity) || 0, kullanilabilir: Number(u.availableBalance) || 0 };
}
function botPozisyonlar() { return mexcIstek('get', '/api/v1/private/position/open_positions', {}) || []; }
function botEmirler() { return mexcIstek('get', '/api/v1/private/order/list/open_orders', { page_num: 1, page_size: 50 }) || []; }
// Bot yalnız kendi açtığı sembollere dokunur; elle açılan işlem ve emirler bu listede olmaz (sayılmaz, iptal edilmez, kapatılmaz).
function botSemboller() { try { return JSON.parse(botProp().getProperty('BOT_SEMBOLLER') || '{}') || {}; } catch (e) { return {}; } }
function botSembolYaz(m) { botProp().setProperty('BOT_SEMBOLLER', JSON.stringify(m)); }
function botKendi(liste) { var m = botSemboller(); return (liste || []).filter(function (x) { return m[x.symbol]; }); }

// Günlük zarar yalnız botun kendi işlemlerinden ölçülür (elle açılan işlem ve para yatırma/çekme sayılmaz).
// BOT_GUN: { tarih, baslangic (bot bakiyesi), semboller: bugün bot işlem açtığı semboller, durdu }.
function botGun(ozkaynak) {
  var p = botProp(), bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd'), g = {};
  try { g = JSON.parse(p.getProperty('BOT_GUN') || '{}') || {}; } catch (e) { g = {}; }
  if (g.tarih !== bugun) { g = { tarih: bugun, baslangic: Math.min(ozkaynak, BOT.bakiye), semboller: {}, durdu: false }; p.setProperty('BOT_GUN', JSON.stringify(g)); }
  if (!g.semboller) g.semboller = {};
  // v1.8: gün içinde para yatırılırsa (28 Eki: 1,4 USDT ile başlayan gün 100 USDT geldi, sınır -0,28 kaldı) günlük sınır tabanı yükselir; düşmez.
  var taban = Math.min(ozkaynak, BOT.bakiye);
  if (taban > g.baslangic) { g.baslangic = taban; botProp().setProperty('BOT_GUN', JSON.stringify(g)); }
  return g;
}
function botGunSembolEkle(sembol) { var g = botGun(0); g.semboller[sembol] = 1; botProp().setProperty('BOT_GUN', JSON.stringify(g)); }
function botGunBaslangicMs(tarih) { return Date.parse(tarih + 'T00:00:00+03:00'); }
// Botun bugünkü toplam sonucu (USDT): kapanan işlemlerin gerçekleşen kârı/zararı + açık botu pozisyonlarının anlık durumu.
// Okunamazsa hata verir; çağıran taraf yeni emir vermez (güvenli taraf).
function botGunSonuc(g) {
  var semboller = g.semboller || {}, bas = botGunBaslangicMs(g.tarih), toplam = 0;
  if (!Object.keys(semboller).length) return 0;
  var gecmis = mexcIstek('get', '/api/v1/private/position/list/history_positions', { page_num: 1, page_size: 50 }) || [];
  (gecmis.resultList || gecmis).forEach(function (x) { if (semboller[x.symbol] && Number(x.closeTime) >= bas) toplam += Number(x.realised) || 0; });
  botPozisyonlar().filter(function (x) { return semboller[x.symbol]; }).forEach(function (x) {
    var d = mexcAcik('/api/v1/contract/detail?symbol=' + x.symbol), t = mexcAcik('/api/v1/contract/ticker?symbol=' + x.symbol);
    var son = Number(t.lastPrice), ort = Number(x.holdAvgPrice), cs = Number(d.contractSize);
    var yon = Number(x.positionType) === 1 ? 1 : -1;
    toplam += (Number(x.realised) || 0) + (son - ort) * Number(x.holdVol) * cs * yon;
  });
  return toplam;
}
function botGunlukZararAsildi(ozkaynak) {
  var g = botGun(ozkaynak), sinir = -g.baslangic * BOT.gunlukZarar / 100, sonuc = g.durdu ? sinir : botGunSonuc(g);
  return { asildi: g.durdu || sonuc <= sinir, g: g, sinir: sinir, sonuc: sonuc };
}

// ---------- Emir hesabı (saf, testli) ----------
// plan: { yon, giris:[a,b], stop, tp1 }, fiyat: limit fiyatı, sermaye: bot payı, riskYuzde: işlem başı risk (toplam bakiyeye göre)
// detay: { contractSize, minVol, volUnit? } MEXC kontrat detayı. Kurala uymazsa { hata } döner.
function botEmirHesap(plan, fiyat, toplam, sermaye, riskYuzde, detay, mini) {
  var lng = plan.yon !== 'short', stopMes = Math.abs(fiyat - plan.stop) / fiyat;
  if (!(fiyat > 0) || !(stopMes > 0) || (lng ? plan.stop >= fiyat : plan.stop <= fiyat)) return { hata: 'stop fiyatın yanlış tarafında' };
  if (lng ? plan.tp1 <= fiyat : plan.tp1 >= fiyat) return { hata: 'fiyat Hedef 1\'i geçmiş' };
  var maxKal = Math.min(BOT.kalMax, Math.floor(1 / (2 * stopMes)));
  if (maxKal < 1) return { hata: 'stop çok uzak' };
  var riskUsdt = toplam * riskYuzde / 100, notional = riskUsdt / stopMes;
  var kal = Math.max(1, Math.min(maxKal, Math.max(BOT.kalMin, Math.ceil(notional / sermaye))));
  if (notional / kal > sermaye) return { hata: 'teminat bot payını aşıyor' };
  var cs = Number(detay && detay.contractSize), minVol = Number(detay && detay.minVol) || 1;
  if (!(cs > 0)) return { hata: 'kontrat bilgisi yok' };
  var vol = Math.floor(notional / (fiyat * cs));
  if (vol < minVol && mini) {
    // Küçük hesap kuralı (Burak Bey, 25 Eki 2026, bakiye 10 USDT altı): en küçük kontrat, stop uzaklığına göre azami kaldıraç, işlem başı kayıp bakiyenin en çok %15'i, teminat bakiyenin en çok %80'i.
    var deger = minVol * fiyat * cs, kalM = Math.max(1, Math.min(maxKal, BOT.kalMax)), temM = deger / kalM, riskM = deger * stopMes;
    if (riskM > toplam * 0.15) return { hata: 'küçük hesap: en küçük kontratın kaybı ' + riskM.toFixed(2) + ' USDT, bakiyenin %15\'ini aşıyor' };
    if (temM > toplam * 0.8) return { hata: 'küçük hesap: teminat ' + temM.toFixed(2) + ' USDT bakiyeye sığmıyor' };
    return { yon: plan.yon, fiyat: fiyat, vol: minVol, kal: kalM, stop: plan.stop, tp1: plan.tp1, riskUsdt: riskM, teminat: temM, mini: true };
  }
  if (vol < minVol) return { hata: 'pozisyon en küçük emirden küçük (' + vol + ' < ' + minVol + ')' };
  return { yon: plan.yon, fiyat: fiyat, vol: vol, kal: kal, stop: plan.stop, tp1: plan.tp1, riskUsdt: vol * fiyat * cs * stopMes, teminat: vol * fiyat * cs / kal };
}

// ---------- Sinyal geldiğinde (Kod.gs sinyalKontrol çağırır) ----------
// c: plan ve canlı fiyatlı coin, s: DKC_HESAP.sinyalSkoru sonucu (A/A+, veto yok)
function botSinyal(c, s) {
  var mod = botModu(); if (mod === 'kapali') return null;
  if (!s || s.veto || (s.sinif !== 'A' && s.sinif !== 'A+')) return null;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return null;
  try {
    var v = botVarlik(), gz = botGunlukZararAsildi(v.ozkaynak);
    if (gz.asildi) return botNot(mod, 'günlük zarar sınırı (botun kendi sonucu, -%' + BOT.gunlukZarar + ') doldu, ' + c.coin + ' sinyali atlandı');
    var poz = botPozisyonlar(), emir = botEmirler(), sembol = c.coin + '_USDT';
    if (botKendi(poz).length + botKendi(emir).length >= BOT.maxAcik) return null;
    // Tek yön: açık pozisyon (elle açılan dahil) ters yöndeyse yeni emir yok (positionType 1 long, 2 short)
    var ters = poz.some(function (x) { return (Number(x.positionType) === 1 ? 'long' : 'short') !== c.plan.yon; });
    if (ters) return botNot(mod, c.coin + ' ' + c.plan.yon + ' atlandı: ters yönde açık pozisyon var');
    if (poz.concat(emir).some(function (x) { return x.symbol === sembol; })) return botNot(mod, c.coin + ' atlandı: bu coinde elle açılmış işlem ya da emir var');
    var detay = mexcAcik('/api/v1/contract/detail?symbol=' + sembol);
    var toplam = Math.min(v.ozkaynak, BOT.bakiye), sermaye = toplam * BOT.pay.trend;
    var h = botEmirHesap(c.plan, c.fiyat, toplam, sermaye, botRisk(), detay, toplam < 10);
    if (h.hata) return botNot(mod, c.coin + ' atlandı: ' + h.hata);
    var ozet = c.coin + ' ' + (h.yon === 'short' ? 'SHORT' : 'LONG') + ' ' + h.vol + ' kontrat @ ' + h.fiyat + ' · ' + h.kal + 'x · stop ' + h.stop + ' · TP1 ' + h.tp1 + ' · risk ' + h.riskUsdt.toFixed(2) + ' USDT';
    if (mod === 'kuru') { botBildir('KURU (emir gönderilmedi): ' + ozet); return h; }
    var govde = { symbol: sembol, price: h.fiyat, vol: h.vol, leverage: h.kal, side: h.yon === 'short' ? 3 : 1, type: 1, openType: 1,
      stopLossPrice: h.stop, takeProfitPrice: h.tp1, externalOid: 'dkc' + Date.now() };
    var no = mexcIstek('post', '/api/v1/private/order/create', govde);
    var ms = botSemboller(); ms[sembol] = Date.now(); botSembolYaz(ms); botGunSembolEkle(sembol);
    botBildir('Emir verildi: ' + ozet + ' (no ' + (no && no.orderId || no) + ')');
    return h;
  } catch (e) { botBildir('Hata, emir verilmedi: ' + e.message); return null; }
  finally { lock.releaseLock(); }
}
// Aynı "atlandı" mesajı 6 saatte bir kez gider (ör. elle açık INJ için her sinyalde tekrar yazılmasın).
function botNot(mod, metin) {
  if (mod === 'kapali') return null;
  var p = botProp(), simdi = Date.now(), son = {};
  try { son = JSON.parse(p.getProperty('BOT_NOT_SON') || '{}') || {}; } catch (e) { son = {}; }
  Object.keys(son).forEach(function (k) { if (simdi - son[k] > 6 * 3600000) delete son[k]; });
  if (son[metin]) return null;
  son[metin] = simdi; p.setProperty('BOT_NOT_SON', JSON.stringify(son));
  botBildir(metin); return null;
}

// ---------- 5 dakikada bir bakım (tetikleyici: botTetikKur) ----------
// Günlük zarar sınırı, dolmayan eski emirlerin iptali ve stopsuz pozisyon kontrolü.
// MEXC anahtarı 90 gün geçerli: bitişten 5 gün önce başlayarak günde bir kez Telegram'a hatırlatır (BOT_ANAHTAR_BITIS, yyyy-MM-dd; varsayılan 2027-01-19).
function botAnahtarHatirlat() {
  var p = botProp(), bitis = Date.parse((p.getProperty('BOT_ANAHTAR_BITIS') || '2027-01-19') + 'T00:00:00+03:00'), simdi = Date.now();
  var bugun = Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd');
  if (!(bitis - simdi < 5 * 86400000) || p.getProperty('BOT_ANAHTAR_UYARI') === bugun) return;
  p.setProperty('BOT_ANAHTAR_UYARI', bugun);
  var gun = Math.ceil((bitis - simdi) / 86400000);
  botBildir(gun > 0 ? '⏰ MEXC API anahtarı ' + gun + ' gün içinde bitiyor; yenisini oluşturup Script Properties\'e girin.' : '⛔ MEXC API anahtarının süresi doldu; bot emir veremez. Yeni anahtar gerekli.');
}
function botBakim() {
  try { botProp().setProperty('BOT_SON_BAKIM', String(Date.now())); } catch (e) { Logger.log(e); }
  try { botAnahtarHatirlat(); } catch (e) { Logger.log(e); }
  var mod = botModu(); if (mod !== 'acik') return;
  try {
    var poz = botPozisyonlar(), emir = botEmirler(), ms = botSemboller(), canli = {}, degisti = false, kapanan = [];
    poz.concat(emir).forEach(function (x) { canli[x.symbol] = true; });
    // Kapanmış işlemin sembolünü listeden düş (yeni verilen emir görünene kadar 10 dk bekle)
    Object.keys(ms).forEach(function (k) { if (!canli[k] && Date.now() - Number(ms[k]) > 10 * 60000) { delete ms[k]; degisti = true; kapanan.push(k); } });
    if (degisti) botSembolYaz(ms);
    var v = botVarlik();
    // v1.5: dünden kalan pozisyon bugün stopla kapanırsa zararı bugünkü sınıra sayılsın (sembol günlük listeden düşmeden önce eklenir)
    if (kapanan.length) { var g0 = botGun(v.ozkaynak); kapanan.forEach(function (k) { g0.semboller[k] = 1; }); botProp().setProperty('BOT_GUN', JSON.stringify(g0)); }
    var gz = botGunlukZararAsildi(v.ozkaynak);
    if (gz.asildi && !gz.g.durdu) {
      botKendi(emir).forEach(function (o) { mexcIstek('post', '/api/v1/private/order/cancel', [o.orderId]); });
      gz.g.durdu = true; botProp().setProperty('BOT_GUN', JSON.stringify(gz.g));
      botBildir('Günlük zarar sınırı doldu (botun bugünkü sonucu ' + gz.sonuc.toFixed(2) + ' ≤ ' + gz.sinir.toFixed(2) + ' USDT). Botun bekleyen emirleri iptal, bugün yeni işlem yok. Açık pozisyonlar stopuyla duruyor.');
    }
    var simdi = Date.now();
    botKendi(emir).forEach(function (o) {
      if (simdi - Number(o.createTime) > BOT.emirOmruDk * 60000) { mexcIstek('post', '/api/v1/private/order/cancel', [o.orderId]); botBildir(o.symbol + ' emri ' + BOT.emirOmruDk + ' dakikada dolmadı, iptal edildi.'); }
    });
    // Botun pozisyonu stopsuz kalmasın: açık stop emri olmayan pozisyon için uyarı (otomatik kapatma API doğrulanınca açılacak)
    var stoplar = mexcIstek('get', '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 50 }) || [];
    botKendi(poz).forEach(function (x) {
      var var_ = stoplar.some(function (s) { return s.symbol === x.symbol && Number(s.stopLossPrice) > 0; });
      if (!var_) botBildir('⚠️ ' + x.symbol + ' pozisyonunun stopu görünmüyor. MEXC\'te kontrol edin; gerekirse botKillSwitch.');
    });
  } catch (e) { botBildir('Bakım hatası: ' + e.message); }
}
function botTetikKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'botBakim') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('botBakim').timeBased().everyMinutes(5).create();
}

// ---------- Takip ekranı için salt okunur durum (uygulamanın Bot sekmesi; emir vermez, anahtarı dışarı vermez) ----------
// Her bölüm ayrı denenir: biri okunamazsa o bölüm 'hata' alanıyla gelir, diğerleri görünür.
function botDurum() {
  var o = { zaman: Date.now(), mod: botModu(), risk: botRisk(), sinirYuzde: BOT.gunlukZarar, uyarilar: [] }, p = botProp();
  var bakim = Number(p.getProperty('BOT_SON_BAKIM')) || 0;
  o.sonBakim = bakim;
  if (o.mod === 'acik' && (!bakim || o.zaman - bakim > 15 * 60000)) o.uyarilar.push('Bot bakımı ' + (bakim ? Math.round((o.zaman - bakim) / 60000) + ' dakikadır' : 'hiç') + ' çalışmadı');
  try {
    var v = botVarlik(); o.ozkaynak = v.ozkaynak; o.kullanilabilir = v.kullanilabilir;
    var g = botGun(v.ozkaynak); o.gunBaslangic = g.baslangic; o.sinir = -g.baslangic * BOT.gunlukZarar / 100; o.durdu = !!g.durdu;
    try { o.bugun = g.durdu ? o.sinir : botGunSonuc(g); } catch (e) { o.bugun = null; o.bugunHata = e.message; }
    if (o.durdu) o.uyarilar.push('Günlük zarar sınırı doldu, bugün yeni işlem yok');
  } catch (e) { o.hesapHata = e.message; o.uyarilar.push('Hesap okunamadı: ' + e.message); }
  try {
    var poz = botPozisyonlar(), ms = botSemboller(), stoplar = mexcIstek('get', '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 50 }) || [];
    o.pozisyonlar = poz.map(function (x) {
      var st = stoplar.filter(function (s) { return s.symbol === x.symbol; })[0] || {}, son = null, pnl = null, yon = Number(x.positionType) === 1 ? 'long' : 'short';
      try {
        var d = mexcAcik('/api/v1/contract/detail?symbol=' + x.symbol), t = mexcAcik('/api/v1/contract/ticker?symbol=' + x.symbol);
        son = Number(t.lastPrice); pnl = (son - Number(x.holdAvgPrice)) * Number(x.holdVol) * Number(d.contractSize) * (yon === 'long' ? 1 : -1);
      } catch (e) { /* fiyat okunamazsa kart yine görünür */ }
      var stopVar = Number(st.stopLossPrice) > 0, botun = !!ms[x.symbol];
      if (botun && !stopVar) o.uyarilar.push(x.symbol + ' pozisyonunun stopu görünmüyor');
      return { sembol: x.symbol, yon: yon, adet: Number(x.holdVol), giris: Number(x.holdAvgPrice), kaldirac: Number(x.leverage), son: son, pnl: pnl,
        stop: Number(st.stopLossPrice) || null, hedef: Number(st.takeProfitPrice) || null, stopVar: stopVar, botun: botun };
    });
    o.emirler = botEmirler().map(function (e2) { return { sembol: e2.symbol, fiyat: Number(e2.price), adet: Number(e2.vol), botun: !!ms[e2.symbol] }; });
  } catch (e) { o.pozHata = e.message; o.uyarilar.push('Pozisyonlar okunamadı: ' + e.message); }
  try {
    var gecmis = mexcIstek('get', '/api/v1/private/position/list/history_positions', { page_num: 1, page_size: 20 }) || [];
    o.gecmis = (gecmis.resultList || gecmis).slice(0, 15).map(function (x) {
      return { sembol: x.symbol, yon: Number(x.positionType) === 1 ? 'long' : 'short', sonuc: Number(x.realised) || 0, kapanis: Number(x.closeTime) || 0 };
    });
  } catch (e) { o.gecmisHata = e.message; }
  try {
    var sh = tablo().getSheetByName('Bot'), n = sh ? sh.getLastRow() : 0;
    o.olaylar = n ? sh.getRange(Math.max(1, n - 39), 1, Math.min(n, 40), 2).getValues().map(function (r) { return { z: String(r[0]).replace(/^'/, ''), m: String(r[1]) }; }).reverse() : [];
  } catch (e) { o.olaylar = []; }
  var bitis = Date.parse((p.getProperty('BOT_ANAHTAR_BITIS') || '2027-01-19') + 'T00:00:00+03:00'), kalan = Math.ceil((bitis - Date.now()) / 86400000);
  o.anahtarGun = kalan; if (kalan <= 10) o.uyarilar.push('MEXC API anahtarı ' + kalan + ' gün içinde bitiyor');
  return o;
}

// ---------- Elle çalıştırılır ----------
// Kill switch: botu kapatır; yalnız botun kendi bekleyen emirlerini ve stoplarını iptal eder, kendi pozisyonlarını piyasa emriyle kapatır.
// Elle açılmış işlem ve emirlere dokunmaz.
function botKillSwitch() {
  botProp().setProperty('BOT_MODU', 'kapali');
  var hata = [], ms = botSemboller(), kendi = function (x) { return ms[x.symbol]; };
  try { var ids = botKendi(botEmirler()).map(function (o) { return o.orderId; }); if (ids.length) mexcIstek('post', '/api/v1/private/order/cancel', ids); } catch (e) { hata.push(e.message); }
  var kapandi = 0;
  try {
    botKendi(botPozisyonlar()).forEach(function (x) {
      var lng = Number(x.positionType) === 1;
      mexcIstek('post', '/api/v1/private/order/create', { symbol: x.symbol, price: 0, vol: Number(x.holdVol), leverage: Number(x.leverage), side: lng ? 4 : 2, type: 5, openType: Number(x.openType) || 1, positionId: x.positionId });
      kapandi++;
    });
  } catch (e) { hata.push(e.message); }
  try {
    var st = (mexcIstek('get', '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 50 }) || []).filter(kendi);
    if (st.length) mexcIstek('post', '/api/v1/private/stoporder/cancel', st.map(function (x) { return { stopPlanOrderId: x.id }; }));
  } catch (e) { hata.push(e.message); }
  if (!hata.length) botSembolYaz({});
  botBildir('KILL SWITCH: bot kapatıldı' + (hata.length ? '. Hatalar: ' + hata.join(' | ') + ' — MEXC\'i elle kontrol edin.' : ', botun emirleri iptal, botun ' + kapandi + ' pozisyonu kapatıldı (elle açtıklarınıza dokunulmadı).'));
}
// API testi: emir vermez. Hesabı, pozisyonları ve bir kontratın detayını okur; sonucu Telegram'a yazar.
function botApiTest() {
  var s = [];
  try { var v = botVarlik(); s.push('Hesap okundu: özkaynak ' + v.ozkaynak.toFixed(2) + ' USDT'); } catch (e) { s.push('Hesap okunamadı: ' + e.message); }
  try { s.push('Açık pozisyon: ' + botPozisyonlar().length); } catch (e) { s.push('Pozisyon okunamadı: ' + e.message); }
  try { var d = mexcAcik('/api/v1/contract/detail?symbol=BTC_USDT'); s.push('BTC kontrat: ' + d.contractSize + ' BTC, en az ' + d.minVol); } catch (e) { s.push('Kontrat okunamadı: ' + e.message); }
  s.push('Mod: ' + botModu() + ', işlem başı risk %' + botRisk());
  botBildir('API testi\n' + s.join('\n'));
  return s;
}

// Tek seferlik küçük gerçek test işlemi (Burak Bey, 25 Eki 2026: "1,34 dolarla işlem açsın"). Elle çalıştırılır, BOT_MODU'na bakmaz ve dokunmaz.
// BTC_USDT, en küçük kontrat, 10x yalıtılmış, piyasa emri; stop %1,5, Hedef %3 emirle birlikte gider. Pozisyon açık kalır, kapatmak için botKillSwitch.
function botTestEmri(yon) {
  yon = yon === 'short' ? 'short' : 'long';
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return 'meşgul';
  try {
    var v = botVarlik(), poz = botPozisyonlar(), sembol = 'BTC_USDT';
    if (poz.length) throw new Error('Hesapta zaten açık pozisyon var (' + poz.length + '), test emri verilmedi');
    var d = mexcAcik('/api/v1/contract/detail?symbol=' + sembol), t = mexcAcik('/api/v1/contract/ticker?symbol=' + sembol);
    var fiyat = Number(t.lastPrice), cs = Number(d.contractSize), vol = Number(d.minVol) || 1, kal = 10;
    if (!(fiyat > 0) || !(cs > 0)) throw new Error('Fiyat ya da kontrat bilgisi okunamadı');
    var deger = vol * cs * fiyat, teminat = deger / kal;
    if (v.kullanilabilir < teminat * 1.5) throw new Error('Kullanılabilir bakiye yetersiz: ' + v.kullanilabilir.toFixed(2) + ' USDT, gereken teminat ~' + teminat.toFixed(2) + ' (+ komisyon payı)');
    var lng = yon === 'long', stop = fiyat * (lng ? 0.985 : 1.015), hedef = fiyat * (lng ? 1.03 : 0.97);
    var yuvarla = function (x) { var p = Number(d.priceUnit) || 0.1, n = Math.round(x / p) * p; return Number(n.toFixed(8)); };
    var govde = { symbol: sembol, price: yuvarla(fiyat), vol: vol, leverage: kal, side: lng ? 1 : 3, type: 5, openType: 1,
      stopLossPrice: yuvarla(stop), takeProfitPrice: yuvarla(hedef), externalOid: 'dkctest' + Date.now() };
    var no = mexcIstek('post', '/api/v1/private/order/create', govde);
    var ms = botSemboller(); ms[sembol] = Date.now(); botSembolYaz(ms); botGunSembolEkle(sembol);
    botBildir('TEST EMRİ verildi: BTC ' + (lng ? 'LONG' : 'SHORT') + ' ' + vol + ' kontrat @ ~' + fiyat + ' · ' + kal + 'x · stop ' + govde.stopLossPrice + ' · hedef ' + govde.takeProfitPrice + ' · teminat ~' + teminat.toFixed(2) + ' USDT (no ' + (no && no.orderId || no) + '). Kapatmak için botKillSwitch.');
    Utilities.sleep(3000);
    var acik = botPozisyonlar().filter(function (x) { return x.symbol === sembol; });
    var stoplar = mexcIstek('get', '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 50 }) || [];
    var stopVar = stoplar.some(function (s) { return s.symbol === sembol && Number(s.stopLossPrice) > 0; });
    if (!acik.length) botBildir('Test emri: pozisyon henüz görünmüyor (dolmamış ya da gecikmiş). MEXC\'te kontrol edin.');
    else if (!stopVar) {
      acik.forEach(function (x) {
        mexcIstek('post', '/api/v1/private/order/create', { symbol: x.symbol, price: 0, vol: Number(x.holdVol), leverage: Number(x.leverage), side: Number(x.positionType) === 1 ? 4 : 2, type: 5, openType: Number(x.openType) || 1, positionId: x.positionId });
      });
      botBildir('⚠️ Test pozisyonunda stop görünmedi; pozisyon piyasa emriyle kapatıldı. MEXC\'te teyit edin.');
    } else botBildir('Test emri: pozisyon açık, stop emri görünüyor.');
    return no;
  } catch (e) { botBildir('Test emri verilmedi: ' + e.message); return null; }
  finally { lock.releaseLock(); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { BOT: BOT, botEmirHesap: botEmirHesap, mexcImza: mexcImza, botSinyal: botSinyal, botGunlukZararAsildi: botGunlukZararAsildi, botKillSwitch: botKillSwitch, botBakim: botBakim, botTestEmri: botTestEmri, botAnahtarHatirlat: botAnahtarHatirlat, botDurum: botDurum, botGun: botGun };
