import { describe, expect, it } from 'vitest';
// @ts-ignore plain ESM script
import { parseCsv, toCsv, toDirectoryRows } from '../scripts/meb-directory-csv.mjs';

/** S019: MEB's public school list becomes the Result Network directory template; only schools that sit exams are kept. */
describe('S019 MEB directory conversion', () => {
  const sample = '﻿il,ilce,okul_adi,kurum_kodu,okul_turu,web_sitesi,adres,telefon,harita,cekim_tarihi\n'
    + 'Adana,Aladağ,Akören Ortaokulu,428569,Ortaokul,https://a.meb.k12.tr,,,,2026-08-31\n'
    + 'Ankara,Çankaya,"Özel Deneme Koleji, Fen Lisesi",900001,Fen Lisesi,http://insecure,,,,2026-08-31\n'
    + 'Ankara,Çankaya,Çankaya Öğretmenevi,900002,Öğretmenevi,,,,,2026-08-31\n'
    + 'Ankara,Çankaya,Tekrar Ortaokulu,428569,Ortaokul,,,,,2026-08-31\n'
    + 'Ankara,Çankaya,Kodsuz İlkokulu,ABC,İlkokul,,,,,2026-08-31\n';
  it('keeps schools, drops offices, duplicates and invalid codes, and marks private schools', () => {
    const rows = toDirectoryRows(parseCsv(sample));
    expect(rows).toEqual([
      ['428569', 'Akören Ortaokulu', 'Adana', 'Aladağ', 'Ortaokul', 'PUBLIC', 'ORTAOKUL', 'https://a.meb.k12.tr'],
      ['900001', 'Özel Deneme Koleji, Fen Lisesi', 'Ankara', 'Çankaya', 'Fen Lisesi', 'PRIVATE', 'LİSE', ''],
    ]);
  });
  it('writes the exact template the Super Admin screen imports', () => {
    const csv = toCsv(toDirectoryRows(parseCsv(sample)));
    expect(csv.startsWith('﻿MEB Kodu;Kurum Adı;İl;İlçe;Kurum Türü;Mülkiyet;Eğitim Seviyesi;Resmi URL\n')).toBe(true);
    expect(csv.trim().split('\n')).toHaveLength(3);
  });
});
