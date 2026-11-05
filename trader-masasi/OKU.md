# Trader Masası (kağıt mod)
Ayrı sayfa: `https://dkcburak.github.io/kripto-kokpit/trader-masasi/` (dKc kokpitinden bağımsız; coin listesi yok).
- `ajanlar.js`: T2 Kırılım, T3 Trend, T4 Funding, T5 Güç sinyal kuralları (saf fonksiyonlar). T1 dKc `tarayici-veri/tarayici.json`'dan okunur.
- `profesor.js`: 10 sert kural (ret) + 100 puanlık yumuşak sistem (70 altı bekle, 50 altı ret). Trend/Funding/Güç ilk 28 gün gözlem (kağıt karne, havuza sayılmaz).
- `izle.js`: saatlik (`.github/workflows/masa-izleme.yml`, :21), MEXC açık veri, durum `masa-veri` dalında `masa.json`. Emir yok, anahtar yok.
- `index.html`: panel; `masa.json`'u okur, 10 dakikada bir yeniler. `?veri=` ile başka kaynak denenebilir.
- Testler: `node test/masa.test.js && node test/masa-izle.test.js`. Geriye dönük test: `.github/workflows/masa-backtest.yml` (300 gün, 40 coin).
- Kurallar: /mnt/project-files/kripto/trader-paneli/ajanlar/ (Mac: ~/Calisma/kripto/trader-paneli/ajanlar/).
