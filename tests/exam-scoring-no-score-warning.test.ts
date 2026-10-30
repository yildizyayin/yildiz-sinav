import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scoringProducesScore } from '../src/pages/ExamDefinitions';
import { scoreMethodFor } from '../worker/lib/scoring';

/** 30 Oct: the exam card warns when the chosen scoring profile produces no score (ÇAP TYT got "TYT Deneme Neti"). */
describe('no-score profile warning', () => {
  it('agrees with the server on which profiles give a score', () => {
    const cases = [
      { mode: 'net', defaultWrongDivisor: 4, session: 'TYT', officialConversion: false },
      { profile: 'OSYM_TYT', mode: 'TYT', scoreModel: 'WEIGHTED_ESTIMATE' },
      { mode: 'LGS_STANDARD' }, { mode: 'SCHOOL_100' }, { scoreModel: 'NONE' }, { mode: 'CUSTOM_EXAM' },
    ];
    for (const c of cases) expect(scoringProducesScore(JSON.stringify(c)), JSON.stringify(c)).toBe(scoreMethodFor(c) !== 'NONE');
    const migration = readFileSync(new URL('../migrations/0032_exam_scoring_presets.sql', import.meta.url), 'utf8');
    const anunexTyt = migration.match(/'srv_anunex_tyt_2627'[^']*'[^']*','[^']*','v1',1,NULL,'([^']+)'/);
    expect(anunexTyt).not.toBeNull();
    expect(scoringProducesScore(anunexTyt![1])).toBe(false);
  });
});
