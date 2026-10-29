import { describe, expect, it } from 'vitest';
import { parseWithTemplate } from '../worker/lib/parse';

describe('S041 KURUM KODU on the sheet is read', () => {
  it('fixed-width and delimited files carry the institution code', () => {
    const def = { type: 'fixed-width', fields: { student_number: { start: 0, end: 4 }, name: { start: 4, end: 14 }, institution_code: { start: 14, end: 22 } }, answers: { TUR: { start: 22, end: 26 } } };
    const r = parseWithTemplate('0101ALI YILMAZ11111111ABCD\n', 'x.txt', { id: 't', name: 'T', parser_definition: JSON.stringify(def) });
    expect(r.records[0].institution_code).toBe('11111111');
    const d = parseWithTemplate('ad_soyad,ogrenci_no,kurum_kodu,answers_TUR\nAli,101,22222222,ABCD\n', 'x.csv', { id: 'd', name: 'D', parser_definition: JSON.stringify({ type: 'delimited', delimiter: ',' }) });
    expect(d.records[0].institution_code).toBe('22222222');
  });
});
