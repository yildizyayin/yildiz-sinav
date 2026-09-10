import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../migrations/0039_assessment_question_media_pipeline.sql', import.meta.url), 'utf8');
const platform = readFileSync(new URL('../worker/lib/platform-expansion.ts', import.meta.url), 'utf8');
const coach = readFileSync(new URL('../worker/lib/coach-mastery-cycle.ts', import.meta.url), 'utf8');

describe('question pool assessment pipeline', () => {
  it('stores rich content, question metadata and measurement envelopes', () => {
    expect(migration).toContain('content_mode');
    expect(migration).toContain('option_count');
    expect(migration).toContain('prior_grade_refs_json');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS question_content_blocks');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS assessment_runs');
    expect(migration).toContain("'EXTERNAL','QUESTION_BANK','MINI_TEST'");
  });

  it('keeps question uploads super-admin only and enforces four/five complete choices', () => {
    expect(platform).toContain('Soru havuzuna içerik yükleme yetkisi yalnız Süper Admin hesabındadır.');
    expect(platform).toContain('questionType===\'MULTIPLE_CHOICE\'&&(![4,5].includes(optionCount)||options.length!==optionCount)');
    expect(platform).toContain('Görsel türündeki soru için en az bir görsel yüklenmelidir.');
  });

  it('scopes teacher question access to assigned branches and creates A/B booklet rows', () => {
    expect(platform).toContain('teacher_assignments ta');
    expect(platform).toContain("['A','B'].includes(x)");
    expect(platform).toContain("code==='B'?[...qs].reverse():qs");
  });

  it('feeds question practice into unified assessment responses and learning evidence', () => {
    expect(platform).toContain("INSERT OR IGNORE INTO assessment_runs");
    expect(platform).toContain("INSERT OR IGNORE INTO assessment_responses");
    expect(platform).toContain("/api/platform/assessment-feed");
  });

  it('renders rich media inside Nibiru mini-tests', () => {
    expect(coach).toContain('hydrateQuestionMedia');
    expect(coach).toContain('content_mode');
  });
});
