# dKc (Kripto Kokpit)

Burak Bey'in coin takip uygulaması; ekranda adı **dKc**. Repo ve adres `kripto-kokpit` olarak kalır. Telefon öncelikli, ana ekrana eklenebilir web uygulaması (GitHub Pages).

- **Ekran:** `index.html`, `app.css`, `app.js` (Kokpit, coin detayı, İşlemlerim, alarmlar); saf hesaplar `hesap.js` (testi: `node test/hesap.test.js`). Pozisyon, favori ve sermaye yalnızca cihazda (localStorage) tutulur. Grafik: `lib/lightweight-charts-4.2.0.js` (TradingView Lightweight Charts, Apache 2.0, logo atfı açık).
- **Veri:** Apps Script "Kripto Alarm Motoru" `doGet` (`?k=ANAHTAR&f=ozet` ve `&f=mum&coin=SOL&tf=h4`). Kod: `/mnt/project-files/kripto/alarm-motoru/Kod.gs`.
- **Analiz:** Claude rutinleri 08:00/19:30 `kokpit-analiz-*.json` yazar (bkz. `ANALIZ-FORMATI.md`, kontrol: `analiz-kontrol.js`).
- **Bildirim:** OneSignal web push (`bildirim.js`, `OneSignalSDKWorker.js`). Apps Script alarm çalınca OneSignal REST API'ye gönderir (`ONESIGNAL_KEY`, `ONESIGNAL_APP_ID` Script Properties'te).
- **Girişe uygun (trafik ışığı):** `hesap.js` `karar()`. Yeşil: analiz plan yönünde hazır, 4S plan yönünde ve 1G ters değil (sınıf A: 1G de aynı yönde, risk %1; sınıf B: 1G yatay, risk %0,5 ve 1S "onay" şart), 1S onaylı, ücret sonrası Hedef 1 kazanç/riski en az 1,5, 5x içinde, analiz 12 saatten yeni, ters yönde "Yüksek" haber yok, piyasa filtresi (long: "Riskten kaçış" değil, short: "Risk açık" değil), funding aşırı değil ve fiyat giriş bölgesinde. Sarı: plan var, eksik koşul yazılır. Kırmızı: plan yok, geçersiz ya da stop geçildi. Emir değildir.
- **Grafik katmanları:** Plan (giriş kutusu, stop/hedef alanı, R), Seviyeler (gri destek/direnç bandı, tepe/dip), RSI · Hacim. Lightweight Charts primitive ile tuvale çizilir. Telefonda varsayılan yalnız Plan.
- **Grafik hızı:** mumlar cihazda saklanır (en fazla 30), grafik anında açılır, arkada yenilenir; ana ekranda önceden yüklenir.
- **Ayar:** `ayar.js`; `api` boşsa uygulama örnek veriyle (`ornek.js`) açılır.

## Yayına alma adımları
1. GitHub `dkcburak/kripto-kokpit` (public) + Pages (main, root). Bu klasörün içeriği repo köküne. `taslak/`, `ANALIZ-FORMATI.md` ve `analiz-kontrol.js` repoya gerekmez.
2. Apps Script'e güncel `Kod.gs` yapıştırılır, `kokpitKurulum` çalıştırılır (PANEL_ANAHTAR oluşur). Script Properties'e `KOKPIT_URL=https://dkcburak.github.io/kripto-kokpit/` eklenir.
3. Dağıt → Yeni dağıtım → Web uygulaması, "Ben olarak çalıştır", erişim "Herkes". `/exec` adresi ve PANEL_ANAHTAR `ayar.js`'e yazılır.
4. OneSignal: App ID `ayar.js`'e ve Script Properties'e (`ONESIGNAL_APP_ID`); REST API Key yalnızca Burak Bey tarafından `ONESIGNAL_KEY` olarak girilir.
5. Telefonda: Safari → Paylaş → Ana Ekrana Ekle → uygulamayı ana ekrandan aç → Alarmlarım → Bildirimleri aç. Sonra `bildirimTest`.
