import { describe, expect, it } from 'vitest';
import { resolveReportStudentId } from '../src/lib/reportSelection';

describe('resolveReportStudentId', () => {
  const rows = [{ id: 'stu_1' }, { id: 'stu_2' }];

  it('uses requested linked student when allowed', () => {
    expect(resolveReportStudentId(rows, 'stu_2', '')).toBe('stu_2');
  });

  it('ignores an unrelated requested student id', () => {
    expect(resolveReportStudentId(rows, 'stu_other', '')).toBe('');
  });

  it('keeps current selection when it is still in scope', () => {
    expect(resolveReportStudentId(rows, null, 'stu_1')).toBe('stu_1');
  });

  it('auto-selects the only allowed student', () => {
    expect(resolveReportStudentId([{ id: 'stu_1' }], null, '')).toBe('stu_1');
  });
});
