import { describe, expect, it } from 'vitest';
import { parseFmtText } from '../worker/lib/fmt';
import { parseWithTemplate } from '../worker/lib/parse';

describe('FMT optical definitions', () => {
  it('converts a tabular FMT mapping into a validated definition', () => {
    const fmt = [
      'type;code;start;length;questionCount',
      'field;student_number;1;5;',
      'field;name;6;20;',
      'field;class;26;3;',
      'field;booklet;29;1;',
      'answer;MAT;30;10;10',
    ].join('\n');
    const result = parseFmtText(fmt, 'tyt.fmt');
    expect(result.ok).toBe(true);
    expect(result.definition?.fields.student_number).toMatchObject({ start: 0, end: 5 });
    expect(result.definition?.answers.MAT).toMatchObject({ start: 29, end: 39, questionCount: 10 });
  });

  it('uses the embedded fixed-width parser for FMT records', () => {
    const definition = { type: 'fmt', recordLength: 20, fields: { student_number: { start: 0, end: 4 }, name: { start: 4, end: 12 }, class: { start: 12, end: 15 }, booklet: { start: 15, end: 16 } }, answers: { MAT: { start: 16, end: 20 } }, fixedWidth: { type: 'fixed-width', recordLength: 20, fields: { student_number: { start: 0, end: 4 }, name: { start: 4, end: 12 }, class: { start: 12, end: 15 }, booklet: { start: 15, end: 16 } }, answers: { MAT: { start: 16, end: 20 } } } };
    const result = parseWithTemplate('0001AHMET   7/AAABCD', 'optik.dat', { id: 'fmt-1', name: 'FMT', parser_definition: JSON.stringify(definition) });
    expect(result.records[0]).toMatchObject({ student_number: '0001', name: 'AHMET', booklet: 'A' });
    expect(result.records[0].answers_by_subject.MAT).toBe('ABCD');
  });
});
