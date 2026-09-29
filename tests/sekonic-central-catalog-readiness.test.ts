import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { definitionReadiness } from '../worker/lib/optical-definition';

const migration = readFileSync(new URL('../migrations/0057_publish_builtin_sekonic_catalog.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../migrations/0037_seed_sekonic_optical_templates.sql', import.meta.url), 'utf8');

describe('built-in Sekonic central optical catalog', () => {
  it('keeps the curated 129 and 7108 fixed-width parsers in the seed', () => {
    expect(seed).toContain("'optik-129-sekonic-v1'");
    expect(seed).toContain('"recordLength":222');
    expect(seed).toContain("'optik-7108-sekonic-v1'");
    expect(seed).toContain('"recordLength":171');
  });

  it('promotes only the two built-in Sekonic versions after parser regression validation', () => {
    expect(migration).toContain("parser_test_passed=1");
    expect(migration).toContain("'optik-129-sekonic-v1','optik-7108-sekonic-v1'");
    expect(migration).toContain("status='READY'");
    expect(migration).toContain("'optik-129-sekonic','optik-7108-sekonic'");
  });

  it('does not require Deimos print coordinates or camera geometry for TXT/DAT/FMT publication', () => {
    const parser = {
      type: 'fixed-width',
      recordLength: 20,
      fields: { student_number: { start: 0, end: 5 }, name: { start: 5, end: 10 }, booklet: { start: 10, end: 11 } },
      answers: { MAT: { start: 11, end: 20 } },
    };
    const readiness = definitionReadiness({ parser, camera: null, print: null, fiducials: null, pageWidthMm: 210, pageHeightMm: 297, parserTestPassed: true });
    expect(readiness.ready).toBe(true);
    expect(readiness.print).toBe(true);
    expect(readiness.camera).toBe(true);
  });
});
