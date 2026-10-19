// Örnek veri: API bağlanana kadar ekranların nasıl görüneceğini gösterir. Gerçek fiyat değildir.
window.KOKPIT_ORNEK = (function () {
  function c(coin, fiyat, deg24, durum, ozet, tf, plan, cizim, haberler, islemYok) {
    return { coin: coin, fiyat: fiyat, deg24: deg24, durum: durum, ozet: ozet, tf: tf, plan: plan || null, cizim: cizim || { destek: [], direnc: [], trend: [] }, haberler: haberler || [], islemYok: islemYok || '' };
  }
  function p(yon, g1, g2, stop, tp1, tp2, gecersiz) { return { yon: yon, giris: [g1, g2], stop: stop, tp1: tp1, tp2: tp2, gecersiz: gecersiz }; }
  var H = function (baslik, ozet, etki, yon, kaynak) { return { baslik: baslik, ozet: ozet, etki: etki, yon: yon, kaynak: kaynak, url: '#', zaman: 'bugün' }; };
  return {
    ornek: true,
    analizZamani: '12 Eki 08:00',
    piyasa: { mod: 'Temkinli', btc: 'Yatay', korku: { deger: 38, etiket: 'Korku' }, dominans: { btc: { deger: 60.4, h4: 'yukari', d: 'yukari' }, usdt: { deger: 6.76, h4: 'yatay', d: 'yukari' } }, not: 'BTC 82.500 desteği üstünde kaldıkça altcoinlerde seçici long aranabilir.' },
    coinler: [
      c('SOL', 107.2, 2.4, 'long', 'Fiyat 105,5–106,5 destek bölgesine yaklaşıyor. 1 saatlikte dönüş mumu gelirse long planı devreye girer.',
        { d: 'yukari', h4: 'yukari', h1: 'bekliyor' }, p('long', 105.5, 106.5, 101.5, 112.8, 119.7, '4 saatlik kapanış 101,5 altında olursa plan iptal.'),
        { destek: [[105.5, 106.5]], direnc: [[116.5, 117.5]], trend: [] },
        [H('Solana ağında günlük işlem hacmi rekor kırdı', 'Ağ kullanımı artıyor, kısa vadede olumlu.', 'Orta', 'Olumlu', 'TradingView'),
         H('Büyük bir ETF başvurusunda SEC kararı ertelendi', 'Belirsizlik sürüyor.', 'Düşük', 'Nötr', 'TradingView')]),
      c('NEAR', 4.91, -3.1, 'short', 'Günlük trend aşağı ve fiyat 5,05–5,15 direncine yakın. Dirençten red gelirse short planı geçerli.',
        { d: 'asagi', h4: 'asagi', h1: 'onay' }, p('short', 5.05, 5.15, 5.42, 4.62, 4.35, '4 saatlik kapanış 5,42 üstünde olursa plan iptal.'),
        { destek: [[4.55, 4.65]], direnc: [[5.05, 5.15]], trend: [] }),
      Object.assign(c('AVAX', 18.42, 1.8, 'long', 'Tarayıcı: 4S yukarı, 1G yukarı. Fiyat 18,1–18,4 bölgesine (4S EMA20) gelir ve 1 saatlikte onay olursa long.',
        { d: 'yukari', h4: 'yukari', h1: 'bekliyor' }, p('long', 18.1, 18.4, 17.35, 19.65, 20.6, '4 saatlik kapanış 17,35 altında olursa plan iptal.'),
        { destek: [[18.1, 18.4]], direnc: [], trend: [] }), { kaynak: 'tarayici', analizZamani: '12 Eki 09:15' }),
      c('BTC', 83540, -0.8, 'bekle', 'Fiyat 82.500 desteği ile 87.200 direnci arasında, bölgenin ortasında. Kenarlara gelmeden işlem yok.',
        { d: 'yukari', h4: 'yatay', h1: 'yok' }, null,
        { destek: [[82200, 82800]], direnc: [[86900, 87500]], trend: [] },
        [H('ABD enflasyon verisi bu hafta açıklanıyor', 'Veri öncesi oynaklık artabilir.', 'Yüksek', 'Nötr', 'TradingView')],
        'Fiyat destek ile direncin ortasında; kazanç/risk oranı yetersiz.'),
      c('ETH', 2468, -1.2, 'bekle', '2.410 desteğine %2,3 uzaklıkta. Destekte tepki beklenir.',
        { d: 'yatay', h4: 'asagi', h1: 'yok' }, null, { destek: [[2400, 2420]], direnc: [[2580, 2600]], trend: [] }, [], '1 günlük ve 4 saatlik yön çelişiyor.'),
      c('XRP', 1.388, 1.1, 'long', '1,36 desteğine %2 kaldı. Destek tutarsa hedef 1,45.',
        { d: 'yukari', h4: 'yukari', h1: 'bekliyor' }, p('long', 1.355, 1.365, 1.31, 1.445, 1.52, '1 günlük kapanış 1,31 altında olursa plan iptal.'),
        { destek: [[1.355, 1.365]], direnc: [[1.445, 1.46]], trend: [] }),
      c('BNB', 731, 0.4, 'bekle', '720 desteğine yakın ama 1 saatlikte onay yok.', { d: 'yukari', h4: 'yatay', h1: 'yok' }, null, { destek: [[716, 724]], direnc: [[772, 778]], trend: [] }, [], 'Onay mumu bekleniyor.'),
      c('HYPE', 84.9, 3.6, 'bekle', 'Güçlü yükseliş sonrası 82,7 desteğine geri çekilme bekleniyor.', { d: 'yukari', h4: 'yukari', h1: 'yok' }, null, { destek: [[82.2, 83.2]], direnc: [[89, 90]], trend: [] }, [], 'Fiyat giriş bölgesinden uzak.'),
      c('DOGE', 0.0836, -0.5, 'bekle', '0,0818 desteğine %2 uzaklıkta.', { d: 'yatay', h4: 'yatay', h1: 'yok' }, null, { destek: [[0.0814, 0.0822]], direnc: [[0.0895, 0.09]], trend: [] }, [], 'Yatay piyasa, net yön yok.'),
      c('TRX', 0.3262, 0.2, 'bekle', 'Dar bantta, 0,323 desteğine yakın.', { d: 'yatay', h4: 'yatay', h1: 'yok' }, null, { destek: [[0.3225, 0.3235]], direnc: [[0.333, 0.334]], trend: [] }, [], 'Hedefe kadar kazanç/risk oranı 2’nin altında.'),
      c('ENA', 0.236, -2.2, 'bekle', '0,228 desteğine doğru geri çekiliyor.', { d: 'asagi', h4: 'yatay', h1: 'yok' }, null, { destek: [[0.226, 0.23]], direnc: [[0.26, 0.264]], trend: [] }, [], '1 günlük trend aşağı, long için erken.'),
      c('TIA', 0.508, 1.9, 'bekle', '0,495 desteği üstünde toparlanma denemesi.', { d: 'asagi', h4: 'yukari', h1: 'yok' }, null, { destek: [[0.492, 0.498]], direnc: [[0.59, 0.597]], trend: [] }, [], '1 günlük ve 4 saatlik yön çelişiyor.'),
      c('CFX', 0.0612, 4.8, 'bekle', 'Sert yükseliş sonrası direnç altında.', { d: 'asagi', h4: 'yukari', h1: 'yok' }, null, { destek: [[0.058, 0.059]], direnc: [[0.0725, 0.073]], trend: [] }, [], 'Fiyat bölgenin ortasında.'),
      c('ZEC', 1244, 6.9, 'uzak', 'Son 24 saatte çok oynak. Haber akışı yoğun; sakinleşene kadar uzak durun.', { d: 'yukari', h4: 'yukari', h1: 'yok' }, null, { destek: [[1190, 1210]], direnc: [[1340, 1355]], trend: [] },
        [H('Zcash için büyük borsada yeni vadeli işlem çifti', 'Hacim ve oynaklık arttı.', 'Yüksek', 'Olumlu', 'TradingView')], 'Aşırı oynaklık: stop mesafesi %8’in üstünde.'),
      c('XMR', 548, -1.6, 'uzak', 'Stop mesafesi çok geniş; risk/kazanç uygun değil.', { d: 'yatay', h4: 'asagi', h1: 'yok' }, null, { destek: [[520, 530]], direnc: [[606, 612]], trend: [] }, [], 'Stop mesafesi %8’in üstünde.'),
      c('STRK', 0.0985, -4.2, 'uzak', 'Token kilit açılımı yaklaşıyor; satış baskısı olabilir.', { d: 'asagi', h4: 'asagi', h1: 'yok' }, null, { destek: [[0.09, 0.093]], direnc: [[0.12, 0.124]], trend: [] },
        [H('STRK token kilit açılımı bu ay', 'Arz artışı fiyatı baskılayabilir.', 'Yüksek', 'Olumsuz', 'TradingView')], 'Yaklaşan token kilit açılımı.')
    ],
    alarmlar: [
      { coin: 'SOL', tur: 'giris', seviye: 106.5, durum: 'bekliyor' }, { coin: 'SOL', tur: 'stop', seviye: 101.5, durum: 'bekliyor' }, { coin: 'SOL', tur: 'tp1', seviye: 112.8, durum: 'bekliyor' },
      { coin: 'NEAR', tur: 'giris', seviye: 5.05, durum: 'bekliyor' }, { coin: 'NEAR', tur: 'stop', seviye: 5.42, durum: 'bekliyor' },
      { coin: 'XRP', tur: 'giris', seviye: 1.365, durum: 'bekliyor' }, { coin: 'XRP', tur: 'stop', seviye: 1.31, durum: 'bekliyor' }
    ],
    karne: { gun: 7, plan: 9, bekliyor: 1, girdi: 1, tp1: 1, stop: 5, gelmedi: 1, iptal: 0, sinyal: 0, sinyalTp1: 0, sinyalStop: 0, isabet: 17 },
    tetiklenen: [
      { zaman: '11 Eki 21:40', coin: 'HYPE', tur: 'tp1', seviye: 89, fiyat: 89.1 }
    ]
  };
})();

// Örnek mum üretici: aynı coin için hep aynı şekli verir.
window.KOKPIT_ORNEK_MUM = function (coin, tf, fiyat) {
  var tohum = 0; for (var i = 0; i < coin.length; i++) tohum = (tohum * 31 + coin.charCodeAt(i)) % 9973;
  tohum += tf === 'd' ? 1 : tf === 'h4' ? 2 : tf === 'm15' ? 4 : 3;
  function rnd() { tohum = (tohum * 9301 + 49297) % 233280; return tohum / 233280; }
  var adim = tf === 'd' ? 86400 : tf === 'h4' ? 14400 : tf === 'm15' ? 900 : 3600, n = 120, oyn = tf === 'd' ? 0.025 : tf === 'h4' ? 0.011 : tf === 'm15' ? 0.0025 : 0.005;
  var simdi = Math.floor(Date.now() / 1000 / adim) * adim, p = fiyat * (0.93 + rnd() * 0.1), out = [];
  for (var k = 0; k < n; k++) {
    var hedef = fiyat, kalan = n - k;
    var o = p, c = o + (hedef - o) / Math.max(kalan, 8) + (rnd() - 0.5) * fiyat * oyn * 2;
    if (k === n - 1) c = fiyat;
    var h = Math.max(o, c) + rnd() * fiyat * oyn, l = Math.min(o, c) - rnd() * fiyat * oyn;
    out.push({ time: simdi - (n - 1 - k) * adim, open: o, high: h, low: l, close: c, vol: Math.round(500 + rnd() * 1500) }); p = c;
  }
  return out;
};
