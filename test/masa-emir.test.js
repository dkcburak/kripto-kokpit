// node test/masa-emir.test.js — Profesör emir katmanı (MEXC'ye istek atmaz: sahte fetch ve sahte borsa)
'use strict';
var assert = require('assert'), E = require('../trader-masasi/emir.js'), I = require('../trader-masasi/izle.js'), n = 0;
function t(ad, fn) { return Promise.resolve().then(fn).then(function () { n++; console.log('ok', ad); }); }
var SN = 1792450000 - (1792450000 % 86400), SIMDI = SN * 1000;
function seri(adet, adim, bitis, fiyat, egim) { var o = []; for (var i = 0; i < adet; i++) { var p = fiyat + (i - adet) * egim + (i % 2) * 0.2; o.push({ time: bitis - (adet - i) * adim, open: p, high: p + 0.5, low: p - 0.5, close: p, vol: 1000 }); } return o; }
function paket(m) { return { success: true, data: { time: m.map(function (x) { return x.time; }), open: m.map(function (x) { return x.open; }), high: m.map(function (x) { return x.high; }), low: m.map(function (x) { return x.low; }), close: m.map(function (x) { return x.close; }), vol: m.map(function (x) { return x.vol; }) } }; }
function sahte(coinler, kirilimCoin, h4Degis) {
  return function (url) {
    if (/ticker$/.test(url)) return Promise.resolve({ success: true, data: coinler.map(function (c) { return { symbol: c + '_USDT', amount24: 9e8, lastPrice: 100, fundingRate: 0.0001 }; }) });
    if (/detail$/.test(url)) return Promise.resolve({ success: true, data: [] });
    if (/funding_rate/.test(url)) return Promise.resolve({ success: true, data: { resultList: [{ fundingRate: 0.0001 }, { fundingRate: 0.0001 }, { fundingRate: 0.0001 }] } });
    if (/tarayici\.json/.test(url)) return Promise.resolve({ surum: 1, zaman: SIMDI - 60000, coinler: [] });
    var c = /kline\/([A-Z]+)_USDT\?interval=(\w+)/.exec(url), coin = c[1], ar = c[2];
    if (ar === 'Day1') return Promise.resolve(paket(seri(270, 86400, SN, 100, 0.1)));
    if (ar === 'Min60') return Promise.resolve(paket(seri(48, 3600, SN, 100, 0)));
    var h4 = seri(80, 14400, SN, 100, 0);
    if (coin === kirilimCoin) { var k = h4[79]; k.open = 100.5; k.high = 106; k.low = 100; k.close = 105; k.vol = 4000; }
    if (h4Degis) h4 = h4Degis(coin, h4);
    return Promise.resolve(paket(h4));
  };
}
// Sahte borsa: çağrıları kaydeder
function borsaYap(mod, ayar) {
  ayar = ayar || {};
  var log = [], poz = ayar.poz || [], emir = ayar.emir || [], durum = ayar.emirDurum || null;
  var c = {
    hesap: async function () { log.push('hesap'); return { ozkaynak: ayar.ozkaynak || 100, kullanilabilir: 90 }; },
    pozisyonlar: async function () { log.push('poz'); return poz; },
    emirler: async function () { log.push('emirler'); return emir; },
    emirDurum: async function (s, oid) { log.push('durum ' + s + ' ' + oid); return typeof durum === 'function' ? durum(s, oid) : durum; },
    detay: async function (s) { log.push('detay ' + s); return { symbol: s, contractSize: 0.1, minVol: 1, priceUnit: 0.01 }; },
    ac: async function (g) { log.push('ac ' + JSON.stringify(g)); return { orderId: '42', ts: 1 }; },
    iptal: async function (id) { log.push('iptal ' + id); return true; },
    kapat: async function (p) { log.push('kapat ' + p.symbol); return { orderId: '43' }; }
  };
  var b = { mod: mod, c: c, log: log, mesaj: [], bildir: function (m) { b.mesaj.push(m); } };
  return b;
}
var testler = [
  t('imza: HMAC-SHA256 hex, belirli', function () {
    var a = E.imza('gizli', 'anahtar1700000000{"a":1}');
    assert(/^[0-9a-f]{64}$/.test(a) && a === E.imza('gizli', 'anahtar1700000000{"a":1}'));
  }),
  t('boyut: %0,25 riskle 100 USDT hesapta 8 kontrat 5x; küçük hesapta en küçük kontrat ya da ret', function () {
    var h = E.boyut({ stop: 97, tp1: 106 }, 100, 100, 0.25, { contractSize: 0.01, minVol: 1 });
    assert(h.vol === 8 && h.kal === 5 && Math.abs(h.riskUsdt - 0.24) < 1e-9 && !h.mini, JSON.stringify(h));
    var m = E.boyut({ stop: 97, tp1: 106 }, 100, 100, 0.25, { contractSize: 1, minVol: 1 });
    assert(m.hata && /en küçük kontratın kaybı/.test(m.hata), JSON.stringify(m));
    var m2 = E.boyut({ stop: 97, tp1: 106 }, 100, 1000, 0.25, { contractSize: 1, minVol: 1 });
    assert(m2.mini && m2.vol === 1 && m2.kal === 10 && Math.abs(m2.riskUsdt - 3) < 1e-9, JSON.stringify(m2));
    assert(E.boyut({ stop: 101, tp1: 106 }, 100, 100, 0.25, { contractSize: 0.01 }).hata, 'stop yanlış taraf');
    assert(E.boyut({ stop: 97, tp1: 99 }, 100, 100, 0.25, { contractSize: 0.01 }).hata, 'hedef geçilmiş');
    assert(E.boyut({ stop: 20, tp1: 300 }, 100, 100, 0.25, { contractSize: 0.01 }).hata, 'stop çok uzak');
  }),
  t('emir gövdesi: limit, stop ve TP1 birlikte, fiyat adımına yuvarlı, externalOid prof ile başlar', function () {
    var g = E.acGovde('SOL_USDT', 105.004, { vol: 8, kal: 5 }, { stop: 97.123, tp1: 115.126 }, { priceUnit: 0.01 }, E.oidUret('kirilim', 'SOL', 1792450000));
    assert(g.price === 105 && g.stopLossPrice === 97.12 && g.takeProfitPrice === 115.13 && g.side === 1 && g.type === 1 && g.openType === 1 && g.leverage === 5 && /^profkirSOL1792450000$/.test(g.externalOid), JSON.stringify(g));
    assert(E.bizim({ externalOid: g.externalOid }) && !E.bizim({ externalOid: 'dkc123' }) && !E.bizim({}));
    var k = E.kapatGovde({ symbol: 'SOL_USDT', positionType: 1, holdVol: 8, leverage: 5, openType: 1, positionId: 7 });
    assert(k.side === 4 && k.type === 5 && k.vol === 8 && k.positionId === 7);
  }),
  t('istemci: başlıklar ve imza (GET sıralı sorgu, POST JSON gövde); success değilse hata', async function () {
    var istekler = [];
    var f = async function (url, sec) { istekler.push({ url: url, sec: sec }); return { status: 200, json: async function () { return /fail/.test(url) ? { success: false, code: 500, message: 'bozuk' } : { success: true, data: [{ currency: 'USDT', equity: '123.4', availableBalance: '100' }] }; } }; };
    var c = E.istemci('K', 'S', f);
    var h = await c.hesap();
    assert.strictEqual(h.ozkaynak, 123.4);
    var r = istekler[0]; assert(r.url === 'https://api.mexc.com/api/v1/private/account/assets' && r.sec.headers.ApiKey === 'K' && r.sec.headers.Signature === E.imza('S', 'K' + r.sec.headers['Request-Time'] + ''), JSON.stringify(r));
    await c.ac({ symbol: 'X_USDT', vol: 1 });
    r = istekler[1]; assert(r.sec.method === 'POST' && r.sec.body === '{"symbol":"X_USDT","vol":1}' && r.sec.headers.Signature === E.imza('S', 'K' + r.sec.headers['Request-Time'] + r.sec.body));
    await c.emirler(); r = istekler[2]; assert(/open_orders\?page_num=1&page_size=50$/.test(r.url) && r.sec.headers.Signature === E.imza('S', 'K' + r.sec.headers['Request-Time'] + 'page_num=1&page_size=50'));
    var hata = null; try { await E.istemci('K', 'S', f).iptal('fail'); } catch (e) { hata = e; }
    assert(hata === null, 'iptal yolu fail içermiyor');
    try { await E.istemci('K', 'S', async function () { return { status: 200, json: async function () { return { success: false, code: 1, message: 'bozuk' }; } }; }).hesap(); hata = null; } catch (e) { hata = e; }
    assert(hata && /MEXC hata 1: bozuk/.test(hata.message));
    assert.throws(function () { E.istemci('', '', f); }, /anahtar/);
  }),
  t('kuru mod: onaylı Kırılım sinyali yazılır, emir gönderilmez, kağıt işlem sürer', async function () {
    var b = borsaYap('kuru');
    var s = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b);
    assert(s.mod === 'kuru' && s.kuru.length === 1 && /SOL LONG 1 kontrat @ 105 .* risk 0.70 USDT/.test(s.kuru[0].metin), JSON.stringify(s.kuru));
    assert(!b.log.some(function (x) { return /^ac /.test(x); }) && s.borsa.ozkaynak === 100);
    var p = s.acik.filter(function (x) { return x.coin === 'SOL' && x.trader === 'kirilim'; })[0]; assert(p && !p.canli && !p.sanal);
  }),
  t('açık mod: emir gider, dolum borsadan okunur, hedefte pozisyon borsada kapatılır', async function () {
    var b = borsaYap('acik');
    var s1 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b);
    var ac = b.log.filter(function (x) { return /^ac /.test(x); }); assert.strictEqual(ac.length, 1);
    var g = JSON.parse(ac[0].slice(3)); assert(g.symbol === 'SOL_USDT' && g.price === 105 && g.vol === 1 && g.stopLossPrice > 0 && g.takeProfitPrice > 0 && /^profkirSOL/.test(g.externalOid), ac[0]);
    var p = s1.acik.filter(function (x) { return x.canli; })[0]; assert(p && p.coin === 'SOL' && p.emirId === '42' && !p.dolum && b.mesaj.some(function (m) { return /Emir verildi/.test(m); }));
    // sonraki mum aralığa değiyor ama canlı işlemde kağıt dolum YOK; borsa "dolmadı" diyor (state 2)
    var b2 = borsaYap('acik', { emir: [{ symbol: 'SOL_USDT', price: 105, vol: 8, externalOid: p.oid }], emirDurum: { state: 2, dealVol: 0 } });
    var deger = sahte(['BTC', 'SOL'], 'YOK', function (coin, h4) { if (coin === 'SOL') { var h = seri(80, 14400, SN + 14400, 100, 0); h[79].open = 106; h[79].low = 104; h[79].high = 107; h[79].close = 106.5; return h; } return h4; });
    var s2 = await I.izle(deger, JSON.parse(JSON.stringify(s1)), SIMDI + 14400000, b2);
    var p2 = s2.acik.filter(function (x) { return x.canli; })[0]; assert(p2 && !p2.dolum && p2.bekleme === 1, JSON.stringify(p2));
    // borsa doldurdu (state 3, 104.9): dolum borsa fiyatı
    var b3 = borsaYap('acik', { poz: [{ symbol: 'SOL_USDT', positionType: 1, holdVol: 8, leverage: 5, openType: 1, positionId: 9, holdAvgPrice: 104.9 }], emirDurum: { state: 3, dealVol: 8, dealAvgPrice: 104.9 } });
    var s3 = await I.izle(deger, JSON.parse(JSON.stringify(s2)), SIMDI + 14400000 + 60000, b3);
    var p3 = s3.acik.filter(function (x) { return x.canli; })[0]; assert(p3 && p3.dolum === 104.9 && p3.giris === 104.9 && s3.borsa.pozisyonlar[0].bizim === true, JSON.stringify(p3));
    // hedef mumu: kağıt 'hedef' kapatır, borsada pozisyon hâlâ açıksa piyasa emriyle kapatılır
    var hedef = sahte(['BTC', 'SOL'], 'YOK', function (coin, h4) { if (coin === 'SOL') { var h = seri(80, 14400, SN + 2 * 14400, 100, 0); h[79].open = 106; h[79].low = 105; h[79].high = 140; h[79].close = 130; return h; } return h4; });
    var b4 = borsaYap('acik', { poz: [{ symbol: 'SOL_USDT', positionType: 1, holdVol: 8, leverage: 5, openType: 1, positionId: 9, holdAvgPrice: 104.9 }] });
    var s4 = await I.izle(hedef, JSON.parse(JSON.stringify(s3)), SIMDI + 2 * 14400000, b4);
    var k = s4.kapali.filter(function (x) { return x.coin === 'SOL' && x.canli; })[0]; assert(k && k.neden === 'hedef' && k.r === 2, JSON.stringify(s4.kapali));
    assert(b4.log.some(function (x) { return x === 'kapat SOL_USDT'; }), b4.log.join(','));
  }),
  t('açık mod: 12 mum dolmayan canlı emir borsada iptal edilir; borsa iptal ettiyse kağıt da iptal', async function () {
    var b = borsaYap('acik');
    var s1 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b);
    var p = s1.acik.filter(function (x) { return x.canli; })[0];
    var yuksek = sahte(['BTC', 'SOL'], 'YOK', function (coin, h4) { if (coin === 'SOL') { var h = seri(80, 14400, SN + 13 * 14400, 100, 0); for (var i = 66; i < 80; i++) { h[i].open = 110; h[i].high = 112; h[i].low = 108; h[i].close = 111; } return h; } return h4; });
    var b2 = borsaYap('acik', { emir: [{ symbol: 'SOL_USDT', externalOid: p.oid }], emirDurum: { state: 2, dealVol: 0 } });
    var s2 = await I.izle(yuksek, JSON.parse(JSON.stringify(s1)), SIMDI + 13 * 14400000, b2);
    assert(s2.kapali.some(function (x) { return x.coin === 'SOL' && x.neden === 'dolmadı' && x.canli; }) && b2.log.some(function (x) { return x === 'iptal 42'; }), b2.log.join(','));
    var b3 = borsaYap('acik', { emirDurum: { state: 4, dealVol: 0 } });
    var s3 = await I.izle(sahte(['BTC', 'SOL'], 'YOK'), JSON.parse(JSON.stringify(s1)), SIMDI + 14400000, b3);
    assert(s3.kapali.some(function (x) { return x.coin === 'SOL' && x.neden === 'iptal' && x.canli; }) && !s3.acik.some(function (x) { return x.canli; }));
  }),
  t('açık mod: kilit, borsada dolu havuz ve aynı coin emri engeller; dKc canlı değil', async function () {
    var b = borsaYap('acik', { poz: [{ symbol: 'ETH_USDT', positionType: 1, holdVol: 1 }], emir: [{ symbol: 'XRP_USDT' }] });
    var s = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b);
    assert(!b.log.some(function (x) { return /^ac /.test(x); }) && s.hatalar.some(function (h) { return /açık işlem sınırı dolu/.test(h); }), JSON.stringify(s.hatalar));
    var b2 = borsaYap('acik', { emir: [{ symbol: 'SOL_USDT' }] });
    var s2 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b2);
    assert(s2.hatalar.some(function (h) { return /bu coinde işlem\/emir var/.test(h); }));
    var b3 = borsaYap('acik'), on = { surum: 1, mod: 'kagit', baslangic: SIMDI, acik: [], kapali: [], kararlar: [], sonMum: {}, gorulen: {}, sonStop: {}, kilit: SIMDI };
    var s3 = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), on, SIMDI, b3);
    assert(!b3.log.some(function (x) { return /^ac /.test(x); }) && s3.hatalar.some(function (h) { return /kilit/.test(h); }));
    assert.deepStrictEqual(Object.keys(I.CANLI).sort(), ['guc', 'kirilim']);
  }),
  t('borsa erişilemezse kağıt mod devam eder, hata kaydedilir', async function () {
    var b = borsaYap('acik'); b.c.hesap = async function () { throw new Error('ağ yok'); };
    var s = await I.izle(sahte(['BTC', 'SOL'], 'SOL'), null, SIMDI, b);
    assert(s.hatalar.some(function (h) { return /borsa: ağ yok/.test(h); }) && s.acik.some(function (x) { return x.coin === 'SOL' && !x.canli; }) && s.mod === 'kagit');
  })
];
Promise.all(testler).then(function () { console.log(n + ' test geçti'); }, function (e) { console.error(e); process.exit(1); });
