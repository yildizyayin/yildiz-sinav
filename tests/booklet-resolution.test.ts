import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-admin-entry';
import examApi from '../worker/index';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';
import { compareBooklets } from '../worker/lib/booklet-review';

describe('A027: missing or wrong booklet',()=>{
 it('compares booklets the way evaluation reads them, also when a test starts at question 41',()=>{
  const subjects=[{subject_id:'mat',code:'MAT',question_count:3,wrong_divisor:4}];
  const keys=[41,42,43].flatMap((n,i)=>[{subject_id:'mat',booklet_code:'A',question_no:n,printed_question_no:n,correct_answer:'ABC'[i]},{subject_id:'mat',booklet_code:'B',question_no:n,printed_question_no:[43,41,42][i],correct_answer:'ABC'[i]}]);
  const record:any={answers_by_subject:{MAT:'ABC'}};
  const [a,b]=compareBooklets(record,['A','B'],subjects,keys);
  expect(a).toMatchObject({code:'A',available:true,correct:3,net:3});
  // B prints q41,q42,q43 as 43,41,42, so the B sheet reads q42 (B), q43 (C), q41 (A)
  expect(b).toMatchObject({code:'B',available:true,correct:0,wrong:3});
  expect(compareBooklets(record,['A'],subjects,keys,()=>0)[0]).toMatchObject({net:3});
 });

 it('shows each booklet\'s result for a sheet without a booklet, stores the choice and audits what was seen',async()=>{
  const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const prepare=(sql:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(sql,v),first:async(c?:string)=>{const r=db.prepare(sql).get(...args) as any;return c?r?.[c]:r;},all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({results:[],meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
  const env={ENVIRONMENT:'test',DB:{prepare,batch:async(st:any[])=>{db.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
  try{
   db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','S','S','ACTIVE');INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','A','x','x',1);INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');`);
   db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run('s1','Ada','Test',normalizeName('Ada Test'),'ACTIVE');
   db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run('e1','s1','school','season','101',8,'A','ACTIVE');
   const cookie=(await createSession(env,'admin',new Request('https://demo.anunex.com'),false)).headers.get('Set-Cookie')!.split(';')[0];
   const request=async(path:string,method='GET',body?:any)=>{const form=body instanceof FormData;const res=await (path.startsWith('/api/exam-definitions')?definitions:examApi).fetch(new Request(`https://demo.anunex.com${path}`,{method,headers:{Cookie:cookie,...(form||body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:form?body:JSON.stringify(body)})}),env);return {response:res,data:await res.json() as any};};
   const created=await request('/api/exam-definitions','POST',{ownerType:'CENTRAL',academicYear:'2026-2027',title:'K',examType:'CUSTOM',gradeLevel:8,publisherName:'P',sessionLabel:'S',scoringRuleVersionId:'srv_anunex_standard_2627',outcomeMode:'OPTIONAL'});
   const base=`/api/exam-definitions/${created.data.id}`;
   expect((await request(`${base}/structure`,'PUT',{booklets:['A','B'],subjects:[{subjectId:'sub_tyt_mat',questionCount:4,questionStart:41,questionEnd:44,optionCount:4,wrongDivisor:4}]})).response.status).toBe(200);
   const put=await request(`${base}/answer-key`,'PUT',{entries:[{subjectId:'sub_tyt_mat',bookletCode:'A',answers:'ABCD',optionCount:4,bookletQuestionNumbers:[41,42,43,44]},{subjectId:'sub_tyt_mat',bookletCode:'B',answers:'ABCD',optionCount:4,bookletQuestionNumbers:[44,43,42,41]}]});
   expect(put.response.status,JSON.stringify(put.data)).toBe(200);
   expect((await request(`${base}/institutions`,'PUT',{institutionIds:['school']})).response.status).toBe(200);
   expect((await request(`${base}/status`,'PATCH',{status:'ACTIVE'})).response.status).toBe(200);
   const form=new FormData();form.set('institutionId','school');form.set('file',new File(['student_number,name,class,booklet,answers_TYT_MAT\n101,Ada Test,8/A,,DCBA'],'b.csv',{type:'text/plain'}));
   const up=await request(`/api/exams/${created.data.id}/preview-file`,'POST',form);expect(up.response.status,JSON.stringify(up.data)).toBe(200);
   const batch=`/api/scan-batches/${up.data.batchId}`;
   const row=(await request(batch)).data.records[0];
   expect(row.bookletOptions.map((o:any)=>[o.code,o.available,o.correct,o.wrong,o.net])).toEqual([['A',true,0,4,-1],['B',true,4,0,4]]);
   expect((await request(`${batch}/records/${row.id}/resolve`,'POST',{action:'BOOKLET',bookletCode:'C'})).response.status).toBe(400);
   expect((await request(`${batch}/records/${row.id}/resolve`,'POST',{action:'BOOKLET',bookletCode:'B'})).response.status).toBe(200);
   const after=(await request(batch)).data.records[0];expect(after.canonical.booklet).toBe('B');
   const audit=JSON.parse((db.prepare(`SELECT details_json d FROM audit_logs WHERE action='SCAN_RECORD_DECISION_RECORDED' ORDER BY rowid DESC LIMIT 1`).get() as any).d);
   expect(audit.booklet).toEqual({from:null,to:'B',options:[{code:'A',available:true,net:-1,correct:0,wrong:4},{code:'B',available:true,net:4,correct:4,wrong:0}]});
  }finally{db.close();}
 },15000);
});
