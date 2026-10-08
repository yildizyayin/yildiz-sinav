import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
import {cohortRubricReport} from '../worker/lib/cohort-rubric-report';
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
 ['different curriculum grade',"UPDATE curriculum_versions SET grade_level=8 WHERE id='cv'"],
 ['missing curriculum grade',"UPDATE curriculum_versions SET grade_level=NULL WHERE id='cv'"],
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

function copyObservation(f:ReturnType<typeof fixture>,id:string,patch:Record<string,any>={}){
 const original=f.db.prepare('SELECT * FROM learning_rubric_observations LIMIT 1').get()!;const copy={...original,id,request_id:'clone-request-'+id,...patch};const columns=Object.keys(copy);f.db.prepare(`INSERT INTO learning_rubric_observations(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>copy[c]));
}
const rubricCohort=(f:ReturnType<typeof fixture>,query='',actor:any={id:'manager',role:'INSTITUTION_MANAGER',institution_id:'school'},classScope?:any)=>cohortRubricReport(f.env,actor,new URL('https://test/?academicYear=2026-2027'+query),classScope);

for(const policy of ['LATEST','ALL'])it(`counts ${policy} rubric levels with equal-timestamp ties and distinct participant counts`,async()=>{
 const f=fixture();try{
  expect((await f.write())!.status).toBe(201);copyObservation(f,'zz-latest',{selections_json:JSON.stringify([{criterionId:'criterion',levelId:'guided'}])});const r=await rubricCohort(f,'&observationPolicy='+policy);expect(r.status).toBe(200);const data:any=await r.json();expect(data.coverage).toMatchObject({rowCount:2,usedObservations:policy==='LATEST'?1:2,repeatedObservations:policy==='LATEST'?1:0,excludedObservations:0});expect(data.groups).toHaveLength(1);expect(data.groups[0]).toMatchObject({observationCount:policy==='LATEST'?1:2,participatingEnrollmentCount:1,sourceKind:'TEACHER_DESIGNED'});expect(data.groups[0].levels).toMatchObject([{id:'guided',count:1,percent:policy==='LATEST'?100:50},{id:'independent',count:policy==='LATEST'?0:1,percent:policy==='LATEST'?0:50}]);expect(data.officialScore).toBeNull();expect(data.abilityScore).toBeNull();const text=JSON.stringify(data);for(const secret of ['Synthetic evidence recorded','Continue demonstrating','synthetic-request-1','teacher','student_id','evidence_note','feedback'])expect(text).not.toContain(secret);
 }finally{f.db.close()}
});

it('uses the older valid observation when a newer frozen snapshot is malformed',async()=>{
 const f=fixture();try{await f.write();copyObservation(f,'zz-invalid',{snapshot_json:'{}'});const r=await rubricCohort(f);expect(r.status).toBe(200);const data:any=await r.json();expect(data.coverage).toMatchObject({rowCount:2,usedObservations:1,excludedObservations:1,repeatedObservations:0});expect(data.groups[0].levels).toMatchObject([{count:0},{count:1}]);}finally{f.db.close()}
});

it('rejects conflicting valid definitions for the same frozen rubric even when LATEST would skip one',async()=>{
 const f=fixture();try{await f.write();const row=f.db.prepare('SELECT snapshot_json FROM learning_rubric_observations LIMIT 1').get()!;const snapshot=JSON.parse(String(row.snapshot_json));copyObservation(f,'zz-conflict',{snapshot_json:JSON.stringify({...snapshot,title:'Conflicting synthetic definition'})});for(const policy of ['LATEST','ALL']){const r=await rubricCohort(f,'&observationPolicy='+policy);expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:{code:'RUBRIC_SNAPSHOT_CONFLICT'}});}}finally{f.db.close()}
});

it('retains the original observation class in institution/history reports after an enrollment moves',async()=>{
 const f=fixture();try{
  await f.write();f.db.exec("UPDATE student_enrollments SET class_id='other' WHERE id='enrollment'");const manager:any=await (await rubricCohort(f)).json();expect(manager.groups).toMatchObject([{classId:'class',className:'7A',observationCount:1}]);
  const guide:any={id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'},scope={id:'class',seasonId:'season',academicYear:'2026-2027'};const old:any=await (await rubricCohort(f,'',guide,scope)).json();expect(old.groups).toEqual([]);
  f.db.exec("UPDATE teacher_assignments SET class_id='other' WHERE id='guidance'");const moved:any=await (await rubricCohort(f,'',guide,{...scope,id:'other'})).json();expect(moved.groups).toEqual([]);
  const history:any=await (await f.read({id:'student-user',role:'STUDENT',student_id:'student'} as any,'?view=history'))!.json();expect(history.observations).toMatchObject([{class_id:'class',enrollment_id:'enrollment'}]);expect(history.enrollments).toMatchObject([{class_name:'7B'}]);
 }finally{f.db.close()}
});

it('keeps institution distributions for departed enrollment while current guidance context is revoked',async()=>{
 const f=fixture();try{await f.write();f.db.exec("UPDATE student_enrollments SET status='LEFT'; UPDATE institution_seasons SET status='CLOSED' WHERE id='season'; UPDATE classes SET active=0 WHERE id='class'");expect((await rubricCohort(f)).status).toBe(200);expect((await (await rubricCohort(f)).json() as any).groups[0].observationCount).toBe(1);expect((await rubricCohort(f,'',{id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'},{id:'class',seasonId:'season',academicYear:'2026-2027'})).status).toBe(403);}finally{f.db.close()}
});

it('excludes withdrawn records from both institution and guidance distributions',async()=>{
 const f=fixture();try{const id=(await (await f.write())!.json() as any).id;expect((await f.withdraw(id))!.status).toBe(200);for(const response of [await rubricCohort(f),await rubricCohort(f,'',{id:'guide',role:'GUIDANCE_TEACHER',institution_id:'school'},{id:'class',seasonId:'season',academicYear:'2026-2027'})]){expect(response.status).toBe(200);expect(await response.json()).toMatchObject({groups:[],coverage:{rowCount:0,usedObservations:0}});}}finally{f.db.close()}
});

it('enforces cohort roles, institution scope and inclusive UTC date bounds',async()=>{
 const f=fixture();try{await f.write();for(const role of ['TEACHER','STUDENT','PARENT'])expect((await rubricCohort(f,'',{...f.teacher,role})).status).toBe(403);expect((await rubricCohort(f,'',{id:'admin',role:'SUPER_ADMIN'})).status).toBe(400);expect((await (await rubricCohort(f,'',{id:'foreign-manager',role:'INSTITUTION_MANAGER',institution_id:'foreign'})).json() as any).groups).toEqual([]);const exact:any=await (await rubricCohort(f,'&fromDate=2026-10-01&toDate=2026-10-01')).json();expect(exact.groups[0].observationCount).toBe(1);expect((await (await rubricCohort(f,'&fromDate=2026-10-02&toDate=2026-10-02')).json() as any).groups).toEqual([]);for(const query of ['&fromDate=2026-02-30&toDate=2026-03-01','&fromDate=2026-10-01','&observationPolicy=FIRST','&fromDate=2025-10-01&toDate=2025-10-02'])expect((await rubricCohort(f,query)).status).toBe(400);}finally{f.db.close()}
});

it('rejects one frozen rubric version carrying contradictory curriculum identities',async()=>{
 const f=fixture();try{await f.write();const row=f.db.prepare('SELECT snapshot_json FROM learning_rubric_observations LIMIT 1').get()!;const snapshot=JSON.parse(String(row.snapshot_json));copyObservation(f,'zz-context-conflict',{snapshot_json:JSON.stringify({...snapshot,curriculumVersionId:'different-curriculum'})});for(const policy of ['LATEST','ALL']){const r=await rubricCohort(f,'&observationPolicy='+policy);expect(r.status).toBe(409);expect(await r.json()).toMatchObject({error:{code:'RUBRIC_SNAPSHOT_CONFLICT'}});}}finally{f.db.close()}
});

it('rejects conflicting frozen outcome titles under both observation policies',async()=>{
 const f=fixture();try{await f.write();const row=f.db.prepare('SELECT snapshot_json FROM learning_rubric_observations LIMIT 1').get()!;const snapshot=JSON.parse(String(row.snapshot_json));copyObservation(f,'zz-title-conflict',{snapshot_json:JSON.stringify({...snapshot,outcomeTitle:'Different frozen outcome title'})});for(const policy of ['LATEST','ALL'])expect((await rubricCohort(f,'&observationPolicy='+policy)).status).toBe(409);}finally{f.db.close()}
});

function copyRubric(f:ReturnType<typeof fixture>,id:string,patch:Record<string,any>={}){
 const row=f.db.prepare("SELECT * FROM learning_rubric_versions WHERE id='rubric'").get()!;const copy={...row,id,version_label:id,...patch};const columns=Object.keys(copy);f.db.prepare(`INSERT INTO learning_rubric_versions(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>copy[c]));
}

it('keeps distinct rubric versions separate even when their criterion IDs are the same',async()=>{
 const f=fixture();try{
  expect((await f.write())!.status).toBe(201);const changed=f.criteria.map(c=>({...c,title:'Second version criterion',levels:c.levels.map(l=>({...l,label:'V2 '+l.label}))}));copyRubric(f,'rubric-v2',{title:'Synthetic second rubric',criteria_json:JSON.stringify(changed)});
  expect((await f.write({...f.body,rubricId:'rubric-v2',requestId:'version-two-request',selections:[{criterionId:'criterion',levelId:'guided'}]}))!.status).toBe(201);
  for(const policy of ['LATEST','ALL']){const r=await rubricCohort(f,'&observationPolicy='+policy);expect(r.status).toBe(200);const report:any=await r.json();expect(report.coverage).toMatchObject({usedObservations:2,repeatedObservations:0});expect(report.groups).toHaveLength(2);expect(report.groups.find((g:any)=>g.rubricId==='rubric')).toMatchObject({versionLabel:'v1',criterionTitle:'Observable action',observationCount:1,levels:[{id:'guided',count:0},{id:'independent',count:1}]});expect(report.groups.find((g:any)=>g.rubricId==='rubric-v2')).toMatchObject({versionLabel:'rubric-v2',criterionTitle:'Second version criterion',observationCount:1,levels:[{id:'guided',label:'V2 With support',count:1},{id:'independent',count:0}]});}
 }finally{f.db.close()}
});

it('accepts exactly 5000 observations and rejects 5001 without partial totals under either policy',async()=>{
 const f=fixture();try{
  await f.write();for(let n=1;n<5000;n++)copyObservation(f,'limit-'+String(n).padStart(4,'0'));
  for(const policy of ['LATEST','ALL']){const response=await rubricCohort(f,'&observationPolicy='+policy);expect(response.status).toBe(200);const report:any=await response.json();expect(report.coverage).toMatchObject({rowCount:5000,usedObservations:policy==='LATEST'?1:5000,repeatedObservations:policy==='LATEST'?4999:0});expect(report.groups[0]).toMatchObject({observationCount:policy==='LATEST'?1:5000,participatingEnrollmentCount:1});}
  copyObservation(f,'zz-overflow',{observed_at:'2026-10-02T12:00:00.000Z'});
  for(const policy of ['LATEST','ALL']){const response=await rubricCohort(f,'&observationPolicy='+policy);expect(response.status).toBe(400);const error:any=await response.json();expect(error).toMatchObject({error:{code:'REPORT_SCOPE_TOO_LARGE'}});expect(error).not.toHaveProperty('groups');}
  const narrowed=await rubricCohort(f,'&observationPolicy=ALL&fromDate=2026-10-01&toDate=2026-10-01');expect(narrowed.status).toBe(200);expect(await narrowed.json()).toMatchObject({coverage:{rowCount:5000,usedObservations:5000}});
 }finally{f.db.close()}
},20000);

it('accepts 500 criterion groups and rejects group 501 instead of returning truncated distributions',async()=>{
 const f=fixture();try{
  await f.write();const snapshot=JSON.parse(String(f.db.prepare('SELECT snapshot_json FROM learning_rubric_observations LIMIT 1').get()!.snapshot_json));
  for(let n=1;n<=500;n++){const id='group-rubric-'+n;copyRubric(f,id);copyObservation(f,'group-observation-'+n,{rubric_id:id,snapshot_json:JSON.stringify({...snapshot,rubricId:id,versionLabel:id})});if(n===499){const response=await rubricCohort(f);expect(response.status).toBe(200);const report:any=await response.json();expect(report.groups).toHaveLength(500);expect(new Set(report.groups.map((g:any)=>g.rubricId)).size).toBe(500);expect(report.coverage.usedObservations).toBe(500);}}
  const response=await rubricCohort(f);expect(response.status).toBe(400);const error:any=await response.json();expect(error).toMatchObject({error:{code:'REPORT_SCOPE_TOO_LARGE'}});expect(error).not.toHaveProperty('groups');expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{f.db.close()}
},20000);
