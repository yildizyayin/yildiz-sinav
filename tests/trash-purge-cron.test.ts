import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Owner (3 Nov): exams left in the old trash are deleted by the production worker's own schedule. */
describe('trash purge on the production schedule', () => {
  it('runs purgeTrashedExams from the production entry', () => {
    const src = readFileSync(new URL('../worker/preview-policy-production-entry.ts', import.meta.url), 'utf8');
    expect(src).toContain("import('./lib/exam-purge').then(m=>m.purgeTrashedExams(env))");
  });
});
