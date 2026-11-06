# Profesör (eski adı Trader Masası)

## Canlı mod (6 Kas 2026: Burak "48 saat sonra gerçek para")
- Mod `trader-masasi/ayar.json` → `mod`: `kagit` (varsayılan) | `kuru` (hesabı okur, emri yazar, göndermez) | `acik` (gerçek emir). Repo değişkeni `MASA_MODU` varsa önce o.
- Gerekli secrets (Settings → Secrets and variables → Actions): `MEXC_API_KEY`, `MEXC_API_SECRET` (yalnız işlem yetkili, çekim kapalı). İsteğe bağlı `TELEGRAM_TOKEN` (chat 6930722980'e emir/dolum/kapanış bildirimi).
- Yalnız **Kırılım** ve **Güç** gerçek emir verir (`CANLI` izle.js); dKc, Trend, Funding kağıtta kalır. Short yok.
- Emir: Profesör onayı → giriş aralığının üstünden limit emir, stop ve Hedef 1 emirle birlikte borsaya gider (`emir.js`). 12 mumda dolmazsa iptal; süre dolunca piyasa emriyle kapanır. Dolum fiyatı borsadan okunur.
- Boyut: işlem başı risk %0,25 (ayar.json `risk`); 100 USDT'lik hesapta çoğu coinde en küçük kontrat bile bundan büyük olduğu için "küçük hesap" kuralı: en küçük kontratın kaybı özkaynağın %1'ini, teminatı %50'sini aşmıyorsa en küçük kontrat; aşarsa emir yok (panelde "emir yok").
- Havuz: borsadaki TÜM açık pozisyon + emirler sayılır (elle açılanlar dahil), en fazla 2; aynı coinde emir/pozisyon varsa girilmez.
- **Acil durdurma:** Actions → `masa-kapat` → `durdur`: kilit koyar, Profesör'ün emirlerini iptal eder, canlı pozisyonlarını kapatır (elle açılanlara dokunmaz). `ac` kilidi kaldırır. Kilitliyken yeni emir verilmez.
- Testler: `node test/masa-emir.test.js` (9), `node test/masa-kapat.test.js` (1). MEXC uç noktaları: api.mexc.com, order/create (25 Eki 2026'da gerçek test emriyle doğrulandı).

## Haberci (7. ajan, denetçi; 6 Kas 2026 Burak isteği)
- `haber.js`: makro takvim (FOMC kararı, ABD TÜFE, istihdam+işsizlik, ABD seçimi; kaynak federalreserve.gov ve bls.gov, TAKVIM dizisi) + haber akışı (CoinDesk, Cointelegraph, Decrypt RSS; her çalışmada son 12 saat, 7/24).
- Coin özelinde ağır haber (hack, delist, dava, iflas, depeg, unlock…) → o coine 24 saat SERT RET (`haber` kuralı). Takvim penceresi (±2 saat; seçim -12/+24 saat) ya da 6 saatte ≥3 ağır piyasa başlığı → `olay` → Profesör -25 puan.
- Panelde 6. halka (Haberci) ve "Haberci" bölümü: risk, bayraklı coinler, 48 saat içindeki takvim, son başlıklar. Kaynak okunamazsa sessiz (hata listesinde). Test: `node test/masa-haber.test.js` (6).

# Kağıt mod (başlangıç)
Ayrı sayfa: `https://dkcburak.github.io/kripto-kokpit/trader-masasi/` (dKc kokpitinden bağımsız; coin listesi yok).
- `ajanlar.js`: T2 Kırılım, T3 Trend, T4 Funding, T5 Güç sinyal kuralları (saf fonksiyonlar). T1 dKc `tarayici-veri/tarayici.json`'dan okunur.
- `profesor.js`: 10 sert kural (ret) + 100 puanlık yumuşak sistem (70 altı bekle, 50 altı ret). Trend/Funding/Güç ilk 28 gün gözlem (kağıt karne, havuza sayılmaz).
- `izle.js`: saatlik (`.github/workflows/masa-izleme.yml`, :21), MEXC açık veri, durum `masa-veri` dalında `masa.json`. Emir yok, anahtar yok.
- `index.html`: panel; `masa.json`'u okur, 10 dakikada bir yeniler. `?veri=` ile başka kaynak denenebilir.
- Testler: `node test/masa.test.js && node test/masa-izle.test.js`. Geriye dönük test: `.github/workflows/masa-backtest.yml` (300 gün, 40 coin).
- Kurallar: /mnt/project-files/kripto/trader-paneli/ajanlar/ (Mac: ~/Calisma/kripto/trader-paneli/ajanlar/).
