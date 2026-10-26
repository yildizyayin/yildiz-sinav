import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {matchScopedOutcome} from '../worker/lib/exam-outcome-matching';
import {matchOfficialOutcome} from '../src/lib/guidedDefinitions';
import {replaceAnswerKey} from '../worker/exam-admin-entry';

const catalog=[
 {id:'o1',subject_id:'tur',code:'T.7.1.1',title:'Fiilleri anlam özelliklerine göre ayırt eder.',official:1,verified:1},
 {id:'o2',subject_id:'tur',code:'T.7.1.2',title:'Fiilde zaman kaymasını fark eder.',official:1,verified:1},
 {id:'o3',subject_id:'tur',code:'T.7.2.1',title:'Metnin ana fikrini belirler.',official:1,verified:1},
];

it('official code first; a code contradicted by wording that names another outcome is not taken (server and form agree)',()=>{
 const cases:Array<[any,string|undefined,string]>=[
  [{officialCode:'T.7.1.1'},'o1','CODE'],
  [{officialCode:'T.7.1.1',publisherTitle:'Fiiller (yayınevi başlığı)'},'o1','CODE'],
  [{officialCode:'T.7.1.1',publisherTitle:'Fiilde zaman kaymasını fark eder.'},undefined,'AMBIGUOUS'],
  [{publisherTitle:'fiilde zaman kaymasini fark eder'},'o2','TITLE'],
  [{officialCode:'T.9.9.9',publisherTitle:'Metnin ana fikrini belirler.'},'o3','TITLE'],
 ];
 for(const [ref,id,reason] of cases){
  const server=matchScopedOutcome(ref,'tur',catalog);const client=matchOfficialOutcome(ref,'tur',catalog as any);
  expect([server.outcomeId,server.reason],JSON.stringify(ref)).toEqual([id,reason]);
  expect([client.outcomeId,client.reason],JSON.stringify(ref)).toEqual([id,reason==='MISSING'?'MISSING':reason]);
 }
 expect(matchScopedOutcome({officialCode:'T.7.1.1',publisherTitle:'Fiilde zaman kaymasını fark eder.'},'tur',catalog).suggestions.map((o:any)=>o.id)).toEqual(['o1','o2']);
 // S028: a topic-only label gets word-stem suggestions on the server; nothing is taken without a person, the form leaves it unmatched.
 expect(matchScopedOutcome({publisherTitle:'Fiiller'},'tur',catalog)).toMatchObject({reason:'AMBIGUOUS',suggestions:[expect.objectContaining({id:'o1'})]});
 expect(matchScopedOutcome({publisherTitle:'Fiiller'},'tur',catalog).outcomeId).toBeUndefined();
 expect(matchOfficialOutcome({publisherTitle:'Fiiller'},'tur',catalog as any)).toEqual({reason:'MISSING'});
 expect(matchScopedOutcome({publisherTitle:'Fiilleri anlam özelliklerine göre'},'tur',catalog)).toMatchObject({reason:'AMBIGUOUS',suggestions:[expect.objectContaining({id:'o1'})]});
});

it('saving a key stores only certain matches; conflicts stay for review and a person\'s mapping is never doubled by automatic matching',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(`migrations/${f}`,'utf8'));
 try{
  db.exec(`PRAGMA foreign_keys=OFF;INSERT OR IGNORE INTO subjects(id,code,name) VALUES('tur','TST_TUR7','Türkçe');
  INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,sponsor_mode,created_by) VALUES('ex','CENTRAL','2026-2027','D','STANDARD',7,'DRAFT','ADMIN_SPONSORED','admin');
  INSERT INTO curriculum_versions(id,academic_year,grade_level,program_version,program_code,authority,verified) VALUES('cv','2026-2027',7,'v','SCHOOL','MEB',1);
  INSERT INTO exam_subjects(exam_id,subject_id,question_count,question_start,question_end,option_count,sort_order) VALUES('ex','tur',3,1,3,5,1);
  INSERT INTO exam_booklets(exam_id,code,active) VALUES('ex','A',1);`);
  for(const o of catalog)db.prepare(`INSERT INTO outcomes(id,curriculum_version_id,subject_id,grade_level,code,title,official,active) VALUES(?,?,?,?,?,?,1,1)`).run(o.id,'cv','tur',7,o.code,o.title);
  [1,2,3].forEach(n=>db.prepare(`INSERT INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES(?,?,?,?,?)`).run('q'+n,'ex','tur',n,n));
  const wrap=(sql:string,args:any[]=[]):any=>({sql,args,bind:(...a:any[])=>wrap(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true,meta:{changes:1}};}});
  const env:any={DB:{prepare:(s:string)=>wrap(s),batch:async(st:any[])=>st.map(s=>/^\s*(SELECT|WITH)/i.test(s.sql)?{results:db.prepare(s.sql).all(...s.args)}:(db.prepare(s.sql).run(...s.args),{results:[],meta:{changes:1}}))}};
  const refs=[{officialCode:'T.7.1.1'},{officialCode:'T.7.1.1',publisherTitle:'Fiilde zaman kaymasını fark eder.'},{officialCode:'T.7.1.1'}];
  const body={entries:[{subjectId:'tur',bookletCode:'A',answers:'ABC',optionCount:5,outcomeRefsByQuestion:refs.map(r=>[r])}],outcomeMappings:[{subjectId:'tur',questionNo:3,outcomeId:'o3'}]};
  const r=await replaceAnswerKey(new Request('https://t/x',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,{id:'admin',role:'SUPER_ADMIN',institution_id:null} as any,'ex');
  expect(r.status,await r.clone().text()).toBe(200);
  const saved=db.prepare(`SELECT q.question_no n,qo.outcome_id o FROM question_outcomes qo JOIN exam_questions q ON q.id=qo.exam_question_id ORDER BY n,o`).all().map((x:any)=>`${x.n}:${x.o}`);
  expect(saved).toEqual(['1:o1','3:o3']);
  const pending=db.prepare(`SELECT q.question_no n,l.mapping_status s FROM question_publisher_outcomes qpo JOIN exam_questions q ON q.id=qpo.exam_question_id JOIN publisher_outcome_labels l ON l.id=qpo.publisher_outcome_id WHERE q.question_no=2`).all() as any[];
  expect(pending.map(x=>x.s)).toEqual(['REVIEW_REQUIRED']);
 }finally{db.close();}
});
