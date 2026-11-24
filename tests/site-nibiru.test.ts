import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_NIBIRU_CHIPS, SITE_NIBIRU_INTENTS, answerSiteNibiru, normalizeTr, simpleMath } from '../src/lib/siteNibiru';

/** anunex.com Nibiru tanıtım asistanı (owner, 11 Nov 2026): prepared answers only, in the browser, nothing sent or kept. */
describe('site Nibiru assistant', () => {
  it('answers every sample question with its own prepared answer', () => {
    for (const intent of SITE_NIBIRU_INTENTS) expect(answerSiteNibiru(intent.sample).id, intent.sample).toBe(intent.id);
  });

  it('answers every suggestion chip without falling back', () => {
    for (const chip of SITE_NIBIRU_CHIPS) expect(answerSiteNibiru(chip).id, chip).not.toBe('bilinmiyor');
  });

  it('puts safety first, whatever else the message says', () => {
    expect(answerSiteNibiru('Fiyatı ne kadar tutar, ayrıca kendimi öldürmek istiyorum').id).toBe('kriz');
    expect(answerSiteNibiru('KENDİME ZARAR vermek istiyorum').id).toBe('kriz');
    expect(answerSiteNibiru('Okulda akran zorbalığı yaşıyorum').id).toBe('istismar');
    expect(answerSiteNibiru('numaram 0532 123 45 67 beni arayın').id).toBe('kisisel-veri');
    expect(answerSiteNibiru('mailim deneme@ornek.com').id).toBe('kisisel-veri');
    expect(answerSiteNibiru('12345678901').id).toBe('kisisel-veri');
    expect(answerSiteNibiru('LGS sınav cevapları lazım').id).toBe('kopya');
    expect(answerSiteNibiru('intihar').actions?.[0].href).toBe('tel:112');
  });

  it('does not mistake ordinary words for sensitive topics', () => {
    expect(answerSiteNibiru('YouTube video seçimi nasıl yapılıyor?').id).toBe('youtube');
    expect(answerSiteNibiru('Asker çocukları için uygun mu?').id).not.toBe('romantik');
    expect(answerSiteNibiru('Telefondan kullanılır mı?').id).toBe('mobil');
    expect(answerSiteNibiru('Kurulum ne kadar sürer?').id).toBe('kurulum');
    expect(answerSiteNibiru('Adresiniz nerede?').id).toBe('iletisim');
  });

  it('handles Turkish letters and casing', () => {
    expect(normalizeTr('İYİ AKŞAMLAR Öğrenci')).toBe(' iyi aksamlar ogrenci ');
    expect(answerSiteNibiru('ÖĞRENME EVRENİ NEDİR').id).toBe('evren');
    expect(answerSiteNibiru('kirmizi foy hangi siniflar').id).toBe('foy');
  });

  it('keeps the product facts the owner set', () => {
    const foy = answerSiteNibiru('Mavi föy nedir').text;
    expect(foy).toContain('4’ten 12’ye');
    expect(foy).toContain('yalnız 8. ve 12. sınıflar');
    expect(answerSiteNibiru('Sıfır hata kitapçığı nedir').text).toContain('Dejavu’nun bir parçası');
    expect(answerSiteNibiru('fiyat').actions?.[0].href).toBe('tel:+905433066172');
  });

  it('is honest about what it is', () => {
    expect(answerSiteNibiru('sen yapay zeka mısın').text).toContain('önceden yazıldı');
    const unknown = answerSiteNibiru('kuantum dolanıklığını anlatır mısın');
    expect(unknown.id).toBe('bilinmiyor');
    expect(unknown.text).toContain('tam anlayamadım');
  });

  it('does small sums and nothing more', () => {
    expect(simpleMath('12 + 7')).toMatch(/^12 \+ 7 = 19\./);
    expect(simpleMath('8x6')).toMatch(/= 48\./);
    expect(simpleMath('5/0')).toContain('tanımsız');
    expect(simpleMath('alert(1)')).toBeNull();
    expect(answerSiteNibiru('45 / 9 = ?').id).toBe('hesap');
  });

  it('tells the time from the visitor’s own clock', () => {
    expect(answerSiteNibiru('saat kaç', 0, new Date(2026, 10, 11, 20, 57)).text).toContain('20:57');
  });

  it('never calls the network or stores anything', () => {
    const src = readFileSync('src/lib/siteNibiru.ts', 'utf8') + readFileSync('src/components/SiteNibiruChat.tsx', 'utf8');
    expect(src).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|WebSocket/);
  });
});
