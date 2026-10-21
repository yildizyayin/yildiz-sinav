import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-admin-entry';
import examApi from '../worker/index';
import chunkedApi from '../worker/chunked-evaluation-entry';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';
import { duplicateStudentConflicts } from '../worker/lib/scan-duplicates';

const row = (n: number, sid: string | null, answers: Record<string, string>, status = 'RESOLVED') => ({ row_no: n, matched_student_id: sid, resolution_status: status, canonical_json: JSON.stringify({ answers_by_subject: answers }) });
describe('A028: unmatched queue',()=>{
 it('two sheets of one student for the same test clash; separate sessions (no common test) do not; cancelled rows are ignored',()=>{
  expect(duplicateStudentConflicts([row(1,'s',{MAT:'AB'}),row(2,'s',{MAT:'A_'})])).toEqual([{studentId:'s',rows:[1,2]}]);
  expect(duplicateStudentConflicts([row(1,'s',{TUR:'AB',MAT:'__'}),row(2,'s',{MAT:'AB'})])).toEqual([]);
  expect(duplicateStudentConflicts([row(1,'s',{MAT:'AB'}),row(2,'s',{MAT:'AB'},'CANCELLED')])).toEqual([]);
 });

 for (const mode of ['direct','chunked'] as const) it(`${mode}: match / guest / cancel decisions, the queue keeps pending rows, and one student is never scored twice`,async()=>{
  const db=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL(`../migrations/${f}`,import.meta.url),'utf8'));
  const prepare=(sql:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(sql,v),first:async(c?:string)=>{const r=db.prepare(sql).get(...args) as any;return c?r?.[c]:r;},all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({results:[],meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
  const env={ENVIRONMENT:'test',DB:{prepare,batch:async(st:any[])=>{db.exec('BEGIN');try{const r=[];for(const s of st)r.push(await s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}} as any;
  try{
   db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','S','S','ACTIVE');INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','A','x','x',1);INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');`);
   for(const [id,f,l,no] of [['s1','Ada','Kaya','101'],['s2','Can','Demir','102']]){db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run(id,f,l,normalizeName(`${f} ${l}`),'ACTIVE');db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run('e'+id,id,'school','season',no,8,'A','ACTIVE');}
   const cookie=(await createSession(env,'admin',new Request('https://demo.anunex.com'),false)).headers.get('Set-Cookie')!.split(';')[0];
   const request=async(path:string,method='GET',body?:any)=>{const form=body instanceof FormData;const res=await (path.startsWith('/api/exam-definitions')?definitions:mode==='chunked'&&path.endsWith('/evaluate')?chunkedApi:examApi).fetch(new Request(`https://demo.anunex.com${path}`,{method,headers:{Cookie:cookie,...(form||body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:form?body:JSON.stringify(body)})}),env);return {response:res,data:await res.json() as any};};
   const created=await request('/api/exam-definitions','POST',{ownerType:'CENTRAL',academicYear:'2026-2027',title:'Q',examType:'CUSTOM',gradeLevel:8,publisherName:'P',sessionLabel:'S',scoringRuleVersionId:'srv_anunex_standard_2627',outcomeMode:'OPTIONAL'});
   const base=`/api/exam-definitions/${created.data.id}`;
   await request(`${base}/structure`,'PUT',{booklets:['A'],subjects:[{subjectId:'sub_tyt_mat',questionCount:2,optionCount:4,wrongDivisor:4}]});
   await request(`${base}/answer-key`,'PUT',{entries:[{subjectId:'sub_tyt_mat',bookletCode:'A',answers:'AB',optionCount:4}]});
   await request(`${base}/institutions`,'PUT',{institutionIds:['school']});
   expect((await request(`${base}/status`,'PATCH',{status:'ACTIVE'})).response.status).toBe(200);
   // row1 Ada; row2 Ada again (same sheet twice); row3 unknown child; row4 a stray sheet
   const csv='student_number,name,class,booklet,answers_TYT_MAT\n101,Ada Kaya,8/A,A,AB\n101,Ada Kaya,8/A,A,A_\n,Ela Yeni,8/A,A,BB\n,Bilinmeyen,8/A,A,__';
   const form=new FormData();form.set('institutionId','school');form.set('file',new File([csv],'q.csv',{type:'text/plain'}));
   const up=await request(`/api/exams/${created.data.id}/preview-file`,'POST',form);expect(up.response.status,JSON.stringify(up.data)).toBe(200);
   const batch=`/api/scan-batches/${up.data.batchId}`;
   let view=(await request(batch)).data;
   expect(view.duplicates).toEqual([{studentId:'s1',rows:[1,2]}]);
   const r=(n:number)=>view.records.find((x:any)=>x.row_no===n);
   expect(r(1).duplicateOf).toEqual([2]);expect(['NEW_GUEST','AMBIGUOUS','INVALID']).toContain(r(3).match_status);
   // a person cannot link the unknown sheet to a student already on another sheet for the same test
   const clash=await request(`${batch}/records/${r(3).id}/resolve`,'POST',{action:'MATCH',studentId:'s1'});
   expect(clash.response.status).toBe(409);expect(clash.data.error.code).toBe('STUDENT_ALREADY_IN_BATCH');
   // decisions: row3 → a free student, row4 → cancelled; the duplicate still blocks evaluation
   expect((await request(`${batch}/records/${r(3).id}/resolve`,'POST',{action:'MATCH',studentId:'s2'})).response.status).toBe(200);
   expect((await request(`${batch}/records/${r(4).id}/resolve`,'POST',{action:'CANCEL'})).response.status).toBe(200);
   view=(await request(batch)).data;expect(view.records.length).toBe(4);
   const blocked=await request(`${batch}/evaluate`,'POST');
   expect(blocked.data.error.code,JSON.stringify(blocked.data)).toBe('DUPLICATE_STUDENT_IN_BATCH');expect(blocked.data.error.message).toContain('satır 1, 2');
   expect((await request(`${batch}/records/${r(2).id}/resolve`,'POST',{action:'CANCEL'})).response.status).toBe(200);
   let ev=await request(`${batch}/evaluate`,'POST');while(mode==='chunked'&&ev.data.done===false)ev=await request(`${batch}/evaluate`,'POST');
   expect(ev.response.status,JSON.stringify(ev.data)).toBe(200);
   const results=db.prepare(`SELECT ep.student_id s,er.net FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=? ORDER BY s`).all(created.data.id);
   expect(results).toEqual([{s:'s1',net:2},{s:'s2',net:0.75}]);
   expect((db.prepare(`SELECT count(*) c FROM audit_logs WHERE action='SCAN_RECORD_DECISION_RECORDED'`).get() as any).c).toBe(3);
  }finally{db.close();}
 },15000);
});
