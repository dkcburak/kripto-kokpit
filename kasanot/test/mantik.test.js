const assert = require('assert');
const KN = require('../mantik.js');
let ok = 0; const t = (ad, f) => { f(); ok++; console.log('ok -', ad); };

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
<cbc:ID>ABC2026000000123</cbc:ID><cbc:IssueDate>2026-10-20</cbc:IssueDate><cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VKN">1234567890</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Örnek Gıda San. &amp; Tic. Ltd. Şti.</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
<cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="VKN">9876543210</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Benim Restoran</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="TRY">20.00</cbc:TaxAmount></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount currencyID="TRY">100.00</cbc:TaxExclusiveAmount><cbc:PayableAmount currencyID="TRY">120.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:InvoicedQuantity unitCode="KGM">10</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100.00</cbc:LineExtensionAmount><cac:Item><cbc:Name>Domates</cbc:Name></cac:Item><cac:Price><cbc:PriceAmount>10.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

t('UBL okuma (alış)', () => {
  const b = KN.ublOku(XML, '9876543210');
  assert.equal(b.yon, 'alis'); assert.equal(b.karsiVkn, '1234567890');
  assert.equal(b.karsiUnvan, 'Örnek Gıda San. & Tic. Ltd. Şti.');
  assert.equal(b.toplam, 120); assert.equal(b.kdv, 20); assert.equal(b.tarih, '2026-10-20');
  assert.equal(b.kalemler.length, 1); assert.equal(b.kalemler[0].birimFiyat, 10); assert.equal(b.kalemler[0].birim, 'KGM');
  assert.deepEqual(KN.tutarlilik(b), []);
});
t('UBL okuma (satış, kendi VKN satıcı)', () => {
  const b = KN.ublOku(XML, '1234567890');
  assert.equal(b.yon, 'satis'); assert.equal(b.karsiUnvan, 'Benim Restoran');
});
t('UBL hata: XML değil', () => assert.throws(() => KN.ublOku('<a/>', ''), /UBL/));
t('Cari eşleştirme VKN ve ünvan', () => {
  const c = [{ id: 1, unvan: 'Örnek Gıda Sanayi Ticaret Limited Şirketi', vkn: '1234567890' }, { id: 2, unvan: 'Yıldız Et', vkn: '' }];
  assert.equal(KN.cariBul(c, { vkn: '1234567890', unvan: 'x' }).cari.id, 1);
  assert.equal(KN.cariBul(c, { unvan: 'YILDIZ ET LTD. ŞTİ.' }).cari.id, 2);
  assert.equal(KN.cariBul(c, { unvan: 'Hiç Alakasız Firma' }), null);
});
t('Bakiye işareti', () => {
  const h = [{ cariId: 1, tur: 'alis', tutar: 1000 }, { cariId: 1, tur: 'odeme', tutar: 400 }, { cariId: 2, tur: 'satis', tutar: 50 }, { cariId: 2, tur: 'tahsilat', tutar: 20 }];
  assert.equal(KN.bakiye(h, 1), 600); assert.equal(KN.bakiye(h, 2), -30);
});
t('Fiyat değişimi', () => {
  const g = [{ urun: 'domates', cariId: 1, tarih: '2026-10-01', birimFiyat: 10 }, { urun: 'domates', cariId: 2, tarih: '2026-10-05', birimFiyat: 12 }];
  const d = KN.fiyatDegisim(g, 'Domates', 1, 12, '2026-10-20');
  assert.equal(d.onceki, 10); assert.equal(d.yuzde, 20); assert.ok(d.ayniCari);
  assert.equal(KN.fiyatDegisim(g, 'Domates', 1, 10.02, '2026-10-20'), null);
  assert.equal(KN.fiyatDegisim(g, 'Salatalık', 1, 5, '2026-10-20'), null);
  const baska = KN.fiyatDegisim(g, 'Domates', 3, 15, '2026-10-20');
  assert.equal(baska.onceki, 12); assert.ok(!baska.ayniCari);
});
t('Mükerrer', () => {
  const h = [{ cariId: 1, belgeNo: 'ABC-1', tutar: 120 }];
  assert.ok(KN.mukerrer(h, 1, 'abc 1', 120)); assert.equal(KN.mukerrer(h, 1, 'ABC-2', 120), null);
});
t('Tutarlılık uyarıları (hatalı okuma)', () => {
  const u = KN.tutarlilik({ toplam: 130, araToplam: 100, kdv: 20, tarih: 'dün', kalemler: [{ tutar: 80 }] });
  assert.equal(u.length, 3);
  assert.ok(KN.tutarlilik({ toplam: 0, tarih: '2026-01-01' }).length >= 1);
});
t('Gemini çıktısı temizleme (dekont yönü, tarih)', () => {
  const b = KN.geminiBelge({ tur: 'dekont', odemeYonu: 'gelen', tarih: '24.10.2026', toplam: '1500', karsiUnvan: 'A' });
  assert.equal(b.yon, 'tahsilat'); assert.equal(b.tarih, '2026-10-24'); assert.equal(b.toplam, 1500);
  assert.equal(KN.geminiBelge({ tur: 'saçma' }).tur, 'fatura'); assert.equal(KN.geminiBelge(null).yon, 'alis');
});
t('Personel ay özeti', () => {
  const p = { id: 1, maas: 22500 };
  const m = [{ personelId: 1, tarih: '2026-10-02', giris: '09:00', cikis: '19:00' }, { personelId: 1, tarih: '2026-10-03', giris: '09:00', cikis: '17:00' }, { personelId: 1, tarih: '2026-09-30', giris: '09:00', cikis: '20:00' }];
  const a = [{ personelId: 1, tarih: '2026-10-10', tutar: 3000 }];
  const o = KN.personelAyOzeti(p, m, a, '2026-10', {});
  assert.equal(o.gun, 2); assert.equal(o.calisilan, 18); assert.equal(o.fazla, 2); assert.equal(o.avans, 3000);
  assert.equal(o.fazlaMesaiUcret, 300); assert.equal(o.odenecek, 19800);
  assert.equal(KN.saatFarki('22:00', '02:00'), 4);
});
t('CSV: ondalık virgül, tırnak, formül enjeksiyonu', () => {
  const c = KN.csv([['Ad', 'Tutar'], ['A;B "x"', 12.5], ['=1+1', 3]]);
  assert.ok(c.startsWith('﻿')); assert.ok(c.includes('"A;B ""x"""')); assert.ok(c.includes(';12,5')); assert.ok(c.includes("'=1+1"));
});
t('El yazısı sipariş fişi: miktar kg olarak düzelir, eski bakiye toplamı şişirmez', () => {
  const b = KN.geminiBelge({ tur: 'fis', yon: 'alis', toplam: 64710, kalemler: [
    { ad: 'Patlıcan', miktar: 2, birimFiyat: 47, tutar: 470 }, { ad: 'Salata', miktar: 1, birimFiyat: 65, tutar: 1040 },
    { ad: 'Bamya', miktar: 1, birimFiyat: 55, tutar: 632 }, { ad: 'Sivri', miktar: 1, birimFiyat: 85, tutar: 850 },
    { ad: 'Limon', miktar: 1, birimFiyat: 38, tutar: 380 }, { ad: 'Roka', miktar: 1, birimFiyat: 22, tutar: 110 },
    { ad: 'Maydanoz', miktar: 1, birimFiyat: 15, tutar: 525 }] });
  assert.deepEqual(b.kalemler.map(k => k.miktar), [10, 16, 11.49, 10, 10, 5, 35]);
  assert.equal(b.toplam, 4007);
  assert.ok(b.aciklama.includes('eski bakiye'));
});
t('Ürün özeti: son, ortalama, en ucuz tedarikçi, toplam değişim', () => {
  const o = KN.urunOzet([{ cariId: 1, tarih: '2026-09-01', birimFiyat: 40 }, { cariId: 2, tarih: '2026-09-15', birimFiyat: 36 }, { cariId: 1, tarih: '2026-10-10', birimFiyat: 50 }]);
  assert.equal(o.son, 50); assert.equal(o.min, 36); assert.equal(o.maks, 50); assert.equal(o.ort, 42); assert.equal(o.adet, 3);
  assert.equal(o.enUcuz.cariId, 2); assert.equal(o.tedarikciFarki, 38.9); assert.equal(o.toplamDegisim, 25);
  assert.equal(KN.urunOzet([]), null);
});
t('Ay özeti: türlere göre toplam, başka ay dışarıda', () => {
  const o = KN.ayOzet([{ tarih: '2026-10-03', tur: 'alis', tutar: 100 }, { tarih: '2026-10-09', tur: 'odeme', tutar: 40.5 }, { tarih: '2026-09-30', tur: 'alis', tutar: 999 }, { tarih: '2026-10-11', tur: 'satis', tutar: 20 }], '2026-10');
  assert.deepEqual(o, { alis: 100, satis: 20, odeme: 40.5, tahsilat: 0, adet: 3 });
});
console.log(ok + ' test geçti');
