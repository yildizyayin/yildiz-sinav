import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const platformSource = readFileSync(new URL('../worker/lib/platform-expansion.ts', import.meta.url), 'utf8');
const centerSource = readFileSync(new URL('../src/pages/ExamCenter.tsx', import.meta.url), 'utf8');

describe('exam upload catalog visibility', () => {
  it('includes newly created draft exams until they are archived', () => {
    expect(platformSource).toContain("e.status IN ('DRAFT','ACTIVE','CLOSED')");
    expect(centerSource).toContain("rows.filter(r=>r.status!=='ARCHIVED')");
  });

  it('keeps publisher name visible when no normalized publisher record exists', () => {
    expect(platformSource).toContain('COALESCE(pub.name,e.publisher_name) publisher_name');
  });
});
