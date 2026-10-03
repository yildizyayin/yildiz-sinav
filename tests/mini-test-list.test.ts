import {DatabaseSync} from 'node:sqlite';
import {expect,it} from 'vitest';
import {listFrozenMiniTestRuns,selectedFrozenMiniTestReport} from '../worker/reporting-entry';

it('discovers only authorized frozen new mini tests with branch eligibility before UTC keyset pagination',async()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE student_entities(id TEXT,first_name TEXT,last_name TEXT,status TEXT);INSERT INTO student_entities VALUES('s','Synthetic','Student','ACTIVE');
 CREATE TABLE student_enrollments(id TEXT,student_id TEXT,institution_id TEXT,season_id TEXT,class_id TEXT,student_number TEXT,grade_level INTEGER,section TEXT,status TEXT,created_at TEXT);
 INSERT INTO student_enrollments VALUES('en','s','school','season','class','1',7,'A','ACTIVE','2026'),('old-en','s','school','old-season','class','1',7,'A','ARCHIVED','2025');
 CREATE TABLE classes(id TEXT,name TEXT);INSERT INTO classes VALUES('class','7A');CREATE TABLE institutions(id TEXT,name TEXT);INSERT INTO institutions VALUES('school','Synthetic');
 CREATE TABLE parent_student_links(id TEXT,parent_user_id TEXT,student_id TEXT,active INTEGER);INSERT INTO parent_student_links VALUES('link','parent','s',1);
 CREATE TABLE teacher_assignments(user_id TEXT,class_id TEXT,subject_id TEXT,assignment_type TEXT,active INTEGER,season_id TEXT);INSERT INTO teacher_assignments VALUES('teacher','class','math','SUBJECT',1,'season');
 CREATE TABLE assignments(id TEXT,institution_id TEXT);INSERT INTO assignments VALUES('assignment','school'),('foreign-assignment','other');
 CREATE TABLE coach_mini_tests(id TEXT,student_id TEXT,assignment_id TEXT,selection_mode TEXT,status TEXT,submitted_at TEXT);
 CREATE TABLE assessment_runs(id TEXT,student_id TEXT,institution_id TEXT,source_type TEXT,status TEXT,delivery_mode TEXT,completed_at TEXT,metadata_json TEXT,source_id TEXT,assignment_id TEXT);`);
 const question=(id:string,subject='math')=>({questionId:id,status:'CORRECT',outcomeRefs:[{outcomeId:'outcome',subjectId:subject,curriculumVersionId:'cv',academicYear:'2026-2027',gradeLevel:7,verified:1,programVersion:'MAARIF'}]});
 const add=(id:string,options:any={})=>{
  const v={student:'s',institution:'school',assignment:'assignment',testStudent:'s',runAssignment:'assignment',sourceId:id,mode:'NEW',status:'PASSED',runStatus:'SCORED',source:'MINI_TEST',delivery:'DIGITAL',enrollment:'en',season:'season',year:'2026-2027',completed:'2026-10-01 12:00:00',submitted:'2026-10-01 12:00:00',questions:[question(id)],...options};
  const metadata=options.metadata??{selectionMode:v.mode,practiceOnly:v.mode==='REPEAT',miniEvidence:{policy:'MINI_TEST_CONTENT_AT_START_V1',enrollmentId:v.enrollment,seasonId:v.season,academicYear:v.year,gradeLevel:7,questionEvidence:v.questions}};
  db.prepare('INSERT INTO coach_mini_tests VALUES(?,?,?,?,?,?)').run(id,v.testStudent,v.assignment,v.mode,v.status,v.submitted);
  db.prepare('INSERT INTO assessment_runs VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,v.student,v.institution,v.source,v.runStatus,v.delivery,v.completed,typeof metadata==='string'?metadata:JSON.stringify(metadata),v.sourceId,v.runAssignment);
 };
 add('own');add('science',{questions:[question('science-q','science')]});add('mixed',{questions:[question('mixed-math'),question('mixed-science','science')]});
 add('offset',{completed:'2026-10-01T14:00:00+03:00'});add('old',{enrollment:'old-en',season:'old-season',completed:'2026-10-01T10:00:00.000Z'});
 add('z-foreign-student',{student:'foreign'});add('z-foreign-institution',{institution:'other'});add('z-foreign-assignment',{assignment:'foreign-assignment'});add('z-spoof-run-assignment',{runAssignment:'foreign-assignment'});add('z-spoof-test-student',{testStudent:'foreign'});add('z-spoof-source',{sourceId:'own'});add('z-spoof-season',{season:'other'});
 add('z-repeat',{mode:'REPEAT'});add('z-legacy',{mode:'LEGACY',metadata:{}});add('z-unscored',{runStatus:'SUBMITTED'});add('z-not-submitted',{submitted:null});add('z-other-source',{source:'QUESTION_BANK'});add('z-other-delivery',{delivery:'PRINT'});add('z-malformed',{metadata:'{'});add('z-date-only',{completed:'2026-10-01'});add('z-invalid-date',{completed:'not a date'});add('z-other-year',{year:'2025-2026'});
 add('z-calendar-overflow',{completed:'2026-02-30 12:00:00'});add('z-hour-overflow',{completed:'2026-10-01 24:00:00'});
 add('z-invalid-status',{questions:[question('valid'),{...question('invalid','science'),status:'INVALID'}]});
 add('z-invalid-outcome',{questions:[question('valid'),{...question('bad'),outcomeRefs:[{...question('bad').outcomeRefs[0],outcomeId:5}]}]});
 add('z-invalid-program',{questions:[{...question('bad'),outcomeRefs:[{...question('bad').outcomeRefs[0],programVersion:5}]}]});
 add('z-unverified',{questions:[{...question('bad'),outcomeRefs:[{...question('bad').outcomeRefs[0],verified:0}]}]});
 add('z-context-mixed',{questions:[{...question('bad'),outcomeRefs:[...question('bad').outcomeRefs,{...question('bad').outcomeRefs[0],curriculumVersionId:'other-cv'}]}]});
 add('z-duplicate',{questions:[{...question('same'),outcomeRefs:[{...question('same').outcomeRefs[0],verified:0}]},question('same')]});
 add('z-empty',{questions:[]});add('z-scalar-question',{questions:['bad']});add('z-scalar-refs',{questions:[{...question('bad'),outcomeRefs:'bad'}]});
 add('z-invalid-grade',{metadata:{selectionMode:'NEW',practiceOnly:false,miniEvidence:{policy:'MINI_TEST_CONTENT_AT_START_V1',academicYear:'2026-2027',gradeLevel:99,enrollmentId:'en',seasonId:'season',questionEvidence:[question('q')]}}});
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})});const env={DB:{prepare}} as any;
 const student={role:'STUDENT',student_id:'s'} as any,teacher={id:'teacher',role:'TEACHER',institution_id:'school'} as any;
 const base=new URL('https://test?academicYear=2026-2027&limit=1');
 const ids:string[]=[];let cursor:string|null=null;
 do{const url=new URL(base);if(cursor)url.searchParams.set('cursor',cursor);const result:any=await(await listFrozenMiniTestRuns(env,student,'s',url)).json();expect(result.runs).toHaveLength(1);expect(Object.keys(result.runs[0]).sort()).toEqual(['completedAt','id']);expect(new Date(result.runs[0].completedAt).toISOString()).toBe(result.runs[0].completedAt);ids.push(result.runs[0].id);cursor=result.nextCursor;}while(cursor);
 expect(ids).toEqual(['science','own','mixed','offset','old']);
 const first:any=await(await listFrozenMiniTestRuns(env,teacher,'s',base)).json();expect(first.runs).toEqual([{id:'own',completedAt:'2026-10-01T12:00:00.000Z'}]);expect(first.restrictedToSubjects).toBe(true);
 const next=new URL(base);next.searchParams.set('cursor',first.nextCursor);const second:any=await(await listFrozenMiniTestRuns(env,teacher,'s',next)).json();expect(second.runs.map((r:any)=>r.id)).toEqual(['mixed']);
 const lastUrl=new URL(base);lastUrl.searchParams.set('cursor',second.nextCursor);const last:any=await(await listFrozenMiniTestRuns(env,teacher,'s',lastUrl)).json();expect(last.runs.map((r:any)=>r.id)).toEqual(['offset']);expect(last.nextCursor).toBeNull();
 const selected:any=await(await selectedFrozenMiniTestReport(env,teacher,'s',new URL('https://test?academicYear=2026-2027&testIds=mixed'))).json();expect(selected.groups.map((g:any)=>g.subjectId)).toEqual(['math']);expect(selected.groups[0].evidenceCount).toBe(1);
 expect(JSON.stringify(first)).not.toMatch(/questionId|outcomeId|science|metadata|Synthetic|correct|count/i);
 const parent={role:'PARENT',id:'parent'} as any;expect((await listFrozenMiniTestRuns(env,parent,'s',base)).status).toBe(200);db.exec('UPDATE parent_student_links SET active=0');expect((await listFrozenMiniTestRuns(env,parent,'s',base)).status).toBe(403);
 expect((await listFrozenMiniTestRuns(env,{role:'STUDENT',student_id:'foreign'} as any,'s',base)).status).toBe(403);expect((await listFrozenMiniTestRuns(env,{role:'INSTITUTION_MANAGER',institution_id:'other'} as any,'s',base)).status).toBe(403);
 db.exec('UPDATE teacher_assignments SET active=0');expect((await listFrozenMiniTestRuns(env,teacher,'s',base)).status).toBe(403);
 for(const query of ['academicYear=2026-2028','academicYear=2026-2027&limit=51','academicYear=2026-2027&limit=0','academicYear=2026-2027&cursor=bad','academicYear=2026-2027&cursor='+btoa(JSON.stringify(['2026-02-30T00:00:00.000Z','own'])).replace(/=+$/,'')])expect((await listFrozenMiniTestRuns(env,student,'s',new URL('https://test?'+query))).status).toBe(400);
 }finally{db.close();}
});
