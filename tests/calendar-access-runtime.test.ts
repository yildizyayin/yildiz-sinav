import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {handleCalendar, listCalendar, validCalendarRange} from '../worker/lib/calendar';

let db:DatabaseSync,env:any;
const user=(id:string,role:string,institution_id='a',student_id:string|null=null)=>({id,role,institution_id,student_id} as any);
const student=user('stu','STUDENT','a','s1'),parent=user('pa','PARENT'),teacher=user('t','TEACHER'),guidance=user('g','GUIDANCE_TEACHER'),manager=user('m','INSTITUTION_MANAGER'),admin=user('root','SUPER_ADMIN',null as any);
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(`
 CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('stu'),('pa'),('t'),('g'),('m'),('root'),('other');
 CREATE TABLE institutions(id TEXT PRIMARY KEY,name TEXT,status TEXT);INSERT INTO institutions VALUES('a','A','ACTIVE'),('b','B','ACTIVE');
 CREATE TABLE student_entities(id TEXT PRIMARY KEY,first_name TEXT,last_name TEXT,status TEXT);INSERT INTO student_entities VALUES('s1','One','Student','ACTIVE'),('s2','Two','Student','ACTIVE'),('s3','Foreign','Student','ACTIVE');
 CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,class_id TEXT,status TEXT,grade_level INTEGER);INSERT INTO student_enrollments VALUES('s1','a','c1','ACTIVE',7),('s2','a','c2','ACTIVE',7),('s3','b','c3','ACTIVE',7);
 CREATE TABLE classes(id TEXT PRIMARY KEY,name TEXT,institution_id TEXT,active INTEGER);INSERT INTO classes VALUES('c1','7A','a',1),('c2','7B','a',1),('c3','7C','b',1);
 CREATE TABLE subjects(id TEXT PRIMARY KEY,name TEXT);INSERT INTO subjects VALUES('math','Math'),('turkish','Turkish');
 CREATE TABLE teacher_assignments(user_id TEXT,class_id TEXT,subject_id TEXT,active INTEGER,assignment_type TEXT);INSERT INTO teacher_assignments VALUES('t','c1','math',1,'SUBJECT'),('g','c1',NULL,1,'GUIDANCE');ALTER TABLE teacher_assignments ADD COLUMN institution_id TEXT DEFAULT 'a';
 CREATE TABLE parent_student_links(student_id TEXT,parent_user_id TEXT,active INTEGER);INSERT INTO parent_student_links VALUES('s1','pa',1),('s2','pa',0);
 CREATE TABLE assignments(id TEXT,institution_id TEXT,title TEXT,due_at TEXT,status TEXT,created_by TEXT);INSERT INTO assignments VALUES('a1','a','Own Homework','2026-10-12T10:00:00Z','ASSIGNED','t'),('a2','b','Other Homework','2026-10-12T10:00:00Z','ASSIGNED','other');
 CREATE TABLE assignment_recipients(assignment_id TEXT,student_id TEXT,status TEXT);INSERT INTO assignment_recipients VALUES('a1','s1','ASSIGNED'),('a2','s3','ASSIGNED');
 CREATE TABLE worksheets(id TEXT,title TEXT,status TEXT);INSERT INTO worksheets VALUES('w1','Worksheet','PUBLISHED');
 CREATE TABLE worksheet_calendar_entries(id TEXT,worksheet_id TEXT,institution_id TEXT,class_id TEXT,planned_date TEXT,status TEXT);INSERT INTO worksheet_calendar_entries VALUES('wc1','w1','a','c1','2026-10-12','PLANNED'),('wc2','w1','b','c3','2026-10-12','PLANNED');
 CREATE TABLE worksheet_subjects(worksheet_id TEXT,subject_id TEXT);INSERT INTO worksheet_subjects VALUES('w1','math');
 CREATE TABLE exams(id TEXT,institution_id TEXT,title TEXT,exam_date TEXT,status TEXT,grade_level INTEGER);INSERT INTO exams VALUES('ex1','a','Our Exam','2026-10-12','ACTIVE',7),('ex2','b','Other Exam','2026-10-12','ACTIVE',7),('ex3','a','Draft','2026-10-12','DRAFT',7);
 CREATE TABLE IF NOT EXISTS result_network_own_exams(exam_id TEXT PRIMARY KEY,owner_kind TEXT,institution_id TEXT,dealer_id TEXT,created_by TEXT);CREATE TABLE exam_institutions(exam_id TEXT,institution_id TEXT,enabled INTEGER);CREATE TABLE exam_subjects(exam_id TEXT,subject_id TEXT);INSERT INTO exam_subjects VALUES('ex1','math');
 CREATE TABLE audit_logs(id TEXT,actor_user_id TEXT,institution_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,details_json TEXT);
 `);
 db.exec(readFileSync(new URL('../migrations/0087_nibiru_direct_access_calendar.sql',import.meta.url),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 env={DB:{prepare}};
 const add=(id:string,scope:string,owner:string,institution='a',classId:string|null=null,studentId:string|null=null,subject:string|null=null)=>db.prepare(`INSERT INTO calendar_events(id,institution_id,owner_user_id,scope,class_id,student_id,subject_id,kind,title,starts_at,ends_at) VALUES(?,?,?,?,?,?,?,'REMINDER',?,'2026-10-12T09:00:00Z','2026-10-12T10:00:00Z')`).run(id,institution,owner,scope,classId,studentId,subject,id);
 add('personal','PERSONAL','other');add('own','PERSONAL','pa');add('institution','INSTITUTION','m');add('class','CLASS','t','a','c1',null,'math');add('unassigned','CLASS','m','a','c2');add('branch-other','CLASS','m','a','c1',null,'turkish');add('student-only','STUDENT','g','a','c1','s1');add('unlinked-child','STUDENT','g','a','c2','s2');add('foreign','INSTITUTION','other','b');
});
afterEach(()=>db.close());
const ids=async(u:any)=>(await listCalendar(env,u,'2026-10-01','2026-11-01')).events.map(x=>x.id);
const request=(path:string,method:string,body:any)=>new Request(`https://app.anunex.com${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const valid={title:'Plan',scope:'CLASS',classId:'c1',subjectId:'math',kind:'LESSON',startsAt:'2026-10-12T12:00:00+03:00',endsAt:'2026-10-12T13:00:00+03:00'};
describe('calendar tenant and role boundaries with actual SQL',()=>{
 it('parents see active linked children, their own personal events and source records only',async()=>{const r=await ids(parent);expect(r).toContain('own');expect(r).toContain('student-only');expect(r).toContain('exam:ex1');expect(r).toContain('assignment:a1');expect(r).toContain('worksheet:wc1');for(const id of ['personal','foreign','unlinked-child','unassigned','exam:ex2','exam:ex3','worksheet:wc2','assignment:a2'])expect(r).not.toContain(id)});
 it('students cannot see another student or personal plan',async()=>{const r=await ids(student);expect(r).toContain('student-only');expect(r).not.toContain('own');expect(r).not.toContain('unlinked-child');expect(r).not.toContain('foreign')});
 it('teachers are bounded to exact class and subject assignments',async()=>{const r=await ids(teacher);expect(r).toContain('class');expect(r).not.toContain('branch-other');expect(r).not.toContain('unassigned');expect(r).not.toContain('foreign')});
 it('guidance sees its own assigned class, never another class',async()=>{const r=await ids(guidance);expect(r).toContain('student-only');expect(r).toContain('branch-other');expect(r).not.toContain('unassigned')});
 it('managers and super admin cannot read other users personal plans',async()=>{expect(await ids(manager)).not.toContain('personal');expect(await ids(manager)).not.toContain('foreign');expect(await ids(admin)).toContain('foreign');expect(await ids(admin)).not.toContain('personal')});
 it('rejects forged scope, foreign class, unrelated student and wrong subject writes',async()=>{for(const [u,b] of [[parent,valid],[teacher,{...valid,scope:'INSTITUTION'}],[teacher,{...valid,classId:'c2'}],[teacher,{...valid,subjectId:'turkish'}],[manager,{...valid,classId:'c3'}],[guidance,{...valid,scope:'STUDENT',studentId:'s2'}]] as any[])expect((await handleCalendar(request('/api/calendar','POST',b),env,u)).status).toBe(403)});
 it('stores a teacher lesson and detects stale edit revisions',async()=>{const r=await handleCalendar(request('/api/calendar','POST',valid),env,teacher);expect(r.status).toBe(201);const id=(await r.json() as any).id;expect((await handleCalendar(request(`/api/calendar/${id}`,'PUT',{...valid,revision:0}),env,teacher)).status).toBe(409);expect((await handleCalendar(request(`/api/calendar/${id}`,'PUT',{...valid,revision:1,status:'COMPLETED'}),env,teacher)).status).toBe(200)});
 it('requires access before acknowledging a reminder',async()=>{expect((await handleCalendar(request('/api/calendar/foreign/acknowledge','POST',{}),env,parent)).status).toBe(404);expect((await handleCalendar(request('/api/calendar/own/acknowledge','POST',{}),env,parent)).status).toBe(200)});
 it('rejects impossible ranges and unbounded recurrences',async()=>{expect(validCalendarRange('2026-02-30','2026-03-05')).toBe(false);expect(validCalendarRange('2026-01-01','2027-01-01')).toBe(false);expect((await handleCalendar(request('/api/calendar','POST',{...valid,recurrence:'WEEKLY',repeatUntil:'2029-01-01T12:00:00+03:00'}),env,teacher)).status).toBe(400)});
});
