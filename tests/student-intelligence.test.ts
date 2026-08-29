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
  goalMotivation:{identity:'Hedefime düzenli çalışan bir öğrenci',enabled:true,activeTargetCount:1,targets:[{id:'t1',targetType:'LGS_SCHOOL'}]},
  guidance:{reviewedSignalCount:2,dimensions:[{key:'planning',score:70},{key:'focus',score:65}]},
  learningLoop:{recovery:{activeCount:1},tasks:{openPersonalTaskCount:1},videos:{availableApprovedCount:1}},
  evidenceSources:[{key:'LEARNING_GRAPH',label:'Öğrenme Grafiği',count:20},{key:'GUIDANCE_REVIEW',label:'Rehberlik',count:2}],
 },
};

describe('Student Intelligence',()=>{
 it('resolves academic year through the enrollment season before D1 bindings',()=>{
  const source=readFileSync(new URL('../worker/lib/student-intelligence.ts',import.meta.url),'utf8');
  expect(source).toContain('JOIN institution_seasons season ON season.id=e.season_id');
  expect(source).toContain('season.academic_year');
  expect(source).toContain('motivation_label future_identity_label');
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
  expect(scoped.payload.goalMotivation).toEqual({available:false,activeTargetCount:0,targets:[]});
  expect(scoped.payload.guidance).toEqual({reviewedSignalCount:0,available:false});
  expect(scoped.payload.learningLoop).toEqual({available:false,reason:'ASSIGNED_SUBJECTS_SCOPE'});
  expect(scoped.payload.evidenceSources.map((x:any)=>x.key)).toEqual(['LEARNING_GRAPH']);
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

 it('builds one evidence profile from recovery, coach, targets, zero-error, books and approved videos',()=>{
  const source=readFileSync(new URL('../worker/lib/student-intelligence.ts',import.meta.url),'utf8');
  expect(source).toContain('schemaVersion:2');
  expect(source).toContain('goalMotivation:');
  expect(source).toContain('learningLoop:{recovery:');
  expect(source).toContain("v.approved=1 AND v.active=1");
  expect(source).toContain("label:'Sıfır Hata döngüsü'");
  expect(source).toContain("label:'Onaylı video köprüsü'");
  expect(source).toContain('student_personal_books');
 });

 it('persists searchable action-loop counters and exposes them to the cached Nibiru context',()=>{
  const migration=readFileSync(new URL('../migrations/0037_unified_student_intelligence.sql',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../worker/student-intelligence-entry.ts',import.meta.url),'utf8');
  for(const column of ['active_recovery_count','open_coach_task_count','pending_followup_count','mastered_outcome_count','available_video_count','personal_book_count','motivation_enabled'])expect(migration).toContain(column);
  expect(entry).toContain('goalMotivation:payload?.goalMotivation');
  expect(entry).toContain('activeRecoveryCount:');
  expect(entry).toContain('availableApprovedVideoCount:');
  expect(entry).toContain('evidenceSources:payload?.evidenceSources');
 });

 it('uses the unified profile in the student journey and removes direct RBA self-report',()=>{
  const page=readFileSync(new URL('../src/pages/StudentGrowthCenter.tsx',import.meta.url),'utf8');
  expect(page).toContain('/api/student-intelligence/profile');
  expect(page).toContain('/api/student-intelligence/learning-graph');
  expect(page).toContain('Rehber öğretmen onaylı gelişim');
  expect(page).toContain('Sıfır Hata ve kişisel kitap');
  expect(page).toContain('Onaylı video köprüsü');
  expect(page).not.toContain('/api/platform/rba');
 });
});
