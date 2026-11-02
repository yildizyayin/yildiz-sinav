import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fitTopics, isMaarifExam, karnePagesPerStudent } from '../src/components/reports/karne-formats';
import { maarifStudentAdvice } from '../src/components/reports/nibiru';

/** 2 Nov (owner): öğrenci karnesi tek sayfa / analizli 2 sayfa; Maarif grades get development language. Synthetic data. */
describe('karne formats', () => {
  it('knows which grades study the Maarif programme in which year', () => {
    const at = (grade: number, year: string) => isMaarifExam({ grade_level: grade, academic_year: year });
    for (const g of [5, 6, 7, 9, 10, 11]) expect(at(g, '2026-2027'), `grade ${g}`).toBe(true);
    for (const g of [8, 12]) expect(at(g, '2026-2027'), `grade ${g}`).toBe(false);
    expect(at(8, '2027-2028')).toBe(true);
    expect(at(12, '2027-2028')).toBe(true);
    expect(at(7, '2025-2026')).toBe(false);
    expect(at(11, '2025-2026')).toBe(false);
    expect(isMaarifExam({ grade_level: null, academic_year: '2026-2027' })).toBe(false);
  });

  it('counts pages per student for each format', () => {
    expect([karnePagesPerStudent('ONE'), karnePagesPerStudent('TWO'), karnePagesPerStudent('BOTH')]).toEqual([1, 2, 3]);
  });

  it('keeps the analysis on one page: weakest outcomes first, shown back in test order', () => {
    const b: any = { tests: [{ id: 'a' }, { id: 'b' }] };
    const topics = [
      ...Array.from({ length: 10 }, (_, i) => ({ subjectId: 'a', section: null, topic: `A${i}`, s: 2, d: 1, y: 1, p: 90 - i })),
      ...Array.from({ length: 10 }, (_, i) => ({ subjectId: 'b', section: null, topic: `B${i}`, s: 2, d: 0, y: 2, p: i })),
    ];
    expect(fitTopics(b, topics, 999)).toEqual({ shown: topics, hidden: 0 });
    const fit = fitTopics(b, topics, 10); // one test header (2) + 8 rows
    expect(fit.hidden).toBe(12);
    expect(fit.shown.map((t: any) => t.topic)).toEqual(['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']);
  });

  it('writes Maarif advice without judgement words', () => {
    const b: any = { tests: [{ id: 'm' }], columns: [{ key: 'm', subjectId: 'm', name: 'Matematik', group: 'Matematik', q: 20 }, { key: 't', subjectId: 't', name: 'Türkçe', group: 'Türkçe', q: 20 }], scoreTypes: [{ key: 'NET', label: 'Net', isScore: false }] };
    const inst: any = { avg: { cols: { m: { n: 10 }, t: { n: 10 } } } };
    const s = { cols: { m: { n: 18 }, t: { n: 2 } }, topics: [{ subjectId: 't', section: null, topic: 'Paragraf', s: 4, d: 0, y: 4, p: 0 }], total: { d: 10, y: 8, b: 22 } };
    const text = maarifStudentAdvice(b, inst, s).join(' ');
    expect(text).toContain('Güçlü olduğun testler: Matematik');
    expect(text).toContain('Geliştirebileceğin testler: Türkçe');
    expect(text).not.toMatch(/altında|başarısız|zayıf|yetersiz/i);
  });

  it('report bundle carries question topics by index and earlier published exams only', () => {
    const src = readFileSync(new URL('../worker/lib/report-bundle.ts', import.meta.url), 'utf8');
    expect(src).toContain("ea.channel='RESULT_NETWORK' AND ea.published_snapshot_version>0");
    expect(src).toMatch(/LIMIT 4/);
  });
});
