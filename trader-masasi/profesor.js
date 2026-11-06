// Profesör: trader sinyallerini denetler, onay / ret / bekle verir. İşlem açmaz. Kurallar: ajanlar/06-profesor.md
// Sert kurallar sırayla (ilk tutan ret), sonra 100 puanlık yumuşak sistem (70 altı bekle, 50 altı ret).
'use strict';
var AYAR = {
  minRR: 1.5, maxAcik: 2, riskTavan: 3, riskIslem: 0.25, gunlukZarar: 20, eskiDk: 45, shortKapali: true,
  bekleEsik: 70, retEsik: 50, gozlemGun: 28, karneMin: 30
};
var KURAL = {
  sema: 'eksik alan', eski: 'veri 45 dakikadan eski', plan: 'plan geçersiz (stop < giriş < hedef değil)', rr: 'komisyonlu R:R 1,5 altında',
  short: 'short kapalı', ayniCoin: 'aynı coinde açık/bekleyen işlem ya da 24 saat içinde stop', havuz: 'havuz dolu (2 işlem / %3 risk)',
  gunluk: 'günlük zarar sınırı dolu', lik: 'likidasyon stopun 2 katından yakın', gozlem: 'trader gözlem modunda', haber: 'coin hakkında ağır haber (Haberci, 24 saat)'
};
function sayi(x) { return typeof x === 'number' && isFinite(x) && x > 0; }
function planGecerli(p) {
  if (!p || !Array.isArray(p.giris) || p.giris.length !== 2 || !sayi(p.giris[0]) || !sayi(p.giris[1]) || !sayi(p.stop) || !sayi(p.tp1)) return false;
  var alt = Math.min(p.giris[0], p.giris[1]), ust = Math.max(p.giris[0], p.giris[1]);
  return p.yon === 'long' ? p.stop < alt && p.tp1 > ust : p.stop > ust && p.tp1 < alt;
}
// s: sinyal { trader, coin, yon, giris, stop, tp1, rr, zaman, veriZamani }
// d: durum { simdi, acik:[{coin, trader, riskYuzde}], sonStop:{coin: ms}, gunSonuc, gunBaslangic, karne:{trader:{n, toplamR}}, gozlem:{trader:true}, btcYon:'yukari'|'asagi'|'yatay', funding:{coin}, atr:{coin}, olay:bool, fiyat:{coin}, hacimDusuk:{coin} }
function karar(s, d) {
  var k = [];
  if (!s || !s.trader || !s.coin || !s.giris) return ret('sema', k);
  if (d.simdi - (s.veriZamani || 0) > AYAR.eskiDk * 60000) return ret('eski', k);
  if (!planGecerli(s)) return ret('plan', k);
  if (!(s.rr >= AYAR.minRR)) return ret('rr', k);
  if (AYAR.shortKapali && s.yon === 'short') return ret('short', k, true);
  if (d.haber && d.haber[s.coin] && d.haber[s.coin].bitis > d.simdi) return retMetin('haber', KURAL.haber + ': ' + String(d.haber[s.coin].neden).slice(0, 80), k);
  if ((d.acik || []).some(function (p) { return p.coin === s.coin; }) || (d.sonStop && d.simdi - d.sonStop[s.coin] < 86400000)) return ret('ayniCoin', k);
  var acikRisk = (d.acik || []).reduce(function (t, p) { return t + (p.riskYuzde || AYAR.riskIslem); }, 0);
  if ((d.acik || []).length >= AYAR.maxAcik || acikRisk + AYAR.riskIslem > AYAR.riskTavan) return ret('havuz', k);
  if (d.gunBaslangic > 0 && d.gunSonuc <= -d.gunBaslangic * AYAR.gunlukZarar / 100) return ret('gunluk', k);
  var mid = (s.giris[0] + s.giris[1]) / 2, stopMes = Math.abs(mid - s.stop) / mid;
  // 5x kaldıraçta likidasyon ~%20 uzakta; stop %10'dan uzaksa "likidasyon ≥ 2× stop" şartı tutmaz
  if (stopMes > 0.1) return ret('lik', k);
  // Yumuşak puan
  var puan = 100, n = [];
  if (d.btcYon === 'asagi') { puan -= 30; n.push('BTC 1G aşağı (-30)'); }
  var ayniYon = (d.acik || []).filter(function (p) { return p.yon === s.yon; }).length;
  if (ayniYon) { puan -= 15; n.push('aynı yönde açık işlem (-15)'); }
  var kr = d.karne && d.karne[s.trader];
  if (kr && kr.n >= AYAR.karneMin && kr.toplamR < 0) { puan -= 20; n.push('traderın son 30 işlemi eksi (-20)'); }
  if (d.funding && d.funding[s.coin] > 0.0005) { puan -= 15; n.push('funding aşırı (' + (d.funding[s.coin] * 100).toFixed(3) + '%, -15)'); }
  if (d.atr && d.atr[s.coin] > 0 && Math.abs(mid - s.stop) < 0.5 * d.atr[s.coin]) { puan -= 20; n.push('stop ATR\'nin yarısından yakın, gürültü (-20)'); }
  if (d.olay) { puan -= 25; n.push('önemli olay/haber penceresi' + (typeof d.olay === 'string' ? ': ' + d.olay : '') + ' (-25)'); }
  if (d.fiyat && d.fiyat[s.coin] > 0 && Math.abs(d.fiyat[s.coin] / mid - 1) > 0.015) { puan -= 10; n.push('giriş fiyattan %1,5+ uzak (-10)'); }
  if (d.hacimDusuk && d.hacimDusuk[s.coin]) { puan -= 10; n.push('hacim ortalamanın altında (-10)'); }
  var kararStr = puan >= AYAR.bekleEsik ? 'onay' : puan >= AYAR.retEsik ? 'bekle' : 'ret';
  var neden = kararStr === 'onay' ? 'Kurallar tamam, puan ' + puan + (n.length ? ' (' + n.join('; ') + ')' : '') + '. Onay.' : 'Puan ' + puan + ': ' + n.join('; ') + '. ' + (kararStr === 'bekle' ? 'Bekle.' : 'Ret.');
  // Gözlem modundaki trader: karar aynı kuralla verilir, işlem yalnız kağıt karneye yazılır (havuza sayılmaz)
  var gz = !!(d.gozlem && d.gozlem[s.trader]);
  return { karar: kararStr, puan: puan, neden: neden + (gz ? ' (gözlem: kağıt karne)' : ''), kural: n, kagit: gz };
}
function ret(kod, k, kagit) { return { karar: 'ret', puan: 0, neden: KURAL[kod] + '.', kural: [kod], kagit: !!kagit }; }
function retMetin(kod, metin, k) { return { karar: 'ret', puan: 0, neden: metin + '.', kural: [kod], kagit: false }; }
module.exports = { AYAR: AYAR, KURAL: KURAL, karar: karar, planGecerli: planGecerli };
