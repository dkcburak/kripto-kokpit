// node test/monte-carlo.js R.json [islem=100] [risk=0.01] [hesap=100] [gunlukSinir=20] [tekrar=10000]
// Çevrimdışı "zaman makinesi": geçmiş işlem sonuçlarını (R cinsinden) rastgele yeniden dizip
// hesabın nasıl sapabileceğini ölçer. Bota/MEXC'ye dokunmaz, tahmin değil gerçeklik kontrolüdür.
// R.json: [1.9,-1,-1,2.1,...] düz sayı dizisi (her biri bir işlemin R sonucu).
'use strict';
var fs = require('fs');

function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function simule(r, o) {
  var rnd = rng(o.seed || 19), bitis = [], dd = [], batan = 0, yarisi = 0, i, j;
  for (i = 0; i < o.tekrar; i++) {
    var h = o.hesap, tepe = h, enAz = 0, bat = false;
    for (j = 0; j < o.islem; j++) {
      var x = r[Math.floor(rnd() * r.length)];
      h += x * o.risk * h;
      if (h > tepe) tepe = h;
      var d = (tepe - h) / tepe; if (d > enAz) enAz = d;
      if (h <= o.hesap * 0.5) bat = true;
    }
    bitis.push(h); dd.push(enAz); if (bat) yarisi++; if (h < o.hesap) batan++;
  }
  bitis.sort(function (a, b) { return a - b; }); dd.sort(function (a, b) { return a - b; });
  var q = function (a, p) { return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  return {
    ortalamaR: r.reduce(function (a, b) { return a + b; }, 0) / r.length,
    zararda: batan / o.tekrar, yariyaDustu: yarisi / o.tekrar,
    bitisP10: q(bitis, 0.1), bitisMedyan: q(bitis, 0.5), bitisP90: q(bitis, 0.9),
    ddMedyan: q(dd, 0.5), ddP90: q(dd, 0.9)
  };
}

// Risk kapısı: tek işlem planı geçer/geçmez (PASS/BLOCK), nedeniyle.
function kapi(plan, k) {
  var neden = [];
  if (!(plan.rr >= k.minRR)) neden.push('R:R ' + plan.rr + ' < ' + k.minRR);
  if (!(plan.riskUsdt <= k.hesap * k.maxRisk)) neden.push('risk ' + plan.riskUsdt + ' > hesabın %' + k.maxRisk * 100);
  if (!(plan.gunKayip + plan.riskUsdt <= k.gunlukSinir)) neden.push('günlük sınır (' + k.gunlukSinir + ') aşılır');
  if (!(plan.acik < k.maxAcik)) neden.push('açık pozisyon sınırı');
  return { sonuc: neden.length ? 'BLOCK' : 'PASS', neden: neden };
}

module.exports = { simule: simule, kapi: kapi };

if (require.main === module) {
  var a = process.argv;
  if (!a[2]) { console.log('Kullanım: node test/monte-carlo.js R.json [islem risk hesap gunlukSinir tekrar]'); process.exit(1); }
  var r = JSON.parse(fs.readFileSync(a[2], 'utf8'));
  var o = { islem: +a[3] || 100, risk: +a[4] || 0.01, hesap: +a[5] || 100, tekrar: +a[7] || 10000 };
  var s = simule(r, o);
  console.log(JSON.stringify(s, null, 2));
}
