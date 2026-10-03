import {describe,it,expect} from 'vitest';
import {frozenPracticeReport} from '../worker/lib/frozen-practice-report';
const year='2026-2027';
function row(id:string,status='CORRECT',changes:any={}){return {id,source_type:'QUESTION_BANK',source_id:'q1',status:'SCORED',completed_at:'2026-10-02 12:00:00',metadata_json:JSON.stringify({frozenEvidence:{policy:'QUESTION_PRACTICE_READ_CONTEXT_V1',enrollmentId:'en1',academicYear:year,gradeLevel:8,questionId:'q1',contentDigest:'a'.repeat(64),status,outcomeRefs:[{outcomeId:'o1',subjectId:'math',curriculumVersionId:'cv1',academicYear:year,gradeLevel:8,programVersion:'v1',verified:1}],...changes}})};}
describe('frozen practice report',()=>{
  it('selects deterministic first/latest distinct attempts and separates changed content',()=>{
    const early=row('a','WRONG'),late=row('b','CORRECT');
    const changed=row('c','BLANK',{contentDigest:'b'.repeat(64)});
    const latest=frozenPracticeReport([late,early,changed,late],year,null,'LATEST');
    expect(latest.groups[0]).toMatchObject({correct:1,wrong:0,blank:1,evidenceCount:2,accuracyPercent:50});
    expect(latest.coverage).toEqual({legacyRuns:0,excludedEvidence:0,repeatedAttempts:1});
    expect(frozenPracticeReport([changed,early,late],year,null,'FIRST').groups[0]).toMatchObject({correct:0,wrong:1,blank:1});
    expect(frozenPracticeReport([early,late,changed],year,null,'LATEST')).toEqual(latest);
    expect(latest.officialScore).toBeNull();expect(latest.nationalRank).toBeNull();
  });
  it('rejects unknown and mixed curriculum evidence without cross-branch diagnostics',()=>{
    const valid=row('valid');
    const unknown=row('unknown','CORRECT',{outcomeRefs:[]});
    const mixed=row('mixed','CORRECT',{outcomeRefs:[{outcomeId:'o1',subjectId:'math',curriculumVersionId:'cv1',academicYear:year,gradeLevel:8,verified:1},{outcomeId:'o2',subjectId:'science',curriculumVersionId:'cv2',academicYear:year,gradeLevel:8,verified:1}]});
    const stale=row('stale','CORRECT',{academicYear:'2025-2026'});
    const mismatched=row('mismatch','CORRECT',{gradeLevel:7});
    const legacy={...row('legacy'),metadata_json:'{}'};
    const result=frozenPracticeReport([valid,unknown,mixed,stale,mismatched,legacy],year,null);
    expect(result.groups[0].evidenceCount).toBe(1);
    expect(result.coverage).toEqual({legacyRuns:1,excludedEvidence:3,repeatedAttempts:0});
    const branch=frozenPracticeReport([valid,unknown,mixed,legacy],year,['math']);
    expect(branch.groups[0].evidenceCount).toBe(1);expect(branch.coverage).toBeNull();
    expect(frozenPracticeReport([valid],year,['science']).groups).toEqual([]);
  });
});
