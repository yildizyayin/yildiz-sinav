import { describe, expect, it } from 'vitest';
import { buildManualParserDefinition, defaultManualAnswerBlocks, defaultManualFields } from '../src/lib/opticalManual';

describe('manual optical mapping', () => {
  it('builds a fixed-width parser with identity priority fields and answer blocks', () => {
    const fields = defaultManualFields().map((field) => ({
      ...field,
      enabled: ['student_number', 'name', 'tckn'].includes(field.key),
      start: field.key === 'student_number' ? 1 : field.key === 'name' ? 6 : 26,
      length: field.key === 'student_number' ? 5 : field.key === 'name' ? 20 : 11,
    }));
    const answers = defaultManualAnswerBlocks().map((block, index) => index === 0
      ? { ...block, code: 'MAT', enabled: true, start: 37, length: 20, questionCount: 20 }
      : block);
    const definition = buildManualParserDefinition(57, fields, answers, 1);

    expect(definition.type).toBe('fixed-width');
    expect(definition.fields).toMatchObject({
      student_number: { start: 0, end: 5 },
      name: { start: 5, end: 25 },
      tckn: { start: 25, end: 36 },
    });
    expect(definition.answers.MAT).toMatchObject({ start: 36, end: 56, questionCount: 20 });
  });

  it('does not emit disabled or empty fields', () => {
    const definition = buildManualParserDefinition(20, defaultManualFields(), defaultManualAnswerBlocks());
    expect(definition.fields).toEqual({});
    expect(definition.answers).toEqual({});
  });
});
