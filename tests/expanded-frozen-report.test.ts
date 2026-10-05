import {expect,it} from 'vitest';
import {combineExpandedFrozenReports} from '../worker/lib/expanded-frozen-report';

const group=(correct:number,wrong:number,programVersion='v1')=>({subjectId:'math',subjectName:'Matematik',curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,programVersion,correct,wrong,blank:0,evidenceCount:correct+wrong});

it('weights EXAM, QUESTION_BANK, MINI_TEST and FOY by evidence count instead of averaging percentages',()=>{
 const result=combineExpandedFrozenReports([
  {sourceType:'EXAM',report:{groups:[group(1,0)]}},
  {sourceType:'QUESTION_BANK',report:{groups:[group(0,9)]}},
  {sourceType:'MINI_TEST',report:{groups:[group(1,0)]}},
  {sourceType:'FOY',report:{groups:[group(3,1)],coverage:{validEvidenceCount:4}}},
 ],null);
 expect(result.groups).toEqual([expect.objectContaining({correct:5,wrong:10,evidenceCount:15,accuracyPercent:33.33})]);
 expect(result.sourceTypes).toEqual(['EXAM','QUESTION_BANK','MINI_TEST','FOY']);
 expect(result.officialScore).toBeNull();
});

it('keeps mini-game score outside academic accuracy and preserves its frozen metrics separately',()=>{
 const game={policy:'FROZEN_MINI_GAME_CONTEXT_V1',groups:[{subjectId:'math',sessionCount:2,averageScore:85,totalXp:40}],coverage:{validSessionCount:2},unavailableSessionIds:[]};
 const result=combineExpandedFrozenReports([{sourceType:'FOY',report:{groups:[group(1,1)]}}],game);
 expect(result.groups[0]).toMatchObject({correct:1,wrong:1,evidenceCount:2,accuracyPercent:50});
 expect(result.gameActivity?.groups[0]).toMatchObject({sessionCount:2,averageScore:85,totalXp:40});
 expect(result.sourceTypes).toEqual(['FOY','MINI_GAME']);
 expect(result.message).toContain('Mini oyun puanı doğruluk hesabına katılmaz');
});

it('never merges different program versions into one accuracy group',()=>{
 const result=combineExpandedFrozenReports([
  {sourceType:'EXAM',report:{groups:[group(1,0,'v1')]}},
  {sourceType:'FOY',report:{groups:[group(1,0,'v2')]}},
 ],null);
 expect(result.groups).toHaveLength(2);
});
