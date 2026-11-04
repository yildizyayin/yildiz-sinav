import { describe, expect, it } from 'vitest';
// @ts-ignore
import { branchThemeOutcomesV2 } from '../scripts/official-branch-catalog.mjs';

/** Owner (4 Nov): the robust official reader keeps codes and titles as printed and skips references in notes. Synthetic pages. */
const page = (body: string) => `<h1>1. Tema: Sentetik</h1><h3>Öğrenme Çıktıları ve Süreç Bileşenleri</h3>${body}<h3>İçerik Çerçevesi</h3>`;
const read = (course: string, grade: number, body: string) => branchThemeOutcomesV2(page(body), { course, grade }, { url: 'https://tymm.meb.gov.tr/x/unite/1', title: '1. Tema: Sentetik' }).map((r: any) => [r.code, r.title]);
describe('official reader V2', () => {
  it('reads a code after &nbsp; and two outcomes on one line', () => {
    expect(read('ortaokul-turkce-dersi', 8, '<p><strong>T.O.8.12.</strong>&nbsp;Metni yorumlayabilme T.O.8.16. Metnin bölümlerini belirleyebilme</p>'))
      .toEqual([['T.O.8.12', 'Metni yorumlayabilme'], ['T.O.8.16', 'Metnin bölümlerini belirleyebilme']]);
  });
  it('skips code references inside notes and abbreviations without a number', () => {
    expect(read('ortaokul-turkce-dersi', 5, '<p>T.O.5.20. Söz varlığını geliştirmeye yönelik çözümleme yapabilme</p><p>Öğretimi T.O.5.20. kapsamında yapılır (T.K.5.1).</p><p>T.C. Anayasası okunur.</p>'))
      .toEqual([['T.O.5.20', 'Söz varlığını geliştirmeye yönelik çözümleme yapabilme']]);
  });
  it('takes a heading-style code that follows a process component on the same line', () => {
    expect(read('ingilizce-dersi-temel-egitim', 8, '<p>ENG.8.2.W2. Students can grasp the model text.</p><p>a) Students grasp the components. ENG.8.2.W3. Students can construct new written content.</p>'))
      .toEqual([['ENG.8.2.W2', 'Students can grasp the model text.'], ['ENG.8.2.W3', 'Students can construct new written content.']]);
  });
  it('keeps codes printed without a prefix or a dot, as printed', () => {
    expect(read('din-kulturu-ve-ahlak-bilgisi-dersi-ortaogretim', 12, '<p>12.3.2.Gıda maddeleriyle ilgili meseleleri yorumlayabilme</p><p>12.3.3 Bağımlılıkla ilgili meseleleri sorgulayabilme</p>'))
      .toEqual([['12.3.2', 'Gıda maddeleriyle ilgili meseleleri yorumlayabilme'], ['12.3.3', 'Bağımlılıkla ilgili meseleleri sorgulayabilme']]);
    expect(read('ilkokul-turkce-dersi', 4, '<p>T.Y4.2. Yazılarında içerik oluşturabilme</p>')).toEqual([['T.Y4.2', 'Yazılarında içerik oluşturabilme']]);
  });
  it('still refuses another grade and a code with two different texts', () => {
    expect(() => read('fen-bilimleri-dersi', 4, '<p>FB.5.1.1. Başka sınıfın çıktısını yapabilme</p>')).toThrow('OUTCOME_GRADE_MISMATCH');
    expect(() => read('fen-bilimleri-dersi', 4, '<p>FB.4.1.1. Birinci metni yapabilme</p><p>FB.4.1.1. İkinci metni yapabilme</p>')).toThrow('CONFLICTING_THEME_CODE');
  });
});
