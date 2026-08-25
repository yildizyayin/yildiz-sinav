import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

describe('personal book aggregate weakness filter',()=>{
  it('filters by the aggregate correct/evidence ratio instead of the raw success_rate column',()=>{
    const source=readFileSync('worker/student-books-entry.ts','utf8');
    expect(source).toContain("HAVING SUM(r.evidence_count)>=3 AND (CAST(SUM(r.correct_count) AS REAL)/NULLIF(SUM(r.evidence_count),0))<0.70");
    expect(source).not.toContain("HAVING SUM(r.evidence_count)>=3 AND success_rate<0.70");
  });
});
