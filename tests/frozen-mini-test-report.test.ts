import {expect,it} from 'vitest';
import {frozenMiniTestReport} from '../worker/lib/frozen-mini-test-report';
it('uses native frozen mini evidence and excludes repeats, legacy records and foreign branches',()=>{
 const question=(subjectId:string,status:string)=>({questionId:subjectId,status,outcomeRefs:[{outcomeId:'o',subjectId,curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1}]});
 const meta={selectionMode:'NEW',practiceOnly:false,miniEvidence:{policy:'MINI_TEST_CONTENT_AT_START_V1',enrollmentId:'en',seasonId:'season',academicYear:'2026-2027',gradeLevel:7,questionEvidence:[question('math','CORRECT'),question('science','WRONG')]}};
 const row={id:'test',source_type:'MINI_TEST',source_id:'test',status:'SCORED',metadata_json:JSON.stringify(meta)};
 const repeat={...row,id:'repeat',source_id:'repeat',metadata_json:JSON.stringify({...meta,selectionMode:'REPEAT',practiceOnly:true})};
 const data=frozenMiniTestReport([row,repeat,{...row,id:'legacy',source_id:'legacy',metadata_json:'{}'}],'2026-2027',null);
 expect(data.groups).toHaveLength(2);expect(data.groups[0]).toMatchObject({correct:1,evidenceCount:1,testCount:1});expect(data.coverage?.legacyTests).toBe(2);
 const branch=frozenMiniTestReport([row,repeat],'2026-2027',['math']);expect(branch.groups).toHaveLength(1);expect(branch.coverage).toBeNull();expect(JSON.stringify(branch)).not.toContain('science');expect(JSON.stringify(branch)).not.toContain('questionId');
});

it('rejects unofficial native statuses and malformed outcome contexts without leaking branch diagnostics',()=>{
 const row=(status:string,outcomeId:unknown)=>({id:'t',source_id:'t',source_type:'MINI_TEST',status:'SCORED',metadata_json:JSON.stringify({selectionMode:'NEW',practiceOnly:false,miniEvidence:{policy:'MINI_TEST_CONTENT_AT_START_V1',enrollmentId:'en',seasonId:'s',academicYear:'2026-2027',gradeLevel:7,questionEvidence:[{questionId:'q',status,outcomeRefs:[{outcomeId,subjectId:'math',curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1}]}]}})});
 expect(frozenMiniTestReport([row('INVALID','o'),row('CORRECT',null)],'2026-2027',null).groups).toEqual([]);
 expect(frozenMiniTestReport([row('INVALID','o')],'2026-2027',['math']).coverage).toBeNull();
});
