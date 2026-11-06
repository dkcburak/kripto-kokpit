// Haberci (7. ajan, denetçi): kriptoyu etkileyecek haber ve makro takvim riskini Profesör'e taşır. Emir vermez, sinyal üretmez.
// 1) Takvim: FOMC kararı, ABD TÜFE (CPI), tarım dışı istihdam (NFP), ABD seçimi vb. Pencere içinde olay=true → Profesör puanı -25 (yumuşak).
//    Kaynak: federalreserve.gov/monetarypolicy/fomccalendars.htm, bls.gov/schedule (6 Kas 2026'da okundu). Yeni tarihleri TAKVIM'e ekle.
// 2) Haber akışı (RSS: CoinDesk, Cointelegraph, Decrypt): coin özelinde ağır haber (hack, delist, dava, çöküş…) → o coine 24 saat SERT RET ('haber');
//    piyasa geneli ağır başlık yoğunluğu (6 saatte ≥3) → 4 saat olay=true. Kaynak erişilemezse sessizce atlanır, hata listesine yazılır.
// Testi: node test/masa-haber.test.js (ağ yok, sahte RSS)
'use strict';
var TAKVIM = [
  // ad, UTC zaman, etki (yuksek: ±2 saat; secim: -12/+24 saat)
  { ad: 'ABD ara seçimi', t: '2026-11-03T23:00:00Z', etki: 'secim' },
  { ad: 'ABD istihdam + işsizlik (NFP)', t: '2026-11-06T13:30:00Z', etki: 'yuksek' },
  { ad: 'ABD TÜFE (CPI)', t: '2026-11-10T13:30:00Z', etki: 'yuksek' },
  { ad: 'ABD istihdam + işsizlik (NFP)', t: '2026-12-04T13:30:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2026-12-09T19:00:00Z', etki: 'yuksek' },
  { ad: 'ABD TÜFE (CPI)', t: '2026-12-10T13:30:00Z', etki: 'yuksek' },
  { ad: 'ABD TÜFE (CPI)', t: '2027-01-13T13:30:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-01-27T19:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-03-17T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-04-28T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-06-09T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-07-28T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-09-15T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-10-27T18:00:00Z', etki: 'yuksek' },
  { ad: 'FOMC faiz kararı', t: '2027-12-08T19:00:00Z', etki: 'yuksek' }
];
var PENCERE = { yuksek: [2 * 3600000, 2 * 3600000], secim: [12 * 3600000, 24 * 3600000] };
var KAYNAK = [
  { ad: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { ad: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { ad: 'Decrypt', url: 'https://decrypt.co/feed' }
];
// Coin özelinde ağır haber (24 saat o coine giriş yok)
var AGIR = /\b(hack(s|ed|er)?|exploit(s|ed)?|drain(s|ed)?|delist(s|ed|ing)?|halt(s|ed)?|suspend(s|ed)?|lawsuit|sues|sued|charged|indict(s|ed|ment)?|bankrupt(cy)?|insolven(t|cy)|rug ?pull|frozen|freeze[sd]?|outage|depeg(s|ged)?|security breach|stolen|unlocks?)\b/i;
// Zayıf ağır sözcükler (halt, suspend, freeze, outage) yalnız ağ/işlem bağlamında sayılır: "Solana's Shanghai event halted" ağır değildir
var AGIR_ZAYIF = /\b(halt(s|ed)?|suspend(s|ed)?|frozen|freeze[sd]?|outage)\b/i, BAGLAM = /\b(network|chain|blockchain|mainnet|trading|withdrawals?|deposits?|bridge|validators?|protocol|exchange|wallet|node|block production)\b/i;
function agirMi(b) { if (!AGIR.test(b)) return false; var kalan = b.replace(AGIR_ZAYIF, ''); return AGIR.test(kalan) || BAGLAM.test(b); }
// Piyasa geneli ağır başlık (yoğunluk 6 saatte ≥3 → 4 saat olay)
var PIYASA = /\b(crash(es|ed)?|plunge[sd]?|liquidations?|bans?|banned|tariffs?|war|sanctions?|sell-?off|rout|black swan|emergency|collapse[sd]?|defaults?)\b/i;
var ISIM = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple|xrp', BNB: 'binance coin|bnb', DOGE: 'dogecoin', ADA: 'cardano', AVAX: 'avalanche', LINK: 'chainlink', DOT: 'polkadot', TRX: 'tron', TON: 'toncoin', SUI: 'sui', APT: 'aptos', ARB: 'arbitrum', OP: 'optimism', LTC: 'litecoin', BCH: 'bitcoin cash', NEAR: 'near protocol', UNI: 'uniswap', AAVE: 'aave', PEPE: 'pepe', WIF: 'dogwifhat', SHIB: 'shiba', ATOM: 'cosmos', FIL: 'filecoin', INJ: 'injective', TIA: 'celestia', SEI: 'sei network', HYPE: 'hyperliquid', ZEC: 'zcash', XLM: 'stellar', HBAR: 'hedera', ONDO: 'ondo', ENA: 'ethena', TAO: 'bittensor', WLD: 'worldcoin', ZRO: 'layerzero', LIT: 'litentry', FLUID: 'fluid', QNT: 'quant', BEAT: 'beat' };

function temiz(s) { return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
// RSS/Atom metninden [{ baslik, zaman(ms), link }]
function rssAyristir(xml) {
  var out = [], re = /<(item|entry)\b[\s\S]*?<\/\1>/gi, m;
  while ((m = re.exec(xml))) {
    var b = m[0], t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(b), d = /<(pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/\1>/i.exec(b), l = /<link[^>]*>([\s\S]*?)<\/link>|<link[^>]*href="([^"]+)"/i.exec(b);
    var z = d ? Date.parse(temiz(d[2])) : NaN;
    if (t) out.push({ baslik: temiz(t[1]), zaman: isFinite(z) ? z : null, link: l ? temiz(l[1] || l[2]) : '' });
  }
  return out;
}
// Coin'in başlıkta geçip geçmediği: sembol (büyük harf, kelime sınırı) ya da adı
function coinGeciyor(coin, baslik) {
  if (new RegExp('(^|[^A-Z0-9$])\\$?' + coin + '([^A-Z0-9]|$)').test(baslik)) return true;
  var ad = ISIM[coin]; return !!ad && new RegExp('\\b(' + ad + ')\\b', 'i').test(baslik);
}
// Takvim penceresi: aktif olay ve 48 saat içindeki yaklaşanlar
function takvim(simdi, liste) {
  liste = liste || TAKVIM;
  var aktif = null, yakin = [];
  liste.forEach(function (e) {
    var t = Date.parse(e.t), p = PENCERE[e.etki] || PENCERE.yuksek;
    if (simdi >= t - p[0] && simdi <= t + p[1]) { if (!aktif || t < Date.parse(aktif.t)) aktif = { ad: e.ad, t: e.t, bitis: t + p[1] }; }
    else if (t > simdi && t - simdi <= 48 * 3600000) yakin.push({ ad: e.ad, t: e.t });
  });
  return { aktif: aktif, yakin: yakin.sort(function (a, b) { return Date.parse(a.t) - Date.parse(b.t); }).slice(0, 3) };
}
// Başlıkları değerlendir: coin bayrakları ve piyasa yoğunluğu
function degerlendir(basliklar, coinler, simdi, onceki) {
  var coinBayrak = (onceki && onceki.coinler) || {}, ilgili = [], piyasaSay = 0;
  Object.keys(coinBayrak).forEach(function (c) { if (coinBayrak[c].bitis <= simdi) delete coinBayrak[c]; });
  basliklar.forEach(function (h) {
    if (h.zaman && simdi - h.zaman > 12 * 3600000) return;
    var agir = agirMi(h.baslik), piy = PIYASA.test(h.baslik), vuran = [];
    if (agir) coinler.forEach(function (c) { if (coinGeciyor(c, h.baslik)) { vuran.push(c); if (!coinBayrak[c] || coinBayrak[c].bitis < simdi + 24 * 3600000) coinBayrak[c] = { neden: h.baslik.slice(0, 120), bitis: (h.zaman || simdi) + 24 * 3600000, kaynak: h.kaynak }; } });
    if (piy && (!h.zaman || simdi - h.zaman <= 6 * 3600000)) piyasaSay++;
    if (agir || piy) ilgili.push({ baslik: h.baslik.slice(0, 140), zaman: h.zaman, kaynak: h.kaynak, coin: vuran, link: h.link });
  });
  var piyasa = null;
  if (piyasaSay >= 3) piyasa = { neden: piyasaSay + ' ağır piyasa başlığı (6 saat)', bitis: simdi + 4 * 3600000 };
  else if (onceki && onceki.piyasa && onceki.piyasa.bitis > simdi) piyasa = onceki.piyasa;
  ilgili.sort(function (a, b) { return (b.zaman || 0) - (a.zaman || 0); });
  return { coinler: coinBayrak, piyasa: piyasa, basliklar: ilgili.slice(0, 8), piyasaSay: piyasaSay };
}
// Ana giriş: getText(url) → metin; coinler: izlenen coin listesi; onceki: önceki durum.haber; simdi: ms
async function haberci(getText, coinler, onceki, simdi) {
  simdi = simdi || Date.now();
  var hepsi = [], kaynaklar = [], hatalar = [];
  for (var i = 0; getText && i < KAYNAK.length; i++) {
    try { var x = await getText(KAYNAK[i].url), l = rssAyristir(x); l.forEach(function (h) { h.kaynak = KAYNAK[i].ad; }); hepsi = hepsi.concat(l); kaynaklar.push(KAYNAK[i].ad + ' ' + l.length); }
    catch (e) { hatalar.push(KAYNAK[i].ad + ': ' + String(e.message || e).slice(0, 40)); }
  }
  var tk = takvim(simdi), dg = degerlendir(hepsi, coinler, simdi, onceki);
  var olay = tk.aktif ? { neden: tk.aktif.ad, bitis: tk.aktif.bitis, tur: 'takvim' } : dg.piyasa ? { neden: dg.piyasa.neden, bitis: dg.piyasa.bitis, tur: 'haber' } : null;
  return { zaman: simdi, olay: olay, takvim: tk.yakin, coinler: dg.coinler, basliklar: dg.basliklar, kaynaklar: kaynaklar, okunan: hepsi.length, hatalar: hatalar };
}
module.exports = { agirMi: agirMi, TAKVIM: TAKVIM, KAYNAK: KAYNAK, rssAyristir: rssAyristir, coinGeciyor: coinGeciyor, takvim: takvim, degerlendir: degerlendir, haberci: haberci };
