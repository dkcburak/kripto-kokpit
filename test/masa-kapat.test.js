// node test/masa-kapat.test.js — acil durdurma (sahte borsa)
'use strict';
var assert = require('assert'), K = require('../trader-masasi/kapat.js');
var log = [];
var c = {
  emirler: async function () { return [{ symbol: 'SOL_USDT', orderId: '1', externalOid: 'profkirSOL1' }, { symbol: 'ETH_USDT', orderId: '2', externalOid: 'elle' }, { symbol: 'INJ_USDT', orderId: '3' }]; },
  iptal: async function (id) { log.push('iptal ' + id); },
  pozisyonlar: async function () { return [{ symbol: 'INJ_USDT', positionType: 1, holdVol: 2 }, { symbol: 'BTC_USDT', positionType: 1, holdVol: 1 }]; },
  kapat: async function (p) { log.push('kapat ' + p.symbol); },
  stoplar: async function () { return [{ id: 's1', symbol: 'INJ_USDT' }, { id: 's2', symbol: 'BTC_USDT' }]; },
  stopIptal: async function (ids) { log.push('stopIptal ' + ids.join(',')); }
};
var durum = { acik: [{ coin: 'INJ', trader: 'guc', canli: true, dolum: 8, giris: 8, stop0: 7.6, vol: 2, t: 1 }, { coin: 'ZEC', trader: 'dkc', canli: false }], kapali: [] };
K.durdur(durum, c, null).then(function (r) {
  assert(!r.hata.length, JSON.stringify(r));
  assert.deepStrictEqual(log, ['iptal 1', 'iptal 3', 'kapat INJ_USDT', 'stopIptal s1'], JSON.stringify(log)); // elle ETH emri ve BTC pozisyonu/stopu dokunulmaz
  assert(durum.kilit > 0 && durum.acik.length === 1 && durum.acik[0].coin === 'ZEC' && durum.kapali[0].neden === 'acil' && durum.kapali[0].coin === 'INJ');
  console.log('ok acil durdurma: yalnız Profesör emir/pozisyon/stopları, kilit kondu\n1 test geçti');
}).catch(function (e) { console.error(e); process.exit(1); });
