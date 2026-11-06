// Profesör acil durdurma (kill switch) ve kilit açma. Kullanım:
//   node trader-masasi/kapat.js durdur <onceki.json> <cikti.json>  → kilit koyar, Profesör'ün bekleyen emirlerini iptal eder, canlı pozisyonlarını piyasa emriyle kapatır
//   node trader-masasi/kapat.js ac <onceki.json> <cikti.json>      → kilidi kaldırır (yeni emirler yine verilebilir)
// Anahtar ortamdan (MEXC_API_KEY/SECRET). Elle açılmış pozisyon ve emirlere DOKUNMAZ (yalnız externalOid 'prof…' ve kayıttaki canlı coinler).
'use strict';
var E = require('./emir.js');
async function durdur(durum, c, bildir) {
  var rapor = [], hata = [], simdi = Date.now();
  durum.kilit = simdi;
  var canliCoin = {}; durum.acik.forEach(function (p) { if (p.canli) canliCoin[p.coin + '_USDT'] = p; });
  try {
    var em = await c.emirler(), iptal = em.filter(function (o) { return E.bizim(o) || canliCoin[o.symbol]; });
    for (var i = 0; i < iptal.length; i++) { await c.iptal(iptal[i].orderId); rapor.push(iptal[i].symbol + ' emri iptal'); }
  } catch (e) { hata.push('emir iptal: ' + e.message); }
  try {
    var poz = (await c.pozisyonlar()).filter(function (x) { return canliCoin[x.symbol]; });
    for (var j = 0; j < poz.length; j++) { await c.kapat(poz[j]); rapor.push(poz[j].symbol + ' pozisyonu piyasa emriyle kapatıldı'); }
  } catch (e) { hata.push('pozisyon kapatma: ' + e.message); }
  try {
    var st = (await c.stoplar()).filter(function (s) { return canliCoin[s.symbol]; });
    if (st.length) { await c.stopIptal(st.map(function (s) { return s.id; })); rapor.push(st.length + ' stop emri iptal'); }
  } catch (e) { hata.push('stop iptal: ' + e.message); }
  if (!hata.length) {
    durum.acik = durum.acik.filter(function (p) {
      if (!p.canli) return true;
      durum.kapali.push({ coin: p.coin, trader: p.trader, t: p.t, bitis: Math.floor(simdi / 1000), giris: p.giris || null, stop: p.stop0 || p.stop, r: 0, neden: 'acil', sanal: false, gozlem: false, canli: true, vol: p.vol });
      return false;
    });
  }
  var metin = 'ACİL DURDURMA: kilit kondu, yeni emir yok. ' + (rapor.length ? rapor.join('; ') : 'borsada Profesör emri/pozisyonu yoktu') + (hata.length ? '. HATA: ' + hata.join(' | ') + ' — MEXC\'i elle kontrol edin.' : '.');
  if (bildir) bildir(metin);
  return { rapor: rapor, hata: hata, metin: metin };
}
module.exports = { durdur: durdur };
if (require.main === module) {
  var fs = require('fs'), islem = process.argv[2], onceki = process.argv[3], cikti = process.argv[4] || 'masa.json', durum;
  try { durum = JSON.parse(fs.readFileSync(onceki, 'utf8')); } catch (e) { console.error('Durum okunamadı: ' + e.message); process.exit(1); }
  var tg = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT || '6930722980';
  var bildir = function (m) { console.log(m); return E.telegram(tg, chat, '🎓 Profesör: ' + m); };
  if (islem === 'ac') { durum.kilit = null; fs.writeFileSync(cikti, JSON.stringify(durum)); bildir('Kilit kaldırıldı; Profesör yeniden emir verebilir.').then(function () { process.exit(0); }); }
  else if (islem === 'durdur') {
    var c; try { c = E.istemci(process.env.MEXC_API_KEY, process.env.MEXC_API_SECRET); } catch (e) { durum.kilit = Date.now(); fs.writeFileSync(cikti, JSON.stringify(durum)); console.error('Anahtar yok: yalnız kilit kondu, borsa işlemi yapılamadı. ' + e.message); process.exit(2); }
    durdur(durum, c, bildir).then(function (r) { fs.writeFileSync(cikti, JSON.stringify(durum)); process.exit(r.hata.length ? 3 : 0); }, function (e) { console.error('Hata: ' + e.message); fs.writeFileSync(cikti, JSON.stringify(durum)); process.exit(1); });
  } else { console.error('Kullanım: kapat.js durdur|ac <onceki.json> <cikti.json>'); process.exit(1); }
}
