// Profesör gerçek emir katmanı (MEXC vadeli, api.mexc.com; 25 Eki 2026'da doğrulanan uç noktalar).
// Saf hesaplar (imza, boyut, emir gövdesi) testli: node test/masa-emir.test.js. Ağ istekleri yalnız istemci() üzerinden.
// Anahtar yalnız ortam değişkeninden okunur (GitHub Actions secrets: MEXC_API_KEY, MEXC_API_SECRET); koda ve kayda yazılmaz.
'use strict';
var crypto = require('crypto');
var TABAN = 'https://api.mexc.com', OID_ON = 'prof';
var AYAR = { kalMin: 5, kalMax: 10, miniRiskYuzde: 1, miniTeminatYuzde: 50, acikTavan: 2 };

function imza(secret, metin) { return crypto.createHmac('sha256', secret).update(metin).digest('hex'); }
function yuvarla(x, adim) { adim = Number(adim) || 0; if (!(adim > 0)) return Number(Number(x).toPrecision(8)); return Number((Math.round(x / adim) * adim).toFixed(10)); }

// Boyut: plan { giris:[a,b], stop, tp1 }, fiyat: limit fiyatı, ozkaynak: USDT, riskYuzde: işlem başı risk (özkaynak yüzdesi), detay: MEXC kontrat detayı.
// Kaldıraç stop uzaklığına göre 5x-10x, likidasyon stopun en az 2 katı uzakta. Küçük hesap: en küçük kontratın kaybı özkaynağın %1'ini, teminatı %50'sini aşmıyorsa en küçük kontrat.
function boyut(plan, fiyat, ozkaynak, riskYuzde, detay) {
  var stopMes = (fiyat - plan.stop) / fiyat;
  if (!(fiyat > 0) || !(stopMes > 0)) return { hata: 'stop fiyatın yanlış tarafında' };
  if (plan.tp1 <= fiyat) return { hata: 'fiyat Hedef 1\'i geçmiş' };
  if (!(ozkaynak > 0)) return { hata: 'özkaynak okunamadı' };
  var maxKal = Math.min(AYAR.kalMax, Math.floor(1 / (2 * stopMes)));
  if (maxKal < 1) return { hata: 'stop çok uzak' };
  var cs = Number(detay && detay.contractSize), minVol = Number(detay && detay.minVol) || 1;
  if (!(cs > 0)) return { hata: 'kontrat bilgisi yok' };
  var riskUsdt = ozkaynak * riskYuzde / 100, notional = riskUsdt / stopMes;
  var kal = Math.max(1, Math.min(maxKal, Math.max(AYAR.kalMin, Math.ceil(notional / ozkaynak))));
  var vol = Math.floor(notional / (fiyat * cs));
  if (vol < minVol) {
    var deger = minVol * fiyat * cs, kalM = Math.max(1, Math.min(maxKal, AYAR.kalMax)), temM = deger / kalM, riskM = deger * stopMes;
    if (riskM > ozkaynak * AYAR.miniRiskYuzde / 100) return { hata: 'en küçük kontratın kaybı ' + riskM.toFixed(2) + ' USDT, özkaynağın %' + AYAR.miniRiskYuzde + '\'ini aşıyor' };
    if (temM > ozkaynak * AYAR.miniTeminatYuzde / 100) return { hata: 'en küçük kontratın teminatı ' + temM.toFixed(2) + ' USDT, özkaynağa sığmıyor' };
    return { vol: minVol, kal: kalM, riskUsdt: riskM, teminat: temM, mini: true };
  }
  if (vol * fiyat * cs / kal > ozkaynak * 0.9) return { hata: 'teminat özkaynağı aşıyor' };
  return { vol: vol, kal: kal, riskUsdt: vol * fiyat * cs * stopMes, teminat: vol * fiyat * cs / kal, mini: false };
}
// Limit açılış emri, stop ve Hedef 1 emirle birlikte (MEXC: side 1 long aç, type 1 limit, openType 1 yalıtılmış)
function acGovde(sembol, fiyat, h, plan, detay, oid) {
  var pu = detay && detay.priceUnit;
  return { symbol: sembol, price: yuvarla(fiyat, pu), vol: h.vol, leverage: h.kal, side: 1, type: 1, openType: 1, stopLossPrice: yuvarla(plan.stop, pu), takeProfitPrice: yuvarla(plan.tp1, pu), externalOid: oid };
}
function kapatGovde(poz) {
  var lng = Number(poz.positionType) === 1;
  return { symbol: poz.symbol, price: 0, vol: Number(poz.holdVol), leverage: Number(poz.leverage), side: lng ? 4 : 2, type: 5, openType: Number(poz.openType) || 1, positionId: poz.positionId };
}
function oidUret(trader, coin, t) { return (OID_ON + trader.slice(0, 3) + coin + String(t)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32); }
function bizim(x) { return typeof (x && x.externalOid) === 'string' && x.externalOid.indexOf(OID_ON) === 0; }

// İmzalı istemci. fetchFn test için değiştirilebilir. Yanıt success değilse hata fırlatır.
function istemci(key, secret, fetchFn) {
  fetchFn = fetchFn || fetch;
  if (!key || !secret) throw new Error('MEXC anahtarı yok');
  async function istek(yontem, yol, param) {
    var zaman = String(Date.now()), metin = '', url = TABAN + yol, sec = { method: yontem.toUpperCase(), headers: {} };
    if (yontem === 'get') { metin = Object.keys(param || {}).sort().map(function (k) { return k + '=' + encodeURIComponent(param[k]); }).join('&'); if (metin) url += '?' + metin; }
    else { metin = JSON.stringify(param || {}); sec.body = metin; sec.headers['Content-Type'] = 'application/json'; }
    sec.headers.ApiKey = key; sec.headers['Request-Time'] = zaman; sec.headers.Signature = imza(secret, key + zaman + metin);
    var r = await fetchFn(url, sec), j = null;
    try { j = await r.json(); } catch (e) { throw new Error('MEXC yanıtı okunamadı (HTTP ' + r.status + ')'); }
    if (!j || j.success !== true) throw new Error('MEXC hata ' + (j && j.code) + ': ' + (j && j.message || 'bilinmiyor'));
    return j.data;
  }
  async function acik(yol) { var r = await fetchFn(TABAN + yol), j = await r.json(); if (!j || j.success !== true) throw new Error('MEXC açık veri hatası: ' + yol); return j.data; }
  return {
    hesap: async function () { var l = (await istek('get', '/api/v1/private/account/assets', {})) || [], u = l.filter(function (x) { return x.currency === 'USDT'; })[0] || {}; return { ozkaynak: Number(u.equity) || 0, kullanilabilir: Number(u.availableBalance) || 0 }; },
    pozisyonlar: async function () { return (await istek('get', '/api/v1/private/position/open_positions', {})) || []; },
    emirler: async function () { return (await istek('get', '/api/v1/private/order/list/open_orders', { page_num: 1, page_size: 50 })) || []; },
    emirDurum: async function (sembol, oid) { try { return await istek('get', '/api/v1/private/order/external/' + sembol + '/' + oid, {}); } catch (e) { if (/2013|not exist|bulunamad/i.test(e.message)) return null; throw e; } },
    detay: async function (sembol) { return acik('/api/v1/contract/detail?symbol=' + sembol); },
    ac: async function (govde) { return istek('post', '/api/v1/private/order/create', govde); },
    iptal: async function (orderId) { return istek('post', '/api/v1/private/order/cancel', [String(orderId)]); },
    kapat: async function (poz) { return istek('post', '/api/v1/private/order/create', kapatGovde(poz)); },
    stoplar: async function () { return (await istek('get', '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 50 })) || []; },
    stopIptal: async function (idler) { return istek('post', '/api/v1/private/stoporder/cancel', idler.map(function (x) { return { stopPlanOrderId: x }; })); }
  };
}
// Telegram (isteğe bağlı; TELEGRAM_TOKEN yoksa sessiz)
async function telegram(token, chat, metin, fetchFn) {
  if (!token || !chat) return false;
  try { var r = await (fetchFn || fetch)('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: metin }) }); return r.ok; } catch (e) { return false; }
}
module.exports = { AYAR: AYAR, OID_ON: OID_ON, imza: imza, yuvarla: yuvarla, boyut: boyut, acGovde: acGovde, kapatGovde: kapatGovde, oidUret: oidUret, bizim: bizim, istemci: istemci, telegram: telegram };
