import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Demo Koleji presentation fixture', () => {
  it('provides eight grades, five role journeys and privacy-safe students', () => {
    const source = readFileSync('scripts/generate-demo-college-showcase.mjs', 'utf8');
    expect(source).toContain("[5, 6, 7, 8, 9, 10, 11, 12]");
    expect(source).toContain('index <= 20');
    for (const username of ['student.demo','parent.demo','teacher.demo','guidance.demo','manager.demo']) {
      expect(source).toContain(username);
    }
    expect(source).not.toMatch(/\b[1-9]\d{10}\b/);
  });

  it('imports only answer-key metadata and holds publisher outcomes for review', () => {
    const data = JSON.parse(readFileSync('data/demo-exams-2026-2027.json', 'utf8'));
    expect(data.exams.find((exam:any) => exam.id === 'cap').questions).toHaveLength(125);
    expect(data.exams.find((exam:any) => exam.id === 'ankara').questions).toHaveLength(75);
    const generator = readFileSync('scripts/generate-demo-exam-catalog.mjs', 'utf8');
    expect(generator).toContain("'REVIEW_REQUIRED',0");
    expect(generator).toContain("contains_question_text,verification_status");
    expect(generator).toContain("'USER_PROVIDED',0,'DECLARED'");
  });

  it('requires the exact Optik 129 and 7108 FMT before evaluation', () => {
    const generator = readFileSync('scripts/generate-demo-exam-catalog.mjs', 'utf8');
    expect(generator).toContain('opt129');
    expect(generator).toContain('opt7108');
    expect(generator).toContain('FMT_REQUIRED');
  });
});
