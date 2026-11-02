// node test/monte-carlo.test.js
'use strict';
var assert = require('assert'), M = require('./monte-carlo.js');
var o = { islem: 100, risk: 0.01, hesap: 100, tekrar: 2000, seed: 19 };
var artili = M.simule([2, -1, -1, 2, -1], o);   // ortalama +0,2R
var eksili = M.simule([1, -1, -1, 1, -1], o);   // ortalama -0,2R
assert.ok(artili.ortalamaR > 0 && eksili.ortalamaR < 0);
assert.ok(artili.zararda < eksili.zararda, 'artı beklenti daha az zararda biter');
assert.deepStrictEqual(M.simule([2, -1, -1], o), M.simule([2, -1, -1], o), 'aynı tohum aynı sonuç');
var k = { minRR: 1.5, hesap: 100, maxRisk: 0.01, gunlukSinir: 20, maxAcik: 1 };
assert.strictEqual(M.kapi({ rr: 2, riskUsdt: 1, gunKayip: 0, acik: 0 }, k).sonuc, 'PASS');
var b = M.kapi({ rr: 1, riskUsdt: 5, gunKayip: 18, acik: 1 }, k);
assert.strictEqual(b.sonuc, 'BLOCK'); assert.strictEqual(b.neden.length, 4);
console.log('ok monte-carlo');
