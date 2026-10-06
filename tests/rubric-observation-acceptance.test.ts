import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {handleRubricObservations} from '../worker/lib/rubric-observations';

function fixture(){
 const db=new DatabaseSync(':memory:');const dir=new URL('../migrations/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
 db.exec(`INSERT INTO institutions(id,name,code) VALUES('school','Synthetic','SYNTH'),('foreign','Foreign','OTHER');
 INSERT INTO institution_seasons(id,institution_id,academic_year) VALUES('season','school','2026-2027'),('next','school','2027-2028');
 INSERT INTO classes(id,institution_id,season_id,grade_level,section,name) VALUES('class','school','season',7,'A','7A'),('other','school','season',7,'B','7B');
 INSERT INTO subjects(id,code,name) VALUES('math','SYNTH_MATH','Synthetic math'),('language','SYNTH_LANG','Synthetic language');
 INSERT INTO student_entities(id,first_name,last_name,normalized_name) VALUES('student','Synthetic','Student','synthetic'),('unlinked','Other','Student','other');
 INSERT INTO student_enrollments(id,student_id,institution_id,season_id,class_id,grade_level) VALUES('enrollment','student','school','season','class',7);
 INSERT INTO users(id,institution_id,role,display_name,password_hash,password_salt) VALUES('teacher','school','TEACHER','Synthetic teacher','hash','salt'),('other-teacher','school','TEACHER','Other teacher','hash','salt'),('guide','school','GUIDANCE_TEACHER','Guide','hash','salt'),('parent','school','PARENT','Parent','hash','salt');
 INSERT INTO teacher_assignments(id,user_id,institution_id,season_id,class_id,subject_id,assignment_type) VALUES('assignment','teacher','school','season','class','math','SUBJECT'),('other-assignment','other-teacher','school','season','class','math','SUBJECT'),('guidance','guide','school','season','class',NULL,'GUIDANCE');
 INSERT INTO parent_student_links(id,parent_user_id,student_id) VALUES('link','parent','student');
 INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,authority,verified,program_code) VALUES('cv','2026-2027',7,'SYNTHETIC','MEB',1,'SCHOOL');
 INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,node_type,official) VALUES('outcome','cv','math',7,'SYNTH.1','Synthetic learning output','OUTCOME',1);
 INSERT INTO curriculum_process_components(id,outcome_id,code,title,source_url,source_title,source_locator,review_note,verified_by) VALUES('component','outcome','P1','Synthetic process','https://tymm.meb.gov.tr/synthetic.pdf','Synthetic document','Synthetic section','Synthetic fixture declaration','teacher');`);
 const criteria=[{id:'criterion',title:'Observable action',description:'Synthetic action',levels:[{id:'guided',label:'With support',description:'Demonstrates with guidance'},{id:'independent',label:'Independent',description:'Demonstrates independently'}]}];
 db.prepare("INSERT INTO learning_rubric_versions(id,component_id,version_label,title,task_instructions,criteria_json,source_kind,review_note,published_by) VALUES('rubric','component','v1','Synthetic rubric','Observe the synthetic task',?,'TEACHER_DESIGNED','Synthetic review','teacher')").run(JSON.stringify(criteria));
 let beforeInsert:(()=>void)|null=null;
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(sql,v),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({success:true,results:db.prepare(sql).all(...args)}),run:async()=>{if(beforeInsert&&(sql.startsWith('INSERT INTO learning_rubric_observations(')||sql.startsWith('INSERT INTO learning_rubric_observation_withdrawals('))){const hook=beforeInsert;beforeInsert=null;hook();}return {success:true,meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}});
 const env:any={DB:{prepare}};const teacher:any={id:'teacher',role:'TEACHER',institution_id:'school'};
 const body={enrollmentId:'enrollment',rubricId:'rubric',requestId:'synthetic-request-1',confirmedObservation:true,observedAt:'2026-10-01T12:00:00.000Z',evidenceNote:'Synthetic evidence recorded during the task.',feedback:'Continue demonstrating the observed action.',nextStep:'Try a second synthetic task independently.',selections:[{criterionId:'criterion',levelId:'independent'}]};
 const write=(value:any=body,actor=teacher,student='student')=>handleRubricObservations(new Request(`https://test/api/learning-observations/students/${student}`,{method:'POST',body:JSON.stringify(value)}),env,actor);
 const read=(actor=teacher,query='')=>handleRubricObservations(new Request(`https://test/api/learning-observations/students/student${query}`),env,actor);
 const withdraw=(id:string,actor=teacher,reason='Synthetic correction requires a fresh observation.')=>handleRubricObservations(new Request(`https://test/api/learning-observations/students/student/${id}/withdraw`,{method:'POST',body:JSON.stringify({reason})}),env,actor);
 return {db,env,teacher,body,criteria,write,read,withdraw,race:(hook:()=>void)=>{beforeInsert=hook}};
}

it('freezes the rubric and selections, replays an identical request, and rejects changed content',async()=>{
 const f=fixture();try{
  const response=await f.write();expect(response!.status).toBe(201);const id=(await response!.json() as any).id;
  const replay=await f.write();expect(replay!.status).toBe(200);expect(await replay!.json()).toMatchObject({id,replayed:true});
  expect((await f.write({...f.body,evidenceNote:'Different synthetic evidence for the same request.'}))!.status).toBe(409);
  const stored=f.db.prepare('SELECT * FROM learning_rubric_observations WHERE id=?').get(id)!;
  expect(JSON.parse(String(stored.snapshot_json))).toMatchObject({schemaVersion:1,rubricId:'rubric',versionLabel:'v1',criteria:f.criteria,sourceKind:'TEACHER_DESIGNED',sourceUrl:null,subjectId:'math',curriculumVersionId:'cv',academicYear:'2026-2027'});
  expect(JSON.parse(String(stored.selections_json))).toEqual(f.body.selections);expect(stored).toMatchObject({student_id:'student',enrollment_id:'enrollment',institution_id:'school',season_id:'season',class_id:'class',observer_id:'teacher'});
  expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(1);
  expect(()=>f.db.prepare('UPDATE learning_rubric_observations SET feedback=? WHERE id=?').run('Changed',id)).toThrow('OBSERVATION_IMMUTABLE');expect(()=>f.db.prepare('DELETE FROM learning_rubric_observations WHERE id=?').run(id)).toThrow('OBSERVATION_IMMUTABLE');expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{f.db.close()}
});

it('allows only the exact subject teacher to write',async()=>{
 const f=fixture();try{
  for(const role of ['SUPER_ADMIN','INSTITUTION_MANAGER','GUIDANCE_TEACHER','STUDENT','PARENT'])expect((await f.write(f.body,{...f.teacher,role}))!.status).toBe(403);
  expect((await f.write(f.body,{...f.teacher,institution_id:'foreign'}))!.status).toBe(403);expect((await f.write(f.body,f.teacher,'unlinked'))!.status).toBe(403);
  f.db.exec("UPDATE teacher_assignments SET subject_id='language' WHERE id='assignment'");expect((await f.write())!.status).toBe(403);expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(0);
 }finally{f.db.close()}
});

for(const [name,sql] of [
 ['revoked assignment',"UPDATE teacher_assignments SET active=0 WHERE id='assignment'"],
 ['different assignment institution',"UPDATE teacher_assignments SET institution_id='foreign' WHERE id='assignment'"],
 ['different assignment season',"UPDATE teacher_assignments SET season_id='next' WHERE id='assignment'"],
 ['different assignment class',"UPDATE teacher_assignments SET class_id='other' WHERE id='assignment'"],
 ['different assignment subject',"UPDATE teacher_assignments SET subject_id='language' WHERE id='assignment'"],
 ['guidance-only assignment',"UPDATE teacher_assignments SET assignment_type='GUIDANCE' WHERE id='assignment'"],
 ['left enrollment',"UPDATE student_enrollments SET status='LEFT' WHERE id='enrollment'"],
 ['archived student',"UPDATE student_entities SET status='ARCHIVED' WHERE id='student'"],
 ['closed season',"UPDATE institution_seasons SET status='CLOSED' WHERE id='season'"],
 ['inactive class',"UPDATE classes SET active=0 WHERE id='class'"],
 ['moved enrollment',"UPDATE student_enrollments SET class_id='other' WHERE id='enrollment'"],
 ['revoked curriculum',"UPDATE curriculum_versions SET verified=0 WHERE id='cv'"],
 ['inactive outcome',"UPDATE outcomes SET active=0 WHERE id='outcome'"],
 ['different grade',"UPDATE student_enrollments SET grade_level=8 WHERE id='enrollment'"],
] as const)it(`rejects ${name} both before lookup and immediately before INSERT`,async()=>{
 const first=fixture();try{first.db.exec(sql);expect((await first.write())!.status).toBe(403);expect(first.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(0);}finally{first.db.close()}
 const raced=fixture();try{raced.race(()=>raced.db.exec(sql));expect((await raced.write())!.status).toBe(409);expect(raced.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(0);}finally{raced.db.close()}
});

it('validates literal confirmation, dates and exactly one known level per criterion',async()=>{
 const f=fixture();try{
  for(const patch of [{confirmedObservation:'true'},{observedAt:'2025-10-01T12:00:00Z'},{observedAt:'2999-10-01T12:00:00Z'},{observedAt:'not-a-date'},{selections:[]},{selections:[{criterionId:'unknown',levelId:'independent'}]},{selections:[{criterionId:'criterion',levelId:'unknown'}]},{selections:[...f.body.selections,...f.body.selections]}])expect((await f.write({...f.body,...patch}))!.status).toBe(400);
  expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(0);
 }finally{f.db.close()}
});

it('reads across authorized roles, filters unrelated subjects and rejects revoked links',async()=>{
 const f=fixture();try{
  expect((await f.write())!.status).toBe(201);
  for(const actor of [{id:'admin',role:'SUPER_ADMIN'},{id:'manager',role:'INSTITUTION_MANAGER',institution_id:'school'},f.teacher,{id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'},{id:'student-user',role:'STUDENT',student_id:'student'},{id:'parent',role:'PARENT'}]){
   const response=await f.read(actor as any);expect(response!.status).toBe(200);const data:any=await response!.json();expect(data.observations).toHaveLength(1);expect(data.observations[0]).not.toHaveProperty('fingerprint');expect(data.observations[0]).not.toHaveProperty('request_id');
   expect(data.rubrics[0].can_observe).toBe(actor.role==='TEACHER'?1:0);
  }
  expect((await f.read({id:'manager',role:'INSTITUTION_MANAGER',institution_id:'foreign'} as any))!.status).toBe(403);expect((await f.read({id:'student-user',role:'STUDENT',student_id:'unlinked'} as any))!.status).toBe(403);
  f.db.exec("UPDATE parent_student_links SET active=0 WHERE id='link'");expect((await f.read({id:'parent',role:'PARENT'} as any))!.status).toBe(403);
  f.db.exec("UPDATE teacher_assignments SET subject_id='language' WHERE id='assignment'");const filtered:any=await (await f.read())!.json();expect(filtered.observations).toEqual([]);expect(filtered.rubrics).toEqual([]);
  f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='guidance'");expect((await f.read({id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'} as any))!.status).toBe(403);
 }finally{f.db.close()}
});

it('preserves historical evidence for authorized roles but blocks staff history and all writes after departure',async()=>{
 const f=fixture();try{
  expect((await f.write())!.status).toBe(201);f.db.exec("UPDATE student_enrollments SET status='LEFT' WHERE id='enrollment'; UPDATE institution_seasons SET status='CLOSED' WHERE id='season'; UPDATE classes SET active=0 WHERE id='class'");
  expect((await f.read())!.status).toBe(403);expect((await f.write({...f.body,requestId:'new-request'}))!.status).toBe(403);
  for(const actor of [f.teacher,{id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'}])expect((await f.read(actor as any,'?view=history'))!.status).toBe(403);
  for(const actor of [{id:'admin',role:'SUPER_ADMIN'},{id:'manager',role:'INSTITUTION_MANAGER',institution_id:'school'},{id:'student-user',role:'STUDENT',student_id:'student'},{id:'parent',role:'PARENT'}]){const r=await f.read(actor as any,'?view=history&enrollmentId=enrollment');expect(r!.status).toBe(200);expect(await r!.json()).toMatchObject({rubrics:[],observations:[{enrollment_id:'enrollment'}],canObserve:false});}
 }finally{f.db.close()}
});

it('withdraws only by the original authorized observer and retains immutable evidence',async()=>{
 const f=fixture();try{
  const id=(await (await f.write())!.json() as any).id;
  expect((await f.withdraw(id,{...f.teacher,id:'other-teacher'}))!.status).toBe(403);expect((await f.withdraw(id,f.teacher,'short'))!.status).toBe(400);
  f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'");expect((await f.withdraw(id))!.status).toBe(403);f.db.exec("UPDATE teacher_assignments SET active=1 WHERE id='assignment'");
  expect((await f.withdraw(id))!.status).toBe(200);expect((await f.withdraw(id))!.status).toBe(403);
  expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(1);expect(f.db.prepare('SELECT * FROM learning_rubric_observation_withdrawals').get()).toMatchObject({observation_id:id,withdrawn_by:'teacher'});
  expect((await (await f.read())!.json() as any).observations).toEqual([]);expect((await (await f.read({id:'student-user',role:'STUDENT',student_id:'student'} as any,'?view=history'))!.json() as any).observations).toEqual([]);
  expect(()=>f.db.exec("UPDATE learning_rubric_observation_withdrawals SET reason='Changed'")).toThrow('WITHDRAWAL_IMMUTABLE');expect(()=>f.db.exec('DELETE FROM learning_rubric_observation_withdrawals')).toThrow('WITHDRAWAL_IMMUTABLE');
  const correction=await f.write({...f.body,requestId:'corrected-request',selections:[{criterionId:'criterion',levelId:'guided'}]});expect(correction!.status).toBe(201);expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(2);
 }finally{f.db.close()}
});

it('rechecks authority on replay and scopes request IDs to each observer',async()=>{
 const f=fixture();try{
  expect((await f.write())!.status).toBe(201);expect((await f.write(f.body,{...f.teacher,id:'other-teacher'}))!.status).toBe(201);
  f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'");expect((await f.write())!.status).toBe(403);
  expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(2);
 }finally{f.db.close()}
});

it('rechecks original observer authority inside the withdrawal INSERT',async()=>{
 const f=fixture();try{
  const id=(await (await f.write())!.json() as any).id;
  f.race(()=>f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'"));expect((await f.withdraw(id))!.status).toBe(403);
  expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observation_withdrawals').get()!.n).toBe(0);expect(f.db.prepare('SELECT count(*) n FROM learning_rubric_observations').get()!.n).toBe(1);
 }finally{f.db.close()}
});

it('pages equal timestamps without duplicates and rechecks cursor scope and authority',async()=>{
 const f=fixture();try{
  const id=(await (await f.write())!.json() as any).id;const row=f.db.prepare('SELECT * FROM learning_rubric_observations WHERE id=?').get(id)!;
  const columns=Object.keys(row);const insert=f.db.prepare(`INSERT INTO learning_rubric_observations(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`);
  for(let n=0;n<200;n++){const copy={...row,id:'obs_synthetic_'+String(n).padStart(3,'0'),request_id:'page-request-'+n};insert.run(...columns.map(c=>copy[c]));}
  const page:any=await (await f.read())!.json();expect(page.observations).toHaveLength(200);expect(page.hasMore).toBe(true);
  const query='?cursor='+encodeURIComponent(page.nextCursor);const rest:any=await (await f.read(f.teacher,query))!.json();expect(rest.observations).toHaveLength(1);expect(rest.hasMore).toBe(false);
  const ids=[...page.observations,...rest.observations].map(x=>x.id);expect(new Set(ids).size).toBe(201);expect(ids).toEqual([...ids].sort().reverse());
  expect((await f.read(f.teacher,query+'&view=history'))!.status).toBe(403);expect((await f.read(f.teacher,query+'&enrollmentId=enrollment'))!.status).toBe(400);expect((await f.read(f.teacher,'?cursor=invalid'))!.status).toBe(400);
  f.db.exec("UPDATE teacher_assignments SET active=0 WHERE id='assignment'");expect((await f.read(f.teacher,query))!.status).toBe(403);
 }finally{f.db.close()}
});
