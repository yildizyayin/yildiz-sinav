import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Owner (3 Nov): on sonuc the student prints the screen ("Yazdır"); no PDF is generated for students. */
describe('sonuc student print', () => {
  const src = readFileSync(new URL('../src/components/StudentResultsWorkspace.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/pages/result-student-print.css', import.meta.url), 'utf8');
  it('prints the screen instead of building a PDF', () => {
    expect(src).toContain('window.print()');
    expect(src).not.toContain('ResultStudentPdf');
    expect(src).toContain("result-student-print.css");
  });
  it('keeps navigation and buttons off paper and prints one A4 column', () => {
    expect(css).toMatch(/@page \{ size: A4/);
    for (const hidden of ['.result-nav nav', '.result-back', '.sr-header-actions', '.sr-nibiru']) expect(css).toContain(hidden);
    expect(css).toContain('.sr-detail-grid { display: block !important; }');
  });
  it('lets the student screen styles apply in print', () => {
    for (const f of ['student-results-v2.css', 'result-student-review.css', 'approved-result-student.css'])
      expect(readFileSync(new URL(`../src/pages/${f}`, import.meta.url), 'utf8')).toMatch(/^@media screen, print \{/m);
  });
});
