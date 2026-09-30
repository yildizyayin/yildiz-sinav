import { describe, expect, it } from 'vitest';
import { bookletIssue, compareBooklets, isBookletIssue } from '../worker/lib/booklet-review';
import type { CanonicalRecord } from '../worker/types';

const record: CanonicalRecord = { row_no: 1, name: 'Ayşe Demir', booklet: '', answers_by_subject: { MAT: 'AB' }, source_type: 'TXT', confidence: 1, issues: [] };
const subjects = [{ subject_id: 'math', code: 'MAT', question_count: 2, wrong_divisor: 4 }];
const keys = [
  { subject_id: 'math', booklet_code: 'A', question_no: 1, correct_answer: 'A' },
  { subject_id: 'math', booklet_code: 'A', question_no: 2, correct_answer: 'B' },
  { subject_id: 'math', booklet_code: 'B', question_no: 1, correct_answer: 'B' },
  { subject_id: 'math', booklet_code: 'B', question_no: 2, correct_answer: 'A' },
];
describe('manual booklet review', () => {
  it('flags missing and invalid codes while accepting valid codes', () => {
    expect(bookletIssue('', ['A', 'B'])).toMatch(/işaretlenmemiş/);
    expect(bookletIssue('X', ['A', 'B'])).toMatch(/geçersiz/);
    expect(bookletIssue('a', ['A', 'B'])).toBeNull();
    expect(isBookletIssue('KRİTİK: Kitapçık belirlenemedi.')).toBe(true);
  });
  it('shows distinct hypothetical net scores without selecting a booklet', () => {
    expect(compareBooklets(record, ['A', 'B'], subjects, keys)).toMatchObject([
      { code: 'A', available: true, correct: 2, wrong: 0, blank: 0, net: 2 },
      { code: 'B', available: true, correct: 0, wrong: 2, blank: 0, net: -0.5 },
    ]);
  });
  it('does not present a net when an answer key is incomplete', () => {
    expect(compareBooklets(record, ['A'], subjects, keys.slice(0, 1))[0]).toMatchObject({ available: false, net: null });
  });
});

it('uses printed order, accepted answers, excluded questions and underscore blanks consistently', () => {
  const preview = compareBooklets({ ...record, answers_by_subject: { MAT: 'C_' } }, ['A'], subjects, [
    { ...keys[0], printed_question_no: 2, question_status: 'EXCLUDED' },
    { ...keys[1], printed_question_no: 1, accepted_answers: '["B","C"]' },
  ])[0];
  expect(preview).toMatchObject({ available: true, correct: 1, wrong: 0, blank: 0, net: 1 });
  expect(compareBooklets({ ...record, answers_by_subject: { MAT: '__' } }, ['A'], subjects, keys)[0]).toMatchObject({ correct: 0, wrong: 0, blank: 2, net: 0 });
});
