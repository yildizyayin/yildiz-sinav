import { describe, expect, it } from 'vitest';
import {
  definitionReadiness,
  validateCameraGeometry,
  validateFiducials,
  validateParserDefinition,
  validatePrintFields,
} from '../worker/lib/optical-definition';

const parser = {
  type: 'fixed-width',
  recordLength: 80,
  fields: {
    student_number: { start: 0, end: 6 },
    name: { start: 6, end: 26 },
    class: { start: 26, end: 30 },
    booklet: { start: 30, end: 31 },
  },
  answers: {
    MAT: { start: 31, end: 51 },
    TUR: { start: 51, end: 71 },
  },
};

const camera = {
  regions: [
    { id: 'student-number', type: 'bubble-grid', xMm: 10, yMm: 20, widthMm: 40, heightMm: 50 },
    { id: 'answers', type: 'answers', xMm: 60, yMm: 30, widthMm: 120, heightMm: 220 },
  ],
};

const print = {
  fields: [
    { key: 'studentName', xMm: 20, yMm: 20, widthMm: 70, heightMm: 8 },
    { key: 'studentNumber', xMm: 120, yMm: 20 },
    { key: 'class', xMm: 160, yMm: 20 },
  ],
};

const fiducials = { targets: [[10, 10], [200, 10], [10, 287], [200, 287]] };

describe('optical definition validation', () => {
  it('accepts a complete fixed-width parser definition', () => {
    expect(validateParserDefinition(parser)).toEqual({ valid: true, errors: [] });
  });

  it('rejects answer fields that exceed record length', () => {
    const bad = structuredClone(parser);
    bad.answers.MAT.end = 99;
    const result = validateParserDefinition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((x) => x.includes('kayıt uzunluğunu'))).toBe(true);
  });

  it('requires an answer/bubble region for camera geometry', () => {
    const result = validateCameraGeometry({ regions: [{ id: 'name', type: 'text', xMm: 10, yMm: 10, widthMm: 40, heightMm: 10 }] }, 210, 297);
    expect(result.valid).toBe(false);
    expect(result.errors.some((x) => x.includes('cevap bölgesi'))).toBe(true);
  });

  it('rejects print coordinates outside the page', () => {
    const result = validatePrintFields({ fields: [{ key: 'studentName', xMm: 220, yMm: 20 }] }, 210, 297);
    expect(result.valid).toBe(false);
  });

  it('requires at least three fiducials', () => {
    const result = validateFiducials({ targets: [[10, 10], [200, 10]] }, 210, 297);
    expect(result.valid).toBe(false);
  });

  it('does not mark a technically complete template ready before parser sample test passes', () => {
    const before = definitionReadiness({ parser, camera, print, fiducials, pageWidthMm: 210, pageHeightMm: 297, parserTestPassed: false });
    expect(before.parser).toBe(true);
    expect(before.camera).toBe(true);
    expect(before.print).toBe(true);
    expect(before.fiducials).toBe(true);
    expect(before.ready).toBe(false);

    const after = definitionReadiness({ parser, camera, print, fiducials, pageWidthMm: 210, pageHeightMm: 297, parserTestPassed: true });
    expect(after.ready).toBe(true);
  });
});
