// Bot.gs testi: node test/test-bot.js (Apps Script servisleri sahte)
'use strict';
var crypto = require('crypto'), assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var kayitlar = [], props = {}, istekler = [], mesajlar = [], cevap = {};
var ctx = {
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] == null ? null : props[k]; }, setProperty: function (k, v) { props[k] = String(v); } }; } },
  Utilities: { computeHmacSha256Signature: function (m, s) { return Array.from(crypto.createHmac('sha256', s).update(m).digest()).map(function (b) { return b > 127 ? b - 256 : b; }); },
    formatDate: function (d) { return d.toISOString().slice(0, 10); } },
  LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
  UrlFetchApp: { fetch: function (url, sec) {
    istekler.push({ url: url, sec: sec || {} });
    var yol = url.replace('https://api.mexc.com', '').split('?')[0];
    var d = cevap[yol]; if (typeof d === 'function') d = d(url, sec);
    return { getResponseCode: function () { return 200; }, getContentText: function () { return JSON.stringify(d === undefined ? { success: true, data: [] } : d); } };
  } },
  telegramGonder: function (m) { mesajlar.push(m); }, tablo: function () { return { getSheetByName: function () { return { appendRow: function (r) { kayitlar.push(r); } }; } }; }, Logger: { log: function () {} }, Date: Date, JSON: JSON, Math: Math
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'Bot.gs'), 'utf8'), ctx);
var n = 0; function t(ad, fn) { props = {}; istekler = []; mesajlar = []; cevap = {}; fn(); n++; console.log('GEÇTİ  ' + ad); }

var LONG = { yon: 'long', giris: [100, 101], stop: 96, tp1: 109 };
var ok = function (d) { return { success: true, data: d }; };
function hesap(ozk) { cevap['/api/v1/private/account/assets'] = ok([{ currency: 'USDT', equity: ozk, availableBalance: ozk }]); }

t('imza: MEXC örneğiyle aynı HMAC-SHA256 hex', function () {
  var beklenen = crypto.createHmac('sha256', 'sir').update('k1700000000000a=1').digest('hex');
  assert.strictEqual(ctx.mexcImza('sir', 'k1700000000000a=1'), beklenen);
});
t('emir hesabı: risk, kaldıraç 5x-10x, kontrat adedi', function () {
  var h = ctx.botEmirHesap(LONG, 100, 100, 50, 1, { contractSize: 0.1, minVol: 1 });
  // risk 1 USDT, stop %4 -> 25 USDT pozisyon -> 2 kontrat (0,1 x 100 = 10 USDT/kontrat)
  assert.strictEqual(h.vol, 2); assert.strictEqual(h.kal, 5); assert(h.riskUsdt <= 1 + 1e-9);
  assert(1 / h.kal > 2 * 0.04 - 1e-9, 'likidasyon stopun 2 katı ötesinde');
});
t('emir hesabı: 100 USDT ve %0,25 riskte BTC en küçük emirden küçük kalır', function () {
  var h = ctx.botEmirHesap({ yon: 'long', giris: [82000, 82300], stop: 79000, tp1: 88000 }, 82200, 100, 50, 0.25, { contractSize: 0.0001, minVol: 1 });
  assert(/en küçük emirden/.test(h.hata));
});
t('emir hesabı: stop yanlış tarafta ya da Hedef 1 geçilmişse emir yok', function () {
  assert(ctx.botEmirHesap(LONG, 95, 100, 50, 1, { contractSize: 0.1 }).hata);
  assert(ctx.botEmirHesap(LONG, 110, 100, 50, 1, { contractSize: 0.1 }).hata);
});
t('küçük hesap: 1,34 USDT\'de en küçük kontrat, 10x, kayıp bakiyenin %15\'i altında', function () {
  var d = { contractSize: 0.0001, minVol: 1 }, pl = { yon: 'long', stop: 79100, tp1: 82700 };
  assert(ctx.botEmirHesap(pl, 80300, 1.34, 0.67, 0.25, d, false).hata);
  var h = ctx.botEmirHesap(pl, 80300, 1.34, 0.67, 0.25, d, true);
  assert(h.mini && h.vol === 1 && h.kal === 10 && h.riskUsdt < 1.34 * 0.15 && h.teminat < 1.34 * 0.8);
});
t('küçük hesap: stop çok uzaksa (kayıp %15 üstü) emir yok', function () {
  assert(ctx.botEmirHesap({ yon: 'long', stop: 76000, tp1: 85000 }, 80300, 1.34, 0.67, 0.25, { contractSize: 0.0001, minVol: 1 }, true).hata);
});
t('mod kapalıyken hiçbir istek atılmaz', function () {
  assert.strictEqual(ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' }), null);
  assert.strictEqual(istekler.length, 0);
});
t('kuru mod: hesaplar, Telegram\'a yazar, emir göndermez', function () {
  props.BOT_MODU = 'kuru'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; props.BOT_RISK = '1'; hesap(100);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.1, minVol: 1 });
  var h = ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(h && h.vol === 2); assert(/KURU/.test(mesajlar[0]));
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); }));
});
t('açık mod: emir stop ve Hedef 1 ile gider, imza başlıkları var', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; props.BOT_RISK = '1'; hesap(100);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.1, minVol: 1 }); cevap['/api/v1/private/order/create'] = ok('123');
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A+' });
  var e = istekler.filter(function (x) { return /order\/create/.test(x.url); })[0], g = JSON.parse(e.sec.payload);
  assert.strictEqual(g.stopLossPrice, 96); assert.strictEqual(g.takeProfitPrice, 109); assert.strictEqual(g.side, 1); assert.strictEqual(g.openType, 1);
  assert(e.sec.headers.Signature && e.sec.headers.ApiKey === 'k');
});
t('veto ya da B sınıfı sinyalde emir yok', function () {
  props.BOT_MODU = 'acik';
  assert.strictEqual(ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'B' }), null);
  assert.strictEqual(ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A', veto: 'ters' }), null);
  assert.strictEqual(istekler.length, 0);
});
t('günlük -%20: yalnız botun kendi sonucu sayılır; elle işlemin zararı botu durdurmaz', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; props.BOT_RISK = '1';
  var gun = new Date().toISOString().slice(0, 10);
  props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_GUN = JSON.stringify({ tarih: gun, baslangic: 100, semboller: { XRP_USDT: 1 }, durdu: false });
  hesap(80); // hesap -20: elle işlem zararı
  cevap['/api/v1/private/position/list/history_positions'] = ok([{ symbol: 'XRP_USDT', realised: -1, closeTime: Date.now() }, { symbol: 'ETH_USDT', realised: -50, closeTime: Date.now() }]);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.1, minVol: 1 }); cevap['/api/v1/private/order/create'] = ok('5');
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(istekler.some(function (x) { return /order\/create/.test(x.url); }), 'bot zararı -1, sınır -20: emir gider');
});
t('günlük -%20: botun kendi sonucu sınıra varınca yeni emir yok', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_GUN = JSON.stringify({ tarih: new Date().toISOString().slice(0, 10), baslangic: 100, semboller: { XRP_USDT: 1 }, durdu: false }); hesap(100);
  cevap['/api/v1/private/position/list/history_positions'] = ok([{ symbol: 'XRP_USDT', realised: -20.1, closeTime: Date.now() }]);
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); })); assert(/günlük zarar/.test(mesajlar[0]));
});
t('günlük zarar: açık pozisyonun anlık zararı da sayılır', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_GUN = JSON.stringify({ tarih: new Date().toISOString().slice(0, 10), baslangic: 100, semboller: { XRP_USDT: 1 }, durdu: false }); hesap(100);
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'XRP_USDT', positionType: 1, holdVol: 100, holdAvgPrice: 1, realised: 0 }]);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 10, minVol: 1 }); cevap['/api/v1/contract/ticker'] = ok({ lastPrice: 0.96 });
  var r = ctx.botGunlukZararAsildi(100); // (0,96-1) x 100 x 10 = -40
  assert(r.asildi && Math.abs(r.sonuc + 40) < 1e-9);
});
t('günlük zarar okunamazsa güvenli taraf: emir yok, hata bildirilir', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(100);
  props.BOT_GUN = JSON.stringify({ tarih: new Date().toISOString().slice(0, 10), baslangic: 100, semboller: { XRP_USDT: 1 }, durdu: false });
  cevap['/api/v1/private/position/list/history_positions'] = { success: false, code: 600, message: 'x' };
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); })); assert(/Hata/.test(mesajlar[0]));
});
t('tek yön: ters pozisyon açıkken emir yok (elle açılan dahil)', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(100);
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'ETH_USDT', positionType: 2, holdVol: 1 }]);
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); })); assert(/ters yönde/.test(mesajlar[0]));
});
t('elle açık aynı yönlü işlem botu engellemez; bot başka coine girer ve yalnız onu işaretler', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; props.BOT_RISK = '1'; hesap(100);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.1, minVol: 1 }); cevap['/api/v1/private/order/create'] = ok('7');
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'ETH_USDT', positionType: 1, holdVol: 1 }]);
  cevap['/api/v1/private/order/list/open_orders'] = ok([{ symbol: 'BTC_USDT', orderId: 55, createTime: 0 }]);
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(istekler.some(function (x) { return /order\/create/.test(x.url); }));
  var m = JSON.parse(props.BOT_SEMBOLLER); assert(m.SOL_USDT); assert(!m.ETH_USDT && !m.BTC_USDT);
});
t('elle işlem olan coine bot girmez', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(100);
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'SOL_USDT', positionType: 1, holdVol: 1 }]);
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); })); assert(/elle açılmış/.test(mesajlar[0]));
});
t('botun kendi işlemi varken ikinci işlem yok (en fazla 1)', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(100);
  props.BOT_SEMBOLLER = JSON.stringify({ XRP_USDT: Date.now() });
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'XRP_USDT', positionType: 1, holdVol: 1 }]);
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  assert(!istekler.some(function (x) { return /order\/create/.test(x.url); }));
});
t('kill switch: botu kapatır, yalnız botun emir ve pozisyonlarına dokunur', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_SEMBOLLER = JSON.stringify({ SOL_USDT: Date.now() });
  cevap['/api/v1/private/position/open_positions'] = ok([
    { symbol: 'SOL_USDT', positionType: 1, holdVol: 3, leverage: 5, openType: 1, positionId: 9 },
    { symbol: 'ETH_USDT', positionType: 2, holdVol: 1, leverage: 5, openType: 1, positionId: 10 }]);
  cevap['/api/v1/private/order/list/open_orders'] = ok([{ symbol: 'SOL_USDT', orderId: 1 }, { symbol: 'BTC_USDT', orderId: 2 }]);
  cevap['/api/v1/private/stoporder/list/orders'] = ok([{ symbol: 'SOL_USDT', id: 11 }, { symbol: 'ETH_USDT', id: 12 }]);
  ctx.botKillSwitch();
  assert.strictEqual(props.BOT_MODU, 'kapali');
  var k = istekler.filter(function (x) { return /order\/create/.test(x.url); }).map(function (x) { return JSON.parse(x.sec.payload); });
  assert.strictEqual(k.length, 1); assert.strictEqual(k[0].symbol, 'SOL_USDT'); assert.strictEqual(k[0].side, 4); assert.strictEqual(k[0].type, 5); assert.strictEqual(k[0].vol, 3);
  var ic = istekler.filter(function (x) { return /\/order\/cancel$/.test(x.url); })[0]; assert.deepStrictEqual(JSON.parse(ic.sec.payload), [1]);
  var sc = istekler.filter(function (x) { return /stoporder\/cancel$/.test(x.url); })[0]; assert.deepStrictEqual(JSON.parse(sc.sec.payload), [{ stopPlanOrderId: 11 }]);
  assert(!istekler.some(function (x) { return /cancel_all/.test(x.url); })); assert(/KILL SWITCH/.test(mesajlar[0]));
});
t('bakım: kuru modda hiçbir şey yapmaz; açık modda yalnız botun eski emrini iptal eder', function () {
  props.BOT_MODU = 'kuru'; ctx.botBakim(); assert.strictEqual(istekler.length, 0);
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(100);
  props.BOT_SEMBOLLER = JSON.stringify({ SOL_USDT: Date.now() });
  cevap['/api/v1/private/order/list/open_orders'] = ok([{ symbol: 'SOL_USDT', orderId: 1, createTime: 0 }, { symbol: 'BTC_USDT', orderId: 2, createTime: 0 }]);
  ctx.botBakim();
  var ic = istekler.filter(function (x) { return /\/order\/cancel$/.test(x.url); }); assert.strictEqual(ic.length, 1); assert.deepStrictEqual(JSON.parse(ic[0].sec.payload), [1]);
});
t('v1.5: emir numarası nesne gelirse Telegram\'a orderId yazılır, [object Object] yazılmaz', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; props.BOT_RISK = '1'; hesap(100);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.1, minVol: 1 });
  cevap['/api/v1/private/order/create'] = ok({ orderId: '777', ts: 1 });
  ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' });
  var m = mesajlar.filter(function (x) { return /Emir verildi/.test(x); })[0];
  assert(m && /no 777\)/.test(m) && !/object/.test(m));
});
t('v1.5: dünden kalan pozisyon bugün stopla kapanınca zararı günlük sınıra sayılır', function () {
  var bugun = new Date().toISOString().slice(0, 10);
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's'; hesap(10);
  props.BOT_SEMBOLLER = JSON.stringify({ BTC_USDT: Date.now() - 3600000 });
  props.BOT_GUN = JSON.stringify({ tarih: bugun, baslangic: 10, semboller: {}, durdu: false });
  cevap['/api/v1/private/stoporder/list/orders'] = ok([]);
  cevap['/api/v1/private/position/list/history_positions'] = ok({ resultList: [{ symbol: 'BTC_USDT', closeTime: Date.now() - 1000, realised: -2.1 }] });
  ctx.botBakim();
  var g = JSON.parse(props.BOT_GUN); assert(g.durdu, 'günlük zarar sınırı doldu (-2,1 <= -2)'); assert(g.semboller.BTC_USDT);
});
t('anahtar yoksa emir denenmez, hata Telegram\'a yazılır', function () {
  props.BOT_MODU = 'acik';
  assert.strictEqual(ctx.botSinyal({ coin: 'SOL', fiyat: 100, plan: LONG }, { sinif: 'A' }), null);
  assert(/anahtar/.test(mesajlar[0])); assert.strictEqual(istekler.length, 0);
});
t('anahtar bitişine 5 günden azsa günde bir kez hatırlatır; uzaksa susar', function () {
  ctx.botAnahtarHatirlat(); assert.strictEqual(mesajlar.length, 0);
  props.BOT_ANAHTAR_BITIS = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  ctx.botAnahtarHatirlat(); ctx.botAnahtarHatirlat(); assert.strictEqual(mesajlar.length, 1); assert(/gün içinde bitiyor/.test(mesajlar[0]));
});
t('her bot mesajı Bot sekmesine de yazılır; sekme hatası botu bozmaz', function () {
  kayitlar.length = 0; ctx.botBildir('deneme'); assert.strictEqual(kayitlar.length, 1); assert(/deneme/.test(kayitlar[0][1]));
  ctx.tablo = function () { throw new Error('yok'); }; ctx.botBildir('x'); assert.strictEqual(mesajlar.length, 2);
});
t('aynı atlandı mesajı 6 saatte bir kez gider', function () {
  props.BOT_MODU = 'kuru'; ctx.botNot('kuru', 'INJ atlandı'); ctx.botNot('kuru', 'INJ atlandı'); ctx.botNot('kuru', 'BTC atlandı');
  assert.strictEqual(mesajlar.length, 2);
});
t('botDurum: salt okunur, anahtar sızdırmaz, stopsuz botun pozisyonu uyarı verir', function () {
  props.BOT_MODU = 'acik'; props.MEXC_API_KEY = 'gizli-anahtar'; props.MEXC_API_SECRET = 'gizli-sir'; props.BOT_SEMBOLLER = JSON.stringify({ BTC_USDT: 1 }); props.BOT_SON_BAKIM = String(Date.now()); hesap(100.67);
  cevap['/api/v1/private/position/open_positions'] = ok([{ symbol: 'BTC_USDT', positionType: 1, holdVol: 2, holdAvgPrice: 80000, leverage: 5, realised: 0 }]);
  cevap['/api/v1/private/stoporder/list/orders'] = ok([]);
  cevap['/api/v1/contract/detail'] = ok({ contractSize: 0.0001, minVol: 1 }); cevap['/api/v1/contract/ticker'] = ok({ lastPrice: 80500 });
  cevap['/api/v1/private/position/list/history_positions'] = ok({ resultList: [{ symbol: 'ETH_USDT', positionType: 2, realised: -0.2, closeTime: 1 }] });
  var d = ctx.botDurum();
  assert.strictEqual(d.mod, 'acik'); assert(Math.abs(d.ozkaynak - 100.67) < 1e-9); assert.strictEqual(d.sinir, -20);
  assert.strictEqual(d.pozisyonlar.length, 1); assert(Math.abs(d.pozisyonlar[0].pnl - 0.1) < 1e-9);
  assert(d.uyarilar.some(function (u) { return /stopu görünmüyor/.test(u); }));
  assert.strictEqual(d.gecmis[0].sembol, 'ETH_USDT');
  assert(!/gizli/.test(JSON.stringify(d)), 'anahtar yanıtta olmamalı');
  assert(!istekler.some(function (x) { return /order\/(create|cancel)/.test(x.url); }), 'emir yok');
});
t('v1.8: gün içinde para yatırılırsa günlük sınır tabanı yükselir, düşmez', function () {
  var gun = new Date().toISOString().slice(0, 10);
  props.BOT_GUN = JSON.stringify({ tarih: gun, baslangic: 1.4, semboller: {}, durdu: false });
  var g = ctx.botGun(100.67); assert.strictEqual(g.baslangic, 100);
  assert.strictEqual(JSON.parse(props.BOT_GUN).baslangic, 100);
  assert.strictEqual(ctx.botGun(60).baslangic, 100, 'bakiye düşünce taban düşmez');
  assert.strictEqual(ctx.botGun(0).baslangic, 100, 'ozkaynak 0 (sembol ekleme çağrısı) tabanı bozmaz');
  var r = ctx.botGunlukZararAsildi(100.67); assert.strictEqual(r.sinir, -20);
});
t('v1.9: closeTime boşsa updateTime/createTime kullanılır, kapanan zarar günlük sonuca girer', function () {
  assert.strictEqual(ctx.botKapanis({ closeTime: 5, updateTime: 6 }), 5);
  assert.strictEqual(ctx.botKapanis({ updateTime: 6, createTime: 7 }), 6);
  assert.strictEqual(ctx.botKapanis({ createTime: 7 }), 7);
  assert.strictEqual(ctx.botKapanis({}), 0);
  var gun = new Date().toISOString().slice(0, 10);
  props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_GUN = JSON.stringify({ tarih: gun, baslangic: 100, semboller: { XRP_USDT: 1 }, durdu: false });
  cevap['/api/v1/private/position/open_positions'] = ok([]);
  cevap['/api/v1/private/position/list/history_positions'] = ok({ resultList: [{ symbol: 'XRP_USDT', realised: -7, updateTime: Date.now() }] });
  var r = ctx.botGunlukZararAsildi(100); assert(Math.abs(r.sonuc + 7) < 1e-9 || r.sonuc === -7, 'kapanan zarar sayılmalı: ' + JSON.stringify(r));
});
t('v1.9: günlük özet sayaç ve bot durumunu mesaja yazar', function () {
  var bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  props.SINYAL_SAYAC = JSON.stringify({ gun: bugun, bolgede: { BTC: 1 }, sinyal: {}, durum: { BTC: '1S onayı yok' } });
  props.MEXC_API_KEY = 'k'; props.MEXC_API_SECRET = 's';
  props.BOT_MODU = 'acik'; props.BOT_GUN = JSON.stringify({ tarih: bugun, baslangic: 100, semboller: {}, durdu: false }); hesap(100.67);
  cevap['/api/v1/private/position/open_positions'] = ok([]);
  mesajlar.length = 0; ctx.botGunlukOzet();
  var m = mesajlar.join('\n'); assert(/Günlük özet/.test(m)); assert(/BTC/.test(m)); assert(/1S onayı yok/.test(m)); assert(/100\.67/.test(m));
});
console.log('\nSonuç: ' + n + ' geçti');
