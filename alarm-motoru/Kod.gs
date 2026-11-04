/**
 * Kripto Alarm Motoru v11.5 (Google Apps Script, 2026-10-29)
 * - v11.5 (29 Eki): sinyalKontrol bugünün bölgeye giren planlarını, A/A+ sinyallerini ve elenme nedenlerini SINYAL_SAYAC'a yazar (Bot.gs botGunlukOzet okur); eşleme cihaz sınırı 5 -> 15.
 * - v11.4 (23 Eki denetimi, 13 planda 10 stop): (1) BTC 4S EMA20-EMA50 farkı %0,5 altındaysa piyasa yönü yok, sinyal ve bot girişi yok
 *   (hesap.js pusula, btcTf.h4Fark canlı yazılır). (2) Aynı yönde 2 açık işlem varken yeni sinyal yok (hesap.js karar).
 *   (3) Karne: sinyal verilen tarayıcı planı da 'girdi' olarak yazılır (kaynak sütunu); sağlık mesajında 'sinyal verilenler' satırı;
 *   yeni satırın sınıfı canlı trendle hesaplanır.
 * - v11.3: karne özeti 'yeni kurallar' dönemini (21 Eki 19:30 sonrası) ayrı gösterir.
 * - v11.2: günlük sağlık mesajına sınıf bazında R özeti (karneSinifRaporu).
 * - v11.1: bildirilen sinyalin stopu görülürse aynı coin+yön 12 saat sinyal/bot girişi vermez (düşen bıçağı tekrar tutma).
 * - v11 ek (22 Eki): dominans (USDT.D, BTC.D) analizden bayat gelmesin: CoinGecko canlı örneği ~4 saatlik hareket analizdeki yöne ters ise yön canlıya çevrilir.
 * - v10 ek (21 Eki): 1S onayında bölge ortası şartı; A/A+ sinyalde Bot.gs botSinyal çağrılır (BOT_MODU kapalıyken etkisiz).
 * - v10: aynı anda tek yön. BTC'nin canlı 1G/4S trendi (yataysa dominans) piyasa yönünü belirler; ters plan, trend tersi plan
 *   ve açık işleme ters plan uygulamada ve bildirimde gösterilmez. Planı olan coinlerin 1G/4S trendi canlı hesaplanır
 *   (uygulama, tarayıcı ve sunucu aynı EMA20/EMA50 kuralı). Tarayıcı, Claude'un analiz ettiği coine plan yazmaz.
 * - v9: tarayıcı (GitHub Actions, 15 dk) planları uygulamaya ve sinyal bildirimine eklenir; Claude'un planı olan coinde
 *   Claude'un planı geçerlidir. Analiz listesi Coinler sekmesi + hacimde ilk 30. analizUret günde 4 kez (00:30, 07:30, 12:30, 19:00).
 * - v7: sinyal skoru A+/A ve fiyat giriş bölgesindeyse uygulama kapalıyken de bildirim (sinyalKontrol).
 * - Her 5 dakikada MEXC açık fiyat verisini okur (API anahtarı yok, emir yok).
 * - "Seviyeler" sekmesindeki aktif alarmları kontrol eder, tetiklenenleri Telegram'a yollar.
 * - Drive'daki "Kripto Alarm" klasörüne Claude'un bıraktığı en yeni seviyeler-*.csv dosyasını içe alır.
 * Gizli bilgiler (TELEGRAM_TOKEN, TELEGRAM_CHAT_ID) yalnızca Proje Ayarları > Script Properties'te durur.
 */

var TABLO_ID = '1bRmu374NPnpImz8xUn36KzwYLO41f00UrQTnBuWk0VQ'; // Kripto Alarm Seviyeleri
var SEKME = 'Seviyeler';
var LOG_SEKME = 'Log';
var KLASOR_ADI = 'Kripto Alarm';
var COIN_SEKME = 'Coinler';   // Burak Bey buraya satır ekleyerek coin ekler
var ANALIZ_SEKME = 'Analiz';  // analizUret() yazar, Claude okur
var VARSAYILAN_COINLER = ['BTC','ETH','BNB','XRP','SOL','TRX','HYPE','ZEC','DOGE','XMR','STRK','NEAR','ENA','CFX','TIA'];
var BASLIK = ['aktif', 'kaynak', 'coin', 'piyasa', 'tur', 'kosul', 'seviye', 'not', 'durum', 'son_fiyat', 'tetik_zamani'];
var C = {}; BASLIK.forEach(function (b, i) { C[b] = i; });

function tablo() { return SpreadsheetApp.openById(TABLO_ID); }

// ---------- Kurulum ----------
function kurulum() {
  var ss = tablo();
  var sh = ss.getSheetByName(SEKME) || ss.getSheets()[0].setName(SEKME);
  sh.getRange(1, 1, 1, BASLIK.length).setValues([BASLIK]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (!ss.getSheetByName(LOG_SEKME)) {
    ss.insertSheet(LOG_SEKME).appendRow(['zaman', 'coin', 'piyasa', 'tur', 'kosul', 'seviye', 'fiyat', 'not']);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('kontrol').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('gunlukSaglik').timeBased().atHour(8).nearMinute(5).everyDays(1).create();
  analizTetikleyiciKur();
  if (!ss.getSheetByName(COIN_SEKME)) {
    var cs = ss.insertSheet(COIN_SEKME);
    cs.appendRow(['coin', 'not']);
    VARSAYILAN_COINLER.forEach(function (c) { cs.appendRow([c, '']); });
  }
  if (!ss.getSheetByName(ANALIZ_SEKME)) ss.insertSheet(ANALIZ_SEKME);
  telegramGonder('✅ Kripto alarm motoru kuruldu. Her 5 dakikada kontrol edecek.');
}

// analizUret günde 4 kez: Claude rutinleri 01:00, 08:00, 13:00 ve 19:30'da bu veriyi okur
var ANALIZ_SAATLERI = [[0, 30], [7, 30], [12, 30], [19, 0]], TETIK_SURUM = '9';
function analizTetikleyiciKur() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'analizUret') ScriptApp.deleteTrigger(t); });
  ANALIZ_SAATLERI.forEach(function (h) { ScriptApp.newTrigger('analizUret').timeBased().atHour(h[0]).nearMinute(h[1]).everyDays(1).create(); });
  PropertiesService.getScriptProperties().setProperty('TETIK_SURUM', TETIK_SURUM);
}
/** Yeni sürüm yapıştırılınca analiz saatleri bir kez kendiliğinden kurulur (elle fonksiyon çalıştırmak gerekmez) */
function tetikleyiciGuncelle() {
  if (PropertiesService.getScriptProperties().getProperty('TETIK_SURUM') !== TETIK_SURUM) analizTetikleyiciKur();
}

// Google -> MEXC ve Telegram erişim testi
function testEt() {
  var spot = mexcSpotFiyatlar();
  var fut = mexcFuturesFiyatlar();
  var msg = '🔎 Test: MEXC spot BTC = ' + spot['BTCUSDT'] + ', futures BTC = ' + fut['BTC_USDT'] +
            ' (spot ' + Object.keys(spot).length + ', futures ' + Object.keys(fut).length + ' sembol)';
  Logger.log(msg);
  telegramGonder(msg);
}

// ---------- Ana döngü (her 5 dk) ----------
function kontrol() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    // İçe alma adımları birbirinden ve fiyat kontrolünden bağımsız: biri hata verirse alarmlar yine çalışır
    guvenli(tetikleyiciGuncelle);
    guvenli(csvIceAl);
    guvenli(kokpitAlarmIceAl);
    guvenli(ozetGonder);
    var sh = tablo().getSheetByName(SEKME);
    var son = sh.getLastRow();
    // Alarm satırı yoksa da karne işlenir (plan kalkınca bekleyen satırlar 'gelmedi' olur)
    // Tarayıcı planları alarm satırı açmaz: satır yokken de sinyal kontrolü yapılır
    if (son < 2) { guvenli(function () { planKarnesiIsle(mexcFuturesFiyatlar()); }); guvenli(sinyalKontrol); return; }
    var aralik = sh.getRange(2, 1, son - 1, BASLIK.length);
    var satirlar = aralik.getValues();
    var lazim = gerekliPiyasalar(satirlar);
    var fiyatlar = {
      spot: lazim.spot ? mexcSpotFiyatlar() : {},
      futures: mexcFuturesFiyatlar() // plan iptali için her turda gerekli
    };
    guvenli(function () { planIptalleriniIsle(fiyatlar.futures); });
    guvenli(function () { planKarnesiIsle(fiyatlar.futures); });
    var sonuc = alarmlariDegerlendir(satirlar, fiyatlar, zamanDamgasi());
    // Önce bildirim, sonra durum: bildirim gidemezse alarm "TETIKLENDI" yazılmaz, sonraki turda tekrar denenir
    var loglar = [];
    if (sonuc.tetiklenen.length) {
      var gitti = alarmBildir(sonuc.tetiklenen.map(function (t) { return t.mesaj; }), sonuc.tetiklenen.map(function (t) { return t.log; }));
      sonuc.tetiklenen.forEach(function (t, i) {
        if (gitti[i]) { loglar.push(t.log); return; }
        var s = sonuc.satirlar[t.i]; s[C.durum] = t.oncekiDurum; s[C.tetik_zamani] = t.oncekiZaman;
      });
    }
    // Yalnızca motorun sütunlarını yaz (durum, son_fiyat, tetik_zamani); seviye hücrelerine dokunma
    if (sonuc.degisti) sh.getRange(2, C.durum + 1, son - 1, BASLIK.length - C.durum)
      .setValues(sonuc.satirlar.map(function (s) { return s.slice(C.durum); }));
    if (loglar.length) {
      // Zaman metin olarak yazılır ('...): tablo saat dilimi ne olursa olsun İstanbul saati kalır
      var log = tablo().getSheetByName(LOG_SEKME);
      log.getRange(log.getLastRow() + 1, 1, loglar.length, 8).setValues(loglar.map(function (l) { l = l.slice(); l[0] = "'" + l[0]; return l; }));
    }
    // Sinyal bildirimi en sonda: hata verirse alarmlar zaten işlenmiş olur
    guvenli(sinyalKontrol);
  } catch (e) {
    hataBildir(e);
  } finally {
    lock.releaseLock();
  }
}

// ---------- Saf mantık (test edilebilir) ----------
function sembol(coin, piyasa) {
  var c = String(coin).trim().toUpperCase();
  return piyasa === 'futures' ? c + '_USDT' : c + 'USDT';
}

function gerekliPiyasalar(satirlar) {
  var r = { spot: false, futures: false };
  satirlar.forEach(function (s) {
    if (aktifMi(s[C.aktif]) && s[C.coin]) r[normPiyasa(s[C.piyasa])] = true;
  });
  return r;
}

function aktifMi(v) {
  var t = String(v).trim().toUpperCase();
  return v === true || t === 'TRUE' || t === 'EVET' || t === '1';
}
function normPiyasa(p) { return String(p).trim().toLowerCase().indexOf('fut') === 0 ? 'futures' : 'spot'; }
function normKosul(k) {
  var t = String(k).trim().toLowerCase();
  if (t.indexOf('alt') === 0 || t === '<' || t === '<=') return 'altina';
  if (t.indexOf('ust') === 0 || t.indexOf('üst') === 0 || t === '>' || t === '>=') return 'ustune';
  return null;
}

/**
 * satirlar: Seviyeler sekmesinin değerleri (başlıksız). fiyatlar: {spot:{BTCUSDT:..}, futures:{BTC_USDT:..}}
 * Tetiklenen satır "TETIKLENDI" olur ve bir daha mesaj atmaz (seviye değişince/yeniden aktif edilince sıfırlanır).
 */
function alarmlariDegerlendir(satirlar, fiyatlar, zaman) {
  var mesajlar = [], loglar = [], tetiklenen = [], degisti = false;
  var yeni = satirlar.map(function (s, i) {
    s = s.slice();
    if (!aktifMi(s[C.aktif]) || !s[C.coin]) return s;
    var piyasa = normPiyasa(s[C.piyasa]);
    var kosul = normKosul(s[C.kosul]);
    var seviye = Number(String(s[C.seviye]).replace(/^'/, '').replace(',', '.'));
    var fiyat = (fiyatlar[piyasa] || {})[sembol(s[C.coin], piyasa)];
    if (!kosul || !isFinite(seviye) || seviye <= 0) {
      if (s[C.durum] !== 'HATALI SATIR') { s[C.durum] = 'HATALI SATIR'; degisti = true; }
      return s;
    }
    if (fiyat === undefined) {
      if (s[C.durum] !== 'FIYAT YOK') { s[C.durum] = 'FIYAT YOK'; degisti = true; }
      return s;
    }
    s[C.son_fiyat] = fiyat; degisti = true;
    if (s[C.durum] === 'TETIKLENDI') return s;
    var oldu = kosul === 'ustune' ? fiyat >= seviye : fiyat <= seviye;
    if (oldu) {
      var t = { i: i, oncekiDurum: s[C.durum] || 'BEKLIYOR', oncekiZaman: s[C.tetik_zamani] || '' };
      s[C.durum] = 'TETIKLENDI';
      s[C.tetik_zamani] = "'" + zaman;
      t.mesaj = emoji(s[C.tur]) + ' ' + String(s[C.coin]).toUpperCase() + ' (' + piyasa + ') ' +
        String(s[C.tur] || 'alarm').toUpperCase() + ': fiyat ' + fiyat + ', seviye ' + seviye +
        (kosul === 'ustune' ? ' üstüne çıktı' : ' altına indi') +
        (s[C.not] ? '\nNot: ' + s[C.not] : '');
      t.log = [zaman, s[C.coin], piyasa, s[C.tur], kosul, seviye, fiyat, s[C.not]];
      mesajlar.push(t.mesaj); loglar.push(t.log); tetiklenen.push(t);
    } else if (s[C.durum] !== 'BEKLIYOR') {
      s[C.durum] = 'BEKLIYOR';
    }
    return s;
  });
  return { satirlar: yeni, mesajlar: mesajlar, loglar: loglar, tetiklenen: tetiklenen, degisti: degisti };
}

// Bir adımın hatası diğer adımları durdurmasın; hata bildirilir (saatte en fazla 1)
function guvenli(fn) {
  try { return fn(); } catch (e) { hataBildir(e); }
}

function emoji(tur) {
  var t = String(tur).toLowerCase();
  if (t.indexOf('stop') === 0) return '🛑';
  if (t.indexOf('hedef') === 0 || t === 'tp') return '🎯';
  if (t.indexOf('giris') === 0 || t.indexOf('giriş') === 0) return '🟢';
  if (t.indexOf('gecersiz') === 0 || t.indexOf('geçersiz') === 0) return '⚠️';
  return '🔔';
}

/** CSV metnini satırlara çevirir; başlık zorunlu: coin,piyasa,tur,kosul,seviye,not */
function csvSatirlari(metin) {
  var veri = Utilities.parseCsv(metin);
  if (!veri.length) return [];
  var bas = veri[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var gerekli = ['coin', 'piyasa', 'tur', 'kosul', 'seviye'];
  gerekli.forEach(function (g) { if (bas.indexOf(g) < 0) throw new Error('CSV başlığında ' + g + ' yok'); });
  return veri.slice(1).filter(function (r) { return r.join('').trim() !== ''; }).map(function (r) {
    var o = {}; bas.forEach(function (h, i) { o[h] = r[i]; });
    var s = BASLIK.map(function () { return ''; });
    s[C.aktif] = 'EVET'; s[C.kaynak] = 'claude';
    s[C.coin] = String(o.coin).trim().toUpperCase(); s[C.piyasa] = normPiyasa(o.piyasa);
    s[C.tur] = o.tur; s[C.kosul] = o.kosul; s[C.seviye] = o.seviye; s[C.not] = o.not || '';
    return s;
  });
}

// ---------- Drive CSV içe alma ----------
function csvIceAl() {
  var klasorler = DriveApp.getFoldersByName(KLASOR_ADI);
  if (!klasorler.hasNext()) return;
  var klasor = klasorler.next();
  var dosyalar = klasor.getFiles(), enYeni = null;
  while (dosyalar.hasNext()) {
    var f = dosyalar.next();
    if (!/^seviyeler-.*\.csv$/i.test(f.getName())) continue;
    if (!enYeni || f.getName() > enYeni.getName()) enYeni = f;
  }
  if (!enYeni) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SON_CSV') === enYeni.getId()) return;
  var yeniSatirlar;
  try { yeniSatirlar = csvSatirlari(enYeni.getBlob().getDataAsString('UTF-8')); }
  catch (e) {
    // Bozuk dosya karantina: bir daha denenmez, mevcut alarmlar aynen kalır
    props.setProperty('SON_CSV', enYeni.getId());
    throw new Error('Bozuk seviye dosyası atlandı (' + enYeni.getName() + '): ' + (e.message || e) + '. Mevcut alarmlar korunuyor.');
  }
  var sh = tablo().getSheetByName(SEKME);
  var son = sh.getLastRow();
  var kalan = son >= 2 ? sh.getRange(2, 1, son - 1, BASLIK.length).getValues()
    .filter(function (s) { return String(s[C.kaynak]).toLowerCase() !== 'claude'; }) : [];
  // Seviye metin olarak yazılır ('1.36' yerel ayarda tarihe/sayıya dönüşmesin)
  var hepsi = kalan.concat(yeniSatirlar).map(function (s) {
    s = s.slice(); if (typeof s[C.seviye] === 'string' && s[C.seviye] !== '') s[C.seviye] = "'" + s[C.seviye].trim(); return s;
  });
  if (son >= 2) sh.getRange(2, 1, son - 1, BASLIK.length).clearContent();
  if (hepsi.length) sh.getRange(2, 1, hepsi.length, BASLIK.length).setValues(hepsi);
  props.setProperty('SON_CSV', enYeni.getId());
  telegramGonder('📥 Yeni seviyeler yüklendi: ' + enYeni.getName() + ' (' + yeniSatirlar.length + ' alarm). Sizin eklediğiniz satırlar korundu.');
}

// Claude'un klasöre bıraktığı en yeni ozet-*.txt dosyasını Telegram'a bir kez yollar
function ozetGonder() {
  if (onesignalHazir()) return; // özetler uygulamada duruyor
  var klasorler = DriveApp.getFoldersByName(KLASOR_ADI);
  if (!klasorler.hasNext()) return;
  var dosyalar = klasorler.next().getFiles(), enYeni = null;
  while (dosyalar.hasNext()) {
    var f = dosyalar.next();
    if (!/^ozet-.*\.txt$/i.test(f.getName())) continue;
    if (!enYeni || f.getName() > enYeni.getName()) enYeni = f;
  }
  if (!enYeni) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SON_OZET') === enYeni.getId()) return;
  telegramGonder(enYeni.getBlob().getDataAsString('UTF-8'));
  props.setProperty('SON_OZET', enYeni.getId());
}

// ---------- Teknik veri (Claude'un raporu için) ----------
function coinListesi() {
  var cs = tablo().getSheetByName(COIN_SEKME);
  var liste = cs && cs.getLastRow() >= 2 ? cs.getRange(2, 1, cs.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); }) : VARSAYILAN_COINLER;
  liste = liste.filter(function (c, i) { return c && liste.indexOf(c) === i; });
  // v9: Coinler sekmesi + tarayıcının hacim listesi (toplam ANALIZ_COIN_SAYISI; Burak Bey'in coinleri her zaman başta)
  var ek = tarayiciHacimListesi();
  for (var i = 0; i < ek.length && liste.length < ANALIZ_COIN_SAYISI; i++) if (liste.indexOf(ek[i]) < 0) liste.push(ek[i]);
  return liste;
}

function analizUret() {
  try {
    var simdi = Math.floor(Date.now() / 1000);
    var tf = [['d', 'Day1', 200 * 86400], ['h4', 'Hour4', 300 * 14400], ['h1', 'Min60', 200 * 3600]];
    var basl = ['coin', 'fiyat', 'funding', 'deg24'];
    tf.forEach(function (t) { ['e20','e50','e200','rsi','atr','destek','direnc','yuksek90','dusuk90'].forEach(function (k) { basl.push(t[0] + '_' + k); }); });
    basl.push('oi_mexc', 'oi_deg_mexc', 'b_oi_deg24', 'b_ls', 'b_funding');
    var satirlar = [basl];
    var tick = mexcFuturesTicker();
    // Türev verisi: MEXC açık pozisyonu (holdVol) bir önceki çalışmayla kıyaslanır; Binance erişilirse 24s OI, long/short, funding
    var props = PropertiesService.getScriptProperties(), oiOnce = {}, oiYeni = {}, binance = 'denenmedi';
    try { oiOnce = JSON.parse(props.getProperty('OI_ONCEKI') || '{}'); } catch (e) { oiOnce = {}; }
    var basla = Date.now(), atlanan = 0;
    coinListesi().forEach(function (c) {
      // 6 dakikalık çalışma sınırı: 4,5 dakikadan sonra kalan coinler atlanır, tablo yine yazılır
      if (Date.now() - basla > 270000) { atlanan++; return; }
      var sym = c + '_USDT', r = [c, '', '', ''];
      try {
        tf.forEach(function (t) {
          var j = getJson('https://contract.mexc.com/api/v1/contract/kline/' + sym + '?interval=' + t[1] + '&start=' + (simdi - t[2]) + '&end=' + simdi);
          var m = mumOzet(j.data.close, j.data.high, j.data.low);
          r[1] = m.fiyat;
          r.push(m.e20, m.e50, m.e200, m.rsi, m.atr, m.destek.join(' / '), m.direnc.join(' / '), m.yuksek, m.dusuk);
        });
        var tk = tick[sym];
        if (tk) { r[2] = tk.fundingRate; r[3] = Math.round(tk.riseFallRate * 10000) / 100; }
      } catch (e) { r[1] = 'HATA: ' + String(e.message || e).slice(0, 80); }
      while (r.length < basl.length - 5) r.push('');
      var tv = tick[sym], hv = tv ? Number(tv.holdVol) : NaN, eski = oiOnce[c];
      if (hv > 0) oiYeni[c] = hv;
      r.push(hv > 0 ? hv : '', hv > 0 && eski > 0 ? Math.round((hv / eski - 1) * 1000) / 10 : '');
      var b = binance === 'yok' ? null : binanceTurev(c);
      if (b && b.hata) { if (binance === 'denenmedi' && b.kod !== 400) binance = 'yok'; b = null; }
      if (b) binance = 'var';
      r.push(b ? b.oiDeg24 : '', b ? b.ls : '', b ? b.funding : '');
      satirlar.push(r);
    });
    korkuGuncelle();
    var sh = tablo().getSheetByName(ANALIZ_SEKME) || tablo().insertSheet(ANALIZ_SEKME);
    sh.clearContents();
    props.setProperty('OI_ONCEKI', JSON.stringify(oiYeni));
    sh.getRange(1, 1).setValue('Güncelleme (TR): ' + zamanDamgasi() + ' | Kaynak: MEXC futures | oi_deg_mexc: önceki çalışmadan bu yana % | Binance: ' + (binance === 'var' ? 'erişildi' : 'erişim yok') + (atlanan ? ' | Süre doldu, ' + atlanan + ' coin atlandı' : ''));
    var genis = Math.max.apply(null, satirlar.map(function (x) { return x.length; }));
    satirlar = satirlar.map(function (x) { while (x.length < genis) x.push(''); return x.map(function (v) { return typeof v === 'number' ? String(v) : v; }); });
    sh.getRange(2, 1, satirlar.length, genis).setNumberFormat('@').setValues(satirlar);
  } catch (e) { hataBildir(e); }
}

function mumOzet(C, H, L) {
  function ema(a, n) { var k = 2 / (n + 1), e = a[0]; for (var i = 1; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; }
  function rsi(c, n) { var g = 0, l = 0, i, d; for (i = 1; i <= n; i++) { d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } g /= n; l /= n;
    for (i = n + 1; i < c.length; i++) { d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  function atr(n) { var tr = [], i; for (i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
    var a = 0; for (i = 0; i < n; i++) a += tr[i]; a /= n; for (i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n; return a; }
  function y(x) { return x == null ? '' : Number(Number(x).toPrecision(6)); }
  var p = C[C.length - 1], h = H.slice(-120), l = L.slice(-120), hi = [], lo = [], k = 3;
  for (var i = k; i < h.length - k; i++) { var ph = true, pl = true;
    for (var j = 1; j <= k; j++) { if (h[i] <= h[i - j] || h[i] < h[i + j]) ph = false; if (l[i] >= l[i - j] || l[i] > l[i + j]) pl = false; }
    if (ph) hi.push(h[i]); if (pl) lo.push(l[i]); }
  return { fiyat: y(p), e20: y(ema(C, 20)), e50: y(ema(C, 50)), e200: C.length >= 200 ? y(ema(C, 200)) : '', rsi: Math.round(rsi(C, 14) * 10) / 10, atr: y(atr(14)),
    destek: lo.filter(function (x) { return x < p; }).sort(function (a, b) { return b - a; }).slice(0, 3).map(y),
    direnc: hi.filter(function (x) { return x > p; }).sort(function (a, b) { return a - b; }).slice(0, 3).map(y),
    yuksek: y(Math.max.apply(null, H.slice(-90))), dusuk: y(Math.min.apply(null, L.slice(-90))) };
}

// Binance açık verisi (anahtar yok). Erişim yoksa {hata, kod} döner; tekrar denemez.
function binanceTurev(coin) {
  var s = coin + 'USDT', al = function (u) {
    var res = UrlFetchApp.fetch('https://fapi.binance.com' + u, { muteHttpExceptions: true }), k = res.getResponseCode();
    if (k !== 200) throw { kod: k };
    return JSON.parse(res.getContentText());
  };
  try {
    var oi = al('/futures/data/openInterestHist?symbol=' + s + '&period=1h&limit=25'), ls = al('/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=1h&limit=1'), pi = al('/fapi/v1/premiumIndex?symbol=' + s);
    var ilk = Number(oi[0].sumOpenInterestValue), son = Number(oi[oi.length - 1].sumOpenInterestValue);
    return { oiDeg24: ilk > 0 ? Math.round((son / ilk - 1) * 1000) / 10 : '', ls: ls[0] ? Number(ls[0].longShortRatio) : '', funding: Number(pi.lastFundingRate) };
  } catch (e) { return { hata: true, kod: e && e.kod || 0 }; }
}

function mexcFuturesTicker() {
  var r = getJson('https://contract.mexc.com/api/v1/contract/ticker');
  var o = {}; (r.data || []).forEach(function (x) { o[x.symbol] = x; });
  return o;
}

// ---------- MEXC (açık uçlar, anahtar yok) ----------
function mexcSpotFiyatlar() {
  var r = getJson('https://api.mexc.com/api/v3/ticker/price');
  var o = {}; r.forEach(function (x) { o[x.symbol] = Number(x.price); });
  return o;
}
function mexcFuturesFiyatlar() {
  var r = getJson('https://contract.mexc.com/api/v1/contract/ticker');
  if (!r.success) throw new Error('MEXC futures yanıtı başarısız: ' + JSON.stringify(r).slice(0, 200));
  var o = {}; r.data.forEach(function (x) { o[x.symbol] = Number(x.lastPrice); });
  return o;
}
function getJson(url) {
  var son;
  for (var i = 0; i < 3; i++) {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) return JSON.parse(res.getContentText());
    son = res.getResponseCode() + ' ' + res.getContentText().slice(0, 200);
    Utilities.sleep(2000 * (i + 1));
  }
  throw new Error('İstek başarısız: ' + url + ' -> ' + son);
}

// ---------- Telegram ----------
function telegramGonder(metin) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('TELEGRAM_TOKEN'), chat = p.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chat) throw new Error('TELEGRAM_TOKEN veya TELEGRAM_CHAT_ID Script Properties içinde yok');
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post', muteHttpExceptions: true,
    payload: { chat_id: chat, text: String(metin).slice(0, 4000), disable_web_page_preview: 'true' }
  });
  if (res.getResponseCode() !== 200) throw new Error('Telegram hatası ' + res.getResponseCode());
}

function hataBildir(e) {
  Logger.log(e && e.stack || e);
  var p = PropertiesService.getScriptProperties();
  var simdi = Date.now(), son = Number(p.getProperty('SON_HATA') || 0);
  if (simdi - son < 60 * 60 * 1000) return; // saatte en fazla 1 hata mesajı
  p.setProperty('SON_HATA', String(simdi));
  try { telegramGonder('❗ Alarm motoru hatası: ' + String(e && e.message || e).slice(0, 300)); } catch (x) {}
}

function gunlukSaglik() {
  var sh = tablo().getSheetByName(SEKME);
  var son = sh.getLastRow();
  var aktif = son >= 2 ? sh.getRange(2, 1, son - 1, BASLIK.length).getValues()
    .filter(function (s) { return aktifMi(s[C.aktif]) && s[C.durum] !== 'TETIKLENDI'; }).length : 0;
  var t = null; try { t = tarayiciVeri(); } catch (e) { t = null; }
  var yas = t && t.zaman ? Math.round((Date.now() - t.zaman) / 60000) : null;
  var tar = yas == null ? '⚠️ Tarayıcı verisi okunamadı.' : yas > 60 ? '⚠️ Tarayıcı ' + yas + ' dakikadır çalışmıyor.' : 'Tarayıcı çalışıyor (' + t.coinler.length + ' plan).';
  var karne = ''; try { karne = karneSinifRaporu(); } catch (e) { Logger.log(e); }
  telegramGonder('🟢 Alarm motoru çalışıyor. Bekleyen aktif alarm: ' + aktif + '\n' + tar + (karne ? '\n' + karne : ''));
}
// Sınıf bazında sonuç (v11.1): girip sonuçlanan planlar. stop = -1R, TP1 = (TP1 - bölge ortası) / (bölge ortası - stop).
// Kazandırmayan sınıf iki hafta sonra sinyalden çıkarılmak üzere izlenir.
var YENI_KURAL_MS = Date.UTC(2026, 9, 21, 16, 0); // 21 Eki 19:00 TR: v10 (tek yön, 1S bölge ortası onayı, 2R hedef) sonrası ilk analiz 19:30
function karneSinifRaporu() {
  var sh = tablo().getSheetByName(KARNE_SEKME); if (!sh) return '';
  var tum = {}, yeni = {}, sinyal = {}, simdi = Date.now();
  karneSatirlari(sh).forEach(function (r) {
    var d = String(r[K.durum]); if (d !== 'tp1' && d !== 'stop') return;
    var sinif = String(r[K.sinif] || '?'), mid = (Number(r[K.giris_alt]) + Number(r[K.giris_ust])) / 2, stop = Number(r[K.stop]), tp1 = Number(r[K.tp1]);
    var risk = Math.abs(mid - stop), yas = analizSaatiTR(r[K.ilk_analiz], simdi), hedefler = [[tum, sinif]];
    if (yas != null && simdi - yas * 3600000 >= YENI_KURAL_MS) hedefler.push([yeni, sinif]);
    // Sinyal verilenler (v11.4): bildirim/bot adayı planlar; bölgeye yalnız değen planlardan ayrı ölçülür. Tarayıcı planı ayrı anahtar.
    if (r[K.sinyal] === 'evet') hedefler.push([sinyal, r[K.kaynak] === 'tarayici' ? 'tarayıcı' : 'Claude']);
    hedefler.forEach(function (h) {
      var g = h[0], x = g[h[1]] = g[h[1]] || { n: 0, tp: 0, st: 0, r: 0 };
      x.n++; if (d === 'tp1') { x.tp++; x.r += risk > 0 ? Math.abs(tp1 - mid) / risk : 0; } else { x.st++; x.r -= 1; }
    });
  });
  var yaz = function (g) {
    return Object.keys(g).sort().map(function (k) {
      var x = g[k]; return 'Sınıf ' + k + ': ' + x.n + ' işlem · ' + x.tp + ' TP1 · ' + x.st + ' stop · toplam ' + (Math.round(x.r * 10) / 10) + 'R · ort ' + (Math.round(x.r / x.n * 100) / 100) + 'R';
    });
  };
  var t = yaz(tum), y = yaz(yeni), sy = yaz(sinyal).map(function (x) { return x.replace(/^Sınıf /, ''); });
  if (!t.length) return '';
  return '📊 Karne (bölgeye girip sonuçlanan planlar)\n' + t.join('\n') + '\nYeni kurallar (21 Eki 19:30 sonrası):\n' + (y.length ? y.join('\n') : 'henüz sonuçlanan plan yok') +
    '\nSinyal verilenler (bildirim/bot adayı):\n' + (sy.length ? sy.join('\n') : 'henüz sonuçlanan sinyal yok');
}

function zamanDamgasi() {
  return Utilities.formatDate(new Date(), 'Europe/Istanbul', 'yyyy-MM-dd HH:mm');
}

// ---------- Tarayıcı (v9) ----------
// GitHub Actions 15 dakikada bir MEXC'yi tarar, tarayici-veri dalına tarayici.json yazar (herkese açık, yalnızca repo sahibi yazabilir).
// Burada okunur, doğrulanır; 45 dakikadan eski veri plan olarak kullanılmaz. Şema: tarayici/sema.json (repo).
var TARAYICI_URL = 'https://raw.githubusercontent.com/dkcburak/kripto-kokpit/tarayici-veri/tarayici.json';
var TARAYICI_ESKI_MS = 45 * 60 * 1000, ANALIZ_COIN_SAYISI = 30;
var TARAYICI_TF = { yukari: 1, asagi: 1, yatay: 1 };
function tarayiciCoinGecerli(c) {
  return !!c && typeof c.coin === 'string' && /^[A-Z0-9]{2,15}$/.test(c.coin) && c.kaynak === 'tarayici' &&
    planGecerli(c.plan) && c.durum === c.plan.yon && !!c.tf && TARAYICI_TF[c.tf.d] === 1 && TARAYICI_TF[c.tf.h4] === 1 &&
    typeof c.analizZamani === 'string' && c.analizZamani.length <= 20;
}
/** Tarayıcı verisini okur ve doğrular. Uymayan coin karantinaya alınır (atılır), veri bozuksa boş döner. */
function tarayiciOku(metin, simdi) {
  var j = JSON.parse(metin), bos = { coinler: [], hacimListesi: [], zaman: 0, atilan: 0 };
  if (!j || j.surum !== 1 || typeof j.zaman !== 'number' || !Array.isArray(j.coinler)) return bos;
  var hacim = Array.isArray(j.hacimListesi) ? j.hacimListesi.filter(function (x) { return typeof x === 'string' && /^[A-Z0-9]{2,15}$/.test(x); }).slice(0, ANALIZ_COIN_SAYISI) : [];
  if ((simdi || Date.now()) - j.zaman > TARAYICI_ESKI_MS) return { coinler: [], hacimListesi: hacim, zaman: j.zaman, atilan: 0, eski: true };
  // Yalnızca bilinen alanlar yeniden kurulur: başka alan (haber, 1S onayı vb.) dışarıdan gelemez
  var gecerli = j.coinler.filter(tarayiciCoinGecerli).slice(0, 60).map(function (c) {
    var p = c.plan, alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
    var plan = { yon: p.yon, giris: [alt, ust], stop: p.stop, tp1: p.tp1 };
    if (p.tp2 != null) plan.tp2 = p.tp2;
    if (typeof p.gecersiz === 'string') plan.gecersiz = p.gecersiz.slice(0, 200);
    var o = { coin: c.coin, kaynak: 'tarayici', durum: p.yon, analizZamani: c.analizZamani, tf: { d: c.tf.d, h4: c.tf.h4, h1: 'bekliyor' }, plan: plan,
      ozet: typeof c.ozet === 'string' ? c.ozet.slice(0, 300) : '', islemYok: '', haberler: [],
      cizim: { destek: p.yon === 'long' ? [[alt, ust]] : [], direnc: p.yon === 'short' ? [[alt, ust]] : [], trend: [] } };
    if (typeof c.fiyat === 'number' && c.fiyat > 0) o.fiyat = c.fiyat;
    return o;
  });
  return { coinler: gecerli, hacimListesi: hacim, zaman: j.zaman, atilan: j.coinler.length - gecerli.length };
}
function tarayiciVeri() {
  var cache = CacheService.getScriptCache(), k = cache.get('tarayici');
  if (k) return JSON.parse(k);
  var v = { coinler: [], hacimListesi: [], zaman: 0 };
  try {
    var r = UrlFetchApp.fetch(TARAYICI_URL + '?t=' + Math.floor(Date.now() / 300000), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) v = tarayiciOku(r.getContentText());
  } catch (e) { v = { coinler: [], hacimListesi: [], zaman: 0 }; }
  if (v.hacimListesi.length) PropertiesService.getScriptProperties().setProperty('TARAYICI_LISTE', JSON.stringify(v.hacimListesi));
  try { cache.put('tarayici', JSON.stringify(v), 840); } catch (x) {}
  return v;
}
/** Eşlenen cihazlardan kaydedilen açık işlemlerin coinleri */
function pozCoinleri() {
  try { return pozGetir().poz.map(function (p) { return String(p.coin || '').toUpperCase(); }).filter(function (c) { return /^[A-Z0-9]{2,15}$/.test(c); }); } catch (e) { return []; }
}
/** Son bilinen hacim listesi (tarayıcı bir süre çalışmasa da analiz listesi değişmesin) */
function tarayiciHacimListesi() {
  try { var l = JSON.parse(PropertiesService.getScriptProperties().getProperty('TARAYICI_LISTE') || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
/** Claude analizi + tarayıcı planları. Claude'un analiz ettiği coinde Claude geçerlidir ("bekle" dahil);
 *  tarayıcı yalnız analizde olmayan coinlere ya da Claude planı stopla iptal olmuş coine plan ekler. */
function birlesikAnaliz(a, iptal) {
  iptal = iptal || [];
  var t; try { t = tarayiciVeri(); } catch (e) { t = { coinler: [] }; }
  var o = {}; for (var k in a) o[k] = a[k];
  var coinler = (a.coinler || []).slice(), yer = {};
  coinler.forEach(function (c, i) { yer[String(c.coin).toUpperCase()] = i; });
  t.coinler.forEach(function (tc) {
    var i = yer[tc.coin], cl = i == null ? null : coinler[i];
    if (cl && !(cl.plan && iptal.indexOf(tc.coin) >= 0)) return;
    var c = {}; for (var x in tc) c[x] = tc[x];
    if (cl && Array.isArray(cl.haberler)) c.haberler = cl.haberler;
    if (i == null) { yer[tc.coin] = coinler.length; coinler.push(c); } else coinler[i] = c;
  });
  o.coinler = coinler; o.tarayiciZaman = t.zaman || 0;
  return o;
}

// ---------- Kripto Kokpit uygulaması için veri servisi ----------
// Uygulama (GitHub Pages) bu web uygulamasından yalnızca OKUMA yapar. Emir, anahtar, kişisel veri yok.
var KOKPIT_DOSYA = /^kokpit-analiz-.*\.json$/i;
var TF_MEXC = { d: ['Day1', 86400], h4: ['Hour4', 14400], h1: ['Min60', 3600], m15: ['Min15', 900] };
var AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
// Eski sürümün plan alarmlarını tanımak için (o zaman kaynak=claude yazılıyordu)
var ESKI_PLAN_NOTLARI = ['Long giriş bölgesine', 'Short giriş bölgesine', 'Stop seviyesi.', 'Hedef 1:'];

function doGet(e) {
  var p = (e && e.parameter) || {}, sonuc;
  try {
    var anahtar = PropertiesService.getScriptProperties().getProperty('PANEL_ANAHTAR');
    if (!anahtar || p.k !== anahtar) throw new Error('Yetkisiz');
    if (p.f === 'ozet') sonuc = kokpitOzet();
    else if (p.f === 'mum') sonuc = { mumlar: kokpitMum(p.coin, p.tf) };
    else throw new Error('Bilinmeyen istek');
  } catch (err) { sonuc = { hata: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(sonuc)).setMimeType(ContentService.MimeType.JSON);
}

function kokpitKurulum() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PANEL_ANAHTAR')) p.setProperty('PANEL_ANAHTAR', Utilities.getUuid().replace(/-/g, '').slice(0, 20));
  korkuGuncelle();
  Logger.log('Kokpit hazır. ONESIGNAL: ' + (onesignalHazir() ? 'var' : 'yok'));
}

// ---------- Analiz dosyası: okuma ve doğrulama ----------
function analizDosyalari() {
  var klasorler = DriveApp.getFoldersByName(KLASOR_ADI);
  if (!klasorler.hasNext()) return [];
  var dosyalar = klasorler.next().getFiles(), liste = [];
  while (dosyalar.hasNext()) { var f = dosyalar.next(); if (KOKPIT_DOSYA.test(f.getName())) liste.push(f); }
  return liste.sort(function (a, b) { return a.getName() < b.getName() ? 1 : a.getName() > b.getName() ? -1 : 0; });
}

function sayiMi(x) { return typeof x === 'number' && isFinite(x) && x > 0; }
/** Plan kurala uyuyor mu: long'da stop < giriş < hedef, short'ta tersi. Uymayan plan hiç kullanılmaz. */
function planGecerli(p) {
  if (!p || (p.yon !== 'long' && p.yon !== 'short')) return false;
  if (!Array.isArray(p.giris) || p.giris.length !== 2 || !sayiMi(p.giris[0]) || !sayiMi(p.giris[1])) return false;
  if (!sayiMi(p.stop) || !sayiMi(p.tp1) || (p.tp2 != null && !sayiMi(p.tp2))) return false;
  var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
  if (p.yon === 'long') return p.stop < alt && p.tp1 > ust && (p.tp2 == null || p.tp2 >= p.tp1);
  return p.stop > ust && p.tp1 < alt && (p.tp2 == null || p.tp2 <= p.tp1);
}
/** Dosya metnini okur. JSON bozuksa hata atar; tek coinin planı bozuksa yalnızca o plan düşer. */
function analizOku(metin) {
  var a = JSON.parse(metin);
  if (!a || !Array.isArray(a.coinler)) throw new Error('coinler listesi yok');
  var hatalar = [];
  a.coinler = a.coinler.filter(function (c) { return c && c.coin; });
  a.coinler.forEach(function (c) {
    if (c.plan == null) return;
    if (planGecerli(c.plan)) { c.plan.giris = [Math.min(c.plan.giris[0], c.plan.giris[1]), Math.max(c.plan.giris[0], c.plan.giris[1])]; return; }
    hatalar.push(String(c.coin).toUpperCase());
    c.plan = null; c.durum = 'bekle'; c.islemYok = 'Plan verisi hatalı geldi, bu coin için alarm kurulmadı.';
  });
  return { analiz: a, hatalar: hatalar };
}

/** Okunabilen en yeni analiz (en yeni dosya bozuksa bir öncekine düşer) */
function kokpitAnaliz() {
  var cache = CacheService.getScriptCache(), k = cache.get('kokpit-analiz');
  if (k) return JSON.parse(k);
  var dosyalar = analizDosyalari(), a = null;
  for (var i = 0; i < dosyalar.length && !a; i++) {
    try { a = analizOku(dosyalar[i].getBlob().getDataAsString('UTF-8')).analiz; a.dosya = dosyalar[i].getId(); } catch (e) { a = null; }
  }
  a = a || { coinler: [] };
  try { cache.put('kokpit-analiz', JSON.stringify(a), 300); } catch (x) {}
  return a;
}

// Yeni analiz dosyası geldiyse plandaki giriş/stop/hedef1 seviyelerini alarm olarak yükler (kaynak=kokpit satırları değişir)
function kokpitPlanAlarmlari(analiz) {
  var out = [];
  (analiz.coinler || []).forEach(function (c) {
    var p = c.plan; if (!planGecerli(p)) return;
    var lng = p.yon !== 'short', coin = String(c.coin).toUpperCase(), sat = function (tur, kosul, seviye, not) {
      var s = BASLIK.map(function () { return ''; });
      s[C.aktif] = 'evet'; s[C.kaynak] = 'kokpit'; s[C.coin] = coin; s[C.piyasa] = 'futures'; s[C.tur] = tur; s[C.kosul] = kosul; s[C.seviye] = "'" + seviye; s[C.not] = not;
      out.push(s);
    };
    var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
    sat('giris', lng ? 'altina' : 'ustune', lng ? ust : alt, (lng ? 'Long' : 'Short') + ' giriş bölgesine geldi. 1 saatlik onayı kontrol edin.');
    sat('stop', lng ? 'altina' : 'ustune', p.stop, 'Stop seviyesi. Pozisyondaysanız MEXC stop emriniz yerinde mi?');
    sat('hedef1', lng ? 'ustune' : 'altina', p.tp1, 'Hedef 1: yarısını kapatıp stopu girişe çekmeyi düşünün.');
  });
  return out;
}
function kokpitSatiriMi(s) {
  var k = String(s[C.kaynak]).toLowerCase(), not = String(s[C.not] || '');
  if (k === 'kokpit') return true;
  return k === 'claude' && ESKI_PLAN_NOTLARI.some(function (n) { return not.indexOf(n) === 0; });
}
function kokpitAlarmIceAl() {
  var dosyalar = analizDosyalari(); if (!dosyalar.length) return;
  var enYeni = dosyalar[0], props = PropertiesService.getScriptProperties();
  if (props.getProperty('SON_KOKPIT') === enYeni.getId()) return;
  var okunan;
  try { okunan = analizOku(enYeni.getBlob().getDataAsString('UTF-8')); }
  catch (e) {
    // Bozuk dosya karantina: bir daha denenmez, mevcut alarmlar aynen kalır
    props.setProperty('SON_KOKPIT', enYeni.getId());
    throw new Error('Bozuk analiz dosyası atlandı (' + enYeni.getName() + '): ' + (e.message || e) + '. Mevcut alarmlar korunuyor.');
  }
  var yeni = kokpitPlanAlarmlari(okunan.analiz);
  var sh = tablo().getSheetByName(SEKME), son = sh.getLastRow();
  var kalan = son >= 2 ? sh.getRange(2, 1, son - 1, BASLIK.length).getValues().filter(function (s) { return !kokpitSatiriMi(s); }) : [];
  var hepsi = kalan.concat(yeni);
  if (son >= 2) sh.getRange(2, 1, son - 1, BASLIK.length).clearContent();
  if (hepsi.length) sh.getRange(2, 1, hepsi.length, BASLIK.length).setValues(hepsi);
  props.setProperty('SON_KOKPIT', enYeni.getId());
  CacheService.getScriptCache().remove('kokpit-analiz');
  if (okunan.hatalar.length) throw new Error('Analizde plan verisi hatalı: ' + okunan.hatalar.join(', ') + '. Bu coinler için alarm kurulmadı, diğerleri kuruldu.');
}

// ---------- Plan iptali (kalıcı) ----------
function planIptalleri(dosyaId) {
  try { var o = JSON.parse(PropertiesService.getScriptProperties().getProperty('PLAN_IPTAL') || '{}'); return o.dosya === dosyaId ? o.coinler || [] : []; }
  catch (e) { return []; }
}
function stopuGectiMi(plan, fiyat) { return plan.yon === 'short' ? fiyat >= plan.stop : fiyat <= plan.stop; }
/** Her turda: fiyat stopu geçtiyse planı bu analiz için kalıcı olarak iptal eder (fiyat geri dönse de plan geri gelmez) */
function planIptalleriniIsle(futures) {
  var a = kokpitAnaliz(); if (!a.dosya) return;
  var liste = planIptalleri(a.dosya), degisti = false;
  (a.coinler || []).forEach(function (c) {
    var coin = String(c.coin).toUpperCase(), f = futures[coin + '_USDT'];
    if (c.plan && f && liste.indexOf(coin) < 0 && stopuGectiMi(c.plan, f)) { liste.push(coin); degisti = true; }
  });
  if (degisti) PropertiesService.getScriptProperties().setProperty('PLAN_IPTAL', JSON.stringify({ dosya: a.dosya, coinler: liste }));
}

function kokpitTicker() {
  var cache = CacheService.getScriptCache(), k = cache.get('kokpit-ticker');
  if (k) return JSON.parse(k);
  var t = mexcFuturesTicker(), o = {};
  Object.keys(t).forEach(function (s) { if (/_USDT$/.test(s)) o[s] = [Number(t[s].lastPrice), Number(t[s].riseFallRate), Number(t[s].fundingRate)]; });
  try { cache.put('kokpit-ticker', JSON.stringify(o), 60); } catch (x) {}
  return o;
}

// ---------- Zaman ----------
/** Log zamanını gerçek ana çevirir. Eski kayıtlar tabloda tarih olarak, tablonun saat diliminde duruyor; yeni kayıtlar metin. */
function logZamani(v, tabloTz) {
  if (v instanceof Date) return new Date(Utilities.formatDate(v, tabloTz || 'Europe/Istanbul', "yyyy-MM-dd'T'HH:mm:ss") + '+03:00');
  var t = String(v).replace(/^'/, '').trim().replace(' ', 'T');
  return new Date(t + (t.length <= 16 ? ':00' : '') + '+03:00');
}
function trZaman(d) {
  return Utilities.formatDate(d, 'Europe/Istanbul', 'd') + ' ' + AYLAR[Number(Utilities.formatDate(d, 'Europe/Istanbul', 'M')) - 1] + ' ' + Utilities.formatDate(d, 'Europe/Istanbul', 'HH:mm');
}

// ---------- Canlı trend ve piyasa yönü (v10) ----------
/** Kapanmış mumlardan 1G ve 4S trendi (DKC_HESAP.trendEma). Okunamayan zaman dilimi yazılmaz. */
function canliTf(coin) {
  var o = {}, sn = Math.floor(Date.now() / 1000);
  ['d', 'h4'].forEach(function (tf) {
    try {
      var adim = TF_MEXC[tf][1], m = kokpitMum(coin, tf).filter(function (x) { return Number(x.time) + adim <= sn; });
      var t = DKC_HESAP.trendEma(m); if (t) o[tf] = t;
    } catch (e) {}
  });
  return o;
}
/** Coinin analizdeki 1G/4S trendini canlı değerle değiştirir (analizdeki değer tfAnaliz'de kalır) */
function tfCanliUygula(c) {
  var t = canliTf(c.coin); if (!t.d && !t.h4) return;
  var tf = c.tf || {}, o = {}; for (var k in tf) o[k] = tf[k];
  c.tfAnaliz = tf; if (t.d) o.d = t.d; if (t.h4) o.h4 = t.h4; c.tf = o;
}
/** Analizin piyasa bilgisi + canlı BTC trendi (pusula girdisi). BTC okunamazsa analizdeki BTC trendi kullanılır. */
function piyasaCanli(a) {
  var p = {}, k; for (k in (a.piyasa || {})) p[k] = a.piyasa[k];
  var b = canliTf('BTC');
  if (!b.d || !b.h4) { var bc = (a.coinler || []).filter(function (c) { return String(c.coin).toUpperCase() === 'BTC'; })[0]; if (bc && bc.tf) { b.d = b.d || bc.tf.d; b.h4 = b.h4 || bc.tf.h4; } }
  p.btcTf = b;
  try { var f = btcH4Fark(); if (f != null) b.h4Fark = f; } catch (e) { Logger.log(e); }
  try { if (p.dominans) p.dominans = dominansTaze(p.dominans); } catch (e) { Logger.log(e); }
  return p;
}
/** BTC 4S (EMA20 - EMA50) / kapanış, yüzde; kapanmış mumlardan (pusula sıkışıklık ölçüsü, v11.4). Mum yetersizse null. */
function btcH4Fark() {
  var sn = Math.floor(Date.now() / 1000), m = kokpitMum('BTC', 'h4').filter(function (x) { return Number(x.time) + TF_MEXC.h4[1] <= sn; });
  var kap = m.map(function (x) { return Number(x.close); }).filter(function (x) { return x > 0; });
  var e20 = sinyalEma(kap, 20), e50 = sinyalEma(kap, 50);
  if (e20 == null || e50 == null) return null;
  return Math.round((e20 - e50) / kap[kap.length - 1] * 10000) / 100;
}
// Dominans analizden gelir ve 12 saate kadar eski olabilir. CoinGecko'dan canlı USDT.D ve BTC.D örneklenir (10 dk'da bir,
// 6 saat saklanır); ~4 saat önceye göre analizdeki 4S yönüne açıkça ters hareket varsa yön canlıya çevrilir.
// Veri yoksa ya da yeterli geçmiş birikmediyse analizdeki değer aynen kalır.
var DOM_ESIK = { usdt: 0.04, btc: 0.15 };
function dominansOrnekle() {
  var props = PropertiesService.getScriptProperties(), simdi = Date.now(), g = [];
  try { g = JSON.parse(props.getProperty('DOM_GECMIS') || '[]') || []; } catch (e) { g = []; }
  var denendi = Number(props.getProperty('DOM_DENEME') || 0);
  if (simdi - denendi >= 10 * 60000) {
    props.setProperty('DOM_DENEME', String(simdi)); // başarısız olsa da 10 dk'da bir denenir; tek istek, bekleme yok
    var r = UrlFetchApp.fetch('https://api.coingecko.com/api/v3/global', { muteHttpExceptions: true }), j = null;
    try { if (r.getResponseCode() === 200) j = JSON.parse(r.getContentText()); } catch (e) { j = null; }
    var yuzde = j && j.data && j.data.market_cap_percentage;
    if (yuzde && isFinite(yuzde.usdt) && isFinite(yuzde.btc)) {
      g.push([simdi, Number(yuzde.usdt), Number(yuzde.btc)]);
      g = g.filter(function (x) { return simdi - x[0] <= 6 * 3600000; });
      props.setProperty('DOM_GECMIS', JSON.stringify(g));
    }
  }
  return g;
}
function domYon(fark, esik) { return fark > esik ? 'yukari' : fark < -esik ? 'asagi' : null; }
function dominansTaze(dm) {
  var g = dominansOrnekle(), son = g[g.length - 1], simdi = Date.now();
  var eski = g.filter(function (x) { return simdi - x[0] >= 3.5 * 3600000; }).pop();
  if (!son || !eski) return dm;
  var cikti = JSON.parse(JSON.stringify(dm));
  [['usdt', 1], ['btc', 2]].forEach(function (k) {
    var canli = domYon(son[k[1]] - eski[k[1]], DOM_ESIK[k[0]]), a = cikti[k[0]] && cikti[k[0]].h4;
    if (canli && a && a !== 'yatay' && canli !== a) cikti[k[0]].h4 = canli;
  });
  return cikti;
}
/** Açık işlemlerin yön sayısı (İşlemlerim) */
function acikYonler() {
  var y = { long: 0, short: 0 };
  try { pozGetir().poz.forEach(function (p) { y[p.yon === 'short' ? 'short' : 'long']++; }); } catch (e) {}
  return y;
}

function kokpitOzet() {
  var a0 = kokpitAnaliz(), iptal = planIptalleri(a0.dosya), a = birlesikAnaliz(a0, iptal), tick = kokpitTicker(), ss = tablo();
  var liste = coinListesi(), anz = {};
  // Açık işlemi olan coin listeden düşmesin (fiyat, risk ve grafik için)
  pozCoinleri().forEach(function (ad) { if (liste.indexOf(ad) < 0) liste.push(ad); });
  (a.coinler || []).forEach(function (c) {
    var ad = String(c.coin).toUpperCase(); anz[ad] = c;
    if (c.kaynak === 'tarayici' && liste.indexOf(ad) < 0) liste.push(ad);
  });
  var coinler = liste.map(function (coin) {
    var c = anz[coin] || { coin: coin, durum: 'bekle', ozet: 'Bu coin bir sonraki analizde değerlendirilecek.', tf: {}, plan: null, cizim: {}, haberler: [], islemYok: 'Henüz analiz yok.' };
    var t = tick[coin + '_USDT'];
    c.coin = coin;
    if (t) { c.fiyat = t[0]; c.deg24 = Math.round(t[1] * 10000) / 100; c.funding = t[2]; }
    // Fiyat girişten önce stopu geçtiyse plan iptal (kalıcı: bu analiz boyunca geri gelmez)
    if (c.plan && ((c.kaynak !== 'tarayici' && iptal.indexOf(coin) >= 0) || (c.fiyat && stopuGectiMi(c.plan, c.fiyat)))) {
      c.islemYok = 'Fiyat stop seviyesini geçti, plan iptal. Yeni analiz bekleniyor.'; c.plan = null; c.durum = 'bekle';
    }
    // Planı olan coinde 1G/4S trendi canlı (trend plana ters dönerse plan sınıf C olur, gösterilmez)
    if (c.plan) { try { tfCanliUygula(c); } catch (e) {} }
    // Fiyat giriş bölgesindeyse 1S onayı canlı hesaplanır (analizdeki sabit değerin yerine geçer)
    if (c.plan && c.fiyat) {
      var gd = DKC_HESAP.girisDurumu(c.plan, c.fiyat);
      if (gd && gd.tur === 'bolgede') { try { var h1 = h1Canli(coin, c.plan); if (h1) { c.h1Canli = h1.durum; c.h1Sebep = h1.sebep; } } catch (e) {} }
    }
    return c;
  });
  var sh = ss.getSheetByName(SEKME), son = sh.getLastRow(), alarmlar = [];
  var TUR = { giris: 'giris', stop: 'stop', hedef1: 'tp1', hedef2: 'tp2', ani: 'ani' };
  if (son >= 2) sh.getRange(2, 1, son - 1, BASLIK.length).getValues().forEach(function (s) {
    if (aktifMi(s[C.aktif]) && s[C.durum] !== 'TETIKLENDI' && s[C.coin])
      alarmlar.push({ coin: String(s[C.coin]).toUpperCase(), tur: TUR[String(s[C.tur]).toLowerCase()] || String(s[C.tur]), seviye: Number(String(s[C.seviye]).replace(/^'/, '').replace(',', '.')), kosul: normKosul(s[C.kosul]), kaynak: String(s[C.kaynak]).toLowerCase(), not: String(s[C.not] || '').slice(0, 120), durum: 'bekliyor' });
  });
  var log = ss.getSheetByName(LOG_SEKME), tetiklenen = [], tz = ss.getSpreadsheetTimeZone();
  if (log && log.getLastRow() >= 2) {
    var n = Math.min(10, log.getLastRow() - 1), simdi = Date.now();
    log.getRange(log.getLastRow() - n + 1, 1, n, 8).getValues().reverse().forEach(function (r) {
      var z = logZamani(r[0], tz); if (isNaN(z.getTime())) return;
      tetiklenen.push({ zaman: trZaman(z), ms: z.getTime(), coin: String(r[1]).toUpperCase(), tur: TUR[String(r[3]).toLowerCase()] || String(r[3]), seviye: r[5], fiyat: Number(r[6]), yeni: simdi - z.getTime() < 86400000 });
    });
  }
  var piyasa = piyasaCanli(a);
  var korku = PropertiesService.getScriptProperties().getProperty('KORKU');
  if (korku) { try { piyasa.korku = JSON.parse(korku); } catch (x) {} }
  var karne = null; try { karne = karneOzet(7); } catch (e) { karne = null; }
  return { karne: karne, analizZamani: a.analizZamani || '', tarayiciZaman: a.tarayiciZaman || 0, fiyatZamani: Utilities.formatDate(new Date(), 'Europe/Istanbul', 'HH:mm'), sunucuZamani: Date.now(), piyasa: piyasa, coinler: coinler, alarmlar: alarmlar, tetiklenen: tetiklenen };
}

function kokpitMum(coin, tf) {
  coin = String(coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var m = TF_MEXC[tf]; if (!coin || !m) throw new Error('Geçersiz istek');
  var cache = CacheService.getScriptCache(), anahtar = 'mum-' + coin + '-' + tf, k = cache.get(anahtar);
  if (k) return JSON.parse(k);
  // Yalnızca izlenen coinler: rastgele adlarla dış istek kotası tüketilemesin
  var izin = cache.get('coin-listesi'), liste = izin ? JSON.parse(izin) : coinListesi();
  if (!izin) {
    try { tarayiciVeri().coinler.forEach(function (c) { if (liste.indexOf(c.coin) < 0) liste.push(c.coin); }); } catch (x) {}
    try { cache.put('coin-listesi', JSON.stringify(liste), 600); } catch (x) {}
  }
  if (liste.indexOf(coin) < 0) {
    // Önbellekteki liste eskiyse: yeni tarayıcı coini ya da açık işlem için bir kez daha bak
    var ek = pozCoinleri(); try { tarayiciVeri().coinler.forEach(function (c) { ek.push(c.coin); }); } catch (x) {}
    if (ek.indexOf(coin) < 0) throw new Error('Bu coin izlenmiyor');
  }
  var simdi = Math.floor(Date.now() / 1000);
  var j = getJson('https://contract.mexc.com/api/v1/contract/kline/' + coin + '_USDT?interval=' + m[0] + '&start=' + (simdi - m[1] * 160) + '&end=' + simdi);
  var d = j.data || {}, out = [];
  (d.time || []).forEach(function (t, i) { out.push({ time: t, open: d.open[i], high: d.high[i], low: d.low[i], close: d.close[i], vol: d.vol ? d.vol[i] : null }); });
  try { cache.put(anahtar, JSON.stringify(out), tf === 'm15' ? 60 : tf === 'h1' ? 180 : 300); } catch (x) {}
  return out;
}

function korkuGuncelle() {
  try {
    var j = getJson('https://api.alternative.me/fng/?limit=1');
    var v = j.data && j.data[0]; if (!v) return;
    var TR = { 'Extreme Fear': 'Aşırı korku', 'Fear': 'Korku', 'Neutral': 'Nötr', 'Greed': 'Açgözlülük', 'Extreme Greed': 'Aşırı açgözlülük' };
    PropertiesService.getScriptProperties().setProperty('KORKU', JSON.stringify({ deger: Number(v.value), etiket: TR[v.value_classification] || v.value_classification }));
  } catch (e) { Logger.log('Korku endeksi alınamadı: ' + e); }
}

// ---------- Bildirim: uygulama (OneSignal) varsa oraya, yoksa Telegram'a ----------
function onesignalHazir() {
  var p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('ONESIGNAL_KEY') && p.getProperty('ONESIGNAL_APP_ID'));
}
/** Her alarm için ayrı gönderir; dönen dizi hangi alarmın en az bir kanaldan gittiğini söyler. */
function alarmBildir(mesajlar, loglar) {
  var ADI = { giris: 'Giriş bölgesi', stop: 'Stop', hedef1: 'Hedef 1', hedef2: 'Hedef 2', alarm: 'Fiyat alarmı' };
  var url = PropertiesService.getScriptProperties().getProperty('KOKPIT_URL') || '', os = onesignalHazir();
  return loglar.map(function (l, i) {
    var coin = String(l[1]).toUpperCase(), tur = String(l[3]).toLowerCase();
    if (os) {
      try { bildirimGonder(emoji(tur) + ' ' + coin + ' · ' + (ADI[tur] || tur), (l[7] ? l[7] + ' ' : '') + 'Fiyat: ' + l[6], url ? url + '#/coin/' + coin : ''); return true; }
      catch (e) { hataBildir(e); }
    }
    try { telegramGonder(mesajlar[i]); return true; } catch (x) { hataBildir(x); return false; }
  });
}
function bildirimGonder(baslik, metin, adres) {
  var p = PropertiesService.getScriptProperties();
  // ONESIGNAL_ALICI: yalnızca Burak Bey'in cihaz abonelik kimlikleri (virgülle). Boşsa tüm abonelere gider.
  var alici = String(p.getProperty('ONESIGNAL_ALICI') || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  var govde = { app_id: p.getProperty('ONESIGNAL_APP_ID'), target_channel: 'push',
    headings: { en: baslik, tr: baslik }, contents: { en: metin, tr: metin }, web_url: adres || p.getProperty('KOKPIT_URL') || undefined };
  if (alici.length) govde.include_subscription_ids = alici; else govde.included_segments = ['Total Subscriptions'];
  var res = UrlFetchApp.fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Key ' + p.getProperty('ONESIGNAL_KEY') },
    payload: JSON.stringify(govde)
  });
  if (res.getResponseCode() >= 300) throw new Error('OneSignal hatası ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
  var j = JSON.parse(res.getContentText());
  if (j.errors && !j.id) throw new Error('OneSignal kimseye göndermedi: ' + JSON.stringify(j.errors).slice(0, 200));
  return j;
}
// ---------- Sinyal bildirimi (v7) ----------
// Skor kuralları uygulamanın hesap.js dosyasıyla aynıdır: dosyanın sonundaki kopya DKC_HESAP olarak gelir.
// Bildirim yalnızca skor A+/A VE fiyat giriş bölgesindeyken gider; aynı coin+yön+sınıf 30 dakikada bir.
var SINYAL_ARA_MS = 30 * 60 * 1000, SINYAL_SAKLA_MS = 7 * 86400000, SINYAL_TUR_SINIRI = 6;
var SINYAL_AY = { oca: 0, şub: 1, sub: 1, mar: 2, nis: 3, may: 4, haz: 5, tem: 6, ağu: 7, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11 };
/** "13 Eki 08:00" (İstanbul saati, UTC+3) -> kaç saat önce. Betik saat diliminden bağımsız. Okunamazsa null. */
function analizSaatiTR(metin, simdi) {
  var m = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3})[A-Za-zÇĞİÖŞÜçğıöşü]*\s+(\d{1,2})[:.](\d{2})/.exec(String(metin || ''));
  if (!m) return null;
  var ay = SINYAL_AY[m[2].toLocaleLowerCase('tr')]; if (ay == null) return null;
  simdi = simdi || Date.now();
  var y = new Date(simdi + 3 * 3600000).getUTCFullYear();
  var t = Date.UTC(y, ay, +m[1], +m[3], +m[4]) - 3 * 3600000;
  if (t - simdi > 86400000) t = Date.UTC(y - 1, ay, +m[1], +m[3], +m[4]) - 3 * 3600000;
  return (simdi - t) / 3600000;
}
function sinyalEma(kapanis, n) {
  if (kapanis.length < n) return null;
  var k = 2 / (n + 1), e = 0, i;
  for (i = 0; i < n; i++) e += kapanis[i];
  e /= n;
  for (i = n; i < kapanis.length; i++) e = kapanis[i] * k + e * (1 - k);
  return e;
}
/** 15 dakikalık mumlardan sinyalSkoru'nun beklediği c.m15 (uygulamadaki canli.js ile aynı kurallar). Yetersizse null. */
function m15Gosterge(mumlar) {
  if (!Array.isArray(mumlar) || mumlar.length < 30) return null;
  var liste = mumlar.slice(-100), kapanis = liste.map(function (m) { return Number(m.close); });
  if (kapanis.some(function (x) { return !(x > 0); })) return null;
  var r = DKC_HESAP.rsiSeri(kapanis, 14), rsi = r[r.length - 1];
  if (rsi == null) return null;
  var ema9 = sinyalEma(kapanis, 9), ema21 = sinyalEma(kapanis, 21);
  // Hacim: son kapanmış mum / ondan önceki 20 kapanmış mumun ortalaması (son mum açık, yarım)
  var hac = liste.map(function (m) { return m.vol == null ? NaN : Number(m.vol); }), n = hac.length;
  var onceki = hac.slice(Math.max(0, n - 22), n - 2).filter(function (x) { return x >= 0; });
  return {
    rsi: Math.round(rsi * 10) / 10, ema9: ema9, ema21: ema21,
    hacim: hac[n - 2] >= 0 ? hac[n - 2] : null,
    hacimOrt: onceki.length ? onceki.reduce(function (a, b) { return a + b; }, 0) / onceki.length : null,
    kapanis: kapanis[kapanis.length - 1], sonZaman: Number(liste[liste.length - 1].time)
  };
}
/** Canlı 1S onayı: 1 saatlik MEXC mumlarından (DKC_HESAP.h1Onay). Mum yetersizse null (analizdeki değer kullanılır). */
function h1Canli(coin, plan) {
  var mumlar = kokpitMum(coin, 'h1');
  if (!Array.isArray(mumlar) || mumlar.length < 4) return null;
  return DKC_HESAP.h1Onay(mumlar, plan);
}

// ---------- Plan karnesi: yayınlanan her planın sonucu (bölgeye geldi mi, sonra önce Hedef 1 mi stop mu) ----------
// durum: bekliyor (plan yayında, bölgeye gelmedi) | girdi (fiyat bölgeye geldi) | tp1 | stop |
//        gelmedi (plan bölgeye gelmeden yayından kalktı) | iptal (bölgeye gelmeden stop görüldü)
// Aynı plan sonraki analizde aynen tekrar yazılırsa yeni satır açılmaz (anahtar: coin|yon|giriş|stop).
// Fiyat 5 dakikada bir okunur; aradaki kısa iğneler görülmeyebilir.
var KARNE_SEKME = 'Karne';
var KARNE_BASLIK = ['anahtar', 'ilk_analiz', 'coin', 'yon', 'sinif', 'giris_alt', 'giris_ust', 'stop', 'tp1', 'durum', 'giris_zamani', 'sonuc_zamani', 'son_analiz', 'sinyal', 'kaynak'];
var K = {}; KARNE_BASLIK.forEach(function (b, i) { K[b] = i; });
function karneAnahtari(c) { var p = c.plan; return [String(c.coin).toUpperCase(), p.yon, p.giris[0], p.giris[1], p.stop].join('|'); }
function karneSayfasi() {
  var ss = tablo(), sh = ss.getSheetByName(KARNE_SEKME);
  if (!sh) { sh = ss.insertSheet(KARNE_SEKME); sh.getRange(1, 1, 1, KARNE_BASLIK.length).setValues([KARNE_BASLIK]); }
  else if (String(sh.getRange(1, KARNE_BASLIK.length).getValues()[0][0]) !== KARNE_BASLIK[KARNE_BASLIK.length - 1]) sh.getRange(1, KARNE_BASLIK.length).setValues([[KARNE_BASLIK[KARNE_BASLIK.length - 1]]]); // v11.4: kaynak sütunu
  return sh;
}
function karneSatirlari(sh) {
  var son = sh.getLastRow();
  return son >= 2 ? sh.getRange(2, 1, son - 1, KARNE_BASLIK.length).getValues() : [];
}
/** Bildirimi giden planı işaretler (sonraki karne turunda 'sinyal' sütununa yazılır) */
function karneSinyal(anahtar) {
  var props = PropertiesService.getScriptProperties(), l = [];
  try { l = JSON.parse(props.getProperty('KARNE_SINYAL') || '[]') || []; } catch (e) { l = []; }
  if (l.indexOf(anahtar) < 0) { l.push(anahtar); props.setProperty('KARNE_SINYAL', JSON.stringify(l.slice(-50))); }
}
function planKarnesiIsle(futures) {
  var a = kokpitAnaliz(); if (!a.dosya) return;
  var sh = karneSayfasi(), satirlar = karneSatirlari(sh), zaman = "'" + zamanDamgasi(), analizAd = a.analizZamani || '';
  var yayinda = {}, bilinen = {}, degisti = false, iptal = planIptalleri(a.dosya);
  var sinyaller = []; try { sinyaller = JSON.parse(PropertiesService.getScriptProperties().getProperty('KARNE_SINYAL') || '[]') || []; } catch (e) { sinyaller = []; }
  (a.coinler || []).forEach(function (c) { if (c.plan && iptal.indexOf(String(c.coin).toUpperCase()) < 0) yayinda[karneAnahtari(c)] = c; });
  satirlar.forEach(function (r) {
    var anahtar = String(r[K.anahtar]), durum = String(r[K.durum]), f = futures[String(r[K.coin]) + '_USDT'];
    var lng = r[K.yon] === 'long', alt = Number(r[K.giris_alt]), ust = Number(r[K.giris_ust]), stop = Number(r[K.stop]), tp1 = Number(r[K.tp1]);
    bilinen[anahtar] = true;
    if (sinyaller.indexOf(anahtar) >= 0 && r[K.sinyal] !== 'evet') { r[K.sinyal] = 'evet'; degisti = true; }
    if (durum === 'bekliyor') {
      if (f > 0 && (lng ? f <= stop : f >= stop)) { r[K.durum] = 'iptal'; r[K.sonuc_zamani] = zaman; degisti = true; return; }
      if (!yayinda[anahtar]) { r[K.durum] = 'gelmedi'; r[K.sonuc_zamani] = zaman; degisti = true; return; }
      if (r[K.son_analiz] !== analizAd) { r[K.son_analiz] = analizAd; degisti = true; }
      if (f > 0 && (lng ? f <= ust : f >= alt)) { r[K.durum] = 'girdi'; r[K.giris_zamani] = zaman; degisti = true; }
    } else if (durum === 'girdi' && f > 0) {
      if (lng ? f <= stop : f >= stop) { r[K.durum] = 'stop'; r[K.sonuc_zamani] = zaman; degisti = true; }
      else if (lng ? f >= tp1 : f <= tp1) { r[K.durum] = 'tp1'; r[K.sonuc_zamani] = zaman; degisti = true; }
    }
  });
  Object.keys(yayinda).forEach(function (k) {
    if (bilinen[k]) return;
    var c = yayinda[k], p = c.plan;
    // Sınıf canlı trendle (v11.4): analizdeki 1G/4S etiketi yanlışsa (ör. 17-20 Eki BTC 'yatay' yazıldı, EMA kuralıyla yukarıydı) karne doğru sınıfı tutar
    var cc = {}; for (var kk in c) cc[kk] = c[kk]; try { tfCanliUygula(cc); } catch (e) {}
    var sn = DKC_HESAP.planSinif(cc, a.piyasa);
    satirlar.push([k, analizAd, String(c.coin).toUpperCase(), p.yon, sn ? sn.sinif : '', p.giris[0], p.giris[1], p.stop, p.tp1, 'bekliyor', '', '', analizAd, '', 'claude']);
    degisti = true;
  });
  if (degisti && satirlar.length) sh.getRange(2, 1, satirlar.length, KARNE_BASLIK.length).setValues(satirlar);
}
/** Sinyali giden tarayıcı planı karneye 'girdi' olarak yazılır (bot bu planlara girer; ölçülmeli). Aynı anahtar varsa yazılmaz. */
function karneTarayiciEkle(c, sinif) {
  var sh = karneSayfasi(), anahtar = karneAnahtari(c), satirlar = karneSatirlari(sh);
  if (satirlar.some(function (r) { return String(r[K.anahtar]) === anahtar; })) return false;
  var p = c.plan, zaman = "'" + zamanDamgasi(), ad = c.analizZamani || '';
  sh.appendRow([anahtar, ad, String(c.coin).toUpperCase(), p.yon, sinif || '', p.giris[0], p.giris[1], p.stop, p.tp1, 'girdi', zaman, '', ad, 'evet', 'tarayici']);
  return true;
}
/** Son `gun` günde yayına giren planların özeti (uygulamadaki karne şeridi) */
function karneOzet(gun) {
  var sh = tablo().getSheetByName(KARNE_SEKME); if (!sh) return null;
  var o = { gun: gun, plan: 0, bekliyor: 0, girdi: 0, tp1: 0, stop: 0, gelmedi: 0, iptal: 0, sinyal: 0, sinyalTp1: 0, sinyalStop: 0, isabet: null };
  karneSatirlari(sh).forEach(function (r) {
    var yas = analizSaatiTR(r[K.ilk_analiz]); if (yas == null || yas > gun * 24) return;
    var d = String(r[K.durum]); o.plan++; if (o[d] != null) o[d]++;
    if (r[K.sinyal] === 'evet') { o.sinyal++; if (d === 'tp1') o.sinyalTp1++; if (d === 'stop') o.sinyalStop++; }
  });
  if (o.tp1 + o.stop) o.isabet = Math.round(o.tp1 / (o.tp1 + o.stop) * 100);
  return o;
}

function sinyalSayi(x) { return String(Number(Number(x).toPrecision(6))).replace('.', ','); }
function sinyalKontrol() {
  if (!onesignalHazir() || typeof DKC_HESAP === 'undefined') return;
  var a0 = kokpitAnaliz(), iptal = planIptalleri(a0.dosya), a = birlesikAnaliz(a0, iptal);
  var tick = kokpitTicker(), props = PropertiesService.getScriptProperties();
  var simdi = Date.now(), url = props.getProperty('KOKPIT_URL') || '';
  var kayit = {}; try { kayit = JSON.parse(props.getProperty('SINYAL_BILDIRILEN') || '{}') || {}; } catch (e) { kayit = {}; }
  // Stop sonrası bekleme (v11.1): bildirilen sinyalin stopu görülürse aynı coin+yön 12 saat sinyal ve bot girişi vermez
  var stopTakip = {}, stopSon = {};
  try { stopTakip = JSON.parse(props.getProperty('SINYAL_STOP') || '{}') || {}; stopSon = JSON.parse(props.getProperty('STOP_SON') || '{}') || {}; } catch (e) { stopTakip = {}; stopSon = {}; }
  var stopDegisti = stopTakipGuncelle(stopTakip, stopSon, tick, simdi);
  var degisti = false, bakilan = 0, piyasa = piyasaCanli(a), acikYon = acikYonler();
  var bugunTR = Utilities.formatDate(new Date(simdi), 'Europe/Istanbul', 'yyyy-MM-dd'), sayac = {};
  try { sayac = JSON.parse(props.getProperty('SINYAL_SAYAC') || '{}') || {}; } catch (e) { sayac = {}; }
  if (sayac.gun !== bugunTR) sayac = { gun: bugunTR, bolgede: {}, sinyal: {}, durum: {} };
  (a.coinler || []).forEach(function (c0) {
    var coin = String(c0.coin || '').toUpperCase(), t = tick[coin + '_USDT'];
    var tarayici = c0.kaynak === 'tarayici';
    if (!c0.plan || !t || (!tarayici && iptal.indexOf(coin) >= 0)) return;
    var ek = { analizSaat: analizSaatiTR(c0.analizZamani || a.analizZamani, simdi), acikYon: acikYon };
    var c = {}; for (var k in c0) c[k] = c0[k];
    c.coin = coin; c.fiyat = t[0]; c.funding = isFinite(t[2]) ? t[2] : undefined;
    // Önce ucuz kontrol: fiyat giriş bölgesinde değilse 15dk mum istenmez
    var g = DKC_HESAP.girisDurumu(c.plan, c.fiyat); if (!g || g.tur !== 'bolgede') return;
    // Çalışma süresi kotası: bir turda en fazla SINYAL_TUR_SINIRI bölgedeki plan için mum istenir (5 dk sonra sıradakiler)
    if (++bakilan > SINYAL_TUR_SINIRI) return;
    try { c.m15 = m15Gosterge(kokpitMum(coin, 'm15')); } catch (e) { c.m15 = null; }
    try { var h1 = h1Canli(coin, c.plan); if (h1) c.h1Canli = h1.durum; } catch (e) {}
    try { tfCanliUygula(c); } catch (e) {}
    var s = DKC_HESAP.sinyalSkoru(c, piyasa, ek);
    sayac.bolgede[coin] = 1; sayac.durum[coin] = s.veto || (s.eksik && s.eksik.length ? s.eksik.slice(0, 2).join('; ') : 'sınıf ' + s.sinif);
    if (s.sinif !== 'A+' && s.sinif !== 'A') return;
    sayac.sinyal[coin] = s.sinif;
    var imza = coin + '_' + s.yon + '_' + s.sinif;
    if (kayit[imza] && simdi - kayit[imza] < SINYAL_ARA_MS) return;
    if (stopSon[coin + '|' + s.yon] && simdi - stopSon[coin + '|' + s.yon] < STOP_BEKLEME_MS) return;
    var p = c.plan;
    var baslik = (s.sinif === 'A+' ? '🔥 ' : '⚡ ') + coin + ' ' + (s.yon === 'short' ? 'SHORT' : 'LONG') + ' sinyali' + (tarayici ? ' · tarayıcı' : '');
    var metin = (s.sinif === 'A+' ? 'Güçlü sinyal' : 'Sinyal') + ' · Skor ' + sinyalSayi(s.skor) + '/' + s.maks +
      ' · Giriş: ' + sinyalSayi(p.giris[0]) + '–' + sinyalSayi(p.giris[1]) + ' · Stop: ' + sinyalSayi(p.stop) + ' · TP1: ' + sinyalSayi(p.tp1);
    try { bildirimGonder(baslik, metin, url ? url + '#/coin/' + coin : ''); kayit[imza] = simdi; degisti = true; stopTakip[coin + '|' + s.yon] = { stop: p.stop, ts: simdi }; stopDegisti = true; if (tarayici) karneTarayiciEkle(c, s.sinif); else karneSinyal(karneAnahtari(c)); }
    catch (e) { hataBildir(e); }
    // Faz 2 botu (Bot.gs): BOT_MODU 'kapali' iken hiçbir şey yapmaz
    if (typeof botSinyal === 'function') { try { botSinyal(c, s); } catch (e) { hataBildir(e); } }
  });
  Object.keys(kayit).forEach(function (k) { if (!(simdi - kayit[k] <= SINYAL_SAKLA_MS)) { delete kayit[k]; degisti = true; } });
  if (degisti) props.setProperty('SINYAL_BILDIRILEN', JSON.stringify(kayit));
  try { props.setProperty('SINYAL_SAYAC', JSON.stringify(sayac)); } catch (e) {}
  if (stopDegisti) { props.setProperty('SINYAL_STOP', JSON.stringify(stopTakip)); props.setProperty('STOP_SON', JSON.stringify(stopSon)); }
}
var STOP_BEKLEME_MS = 12 * 3600000, STOP_TAKIP_MS = 48 * 3600000;
// Bildirilen sinyalin stopu görüldüyse (fiyat stopu geçti) coin+yön bekleme listesine alınır; 48 saatte sönen takip silinir.
function stopTakipGuncelle(takip, son, tick, simdi) {
  var degisti = false;
  Object.keys(takip).forEach(function (k) {
    var parca = k.split('|'), t = tick[parca[0] + '_USDT'], e = takip[k];
    if (t && isFinite(t[0]) && stopuGectiMi({ yon: parca[1], stop: e.stop }, t[0])) { son[k] = simdi; delete takip[k]; degisti = true; }
    else if (simdi - e.ts > STOP_TAKIP_MS) { delete takip[k]; degisti = true; }
  });
  Object.keys(son).forEach(function (k) { if (simdi - son[k] > STOP_BEKLEME_MS) { delete son[k]; degisti = true; } });
  return degisti;
}
function bildirimTest() { Logger.log(JSON.stringify(bildirimGonder('dKc', '✅ Test: bildirimler çalışıyor.'))); }

// ---------- dKc: uygulamadan alarm kurma (yazma) ----------
// Okuma anahtarı (PANEL_ANAHTAR) herkese açık sayfada durur; yazma için ayrıca cihaz eşleme gerekir.
// Eşleme: uygulama kod ister -> kod Burak Bey'in Telegram'ına gider -> kod girilince cihaza uzun bir anahtar verilir.
// Sunucuda anahtarın yalnızca özeti (SHA-256) saklanır.
var UYGULAMA_ALARM_SINIRI = 30;
var ESLEME_DENEME = 5;

function doPost(e) {
  var sonuc;
  try {
    var g = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var anahtar = PropertiesService.getScriptProperties().getProperty('PANEL_ANAHTAR');
    if (!anahtar || g.k !== anahtar) throw new Error('Yetkisiz');
    if (g.f === 'kodIste') sonuc = kodIste();
    else if (g.f === 'esles') sonuc = esles(g.kod, g.abone);
    else {
      if (!cihazYetkili(g.t)) throw new Error('Cihaz eşli değil');
      if (g.f === 'alarmEkle') sonuc = uygulamaAlarmEkle(g.coin, g.kosul, g.seviye, g.not);
      else if (g.f === 'alarmSil') sonuc = uygulamaAlarmSil(g.coin, g.kosul, g.seviye);
      else if (g.f === 'pozGetir') sonuc = pozGetir();
      else if (g.f === 'botDurum') sonuc = botDurum();   // Bot.gs: salt okunur takip ekranı verisi
      else if (g.f === 'pozIslem') sonuc = pozIslem(g.islemler);
      else if (g.f === 'cihaz') sonuc = { tamam: true };
      else throw new Error('Bilinmeyen istek');
    }
  } catch (err) { sonuc = { hata: String(err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(sonuc)).setMimeType(ContentService.MimeType.JSON);
}

function ozet256(metin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(metin), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function kodIste() {
  var cache = CacheService.getScriptCache();
  if (cache.get('esles-istek')) throw new Error('Yeni kod için 2 dakika bekleyin');
  var kod = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('esles-kod', JSON.stringify({ h: ozet256(kod), d: 0 }), 600);
  cache.put('esles-istek', '1', 120);
  telegramGonder('🔐 dKc eşleme kodu: ' + kod + '\n10 dakika geçerli. Bu kodu siz istemediyseniz kimseyle paylaşmayın.');
  return { tamam: true };
}
function esles(kod, abone) {
  var cache = CacheService.getScriptCache(), k = cache.get('esles-kod');
  if (!k) throw new Error('Kod süresi doldu, yeni kod isteyin');
  var o = JSON.parse(k);
  if (o.d >= ESLEME_DENEME) { cache.remove('esles-kod'); throw new Error('Çok fazla yanlış deneme, yeni kod isteyin'); }
  if (ozet256(String(kod || '').trim()) !== o.h) { o.d++; cache.put('esles-kod', JSON.stringify(o), 600); throw new Error('Kod yanlış'); }
  cache.remove('esles-kod');
  var p = PropertiesService.getScriptProperties();
  var anahtar = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var cihazlar = cihazListesi(); cihazlar.push({ h: ozet256(anahtar), t: zamanDamgasi() });
  p.setProperty('CIHAZLAR', JSON.stringify(cihazlar.slice(-15)));
  // Bildirimler yalnızca eşlenen cihazlara gitsin
  abone = String(abone || '').trim();
  if (/^[0-9a-f-]{36}$/i.test(abone)) {
    var alici = String(p.getProperty('ONESIGNAL_ALICI') || '').split(',').map(function (x) { return x.trim(); }).filter(String);
    if (alici.indexOf(abone) < 0) alici.push(abone);
    p.setProperty('ONESIGNAL_ALICI', alici.slice(-5).join(','));
  }
  return { t: anahtar, bildirim: /^[0-9a-f-]{36}$/i.test(abone) };
}
function cihazListesi() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('CIHAZLAR') || '[]'); } catch (e) { return []; }
}
function cihazYetkili(t) {
  if (!t || String(t).length < 32) return false;
  var h = ozet256(t);
  return cihazListesi().some(function (c) { return c.h === h; });
}
function seviyeSayi(v) { var n = Number(String(v).replace(/^'/, '').replace(',', '.')); return isFinite(n) && n > 0 ? n : null; }
function uygulamaAlarmEkle(coin, kosul, seviye, not) {
  coin = String(coin || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (coinListesi().indexOf(coin) < 0) throw new Error('Bu coin izlenmiyor');
  if (kosul !== 'altina' && kosul !== 'ustune') throw new Error('Koşul hatalı');
  var sv = seviyeSayi(seviye); if (sv == null) throw new Error('Seviye hatalı');
  not = String(not || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = tablo().getSheetByName(SEKME), son = sh.getLastRow();
    var satirlar = son >= 2 ? sh.getRange(2, 1, son - 1, BASLIK.length).getValues() : [];
    var benim = satirlar.filter(function (s) { return String(s[C.kaynak]).toLowerCase() === 'uygulama' && aktifMi(s[C.aktif]) && s[C.durum] !== 'TETIKLENDI'; });
    if (benim.length >= UYGULAMA_ALARM_SINIRI) throw new Error('En fazla ' + UYGULAMA_ALARM_SINIRI + ' alarm kurulabilir');
    if (benim.some(function (s) { return s[C.coin] === coin && normKosul(s[C.kosul]) === kosul && seviyeSayi(s[C.seviye]) === sv; })) return { tamam: true, zaten: true };
    var s = BASLIK.map(function () { return ''; });
    s[C.aktif] = 'evet'; s[C.kaynak] = 'uygulama'; s[C.coin] = coin; s[C.piyasa] = 'futures'; s[C.tur] = 'alarm'; s[C.kosul] = kosul; s[C.seviye] = "'" + sv; s[C.not] = not;
    sh.getRange(Math.max(son, 1) + 1, 1, 1, BASLIK.length).setValues([s]);
    return { tamam: true };
  } finally { lock.releaseLock(); }
}
function uygulamaAlarmSil(coin, kosul, seviye) {
  coin = String(coin || '').toUpperCase(); var sv = seviyeSayi(seviye);
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var sh = tablo().getSheetByName(SEKME), son = sh.getLastRow(), silinen = 0;
    if (son < 2) return { tamam: true, silinen: 0 };
    var satirlar = sh.getRange(2, 1, son - 1, BASLIK.length).getValues();
    // Alttan üste sil: satır numaraları kaymasın
    for (var i = satirlar.length - 1; i >= 0; i--) {
      var s = satirlar[i];
      if (String(s[C.kaynak]).toLowerCase() === 'uygulama' && s[C.coin] === coin && normKosul(s[C.kosul]) === kosul && seviyeSayi(s[C.seviye]) === sv) { sh.deleteRow(i + 2); silinen++; }
    }
    return { tamam: true, silinen: silinen };
  } finally { lock.releaseLock(); }
}

// ---------- dKc: İşlemlerim eşitleme (eşli cihazlar arasında) ----------
// Elle girilen işlemler ve sermaye Script Properties'te tek kayıt olarak durur; MEXC'ye bağlanmaz.
var POZ_SINIRI = 20;
function pozSayi(v, zorunlu) {
  if (v === null || v === undefined || v === '') { if (zorunlu) throw new Error('İşlem bilgisi hatalı'); return null; }
  var n = Number(v); if (!isFinite(n) || n <= 0) throw new Error('İşlem bilgisi hatalı'); return n;
}
function pozTemizle(liste) {
  if (!Array.isArray(liste)) throw new Error('İşlem listesi hatalı');
  if (liste.length > POZ_SINIRI) throw new Error('En fazla ' + POZ_SINIRI + ' işlem kaydedilebilir');
  var gorulen = {};
  return liste.map(function (p) {
    p = p || {};
    var coin = String(p.coin || '').toUpperCase();
    if (!/^[A-Z0-9]{1,15}$/.test(coin) || gorulen[coin]) throw new Error('İşlem bilgisi hatalı');
    gorulen[coin] = true;
    if (p.yon !== 'long' && p.yon !== 'short') throw new Error('İşlem bilgisi hatalı');
    var o = { coin: coin, yon: p.yon, giris: pozSayi(p.giris, true), buyukluk: pozSayi(p.buyukluk), kaldirac: pozSayi(p.kaldirac) || 1,
      stop: pozSayi(p.stop), hedef: pozSayi(p.hedef), zaman: Number(p.zaman) > 0 ? Math.floor(Number(p.zaman)) : Date.now() };
    if (o.kaldirac > 125) throw new Error('İşlem bilgisi hatalı');
    return o;
  });
}
function pozGetir() {
  var k; try { k = JSON.parse(PropertiesService.getScriptProperties().getProperty('POZISYONLAR') || 'null'); } catch (e) { k = null; }
  return k && Array.isArray(k.poz) ? k : { poz: [], sermaye: null, s: 0 };
}
// Değişiklikler tek tek gelir (kaydet / sil / sermaye / birleştir); eski bilgili bir cihaz tüm listeyi ezemez.
function pozIslem(islemler) {
  if (!Array.isArray(islemler) || !islemler.length || islemler.length > 50) throw new Error('İşlem listesi hatalı');
  var lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    var k = pozGetir(), poz = k.poz.slice(), sermaye = k.sermaye;
    var koy = function (p) { var y = pozTemizle([p])[0], i = -1; poz.forEach(function (x, n) { if (x.coin === y.coin) i = n; }); if (i < 0) poz.push(y); else if (y.zaman >= (poz[i].zaman || 0)) poz[i] = y; };
    islemler.forEach(function (o) {
      o = o || {};
      if (o.tur === 'kaydet') koy(o.p);
      else if (o.tur === 'sil') { var c = String(o.coin || '').toUpperCase(); poz = poz.filter(function (x) { return x.coin !== c; }); }
      else if (o.tur === 'sermaye') sermaye = o.deger == null || o.deger === '' ? null : pozSayi(o.deger);
      // Eşlemeden sonraki ilk açılış: cihazdaki işlemler eklenir, aynı coinde yenisi kalır; sunucuda sermaye varsa korunur
      else if (o.tur === 'birlestir') { pozTemizle(o.poz).forEach(koy); if (sermaye == null && o.sermaye != null && o.sermaye !== '') sermaye = pozSayi(o.sermaye); }
      else throw new Error('İşlem listesi hatalı');
    });
    if (poz.length > POZ_SINIRI) throw new Error('En fazla ' + POZ_SINIRI + ' işlem kaydedilebilir');
    var yeni = { poz: poz, sermaye: sermaye, s: Date.now() };
    PropertiesService.getScriptProperties().setProperty('POZISYONLAR', JSON.stringify(yeni));
    return yeni;
  } finally { lock.releaseLock(); }
}

if (typeof module !== 'undefined') module.exports = { kokpitPlanAlarmlari: kokpitPlanAlarmlari, mumOzet: mumOzet, alarmlariDegerlendir: alarmlariDegerlendir, csvSatirlari: csvSatirlari, C: C, BASLIK: BASLIK, sembol: sembol, planGecerli: planGecerli, analizOku: analizOku, logZamani: logZamani, cihazYetkili: cihazYetkili };

// ===================================================================================
// hesap.js KOPYASI (dkcburak/kripto-kokpit, 23 Eki: sıkışık piyasa filtresi, aynı yön sınırı; 21 Eki: tek yön pusulası, tek %3 risk tavanı, 5x-10x kaldıraç, 1S onayında bölge ortası): skor kuralları uygulamayla aynı kalsın diye değiştirmeden eklendi.
// hesap.js değişirse bu bölüm de aynen güncellenir. Global DKC_HESAP olarak gelir.
// ===================================================================================
// dKc saf hesaplar: ekrandan bağımsız, Node'da test edilebilir (test/hesap.test.js).
(function (kok) {
  'use strict';
  var RISK_TAVAN = 3; // açık işlemlerin toplam risk tavanı (long ve short birlikte), sermayenin %'si
  var KAL_MIN = 5, KAL_MAX = 10; // önerilen kaldıraç aralığı; likidasyon stopun en az 2 katı uzakta kalır
  var UCRET = 0.001;  // giriş+çıkış ücret ve kayma payı (temkinli, işlem değerinin %0,1'i; MEXC tarifesi doğrulanmalı)
  var ESKI_SAAT = 13; // bundan eski analizle "Girişe uygun" denmez (akşam 19:30 -> sabah 08:00 arası 12,5 saat)
  // Sıkışık piyasa (23 Eki denetimi): BTC 4S EMA20 ile EMA50 arası fiyatın %0,5'inden azsa trend yok sayılır, piyasa yönü verilmez.
  // 17-22 Eki'de girilen 13 planın 8'i bu eşiğin altında açıldı: 1 Hedef 1, 7 stop. Eşiğin üstünde: 2 Hedef 1, 3 stop.
  var PUSULA_MIN_FARK = 0.5;
  // Aynı yönde aynı anda en fazla bu kadar açık işlem varken yeni sinyal yok (20 Eki: 5 short birden = tek BTC bahsi x5).
  var AYNI_YON_SINIR = 2;

  function sayi(x) { return typeof x === 'number' && isFinite(x) && x > 0; }

  // Plan kurala uyuyor mu: long'da stop < giriş bölgesi < hedef, short'ta tersi
  function planGecerli(p) {
    if (!p || (p.yon !== 'long' && p.yon !== 'short')) return false;
    if (!Array.isArray(p.giris) || p.giris.length !== 2 || !sayi(p.giris[0]) || !sayi(p.giris[1])) return false;
    if (!sayi(p.stop) || !sayi(p.tp1) || (p.tp2 != null && !sayi(p.tp2))) return false;
    var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
    if (p.yon === 'long') return p.stop < alt && p.tp1 > ust && (p.tp2 == null || p.tp2 >= p.tp1);
    return p.stop > ust && p.tp1 < alt && (p.tp2 == null || p.tp2 <= p.tp1);
  }

  // Plan sınıfı: A = 1G ve 4S plan yönünde, B = 1G yatay + 4S plan yönünde, C = trend tersi.
  // Analiz sinif yazmışsa ve trendle çelişmiyorsa onu kullanır; risk A'da %1, B'de %0,5, C'de yayın yok.
  var AYNI = { long: 'yukari', short: 'asagi' }, TERS = { long: 'asagi', short: 'yukari' };
  function planSinif(c, piyasa) {
    var p = c && c.plan; if (!p) return null;
    var yy = AYNI[p.yon === 'short' ? 'short' : 'long'], tf = c.tf || {};
    var s = tf.h4 !== yy ? 'C' : tf.d === yy ? 'A' : tf.d === 'yatay' ? 'B' : 'C';
    if (s === 'A' && p.sinif === 'B') s = 'B';
    // Dominance planın tersine akıyorsa A planı B'ye iner (risk %0,5, girişte 1S onayı şart)
    if (s === 'A' && dominansEngeli(c.coin, p.yon, piyasa)) s = 'B';
    var tavan = s === 'A' ? 1 : s === 'B' ? 0.5 : 0;
    var risk = typeof p.riskYuzde === 'number' && p.riskYuzde > 0 ? Math.min(p.riskYuzde, tavan) : tavan;
    return { sinif: s, riskYuzde: risk };
  }

  // EMA serisinin son değeri (ilk n kapanışın ortalamasıyla başlar)
  function emaSon(kap, n) {
    if (kap.length < n) return null;
    var k = 2 / (n + 1), e = 0, i;
    for (i = 0; i < n; i++) e += kap[i];
    e /= n;
    for (i = n; i < kap.length; i++) e = kap[i] * k + e * (1 - k);
    return e;
  }
  // Tek trend tanımı (uygulama, sunucu, tarayıcı aynı): kapanmış mumlarda kapanış ve EMA20 EMA50'nin üstündeyse yukari,
  // ikisi de altındaysa asagi, aksi yatay. mumlar: [{ close }] eskiden yeniye. 50 mumdan azsa null.
  function trendEma(mumlar) {
    var kap = (mumlar || []).map(function (m) { return Number(m.close); }).filter(function (x) { return x > 0; });
    var e20 = emaSon(kap, 20), e50 = emaSon(kap, 50), c = kap[kap.length - 1];
    if (e20 == null || e50 == null) return null;
    // v2 (4 Kas 2026): fiyat iki EMA'nın da üstündeyse yukari, altındaysa asagi (hesap.js ile aynı)
    if (c > e50 && c > e20) return 'yukari';
    if (c < e50 && c < e20) return 'asagi';
    return 'yatay';
  }

  // Piyasa pusulası: aynı anda tek yön. piyasa.btcTf = { d, h4 } (BTC trendi), piyasa.dominans (USDT.D, BTC.D 4S).
  // BTC 1G ve 4S aynı yöndeyse yön odur. BTC yatay ya da karışıksa dominans karar verir:
  // USDT.D düşüyorsa long (BTC.D yükselmiyorsa), USDT.D yükseliyorsa short (BTC.D düşmüyorsa);
  // USDT.D yataysa BTC.D düşüşü long, yükselişi short. Kalan durumlarda yön yok (yeni plan verilmez).
  // piyasa.btcTf hiç yoksa kural uygulanmaz (null).
  var YON_AD = { long: 'LONG', short: 'SHORT' };
  function pusula(piyasa) {
    if (!piyasa || !piyasa.btcTf || typeof piyasa.btcTf !== 'object') return null;
    var b = piyasa.btcTf, dm = piyasa.dominans || {}, u = dm.usdt && dm.usdt.h4, bd = dm.btc && dm.btc.h4;
    var ad = { yukari: 'yukarı', asagi: 'aşağı', yatay: 'yatay' };
    // b.h4Fark: BTC 4S (EMA20 - EMA50) / fiyat, yüzde (sunucu canlı yazar). Sıkışıksa yön yok: trend sistemi yatay piyasada çalışmaz.
    if (typeof b.h4Fark === 'number' && isFinite(b.h4Fark) && Math.abs(b.h4Fark) < PUSULA_MIN_FARK) {
      return { yon: null, neden: 'BTC 4S sıkışık (EMA20-EMA50 %' + (Math.round(Math.abs(b.h4Fark) * 100) / 100).toString().replace('.', ',') + ' < %' + String(PUSULA_MIN_FARK).replace('.', ',') + ') · yeni plan yok', sikisik: true };
    }
    if (b.d && b.d === b.h4 && b.d !== 'yatay') return { yon: b.d === 'yukari' ? 'long' : 'short', neden: 'BTC 1G ve 4S ' + ad[b.d] };
    var btc = 'BTC ' + (b.d || b.h4 ? '1G ' + (ad[b.d] || '?') + ', 4S ' + (ad[b.h4] || '?') : 'trendi bilinmiyor');
    if (u === 'asagi') return bd === 'yukari' ? { yon: null, neden: btc + '; USDT.D düşüyor ama BTC.D yükseliyor' } : { yon: 'long', neden: btc + '; USDT.D düşüyor' };
    if (u === 'yukari') return bd === 'asagi' ? { yon: null, neden: btc + '; USDT.D yükseliyor ama BTC.D düşüyor' } : { yon: 'short', neden: btc + '; USDT.D yükseliyor' };
    if (bd === 'asagi') return { yon: 'long', neden: btc + '; BTC.D düşüyor' };
    if (bd === 'yukari') return { yon: 'short', neden: btc + '; BTC.D yükseliyor' };
    return { yon: null, neden: btc + '; dominans yatay' };
  }

  // Dominance engeli: piyasa.dominans = { btc: { deger, h4, d }, usdt: { deger, h4, d } } (h4/d: yukari|asagi|yatay).
  // USDT.D 4S yükselirken para stabil coine kaçar: long'a engel. USDT.D 4S düşerken short'a engel.
  // BTC.D 4S yükselirken altcoin long'a engel. Veri yoksa engel yok (null). Döner: neden metni ya da null.
  function dominansEngeli(coin, yon, piyasa) {
    var dm = piyasa && piyasa.dominans; if (!dm || typeof dm !== 'object') return null;
    var u = dm.usdt && dm.usdt.h4, b = dm.btc && dm.btc.h4, alt = String(coin || '').toUpperCase() !== 'BTC';
    if (yon === 'short') return u === 'asagi' ? 'USDT.D düşüyor (para piyasaya giriyor)' : null;
    if (u === 'yukari') return 'USDT.D yükseliyor (para stabil coine kaçıyor)';
    if (alt && b === 'yukari') return 'BTC.D yükseliyor (altcoin aleyhine)';
    return null;
  }

  // Canlı 1 saatlik onay. mumlar: 1S mumları {open, high, low, close}, en eskiden yeniye; son mum açık (yarım) sayılır.
  // onay: son 3 kapanmış mumdan biri giriş bölgesine değmiş, son kapanmış mum plan yönünde kapanmış ve kapanış
  // bölge ortasının hedef tarafında (Hedef 1'e varmadan). yok: son kapanış bölgenin stop tarafında. Aksi: bekliyor.
  // Bölge ortası şartı backtest'ten (21 Eki): ortanın trend tarafında kapanışla giriş, isabeti %32'den %53'e çıkardı.
  function h1Onay(mumlar, plan) {
    var o = { durum: 'bekliyor', sebep: '1S verisi yok' };
    if (!plan || !Array.isArray(mumlar) || mumlar.length < 4) return o;
    var kap = mumlar.slice(-4, -1).map(function (m) { return { o: Number(m.open), h: Number(m.high), l: Number(m.low), c: Number(m.close) }; });
    if (kap.some(function (m) { return !(sayi(m.o) && sayi(m.h) && sayi(m.l) && sayi(m.c)); })) return o;
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]), lng = plan.yon !== 'short';
    var son = kap[kap.length - 1];
    var degdi = kap.some(function (m) { return lng ? m.l <= ust : m.h >= alt; });
    if (lng ? son.c < alt : son.c > ust) return { durum: 'yok', sebep: '1S kapanış bölgenin ' + (lng ? 'altında' : 'üstünde') };
    if (!degdi) return { durum: 'bekliyor', sebep: '1S mum bölgeye değmedi' };
    if (lng ? son.c >= plan.tp1 : son.c <= plan.tp1) return { durum: 'bekliyor', sebep: 'fiyat Hedef 1\'e vardı' };
    if (lng ? son.c <= (alt + ust) / 2 : son.c >= (alt + ust) / 2) return { durum: 'bekliyor', sebep: '1S kapanış bölge ortasını geçmedi' };
    if (lng ? son.c > son.o : son.c < son.o) return { durum: 'onay', sebep: '1S mum bölgeden ' + (lng ? 'yukarı' : 'aşağı') + ' kapandı' };
    return { durum: 'bekliyor', sebep: '1S mum ' + (lng ? 'yukarı' : 'aşağı') + ' kapanmadı' };
  }

  // "12 Eki 08:00" -> kaç saat önce (yıl yazılmadığı için ileri tarih bir önceki yıl sayılır). Okunamazsa null.
  var AYLAR = { oca: 0, şub: 1, sub: 1, mar: 2, nis: 3, may: 4, haz: 5, tem: 6, ağu: 7, agu: 7, eyl: 8, eki: 9, kas: 10, ara: 11 };
  function analizYasi(metin, simdi) {
    var m = /(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]{3})[A-Za-zÇĞİÖŞÜçğıöşü]*\s+(\d{1,2})[:.](\d{2})/.exec(String(metin || ''));
    if (!m) return null;
    var ay = AYLAR[m[2].toLocaleLowerCase('tr')]; if (ay == null) return null;
    var n = new Date(simdi || Date.now()), y = n.getFullYear();
    var t = new Date(y, ay, +m[1], +m[3], +m[4]);
    if (t - n > 36e5 * 24) t = new Date(y - 1, ay, +m[1], +m[3], +m[4]);
    return (n - t) / 36e5;
  }

  // Plan hesapları (riskYuzde varsayılan %1, önerilen kaldıraç 5x-10x). r1Net: ücret ve kayma payı düşülmüş Hedef 1 kazanç/risk. Funding dahil değil.
  function planHesap(p, riskYuzde) {
    var giris = (p.giris[0] + p.giris[1]) / 2, risk = Math.abs(giris - p.stop), stopYuzde = risk / giris;
    var r1 = Math.abs(p.tp1 - giris) / risk, r2 = p.tp2 ? Math.abs(p.tp2 - giris) / risk : null;
    var u = UCRET * giris, r1Net = (Math.abs(p.tp1 - giris) - u) / (risk + u);
    var ry = typeof riskYuzde === 'number' && riskYuzde > 0 ? riskYuzde : 1;
    var poz = ry / 100 / stopYuzde * 100;
    // Gereken kaldıraç = pozisyon / sermaye; önerilen 5x-10x arası, likidasyon stopun en az 2 katı uzakta kalacak kadar
    var maxKal = Math.min(KAL_MAX, Math.floor(1 / (2 * stopYuzde)));
    var gerekli = Math.max(1, Math.ceil(poz / 100));
    var kal = Math.max(1, Math.min(maxKal, Math.max(KAL_MIN, gerekli)));
    return { giris: giris, stopYuzde: stopYuzde * 100, r1: r1, r1Net: r1Net, r2: r2, poz: poz, riskYuzde: ry, kal: kal, kalUygun: gerekli <= maxKal, maxKal: maxKal, gerekli: gerekli };
  }

  // Fiyatın giriş bölgesine göre yeri. tur: 'uzak' (girişe gelmedi) | 'bolgede' | 'gecti' (bölgenin stop tarafında)
  function girisDurumu(plan, fiyat) {
    if (!plan || !sayi(fiyat)) return null;
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]), lng = plan.yon !== 'short';
    var stopa = Math.abs(fiyat - plan.stop) / fiyat * 100;
    if (fiyat >= alt && fiyat <= ust) return { tur: 'bolgede', stopa: stopa };
    if (lng ? fiyat > ust : fiyat < alt) return { tur: 'uzak', girise: Math.abs(fiyat - (lng ? ust : alt)) / fiyat * 100, stopa: stopa };
    return { tur: 'gecti', stopa: stopa };
  }

  // Giriş kararı (trafik ışığı). Emir değildir; planın koşul durumunu söyler.
  // yesil: teknik + temel + fiyat bölgede tamam. sari: plan var, bir koşul eksik. kirmizi: plan yok/geçersiz.
  // ek.analizSaat: analizin yaşı (saat); 12 saatten eskiyse yeşil yanmaz.
  // ek.acikYon: { long: adet, short: adet } açık işlemler; ters yönde açık işlem varken plan kırmızıdır.
  // Kırmızı + engel: piyasa pusulasına ters, açık işleme ters ya da trend tersi (C) plan; ekranda ve bildirimde gösterilmez.
  function karar(c, piyasa, ek) {
    var p = c && c.plan, o = { renk: 'kirmizi', ad: 'Uzak dur', eksik: [], teknik: false, temel: false, fiyat: false, g: null };
    if (!c) return o;
    if (c.planHatali) { o.neden = 'Plan verisi hatalı'; return o; }
    if (!p) { o.neden = c.durum === 'uzak' ? 'Analiz: uzak dur' : 'İşlem planı yok'; return o; }
    var yon = p.yon === 'short' ? 'short' : 'long', tf = c.tf || {}, g = girisDurumu(p, c.fiyat);
    var sn = planSinif(c, piyasa), h = planHesap(p, sn.riskYuzde);
    o.yon = yon; o.g = g; o.sinif = sn.sinif; o.riskYuzde = sn.riskYuzde; o.h = h;
    o.dominans = dominansEngeli(c.coin, yon, piyasa);
    // 1S: sunucunun canlı hesapladığı değer (c.h1Canli) analizdeki sabit değerin önüne geçer
    var h1 = c.h1Canli || tf.h1; o.h1 = h1;
    if (c.durum === 'uzak') { o.neden = 'Analiz: uzak dur'; return o; }
    if (g && g.tur === 'gecti' && (yon === 'short' ? c.fiyat >= p.stop : c.fiyat <= p.stop)) { o.neden = 'Fiyat stopun ötesinde · plan geçersiz'; return o; }
    // Tek yön kuralı: trend tersi plan, piyasa yönüne ters plan ve açık işleme ters plan yok
    var pu = pusula(piyasa), ters = yon === 'long' ? 'short' : 'long'; o.pusula = pu;
    if (sn.sinif === 'C') { o.neden = 'Trend plan yönünde değil · plan yok'; o.engel = true; return o; }
    if (pu && pu.yon !== yon) { o.neden = pu.yon ? 'Piyasa yönü ' + YON_AD[pu.yon] + ' · ' + YON_AD[yon] + ' plan yok' : 'Piyasa yönü belirsiz · yeni plan yok'; o.engel = true; return o; }
    if (ek && ek.acikYon && ek.acikYon[ters] > 0) { o.neden = 'Açık ' + YON_AD[ters] + ' işleminiz var · ters plan yok'; o.engel = true; return o; }
    // Teknik
    var tek = [];
    if (c.durum !== yon) tek.push('analiz onayı yok');
    if (tf.d === TERS[yon]) tek.push('1G ters yönde');
    if (tf.h4 === TERS[yon]) tek.push('4S ters yönde');
    else if (tf.h4 !== AYNI[yon]) tek.push('4S plan yönünde değil');
    if (sn.sinif === 'B' ? h1 !== 'onay' : h1 !== 'onay' && h1 !== AYNI[yon]) tek.push('1S onayı yok');
    if (h.r1Net < 1.5 - 1e-9) tek.push('ücret sonrası kazanç/risk ' + (Math.floor(h.r1Net * 100) / 100).toFixed(2).replace('.', ',') + ' (en az 1,5)');
    if (!h.kalUygun) tek.push(KAL_MAX + 'x sınırında stop çok yakın');
    if (ek && typeof ek.analizSaat === 'number' && ek.analizSaat > ESKI_SAAT) tek.push('analiz ' + Math.floor(ek.analizSaat) + ' saat önce');
    if (ek && ek.acikYon && ek.acikYon[yon] >= AYNI_YON_SINIR) tek.push('aynı yönde ' + ek.acikYon[yon] + ' açık işlem var (sınır ' + AYNI_YON_SINIR + ')');
    // Temel
    var tem = [], tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu';
    (c.haberler || []).forEach(function (h) { if (h && h.etki === 'Yüksek' && h.yon === tersHaber && tem.indexOf('ters yönde önemli haber') < 0) tem.push('ters yönde önemli haber'); });
    if (yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') tem.push('piyasa riskten kaçışta');
    if (yon === 'short' && piyasa && piyasa.mod === 'Risk açık') tem.push('piyasa risk iştahında');
    if (typeof c.funding === 'number' && (yon === 'short' ? c.funding <= -0.0003 : c.funding >= 0.001)) tem.push('funding ' + (yon === 'short' ? 'belirgin negatif' : 'çok yüksek'));
    // Fiyat
    var fiy = [];
    if (!g) fiy.push('fiyat yok');
    else if (g.tur === 'uzak') fiy.push('girişe %' + (Math.round(g.girise * 10) / 10).toString().replace('.', ',') + ' kaldı');
    else if (g.tur === 'gecti') fiy.push('fiyat bölgenin ' + (yon === 'short' ? 'üstünde' : 'altında'));
    o.teknik = !tek.length; o.temel = !tem.length; o.fiyat = !fiy.length;
    o.eksik = fiy.concat(tek, tem); o.eksikTeknik = tek; o.eksikTemel = tem; o.eksikFiyat = fiy;
    if (!o.eksik.length) { o.renk = 'yesil'; o.ad = 'Girişe uygun'; }
    else { o.renk = 'sari'; o.ad = 'Bekle'; }
    return o;
  }

  // Elle girilen pozisyon: kâr/zarar, stopa/hedefe uzaklık, risk, yaklaşık likidasyon (izole, bakım marjı ~%0,5)
  function pozisyonHesap(poz, fiyat, sermaye) {
    var yon = poz.yon === 'short' ? -1 : 1, deg = sayi(fiyat) ? (fiyat - poz.giris) / poz.giris * yon : 0;
    var kal = sayi(poz.kaldirac) ? poz.kaldirac : 1;
    var o = { hareket: deg * 100, kz: sayi(poz.buyukluk) ? poz.buyukluk * deg : null, kaldirac: kal };
    o.likidasyon = poz.giris * (1 - yon / kal + yon * 0.005);
    if (sayi(poz.stop)) {
      var stopMesafe = Math.abs(poz.giris - poz.stop) / poz.giris;
      o.stopa = sayi(fiyat) ? (fiyat - poz.stop) / fiyat * 100 * yon : null;
      o.r = stopMesafe ? deg / stopMesafe : null;
      o.risk = sayi(poz.buyukluk) ? poz.buyukluk * stopMesafe : null;
      o.riskYuzde = o.risk != null && sayi(sermaye) ? o.risk / sermaye * 100 : null;
    }
    if (sayi(poz.hedef) && sayi(fiyat)) o.hedefe = (poz.hedef - fiyat) / fiyat * 100 * yon;
    return o;
  }

  // Tavan tektir: long ve short birlikte en fazla RISK_TAVAN. yuzde: toplam, yonler: {long, short} (bilgi).
  function toplamRisk(pozlar, fiyatlar, sermaye) {
    var t = 0, bilinmeyen = 0, y = { long: 0, short: 0 };
    pozlar.forEach(function (p) { var h = pozisyonHesap(p, fiyatlar[p.coin], sermaye); if (h.riskYuzde == null) bilinmeyen++; else { t += h.riskYuzde; y[p.yon === 'short' ? 'short' : 'long'] += h.riskYuzde; } });
    return { yuzde: t, yonler: y, tavan: RISK_TAVAN, asildi: t > RISK_TAVAN + 1e-9, bilinmeyen: bilinmeyen };
  }

  // Sunucudan gelen tek coini kontrol eder; bozuk alanı temizler, sayfanın geri kalanını korur
  var DURUMLAR = { long: 1, short: 1, bekle: 1, uzak: 1 };
  function coinTemizle(c) {
    if (!c || typeof c.coin !== 'string' || !c.coin) return null;
    var o = {}; for (var k in c) o[k] = c[k];
    if (!DURUMLAR[o.durum]) o.durum = 'bekle';
    if (o.plan != null && !planGecerli(o.plan)) { o.plan = null; o.planHatali = true; if (o.durum === 'long' || o.durum === 'short') o.durum = 'bekle'; o.islemYok = 'Plan verisi hatalı geldi; bu coin için plan gösterilmiyor.'; }
    if (!sayi(o.fiyat)) o.fiyat = null;
    if (typeof o.deg24 !== 'number' || !isFinite(o.deg24)) o.deg24 = null;
    o.cizim = o.cizim && typeof o.cizim === 'object' ? o.cizim : {};
    o.haberler = Array.isArray(o.haberler) ? o.haberler : [];
    o.tf = o.tf && typeof o.tf === 'object' ? o.tf : {};
    return o;
  }
  // Wilder RSI: kapanış listesi -> aynı uzunlukta liste (ilk n eleman null)
  function rsiSeri(kapanis, n) {
    var out = kapanis.map(function () { return null; }), g = 0, l = 0;
    for (var i = 1; i < kapanis.length; i++) {
      var d = kapanis[i] - kapanis[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
      if (i <= n) { g += up; l += dn; if (i < n) continue; g /= n; l /= n; }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  // Türev verisi (Binance açık verisi): açık pozisyon (OI) 24s değişimi, long/short hesap oranı, funding ve kısa okuma.
  // Bilgi amaçlıdır; "Girişe uygun" kararına girmez. Binance, MEXC'teki pozisyonları göstermez.
  function turevHesap(oiHist, ls, pi, deg24) {
    if (!Array.isArray(oiHist) || oiHist.length < 2) return null;
    var seri = oiHist.map(function (x) { return Number(x.sumOpenInterestValue); }).filter(function (x) { return x > 0; });
    if (seri.length < 2) return null;
    var son = seri[seri.length - 1], oiDeg = (son / seri[0] - 1) * 100;
    var oran = ls && ls[0] ? Number(ls[0].longShortRatio) : null, fon = pi && pi.lastFundingRate != null ? Number(pi.lastFundingRate) : null;
    var o = { oi: son, oiDeg24: oiDeg, seri: seri, ls: isFinite(oran) ? oran : null, longYuzde: isFinite(oran) && oran > 0 ? oran / (1 + oran) * 100 : null, funding: isFinite(fon) ? fon : null, okuma: [] };
    var d = typeof deg24 === 'number' && isFinite(deg24) ? deg24 : 0, fy = d > 1 ? 1 : d < -1 ? -1 : 0, oy = oiDeg > 2 ? 1 : oiDeg < -2 ? -1 : 0;
    if (!oy) o.okuma.push('Açık pozisyon yatay: hareket yeni para getirmiyor.');
    else if (fy > 0) o.okuma.push(oy > 0 ? 'Fiyat ve açık pozisyon birlikte artıyor: yeni long girişi yükselişi destekliyor.' : 'Fiyat artarken açık pozisyon düşüyor: yükseliş short kapanışından geliyor, zayıf olabilir.');
    else if (fy < 0) o.okuma.push(oy > 0 ? 'Fiyat düşerken açık pozisyon artıyor: yeni short girişi düşüşü destekliyor.' : 'Fiyat ve açık pozisyon birlikte düşüyor: long kapanışı ve likidasyon; satış baskısı azalabilir.');
    else o.okuma.push(oy > 0 ? 'Fiyat yatayken açık pozisyon artıyor: sert bir kırılma için birikim var.' : 'Fiyat yatayken açık pozisyon azalıyor: pozisyonlar kapanıyor, piyasa sakinleşiyor.');
    if (o.ls != null && o.ls >= 2.5) o.okuma.push('Hesapların çoğu long: kalabalık taraf long, aşağı sert iğne riski var.');
    else if (o.ls != null && o.ls <= 0.8) o.okuma.push('Hesapların çoğu short: short sıkışması (yukarı sert hareket) riski var.');
    if (o.funding != null && o.funding >= 0.0005) o.okuma.push('Funding yüksek: long tutmanın maliyeti arttı.');
    else if (o.funding != null && o.funding <= -0.0003) o.okuma.push('Funding belirgin negatif: short tutmanın maliyeti arttı.');
    return o;
  }
  // Tahmini likidasyon kümeleri (bilgi amaçlı; karara girmez).
  // Her saatte açık pozisyon artışı yeni pozisyon sayılır; o saatin ortalama fiyatından,
  // long/short hesap oranına göre bölünüp 10/25/50/100x kaldıraçta likidasyon fiyatı hesaplanır.
  // Pozisyon azalınca tüm kümeler orantılı küçülür; fiyat bir kümeye değdiyse o küme silinir.
  var LIK_KALDIRAC = [[10, 0.35], [25, 0.3], [50, 0.2], [100, 0.15]], LIK_MM = 0.005;
  function likidasyonHesap(oiHist, mumlar, lsHist, fiyat) {
    if (!Array.isArray(oiHist) || !Array.isArray(mumlar) || oiHist.length < 3 || mumlar.length < 3) return null;
    var mumSaat = {}, oran = {};
    mumlar.forEach(function (m) { mumSaat[Number(m[0])] = { h: Number(m[2]), l: Number(m[3]), o: (Number(m[2]) + Number(m[3]) + Number(m[4])) / 3 }; });
    (lsHist || []).forEach(function (x) { var r = Number(x.longShortRatio); if (r > 0) oran[Number(x.timestamp)] = r / (1 + r); });
    var kume = [], onceki = null, sonOran = 0.5, sonT = 0;
    oiHist.forEach(function (x) {
      var t = Number(x.timestamp), v = Number(x.sumOpenInterestValue), m = mumSaat[t - 3600000] || mumSaat[t];
      if (oran[t] != null) sonOran = oran[t];
      if (!(v > 0)) return;
      if (m) kume.forEach(function (k) { if (k.yon === 'long' ? m.l <= k.p : m.h >= k.p) k.v = 0; });
      if (onceki != null && m) {
        if (v > onceki) {
          var yeni = v - onceki;
          LIK_KALDIRAC.forEach(function (lk) {
            kume.push({ p: m.o * (1 - 1 / lk[0] + LIK_MM), v: yeni * sonOran * lk[1], yon: 'long' });
            kume.push({ p: m.o * (1 + 1 / lk[0] - LIK_MM), v: yeni * (1 - sonOran) * lk[1], yon: 'short' });
          });
        } else { var o = v / onceki; kume.forEach(function (k) { k.v *= o; }); }
      }
      onceki = v; sonT = t;
    });
    // son açık pozisyon kaydından sonraki mumlar da kümeleri siler
    mumlar.forEach(function (m) { if (Number(m[0]) >= sonT) kume.forEach(function (k) { if (k.yon === 'long' ? Number(m[3]) <= k.p : Number(m[2]) >= k.p) k.v = 0; }); });
    var son = mumlar[mumlar.length - 1];
    var f = Number(fiyat) > 0 ? Number(fiyat) : Number(son[4]);
    kume = kume.filter(function (k) { return k.v > 0 && (k.yon === 'long' ? k.p < f : k.p > f); });
    if (!kume.length) return null;
    // Özet: fiyatın %0,5'lik dilimlerinde en yoğun küme, üstte (short likidasyonu) ve altta (long likidasyonu)
    var dilim = {}, en = { ust: null, alt: null };
    kume.forEach(function (k) { var d = Math.round(Math.log(k.p / f) / Math.log(1.005)); dilim[d] = (dilim[d] || 0) + k.v; });
    Object.keys(dilim).forEach(function (d) {
      d = Number(d); if (!d || Math.abs(d) > 30) return;
      var yer = d > 0 ? 'ust' : 'alt', p = f * Math.pow(1.005, d);
      if (!en[yer] || dilim[d] > en[yer].v) en[yer] = { p: p, v: dilim[d], uzak: (p / f - 1) * 100 };
    });
    return { kume: kume, fiyat: f, ust: en.ust, alt: en.alt };
  }
  // Grafik şeridi için: lo–hi aralığını n dilime böler, her dilimdeki tahmini tutar
  function likidasyonDilim(kume, lo, hi, n) {
    var d = []; for (var i = 0; i < n; i++) d.push(0);
    if (!(hi > lo) || !kume) return d;
    kume.forEach(function (k) { if (k.p < lo || k.p >= hi) return; d[Math.floor((k.p - lo) / (hi - lo) * n)] += k.v; });
    return d;
  }
  var BINANCE_AD = { PEPE: '1000PEPE', SHIB: '1000SHIB', BONK: '1000BONK', FLOKI: '1000FLOKI', SATS: '1000SATS', LUNC: '1000LUNC', XEC: '1000XEC', RATS: '1000RATS', CAT: '1000CAT' };
  function binanceSembol(coin) { return (BINANCE_AD[coin] || coin) + 'USDT'; }
  function guvenliUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }

  // ---- AĞIRLIKLI CONFLUENCE SKORU (Faz 1) ----
  // Mevcut karar() AND mantığını bozmaz; paralel çalışır.
  // Amaç: sinyal kalitesini puanlamak, eşik üstünde "sinyal var" demek.
  // Veto (skor 0): plan hatalı, analiz "uzak dur", fiyat stop ötesinde, 4S ters, plan sınıfı C (yayın yok), piyasa pusulasına ya da açık işleme ters yön.
  // Tavan (en fazla B): analiz 12 saatten eski, 10x sınırında stop çok yakın, fiyat bölgenin stop tarafında,
  // B sınıfı planda 1S onayı yok (karar() ile aynı kural).
  // Funding verisi yoksa funding puanı verilmez. 15m verisi (c.m15) henüz sunucudan gelmiyor.
  var SKOR_AGIRLIK = {
    h4: 3, d: 2, h1: 2, m15: 2, rr: 2, funding: 1, haber: 2, rejim: 1, fiyat: 2
  };
  var SKOR_MAX = 17;
  var SKOR_ESIK = { A_PLUS: 14, A: 11, B: 8 };
  // Haber sentiment ağırlığı (sinyalSkoruHaber içinde kullanılır)
  var HABER_AGIRLIK = 2;

  function m15Zamanlama(m15, yon) {
    if (!m15 || typeof m15.rsi !== 'number') return { puan: 0, maks: 3, sebep: '15m verisi yok' };
    var puan = 0, sebepler = [];
    if (yon === 'long') {
      if (m15.rsi >= 40 && m15.rsi <= 65) { puan += 1; sebepler.push('15m RSI uygun'); }
      else if (m15.rsi > 75) sebepler.push('15m RSI aşırı alım');
      else if (m15.rsi < 30) sebepler.push('15m RSI aşırı satım');
    } else {
      if (m15.rsi >= 35 && m15.rsi <= 60) { puan += 1; sebepler.push('15m RSI uygun'); }
      else if (m15.rsi < 25) sebepler.push('15m RSI aşırı satım');
      else if (m15.rsi > 70) sebepler.push('15m RSI aşırı alım');
    }
    if (m15.ema9 && m15.ema21) {
      var emaUygun = yon === 'long' ? m15.ema9 > m15.ema21 : m15.ema9 < m15.ema21;
      if (emaUygun) { puan += 1; sebepler.push('15m EMA hizası uygun'); }
      else sebepler.push('15m EMA ters');
    }
    if (m15.hacim && m15.hacimOrt && m15.hacim > m15.hacimOrt * 1.1) { puan += 1; sebepler.push('15m hacim onaylı'); }
    else if (m15.hacim && m15.hacimOrt && m15.hacim < m15.hacimOrt * 0.7) sebepler.push('15m hacim zayıf');
    return { puan: Math.min(3, puan), maks: 3, sebep: sebepler.join(', ') };
  }

  // ---- HABER SENTIMENT SKORU (Faz 1) ----
  // Her haberi -1 / 0 / +1 olarak puanlar. Toplam: -3 ile +3 arası.
  // Etki: Yüksek = 1.0, Orta = 0.5, Düşük = 0.2
  // Tazelik: 0-6 saat = 1.0, 6-24 saat = 0.7, 24-48 saat = 0.4, >48 saat = 0 (sayılmaz)
  // Yön: Olumlu = +1, Olumsuz = -1, Nötr = 0
  // Haber verisi: { yon: 'Olumlu'|'Olumsuz'|'Nötr', etki: 'Yüksek'|'Orta'|'Düşük', saat: kaç saat önce }
  // saat yoksa analizdeki zaman metninden ("16 Eki 09:34") hesaplanır; o da okunamazsa haber tam sayılır.
  var HABER_ETKI = { 'Yüksek': 1.0, 'Orta': 0.5, 'Düşük': 0.2 };
  var HABER_YON = { 'Olumlu': 1, 'Olumsuz': -1, 'Nötr': 0 };

  function haberTazelik(saat) {
    if (typeof saat !== 'number' || !isFinite(saat) || saat < 0) return 1.0; // bilinmiyorsa tam say
    if (saat <= 6) return 1.0;
    if (saat <= 24) return 0.7;
    if (saat <= 48) return 0.4;
    return 0; // 48 saatten eski haber sayılmaz
  }

  // Haberleri puanla. Dönüş: { skor, sinyalYon, sayi, etkili, detay[] }
  // skor: sinyal yönüne göre; pozitif = destekliyor, negatif = ters. simdi: test için (ms)
  function haberSentiment(haberler, sinyalYon, simdi) {
    var o = { skor: 0, sinyalYon: sinyalYon === 'short' ? 'short' : 'long', sayi: 0, etkili: 0, detay: [] };
    if (!Array.isArray(haberler) || !haberler.length) return o;
    var yonIsaret = o.sinyalYon === 'short' ? -1 : 1; // short'ta olumsuz haber destek sayılır
    haberler.forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      o.sayi++;
      var etki = HABER_ETKI[h.etki];
      if (etki == null) etki = 0.3; // bilinmeyen etki varsayılan
      var yon = HABER_YON[h.yon];
      if (yon == null) yon = 0;
      var saat = typeof h.saat === 'number' ? h.saat : analizYasi(h.zaman, simdi);
      var tazelik = haberTazelik(saat);
      if (tazelik === 0) { o.detay.push({ yon: h.yon, etki: h.etki, saat: saat, puan: 0, not: '48 saatten eski, sayılmadı' }); return; }
      var puan = yon * etki * tazelik * yonIsaret;
      o.skor += puan;
      if (Math.abs(puan) > 0.3) o.etkili++;
      o.detay.push({ yon: h.yon, etki: h.etki, saat: saat, puan: Math.round(puan * 100) / 100 });
    });
    // -3 ile +3 arasına sıkıştır
    o.skor = Math.round(Math.max(-3, Math.min(3, o.skor)) * 100) / 100;
    return o;
  }

  function sinyalSkoru(c, piyasa, ek) {
    var o = { skor: 0, maks: SKOR_MAX, sinif: 'yok', yon: null, renk: 'kirmizi', ad: 'Sinyal yok', veto: null, eksik: [], detay: {} };
    if (!c || !c.plan) { o.eksik.push(c && c.planHatali ? 'plan verisi hatalı' : 'plan yok'); return o; }
    if (!planGecerli(c.plan)) { o.veto = 'Plan verisi hatalı'; o.eksik.push(o.veto); return o; }
    var k = karar(c, piyasa, ek);
    o.yon = k.yon || (c.plan.yon === 'short' ? 'short' : 'long');
    o.detay.karar = k;
    if (k.neden && k.neden.indexOf('stopun ötesinde') >= 0) { o.veto = 'Fiyat stopun ötesinde'; o.eksik.push(o.veto); return o; }
    if (c.durum === 'uzak') { o.veto = 'Analiz: uzak dur'; o.eksik.push(o.veto); return o; }
    var yon = o.yon, tf = c.tf || {};
    if (tf.h4 === TERS[yon]) { o.veto = '4S ters yönde'; o.eksik.push(o.veto); return o; }
    if (k.sinif === 'C') { o.veto = 'Plan sınıfı C (trend tersi) · yayın yok'; o.eksik.push(o.veto); return o; }
    if (k.engel) { o.veto = k.neden; o.eksik.push(o.veto); return o; }
    var skor = 0;
    if (tf.h4 === AYNI[yon]) skor += SKOR_AGIRLIK.h4; else o.eksik.push('4S plan yönünde değil');
    o.detay.h4 = tf.h4;
    if (tf.d === AYNI[yon]) skor += SKOR_AGIRLIK.d;
    else if (tf.d === 'yatay') skor += SKOR_AGIRLIK.d * 0.5;
    else o.eksik.push('1G ters');
    o.detay.d = tf.d;
    var h1 = k.h1 || tf.h1;
    if (h1 === 'onay' || (k.sinif !== 'B' && h1 === AYNI[yon])) skor += SKOR_AGIRLIK.h1; else o.eksik.push('1S onay yok');
    o.detay.h1 = h1;
    var m15 = m15Zamanlama(c.m15, yon);
    skor += m15.puan * (SKOR_AGIRLIK.m15 / 3);
    o.detay.m15 = m15;
    if (m15.puan < 2) o.eksik.push('15m zamanlama zayıf: ' + m15.sebep);
    var h = k.h || planHesap(c.plan, (planSinif(c) || {}).riskYuzde);
    if (h.r1Net >= 1.5 - 1e-9) skor += SKOR_AGIRLIK.rr; else o.eksik.push('R:R ' + (Math.floor(h.r1Net * 100) / 100).toFixed(2).replace('.', ',') + ' (< 1,5)');
    o.detay.rr = h.r1Net;
    if (typeof c.funding === 'number') {
      var fundingOk = yon === 'short' ? c.funding > -0.0003 : c.funding < 0.001;
      if (fundingOk) skor += SKOR_AGIRLIK.funding; else o.eksik.push('funding aşırı');
    } else o.eksik.push('funding verisi yok');
    o.detay.funding = c.funding;
    var tersHaber = yon === 'long' ? 'Olumsuz' : 'Olumlu', haberTemiz = true;
    (c.haberler || []).forEach(function (hb) { if (hb && hb.etki === 'Yüksek' && hb.yon === tersHaber) haberTemiz = false; });
    if (haberTemiz) skor += SKOR_AGIRLIK.haber; else o.eksik.push('ters yönde yüksek haber');
    o.detay.haber = haberTemiz;
    var rejimOk = !(yon === 'long' && piyasa && piyasa.mod === 'Riskten kaçış') && !(yon === 'short' && piyasa && piyasa.mod === 'Risk açık');
    if (rejimOk && k.dominans) { rejimOk = false; o.eksik.push('dominance ters: ' + k.dominans); }
    else if (!rejimOk) o.eksik.push('piyasa rejimi ters');
    if (rejimOk) skor += SKOR_AGIRLIK.rejim;
    o.detay.rejim = piyasa && piyasa.mod;
    var g = k.g;
    if (g && g.tur === 'bolgede') skor += SKOR_AGIRLIK.fiyat;
    else if (g && g.tur === 'uzak') o.eksik.push('fiyat girişe uzak (%' + (Math.round(g.girise * 10) / 10).toString().replace('.', ',') + ')');
    else if (g && g.tur === 'gecti') o.eksik.push('fiyat bölgenin ' + (yon === 'short' ? 'üstünde' : 'altında'));
    else o.eksik.push('fiyat yok');
    o.detay.fiyat = g && g.tur;
    o.skor = Math.round(skor * 10) / 10;
    var tavanB = false;
    if (ek && typeof ek.analizSaat === 'number' && ek.analizSaat > ESKI_SAAT) { tavanB = true; o.eksik.push('analiz ' + Math.floor(ek.analizSaat) + ' saat önce'); }
    if (!h.kalUygun) { tavanB = true; o.eksik.push(KAL_MAX + 'x sınırında stop çok yakın'); }
    if (g && g.tur === 'gecti') tavanB = true;
    if (k.sinif === 'B' && h1 !== 'onay') tavanB = true;
    // Tek kural: ekrandaki trafik ışığı yeşil değilse skor da sinyal (A/A+) vermez; bildirim ile ekran aynı şeyi söyler
    if (k.renk !== 'yesil') tavanB = true;
    if (o.skor >= SKOR_ESIK.A_PLUS && !tavanB) { o.sinif = 'A+'; o.renk = 'yesil'; o.ad = 'Güçlü ' + (yon === 'long' ? 'LONG' : 'SHORT'); }
    else if (o.skor >= SKOR_ESIK.A && !tavanB) { o.sinif = 'A'; o.renk = 'yesil'; o.ad = (yon === 'long' ? 'LONG' : 'SHORT') + ' sinyali'; }
    else if (o.skor >= SKOR_ESIK.B) { o.sinif = 'B'; o.renk = 'sari'; o.ad = 'Zayıf sinyal · bekle'; }
    else { o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Sinyal yok'; }
    return o;
  }

  // ---- ATR BAZLI DİNAMİK STOP/TP (Faz 1) ----
  // Amaç: volatilite değişince stop/TP'yi uyarla. Analizin stop'u TAVAN/TABAN'dır;
  // ATR stop'u analizin stop'undan geniş olamaz, yalnızca daraltabilir.
  // Daraltılmış plan da kurala uymalı: stop giriş bölgesinin dışında, 10x içinde; aksi halde analizin stop'u kalır.
  // Bilgi amaçlı; karar() ve plan değişmez. Backtest yapılmadı.
  var ATR_PERIYOT = 7;           // 15m için hızlı ATR
  var ATR_STOP_CARPAN = 1.5;     // stop = giriş ± ATR * 1.5
  var ATR_TP1_R = 1.5;           // TP1: ücret sonrası kazanç/risk 1,5 (karar() eşiği)
  var ATR_TP2_R = 2.5;           // TP2: ücret sonrası kazanç/risk 2,5

  // Fiyata göre 8 anlamlı basamak (düşük fiyatlı coinde 1e6 yuvarlama değeri bozardı)
  function anlamli(x) { return Number(x.toPrecision(8)); }

  // True Range serisi: mum listesi -> TR listesi (ilk eleman null)
  // mum: [{ time, open, high, low, close, vol }, ...]
  function trSeri(mumlar) {
    var out = mumlar.map(function () { return null; });
    for (var i = 1; i < mumlar.length; i++) {
      var m = mumlar[i], onceki = mumlar[i - 1];
      var tr = Math.max(
        m.high - m.low,
        Math.abs(m.high - onceki.close),
        Math.abs(m.low - onceki.close)
      );
      out[i] = isFinite(tr) ? tr : null;
    }
    return out;
  }

  // Wilder ATR: ilk n TR'nin ortalaması, sonra (önceki * (n-1) + TR) / n
  // mumlar: [{ high, low, close }, ...], n: periyot (varsayılan ATR_PERIYOT)
  function atrHesap(mumlar, n) {
    n = n || ATR_PERIYOT;
    if (!Array.isArray(mumlar) || mumlar.length < n + 1) return null;
    var tr = trSeri(mumlar);
    var atr = 0, sayac = 0;
    for (var i = 1; i < tr.length; i++) {
      if (tr[i] == null) continue;
      if (sayac < n) { atr += tr[i]; sayac++; if (sayac === n) atr /= n; }
      else { atr = (atr * (n - 1) + tr[i]) / n; }
    }
    return sayac >= n ? atr : null;
  }

  // Ücret sonrası kazanç/risk = r olacak hedef uzaklığı (planHesap r1Net formülünün tersi)
  function netHedefMesafe(risk, giris, r) { var u = UCRET * giris; return r * (risk + u) + u; }

  // ATR bazlı stop/TP önerisi. Analizin planıyla karşılaştırıp daha sıkı stop'u seçer.
  // plan: { yon, giris, stop, tp1, tp2 }, atr: sayı, fiyat: güncel fiyat (bilgi)
  // Dönüş: { stop, tp1, tp2, atr, stopYuzde, kaynak: 'claude' | 'atr', notlar: [] } ya da null
  function atrStopTp(plan, atr, fiyat) {
    if (!planGecerli(plan) || !sayi(atr)) return null;
    var yon = plan.yon === 'short' ? 'short' : 'long', lng = yon === 'long';
    var alt = Math.min(plan.giris[0], plan.giris[1]), ust = Math.max(plan.giris[0], plan.giris[1]);
    var giris = (alt + ust) / 2;
    var notlar = [], kaynak = 'claude', stop = plan.stop;
    var atrStop = lng ? giris - atr * ATR_STOP_CARPAN : giris + atr * ATR_STOP_CARPAN;
    if (lng ? atrStop <= plan.stop : atrStop >= plan.stop) notlar.push('Analiz stopu daha sıkı, korundu');
    else if (lng ? atrStop >= alt : atrStop <= ust) notlar.push('ATR stopu giriş bölgesinin içinde kalıyor, analiz stopu korundu');
    else if (!planHesap({ yon: yon, giris: plan.giris, stop: atrStop, tp1: plan.tp1 }).kalUygun) notlar.push('ATR stopu ' + KAL_MAX + 'x sınırı için çok yakın, analiz stopu korundu');
    else { stop = atrStop; kaynak = 'atr'; notlar.push('ATR stopu analiz stopundan sıkı'); }
    // TP'ler: ücret sonrası 1,5R ve 2,5R; analizin hedefi daha yakınsa o korunur (bölgenin dışında kalmak şartıyla)
    var risk = Math.abs(giris - stop);
    var atrTp1 = lng ? giris + netHedefMesafe(risk, giris, ATR_TP1_R) : giris - netHedefMesafe(risk, giris, ATR_TP1_R);
    var atrTp2 = lng ? giris + netHedefMesafe(risk, giris, ATR_TP2_R) : giris - netHedefMesafe(risk, giris, ATR_TP2_R);
    var tp1 = lng ? Math.min(plan.tp1, atrTp1) : Math.max(plan.tp1, atrTp1);
    var tp2 = plan.tp2 ? (lng ? Math.min(plan.tp2, atrTp2) : Math.max(plan.tp2, atrTp2)) : atrTp2;
    if (lng ? tp1 <= ust : tp1 >= alt) { tp1 = plan.tp1; notlar.push('ATR hedefi giriş bölgesinde, analiz hedefi korundu'); }
    if (lng ? tp2 < tp1 : tp2 > tp1) tp2 = tp1;
    if (tp1 !== plan.tp1) notlar.push('Hedef 1 ATR stopuna göre yakınlaştı');
    return {
      stop: anlamli(stop),
      tp1: anlamli(tp1),
      tp2: anlamli(tp2),
      atr: anlamli(atr),
      stopYuzde: Math.round(risk / giris * 10000) / 100,
      kaynak: kaynak,
      notlar: notlar
    };
  }

  // Sinyal skoru, ATR ayarlı planla baştan hesaplanır (tüm kurallar ayarlı plana uygulanır)
  // c.mumlar: 15m veya 1S mum listesi (henüz app.js doldurmuyor)
  function sinyalSkoruAtr(c, piyasa, ek) {
    var o = sinyalSkoru(c, piyasa, ek);
    if (!c || !c.mumlar || !c.plan) return o;
    var atr = atrHesap(c.mumlar, ATR_PERIYOT);
    if (!atr) { o.atrNot = 'ATR için yeterli mum yok'; return o; }
    var ayar = atrStopTp(c.plan, atr, c.fiyat);
    if (!ayar) { o.atrNot = 'ATR stop/TP hesaplanamadı'; return o; }
    var planAyarli = {}, k;
    for (k in c.plan) planAyarli[k] = c.plan[k];
    planAyarli.stop = ayar.stop; planAyarli.tp1 = ayar.tp1; planAyarli.tp2 = ayar.tp2;
    var c2 = {};
    for (k in c) c2[k] = c[k];
    c2.plan = planAyarli;
    var o2 = sinyalSkoru(c2, piyasa, ek);
    o2.atr = ayar; o2.planAyarli = planAyarli; o2.skorOzgun = o.skor; o2.sinifOzgun = o.sinif;
    return o2;
  }

  // Haber sentiment katmanı: sinyalSkoru() sonucuna ±HABER_AGIRLIK puan ekler (bilgi amaçlı; karar() değişmez).
  // sinyalSkoru()'nun vetoları ve "en fazla B" tavanı korunur; güçlü ters haber (≤ -2) veto eder.
  // Not: sinyalSkoru zaten "ters yönde yüksek haber yok" için 2 puan veriyor; bu katman onun üstüne gelir (maks 19).
  function sinyalSkoruHaber(c, piyasa, ek, simdi) {
    var o = sinyalSkoru(c, piyasa, ek);
    if (!c || !c.plan) return o;
    var yon = o.yon || 'long';
    var hs = haberSentiment(c.haberler, yon, simdi);
    o.haber = hs;
    o.detay.haberSkor = hs.skor;
    o.skorHabersiz = o.skor;
    o.maks = SKOR_MAX + HABER_AGIRLIK;
    if (o.veto) return o; // vetolu sinyal haberle geri gelmez
    if (hs.skor <= -2) {
      o.veto = 'Güçlü ters haber (skor ' + String(hs.skor).replace('.', ',') + ')'; o.eksik.push(o.veto);
      o.skor = 0; o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Ters haber · bekle';
      return o;
    }
    // Tavan: sinyalSkoru puanı A'ya yetip sınıfı B verdiyse (eski analiz, 10x, bölge geçildi, B'de 1S onayı yok) B kalır
    var tavanB = o.sinif === 'B' && o.skor >= SKOR_ESIK.A;
    // Haber katkısı: -3..+3 -> -HABER_AGIRLIK..+HABER_AGIRLIK
    var katki = hs.skor * HABER_AGIRLIK / 3;
    o.skor = Math.max(0, Math.round((o.skor + katki) * 10) / 10);
    if (hs.skor < 0) o.eksik.push('haber akışı ters (' + String(hs.skor).replace('.', ',') + ')');
    if (o.skor >= SKOR_ESIK.A_PLUS && !tavanB) { o.sinif = 'A+'; o.renk = 'yesil'; o.ad = 'Güçlü ' + (yon === 'long' ? 'LONG' : 'SHORT'); }
    else if (o.skor >= SKOR_ESIK.A && !tavanB) { o.sinif = 'A'; o.renk = 'yesil'; o.ad = (yon === 'long' ? 'LONG' : 'SHORT') + ' sinyali'; }
    else if (o.skor >= SKOR_ESIK.B) { o.sinif = 'B'; o.renk = 'sari'; o.ad = 'Zayıf sinyal · bekle'; }
    else { o.sinif = 'yok'; o.renk = 'kirmizi'; o.ad = 'Sinyal yok'; }
    return o;
  }

  var dis = { RISK_TAVAN: RISK_TAVAN, PUSULA_MIN_FARK: PUSULA_MIN_FARK, AYNI_YON_SINIR: AYNI_YON_SINIR, KAL_MIN: KAL_MIN, KAL_MAX: KAL_MAX, emaSon: emaSon, trendEma: trendEma, pusula: pusula, UCRET: UCRET, planGecerli: planGecerli, planSinif: planSinif, dominansEngeli: dominansEngeli, h1Onay: h1Onay, ESKI_SAAT: ESKI_SAAT, analizYasi: analizYasi, planHesap: planHesap, girisDurumu: girisDurumu, karar: karar, pozisyonHesap: pozisyonHesap, toplamRisk: toplamRisk, coinTemizle: coinTemizle, guvenliUrl: guvenliUrl, rsiSeri: rsiSeri, turevHesap: turevHesap, likidasyonHesap: likidasyonHesap, likidasyonDilim: likidasyonDilim, binanceSembol: binanceSembol, sinyalSkoru: sinyalSkoru, m15Zamanlama: m15Zamanlama, SKOR_ESIK: SKOR_ESIK, SKOR_AGIRLIK: SKOR_AGIRLIK, atrHesap: atrHesap, atrStopTp: atrStopTp, sinyalSkoruAtr: sinyalSkoruAtr, trSeri: trSeri, ATR_PERIYOT: ATR_PERIYOT, haberSentiment: haberSentiment, haberTazelik: haberTazelik, sinyalSkoruHaber: sinyalSkoruHaber, HABER_AGIRLIK: HABER_AGIRLIK };
  if (typeof module !== 'undefined' && module.exports) module.exports = dis; else kok.DKC_HESAP = dis;
})(this);
