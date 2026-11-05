# Trader Masası geriye dönük test sonucu (5 Kas 2026)
Kaynak: GitHub Actions `masa-backtest` çalışması https://github.com/dkcburak/kripto-kokpit/actions/runs/41940556499 (MEXC açık veri, 300 gün, 40 coin, 9 Oca – 5 Kas 2026; TRAIN ilk 210 gün, TEST son 90 gün).
Tüm sayılar TAHMİNDİR: evren bugünkü hacim sırası (hayatta kalma yanlılığı), giriş sonraki mum açılışı, funding ödemesi yok, ücret+kayma %0,1. R = ücret sonrası net.

| Trader | İşlem | Toplam R | R/işlem | İsabet | En kötü düşüş | TRAIN | TEST | Karar |
|---|---|---|---|---|---|---|---|---|
| T2 Kırılım | 446 | +94,1 | +0,21 | %46 | -23,3 R | +1,7 R (278 işlem, 0,006/işlem) | +92,4 R (168 işlem, 0,55/işlem) | Kalır, ama TUTARSIZ: kazancın tamamı son 90 günde. 4 hafta gözlem |
| T3 Trend | 5 | -0,9 | -0,17 | %40 | -1 R | 0 işlem | 5 işlem | Yetersiz veri (55 gün zirvesi + EMA50>EMA200 nadir). Gözlemde kalır |
| T4 Funding | 75 | +0,3 | 0,00 | %43 | -9,4 R | -5,0 R (67 işlem) | +5,3 R (8 işlem) | **ELENDİ**: TRAIN eksi. Panelde kalır, kağıt kaydı tutar, havuza asla girmez |
| T5 Güç | 142 | +31,6 | +0,22 | %50 | -8,6 R | +14,8 R (84 işlem, 0,18/işlem) | +16,8 R (58 işlem, 0,29/işlem) | **En tutarlı**: iki dönemde de artı, düşüş küçük. 4 hafta gözlem |
| Havuz (Kırılım+Güç, en fazla 2 açık) | 235 | +34,0 | +0,15 | %43 | -20,5 R | +17,7 R | +16,3 R | Profesör havuz kuralıyla iki dönemde de artı |

Notlar
- Kırılım çıkışlarının yarısı "süre" (12 mum); hedefe ulaşan 109, stop 114. TRAIN'de sıfıra yakın olması kazancın piyasa rejimine bağlı olduğunu gösterir; "kanıtlı avantaj" denmez.
- Güç: çıkış 63 süre / 34 hedef / 45 stop. 0,25 USDT riskle 300 günde ~+8 USDT; küçük ama tutarlı.
- Trend için 1G verisi yetersiz; 3-4 hafta sonra tekrar bakılır ya da kural gevşetilir (Donchian-20 denenmedi).
- T1 dKc bu testte yok (kendi sinyali tarayıcıdan okunur; 1 Kas değerlendirmesinde avantaj kanıtlı değil).
- Sonraki adım: kağıt modda 3-4 hafta; trader başına ≥30 gerçek zamanlı işlem olmadan bota geçilmez.
