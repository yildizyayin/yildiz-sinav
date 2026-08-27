import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {classifyMastery,examTrend,scopeStudentIntelligence} from '../worker/lib/student-intelligence';

const baseProfile={
 studentId:'stu_test',profileVersion:3,learning:[{secret:'internal'}],
 payload:{
  policy:{educationalOnly:true,diagnosticUse:false,rawGuidanceResponsesIncluded:false,targetGapFabricated:false},
  overall:{masteryScore:62,academicConfidence:.72,learningCoverage:.5,evidenceCount:20,examTrend:'STABLE'},
  subjects:[
   {subjectId:'sub_math',subjectName:'Matematik',masteryScore:55,confidence:.7,evidenceCount:12},
   {subjectId:'sub_tur',subjectName:'Türkçe',masteryScore:72,confidence:.75,evidenceCount:8},
  ],
  priorities:[
   {subjectId:'sub_math',subjectName:'Matematik',outcomeTitle:'Problemler',masteryScore:40},
   {subjectId:'sub_tur',subjectName:'Türkçe',outcomeTitle:'Ana fikir',masteryScore:45},
  ],
  recentExams:[{id:'e1',title:'Deneme'}],
  targets:{activeCount:1,items:[{id:'t1',targetType:'LGS_SCHOOL'}]},
  guidance:{reviewedSignalCount:2,dimensions:[{key:'planning',score:70},{key:'focus',score:65}]},
  learningLoop:{openZeroErrorCount:1,activeAssignmentCount:1},
 },
};

describe('Student Intelligence',()=>{
 it('resolves academic year through the enrollment season before D1 bindings',()=>{
  const source=readFileSync(new URL('../worker/lib/student-intelligence.ts',import.meta.url),'utf8');
  expect(source).toContain('JOIN institution_seasons season ON season.id=e.season_id');
  expect(source).toContain('season.academic_year');
 });

 it('uses conservative mastery bands when evidence or confidence is insufficient',()=>{
  expect(classifyMastery(.95,2,.9)).toBe('INSUFFICIENT');
  expect(classifyMastery(.95,10,.2)).toBe('INSUFFICIENT');
  expect(classifyMastery(.85,10,.8)).toBe('STRONG');
  expect(classifyMastery(.65,10,.8)).toBe('STABLE');
  expect(classifyMastery(.45,10,.8)).toBe('DEVELOPING');
  expect(classifyMastery(.25,10,.8)).toBe('CRITICAL');
 });

 it('classifies exam trend only with enough evidence',()=>{
  expect(examTrend([90,88])).toBe('INSUFFICIENT');
  expect(examTrend([82,80,78,60,58])).toBe('RISING');
  expect(examTrend([55,58,60,78,80])).toBe('FALLING');
  expect(examTrend([70,71,69,70])).toBe('STABLE');
 });

 it('restricts branch teacher profile to assigned subjects and removes cross-domain signals',()=>{
  const scoped=scopeStudentIntelligence(structuredClone(baseProfile),{allowed:true,mode:'SUBJECT',subjectIds:['sub_math']},{role:'TEACHER'} as any);
  expect(scoped.accessScope).toBe('SUBJECT');
  expect(scoped.payload.subjects.map((x:any)=>x.subjectId)).toEqual(['sub_math']);
  expect(scoped.payload.priorities.every((x:any)=>x.subjectId==='sub_math')).toBe(true);
  expect(scoped.payload.recentExams).toEqual([]);
  expect(scoped.payload.targets).toEqual({activeCount:0,items:[]});
  expect(scoped.payload.guidance).toEqual({reviewedSignalCount:0,available:false});
  expect(scoped.payload.overall.scope).toBe('ASSIGNED_SUBJECTS');
  expect(scoped.learning).toBeUndefined();
 });

 it('keeps parent academic view but masks counselor dimension details',()=>{
  const scoped=scopeStudentIntelligence(structuredClone(baseProfile),{allowed:true,mode:'FULL',subjectIds:[]},{role:'PARENT'} as any);
  expect(scoped.payload.subjects).toHaveLength(2);
  expect(scoped.payload.guidance.reviewedSignalCount).toBe(2);
  expect(scoped.payload.guidance.available).toBe(true);
  expect(scoped.payload.guidance.dimensions).toBeUndefined();
  expect(scoped.learning).toBeUndefined();
 });
});
