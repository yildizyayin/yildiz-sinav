import { describe, expect, it } from 'vitest';
import type { CanonicalRecord } from '../worker/types';
import { alignRecordsToExam, blankSubjectsCoveredElsewhere, mergeSessionRecords, primaryBooklet, recordBookletIssue, subjectBooklet } from '../worker/lib/two-session';
import { bookletIssue } from '../worker/lib/booklet-review';
import { parseUploadedText } from '../worker/lib/parse';

const rec = (row: number, over: Partial<CanonicalRecord>): CanonicalRecord => ({ row_no: row, name: 'ALI YILMAZ', student_number: '101', class_name: '8A', answers_by_subject: {}, source_type: 'TXT', source_template: 'F', confidence: 0.97, issues: [], ...over });
const LGS = ['TUR', 'INK', 'DIN', 'YAB', 'MAT', 'FEN'];

describe('A028b: aligning a file to the exam', () => {
  it('a single-session LGS on the built-in 7108 (SOS/ING blocks) is read as İnkılap and İngilizce', () => {
    const r = alignRecordsToExam([rec(1, { answers_by_subject: { TUR: 'AB', SOS: 'CD', DIN: 'A_', ING: 'BB', MAT: 'AA', FEN: 'DD' } })], LGS);
    expect(r.records[0].answers_by_subject).toEqual({ TUR: 'AB', INK: 'CD', DIN: 'A_', YAB: 'BB', MAT: 'AA', FEN: 'DD' });
    expect(r.renamed).toEqual({ SOS: 'INK', ING: 'YAB' });
    expect(r.missing).toEqual([]);
  });

  it('does not rename when the exam really has Sosyal Bilgiler, or when both codes are in the file', () => {
    expect(alignRecordsToExam([rec(1, { answers_by_subject: { SOS: 'AB' } })], ['TUR', 'SOS']).renamed).toEqual({});
    const both = alignRecordsToExam([rec(1, { answers_by_subject: { SOS: 'AB', INK: 'CD' } })], LGS);
    expect(both.renamed).toEqual({});
    expect(both.unused).toEqual(['SOS']);
  });

  it('a test blank on every sheet of a form is not part of this upload; one blank student still counts as blank', () => {
    const r = alignRecordsToExam([
      rec(1, { answers_by_subject: { TUR: '____', MAT: 'AB__' } }),
      rec(2, { student_number: '102', name: 'AYSE KAYA', answers_by_subject: { TUR: '    ', MAT: '____' } }),
    ], ['TUR', 'MAT']);
    expect(r.dropped).toEqual(['TUR']);
    expect(r.missing).toEqual(['TUR']);
    expect(r.records.map((x) => x.answers_by_subject)).toEqual([{ MAT: 'AB__' }, { MAT: '____' }]);
    expect(r.warnings.join(' ')).toContain('TUR');
  });

  it('decides per form: the 7108 sheet’s empty Türkçe is dropped although the 840 sheets answer Türkçe', () => {
    const r = alignRecordsToExam([
      rec(1, { source_template: '840', answers_by_subject: { TUR: 'AB' } }),
      rec(2, { source_template: '7108', answers_by_subject: { TUR: '__', MAT: 'CD' } }),
    ], ['TUR', 'MAT']);
    expect(r.records.map((x) => x.answers_by_subject)).toEqual([{ TUR: 'AB' }, { MAT: 'CD' }]);
  });

  it('keeps a blank optional philosophy block (read by its own step)', () => {
    const r = alignRecordsToExam([rec(1, { answers_by_subject: { TYT_TUR: 'AB', TYT_FEL: '_____' } })], ['TYT_TUR']);
    expect(r.records[0].answers_by_subject).toHaveProperty('TYT_FEL');
    expect(r.unused).toEqual([]);
  });
});

describe('A028b: joining the two session sheets of one student', () => {
  it('joins by number, keeps each session’s booklet, and leaves other students alone', () => {
    const { records, merged } = mergeSessionRecords([
      rec(1, { booklet: 'A', answers_by_subject: { MAT: 'AB', FEN: 'CD' } }),
      rec(2, { student_number: '102', name: 'AYSE KAYA', booklet: 'A', answers_by_subject: { MAT: 'AA' } }),
      rec(3, { booklet: 'B', answers_by_subject: { TUR: 'DD' } }),
    ]);
    expect(merged).toEqual([{ kept: 1, absorbed: 3 }]);
    expect(records).toHaveLength(2);
    expect(records[0].answers_by_subject).toEqual({ MAT: 'AB', FEN: 'CD', TUR: 'DD' });
    expect(records[0].booklet_by_subject).toEqual({ MAT: 'A', FEN: 'A', TUR: 'B' });
    expect(records[0].booklet).toBeUndefined();
    expect(primaryBooklet(records[0])).toBe('A');
    expect(subjectBooklet(records[0], 'TUR')).toBe('B');
    expect(recordBookletIssue(records[0], ['A', 'B'], bookletIssue)).toBeNull();
    expect(records[0].merged_rows).toEqual([3]);
  });

  it('same booklet in both sessions stays a plain booklet', () => {
    const { records } = mergeSessionRecords([rec(1, { booklet: 'A', answers_by_subject: { MAT: 'AB' } }), rec(2, { booklet: 'A', answers_by_subject: { TUR: 'CD' } })]);
    expect(records[0]).toMatchObject({ booklet: 'A', answers_by_subject: { MAT: 'AB', TUR: 'CD' } });
    expect(records[0].booklet_by_subject).toBeUndefined();
  });

  it('an unreadable booklet on one session is asked for, only for that session’s tests', () => {
    const { records } = mergeSessionRecords([rec(1, { booklet: 'A', answers_by_subject: { MAT: 'AB' } }), rec(2, { booklet: '', answers_by_subject: { TUR: 'CD' } })]);
    expect(records[0].booklet_by_subject).toEqual({ MAT: 'A' });
    expect(recordBookletIssue(records[0], ['A', 'B'], bookletIssue)).toMatch(/^Kitapçık:/);
    expect(subjectBooklet({ ...records[0], booklet: 'B' }, 'TUR')).toBe('B');
    expect(subjectBooklet({ ...records[0], booklet: 'B' }, 'MAT')).toBe('A');
  });

  it('never joins sheets with overlapping tests, different numbers, or a conflicting name', () => {
    expect(mergeSessionRecords([rec(1, { answers_by_subject: { MAT: 'AB' } }), rec(2, { answers_by_subject: { MAT: 'CD' } })]).records).toHaveLength(2);
    expect(mergeSessionRecords([rec(1, { answers_by_subject: { MAT: 'AB' } }), rec(2, { student_number: '102', answers_by_subject: { TUR: 'CD' } })]).records).toHaveLength(2);
    expect(mergeSessionRecords([rec(1, { answers_by_subject: { MAT: 'AB' } }), rec(2, { name: 'VELI CAN', answers_by_subject: { TUR: 'CD' } })]).records).toHaveLength(2);
    expect(mergeSessionRecords([rec(1, { tckn: '10000000146', answers_by_subject: { MAT: 'AB' } }), rec(2, { tckn: '10000000078', answers_by_subject: { TUR: 'CD' } })]).records).toHaveLength(2);
  });

  it('a name whose Turkish letters were lost still joins by number', () => {
    expect(mergeSessionRecords([rec(1, { name: 'AYŞE KAYA', answers_by_subject: { MAT: 'AB' } }), rec(2, { name: 'AY\uFFFDE KAYA', answers_by_subject: { TUR: 'CD' } })]).records).toHaveLength(1);
  });
});

describe('A028b: sheets of one student left as separate rows', () => {
  it('a test entirely blank on one sheet but answered on the other is not written from the blank sheet', () => {
    const row = (id: string, student: string, answers: Record<string, string>) => ({ id, matched_student_id: student, canonical_json: JSON.stringify({ answers_by_subject: answers }) });
    const skip = blankSubjectsCoveredElsewhere([row('a', 's1', { TUR: '____', MAT: 'AB__' }), row('b', 's1', { TUR: 'CD__', MAT: '____' }), row('c', 's2', { TUR: '____' })]);
    expect([...skip.entries()].map(([k, v]) => [k, [...v]])).toEqual([['a', ['TUR']], ['b', ['MAT']]]);
  });
});

describe('A028b: one TXT with two forms', () => {
  const tpl = (id: string, recordLength: number, signature: string, answers: Record<string, { start: number; end: number }>) => ({ id, name: id, parser_definition: JSON.stringify({ type: 'fixed-width', recordLength, signature, fields: { student_number: { start: 3, end: 6 }, name: { start: 6, end: 16 } }, answers }) });
  const A = tpl('F1', 20, '111', { MAT: { start: 16, end: 20 } }), B = tpl('F2', 22, '222', { TUR: { start: 16, end: 22 } });
  it('reads each line with the form of its length and keeps file order', () => {
    const text = ['222101ALI YILMAZABCDEF', '111101ALI YILMAZABCD', '111102AYSE KAYA BBBB'].join('\n');
    const r = parseUploadedText(text, 'x.txt', [A, B]);
    expect(r.forms).toEqual([{ id: 'F2', name: 'F2', rows: 1 }, { id: 'F1', name: 'F1', rows: 2 }]);
    expect(r.records.map((x) => [x.row_no, x.source_template, Object.keys(x.answers_by_subject)[0]])).toEqual([[1, 'F2', 'TUR'], [2, 'F1', 'MAT'], [3, 'F1', 'MAT']]);
  });
  it('refuses to guess when a line length has no form or two forms', () => {
    expect(parseUploadedText(['222101ALI YILMAZABCDEF', '111101ALI YILMAZABC'].join('\n'), 'x.txt', [A, B]).records).toEqual([]);
    expect(parseUploadedText(['222101ALI YILMAZABCDEF', '111101ALI YILMAZABCD'].join('\n'), 'x.txt', [A, B, { ...tpl('F3', 20, '111', { FEN: { start: 16, end: 20 } }) }]).records).toEqual([]);
  });
});

describe('A028b: built-in Sekonic 129 TC slice', () => {
  it('ends before the ALAN column (36–47), so a marked ALAN digit no longer spoils the 11-digit TC', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { readFileSync, readdirSync } = await import('node:fs');
    const db = new DatabaseSync(':memory:');
    for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const def = JSON.parse((db.prepare(`SELECT parser_definition p FROM optical_template_versions WHERE id='optik-129-sekonic-v1'`).get() as any).p);
    db.close();
    expect(def.fields.tckn).toEqual({ start: 36, end: 47 });
  });
});
