import { describe, expect, it } from 'vitest';
import type { CanonicalRecord } from '../worker/types';
import { alignRecordsToExam } from '../worker/lib/two-session';

/** Owner (4 Nov): a manual optic's TEST-1…TEST-n blocks are read in order as the exam's tests. Synthetic data. */
const rec = (answers: Record<string, string>): CanonicalRecord => ({ row_no: 1, name: 'SENTETIK OGRENCI', student_number: '101', class_name: '8A', answers_by_subject: answers, source_type: 'TXT', source_template: 'HIZ', confidence: 0.97, issues: [] } as any);
describe('generic TEST-n answer blocks', () => {
  it('LGS: six generic blocks become TUR, INK, DIN, YAB, MAT, FEN in order (TEST-10 sorts after TEST-2)', () => {
    const r = alignRecordsToExam([rec({ 'TEST-1': 'A', 'TEST-2': 'B', 'TEST-3': 'C', 'TEST-4': 'D', 'TEST-5': 'A', 'TEST-6': 'B' })], ['TUR', 'INK', 'DIN', 'YAB', 'MAT', 'FEN']);
    expect(r.records[0].answers_by_subject).toEqual({ TUR: 'A', INK: 'B', DIN: 'C', YAB: 'D', MAT: 'A', FEN: 'B' });
    expect(r.unused).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/TEST-1 cevapları sınavın TUR dersi olarak okundu/);
  });
  it('TYT: four blocks map to TYT_TUR, TYT_SOS, TYT_MAT, TYT_FEN', () => {
    const r = alignRecordsToExam([rec({ 'TEST-2': 'B', 'TEST-1': 'A', 'TEST-4': 'D', 'TEST-3': 'C' })], ['TYT_TUR', 'TYT_SOS', 'TYT_MAT', 'TYT_FEN']);
    expect(r.records[0].answers_by_subject).toEqual({ TYT_TUR: 'A', TYT_SOS: 'B', TYT_MAT: 'C', TYT_FEN: 'D' });
  });
  it('leaves blocks alone when their number does not match the exam', () => {
    const r = alignRecordsToExam([rec({ 'TEST-1': 'A', 'TEST-2': 'B', 'TEST-3': 'C' })], ['TUR', 'INK', 'DIN', 'YAB', 'MAT', 'FEN']);
    expect(r.unused).toEqual(['TEST-1', 'TEST-2', 'TEST-3']);
  });
});
