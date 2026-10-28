import { describe, expect, it } from 'vitest';
import { applyStandardSections, standardSectionOf } from '../worker/lib/report-bundle';

/** Owner request (28 Oct): sub-tests appear in the karne and the net list even when the key had no DERS column. */
describe('S038 ÖSYM sub-test order', () => {
  const sos = { name: 'TYT Sosyal Bilimler', code: 'TYT_SOS' }, fen = { name: 'TYT Fen Bilimleri', code: 'TYT_FEN' };
  it('splits TYT Sosyal and Fen by the ÖSYM booklet order', () => {
    expect([1, 5, 6, 10, 11, 15, 16, 20, 21, 25].map((n) => standardSectionOf('TYT', sos, 25, n))).toEqual(['Tarih', 'Tarih', 'Coğrafya', 'Coğrafya', 'Felsefe', 'Felsefe', 'Din Kültürü', 'Din Kültürü', 'Felsefe (Din yerine)', 'Felsefe (Din yerine)']);
    expect([1, 7, 8, 14, 15, 20].map((n) => standardSectionOf('TYT', fen, 20, n))).toEqual(['Fizik', 'Fizik', 'Kimya', 'Kimya', 'Biyoloji', 'Biyoloji']);
    expect(standardSectionOf('AYT', { name: 'AYT Fen Bilimleri', code: 'AYT_FEN' }, 40, 28)).toBe('Biyoloji');
  });
  it('never guesses a layout of another size or a test without sub-tests', () => {
    expect(standardSectionOf('TYT', fen, 24, 1)).toBeNull();
    expect(standardSectionOf('TYT', { name: 'TYT Türkçe', code: 'TYT_TUR' }, 40, 1)).toBeNull();
    expect(standardSectionOf('LGS', fen, 20, 1)).toBeNull();
  });
  it('keeps the sub-tests the answer key named', () => {
    const subjects = [{ id: 's', name: 'TYT Sosyal Bilimler', code: 'TYT_SOS', questionCount: 25 }];
    const keyed = Array.from({ length: 25 }, (_, i) => ({ subjectId: 's', no: i + 1, section: i < 12 ? 'Tarih' : 'Coğrafya' }));
    expect(applyStandardSections('TYT', subjects, keyed)).toEqual(keyed);
    const bare = Array.from({ length: 25 }, (_, i) => ({ subjectId: 's', no: i + 1, section: null as string | null }));
    const out = applyStandardSections('TYT', subjects, bare);
    expect(out[0]).toMatchObject({ section: 'Tarih', auto: true });
    expect(out[24]).toMatchObject({ section: 'Felsefe (Din yerine)', auto: true });
  });
});
