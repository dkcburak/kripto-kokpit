# KasaNot

Küçük işletmeler için fatura, fiş ve dekont okuyan muhasebe kayıt uygulaması. Telefona eklenen web uygulaması (PWA). Adres: `https://dkcburak.github.io/kripto-kokpit/kasanot/`

- **Akış:** belge ekle (fotoğraf, resim, PDF, e-fatura XML) -> okunur -> onay ekranı -> kayıt. Onaysız kayıt girmez.
- **Okuma:** e-fatura/e-arşiv XML (UBL-TR) yerelde ayrıştırılır (`mantik.js`, kesin, anahtarsız). Fotoğraf ve PDF Gemini API ile okunur (`okuma.js`, model `gemini-2.5-flash`, anahtar Ayarlar'dan, yalnız cihazda saklanır).
- **Cari:** VKN, sonra ünvan benzerliğiyle eşleşir; yoksa otomatik açılır. Bakiye işareti: artı = borcumuz, eksi = alacağımız. Dekont ödeme/tahsilat olarak bakiyeden düşer.
- **Ürün fiyatı:** alış kalemleri kaydedilir, önceki alıma göre değişim onay ekranında ve Ana'da uyarılır.
- **Peşin ödeme:** fişte "peşin ödendi" kutusu bakiye eklemeden kaydeder. **Excel:** ekstre ve tüm hareketler CSV olarak indirilir.
- **Personel:** çalışan, mesai (giriş/çıkış), avans, ay özeti (fazla mesai ve ödenecek tahmini).
- **Veri:** yalnız cihazda (IndexedDB), yedek JSON olarak indirilir. Sunucu yok, üyelik yok (Faz 3'te eklenecek).
- **Testler:** `node kasanot/test/mantik.test.js` (okuma, eşleştirme, bakiye, fiyat, personel hesabı).
- **KVKK notu:** Gemini ücretsiz katmanında gönderilen veri Google ürün geliştirmede kullanılabilir (ai.google.dev/gemini-api/docs/pricing). Gerçek müşteri belgeleri için ücretli katman gerekir. Personel verisi okumaya gönderilmez.
- Resmi muhasebe/e-defter yerine geçmez; yardımcı kayıt aracıdır.

## Bulut eşitleme (Supabase)
- Proje: `olzrmonvwhckufctblak.supabase.co` (ücretsiz plan; bir hafta kullanılmazsa duraklar). `bulut.js`: giriş (e-posta + şifre), işletme kurma, ekip üyesi ekleme, çift yönlü eşitleme (yerel IndexedDB önbellek + `kayit` tablosu, son yazan kazanır, silmeler işaretlenir), belge fotoğrafları `belgeler` deposunda (`<işletme>/<kayıt id>`).
- Şema ve RLS kuralları: `supabase-sema.sql`. Her satır yalnız o işletmenin üyelerince okunur/yazılır. İstemcideki anahtar "publishable" türüdür (herkese açık olması tasarım gereğidir). Gizli anahtar (`secret`/`service_role`) koda girmez.
- Kimlikler cihazda üretilir (zaman damgası × 1000 + rastgele); sunucu `guncelleme` zamanını kendisi yazar.
- Çevrimdışı çalışır: değişiklikler `cikis` kuyruğunda bekler, bağlantı gelince gider.
