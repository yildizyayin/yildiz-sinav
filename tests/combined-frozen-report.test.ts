import {expect,it} from 'vitest';
import {combineFrozenReports} from '../worker/lib/combined-frozen-report';
it('weights question events rather than source percentages and keeps different frozen contexts separate',()=>{
 const group={subjectId:'math',curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,programVersion:'v1',correct:1,wrong:0,blank:0,evidenceCount:1};
 const result=combineFrozenReports([{sourceType:'EXAM',report:{groups:[{...group,invalid:2}]}},{sourceType:'QUESTION_BANK',report:{groups:[{...group,correct:0,wrong:9,evidenceCount:9},{...group,programVersion:'v2'}]}}]);
 expect(result.groups).toHaveLength(2);expect(result.groups.find(g=>g.programVersion==='v1')).toMatchObject({evidenceCount:10,accuracyPercent:10,invalid:2});
 expect(result.groups.find(g=>g.programVersion==='v1').sourceBreakdown).toHaveLength(2);expect(result.officialScore).toBeNull();expect(result.nationalRank).toBeNull();
});
