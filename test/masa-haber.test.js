// node test/masa-haber.test.js — Haberci (ağ yok, sahte RSS)
'use strict';
var assert = require('assert'), Hb = require('../trader-masasi/haber.js'), P = require('../trader-masasi/profesor.js'), n = 0;
function t(ad, fn) { return Promise.resolve().then(fn).then(function () { n++; console.log('ok', ad); }); }
var SIMDI = Date.parse('2026-11-10T13:00:00Z');
function rss(items) { return '<?xml version="1.0"?><rss><channel>' + items.map(function (x) { return '<item><title><![CDATA[' + x[0] + ']]></title><link>https://x/' + encodeURIComponent(x[0]) + '</link><pubDate>' + new Date(x[1]).toUTCString() + '</pubDate></item>'; }).join('') + '</channel></rss>'; }
var testler = [
  t('rss ayrıştırma: CDATA başlık, tarih, link', function () {
    var l = Hb.rssAyristir(rss([['Solana &amp; friends', SIMDI - 1000]]));
    assert(l.length === 1 && l[0].baslik === 'Solana & friends' && Math.abs(l[0].zaman - (SIMDI - 1000)) < 1000 && /^https:\/\/x\//.test(l[0].link), JSON.stringify(l));
    assert.strictEqual(Hb.rssAyristir('<feed><entry><title>A</title><updated>2026-11-10T12:00:00Z</updated><link href="https://y"/></entry></feed>')[0].link, 'https://y');
  }),
  t('coin eşleşmesi: sembol kelime sınırı, ad; SOL "solution" ile eşleşmez', function () {
    assert(Hb.coinGeciyor('SOL', 'Solana network halted for 2 hours') && Hb.coinGeciyor('SOL', '$SOL drops') && !Hb.coinGeciyor('SOL', 'A solution for DeFi') && !Hb.coinGeciyor('SOL', 'CONSOLIDATION ahead') && Hb.coinGeciyor('XRP', 'Ripple sued by SEC'));
  }),
  t('ağır haber bağlamı: etkinlik iptali ve KOSPI durdurması ağır değil; ağ durması ve hack ağır', function () {
    assert(!Hb.agirMi("Solana’s Shanghai event halted over unauthorized promotion: Report"));
    assert(!Hb.agirMi('Bitcoin holds $75K as AI regulation fears see KOSPI halted after 8% crash'));
    assert(Hb.agirMi('Solana network halted for 2 hours, validators restart') && Hb.agirMi('Solana DeFi protocol hacked for $40M') && Hb.agirMi('Exchange suspends ZEC withdrawals') && Hb.agirMi('Zcash delisted by exchange'));
  }),
  t('eski bayrak: artık ağır sayılmayan başlıkla konan bayrak bir sonraki çalışmada düşer, geçerli olan kalır', function () {
    var onceki = { coinler: { SOL: { neden: "Solana’s Shanghai event halted over unauthorized promotion: Report", bitis: SIMDI + 20 * 3600000 }, ETH: { neden: 'Ethereum DeFi protocol hacked for $40M', bitis: SIMDI + 20 * 3600000 } } };
    var d = Hb.degerlendir([], ['SOL', 'ETH'], SIMDI, onceki);
    assert(!d.coinler.SOL && d.coinler.ETH, JSON.stringify(d.coinler));
  }),
  t('takvim: CPI penceresi (±2 saat) aktif, 48 saat içindekiler listelenir; seçim -12/+24 saat', function () {
    var tk = Hb.takvim(SIMDI);
    assert(tk.aktif && /CPI/.test(tk.aktif.ad) && tk.aktif.bitis === Date.parse('2026-11-10T15:30:00Z'), JSON.stringify(tk));
    assert(!Hb.takvim(Date.parse('2026-11-10T16:00:00Z')).aktif);
    var s = Hb.takvim(Date.parse('2026-11-04T10:00:00Z')); assert(s.aktif && /seçim/.test(s.aktif.ad));
    var y = Hb.takvim(Date.parse('2026-12-08T16:00:00Z')); assert(!y.aktif && y.yakin.length === 2 && /FOMC/.test(y.yakin[0].ad) && /CPI/.test(y.yakin[1].ad), JSON.stringify(y));
  }),
  t('değerlendirme: coin özelinde hack → 24 saat bayrak; 3 ağır piyasa başlığı → 4 saat olay; eski başlık sayılmaz', function () {
    var b = Hb.rssAyristir(rss([['Solana DeFi protocol hacked for $40M', SIMDI - 3600000], ['Bitcoin plunges 8% as tariffs bite', SIMDI - 1800000], ['Crypto liquidations top $1B', SIMDI - 600000], ['Markets crash after war fears', SIMDI - 300000], ['Ethereum exploit drained', SIMDI - 20 * 3600000]]));
    var d = Hb.degerlendir(b, ['BTC', 'ETH', 'SOL'], SIMDI, null);
    assert(d.coinler.SOL && d.coinler.SOL.bitis === SIMDI - 3600000 + 24 * 3600000 && !d.coinler.ETH, JSON.stringify(d.coinler));
    assert(d.piyasa && d.piyasaSay === 3 && d.piyasa.bitis === SIMDI + 4 * 3600000, JSON.stringify(d.piyasa));
    // sonraki tarama: bayrak süresi dolana kadar kalır, piyasa olayı 4 saat sürer
    var d2 = Hb.degerlendir([], ['SOL'], SIMDI + 3 * 3600000, d); assert(d2.coinler.SOL && d2.piyasa);
    var d3 = Hb.degerlendir([], ['SOL'], SIMDI + 25 * 3600000, d); assert(!d3.coinler.SOL && !d3.piyasa);
  }),
  t('haberci: kaynak hatası sessiz, takvim olayı önce gelir', async function () {
    var h = await Hb.haberci(async function (url) { if (/coindesk/.test(url)) throw new Error('403'); return rss([['Zcash delisted by exchange', SIMDI - 1000]]); }, ['ZEC', 'BTC'], null, SIMDI);
    assert(h.olay && h.olay.tur === 'takvim' && h.hatalar.length === 1 && h.coinler.ZEC && h.okunan === 2 && h.kaynaklar.length === 2, JSON.stringify(h));
  }),
  t('profesör: haber bayraklı coine sert ret, olayda -25 puan', function () {
    var s = { trader: 'kirilim', coin: 'SOL', yon: 'long', giris: [100, 101], stop: 96, tp1: 112, rr: 2, veriZamani: SIMDI };
    var d = { simdi: SIMDI, acik: [], sonStop: {}, gunSonuc: 0, gunBaslangic: 100, karne: {}, gozlem: {}, btcYon: 'yukari', funding: {}, atr: {}, fiyat: {}, haber: { SOL: { neden: 'hack', bitis: SIMDI + 1000 } } };
    var k = P.karar(s, d); assert(k.karar === 'ret' && k.kural[0] === 'haber', JSON.stringify(k));
    d.haber = {}; d.olay = true; k = P.karar(s, d); assert(k.puan === 75 && /olay/.test(k.neden), JSON.stringify(k));
  })
];
Promise.all(testler).then(function () { console.log(n + ' test geçti'); }, function (e) { console.error(e); process.exit(1); });
