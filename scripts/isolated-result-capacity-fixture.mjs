import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
const base='https://yildiz-sinav-qpool-pr-227.rtsgida.workers.dev';
const account='daae7254acbfe5218c52665daaacbd96',database='8db26532-eb50-42c9-99f3-00f097127c11';
assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID,account);
assert(/^\d+$/.test(process.env.GITHUB_RUN_ID||''));assert(/^(?:[1-9]|10)$/.test(process.env.CAPACITY_SHARD||''));
const shard=Number(process.env.CAPACITY_SHARD),key=`accept_capacity_${process.env.GITHUB_RUN_ID}_${shard}`;
const ids={exam:key+'_exam',participant:key+'_participant',institution:key+'_institution',administration:key+'_administration',snapshot:key+'_snapshot'};
const code='999990'+String(shard).padStart(2,'0'),studentNumber=String(10000+shard),fullName='Sentetik Kapasite '+shard;
async function sql(sql,params=[]){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params})});assert.equal(r.status,200);const b=await r.json();assert.equal(b.success,true);assert(b.result[0].success);return b.result[0]}
if(process.argv.includes('--cleanup')){
 for(const [table,column,id] of [['exam_result_snapshots','id',ids.snapshot],['exam_administrations','id',ids.administration],['exam_participants','id',ids.participant],['exams','id',ids.exam],['institutions','id',ids.institution]])await sql(`DELETE FROM ${table} WHERE ${column}=?`,[id]);
 await sql('DELETE FROM national_institution_directory WHERE meb_code=? AND source_url=?',[code,'https://anunex.com/synthetic-capacity-fixture']);
 console.log(JSON.stringify({status:'cleaned',scope:'only this run/shard synthetic capacity fixture',shard}));process.exit(0);
}
const cfg=await fetch(base+'/api/config');assert.equal((await cfg.json()).environment,'staging');
await sql("INSERT INTO institutions(id,name,code,status) VALUES (?,'SENTETİK KAPASİTE TESTİ - GERÇEK KURUM DEĞİL',?,'ACTIVE')",[ids.institution,code]);
await sql("INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url,status) VALUES (?,'SENTETİK KAPASİTE TESTİ - GERÇEK KURUM DEĞİL','sentetik kapasite testi','SENTETİK','SENTETİK','https://anunex.com/synthetic-capacity-fixture','ACTIVE')",[code]);
await sql("INSERT INTO exams(id,owner_type,academic_year,title,exam_type,grade_level,status,created_by) VALUES (?,'CENTRAL','2026-2027','SENTETİK KAPASİTE SINAVI','KURUM',7,'ACTIVE','usr_super')",[ids.exam]);
await sql("INSERT INTO exam_participants(id,exam_id,institution_id,name_snapshot,student_number_snapshot,participant_status) VALUES (?,?,?,?,?,'GUEST')",[ids.participant,ids.exam,ids.institution,fullName,studentNumber]);
await sql("INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,created_by) VALUES (?,?,'2026-2027','RESULT_NETWORK','DRAFT','usr_super')",[ids.administration,ids.exam]);
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifier:'super',password:'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);console.log('::add-mask::'+cookie);
const issued=await fetch(base+'/api/admin/result-network/access',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({administrationId:ids.administration,participantId:ids.participant,mebCode:code,studentNumber,gradeLevel:7,fullName})});assert.equal(issued.status,201);const access=await issued.json();assert(access.ok);assert(access.accessCode);console.log('::add-mask::'+access.accessCode);
const payload={schemaVersion:1,exam:{exam_id:ids.exam,title:'SENTETİK KAPASİTE SINAVI',exam_type:'KURUM',academic_year:'2026-2027',exam_date:'2026-10-08',net:7.5},subjects:[],outcomes:[]};
await sql('INSERT INTO exam_result_snapshots(id,exam_id,participant_id,snapshot_version,institution_id,net,payload_json) VALUES (?,?,?,1,?,7.5,?)',[ids.snapshot,ids.exam,ids.participant,ids.institution,JSON.stringify(payload)]);
await sql("UPDATE exam_administrations SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP,published_snapshot_version=1,participant_count=1,institution_count=1 WHERE id=?",[ids.administration]);
assert(process.env.GITHUB_ENV);
for(const [name,value] of Object.entries({RESULT_LOAD_INSTITUTION_CODE:code,RESULT_LOAD_GRADE_LEVEL:'7',RESULT_LOAD_FULL_NAME:fullName,RESULT_LOAD_LOOKUP_TYPE:'STUDENT_NUMBER',RESULT_LOAD_LOOKUP_VALUE:studentNumber,RESULT_LOAD_ACCESS_CODE:access.accessCode,RESULT_EXPECTED_EXAM_ID:ids.exam}))appendFileSync(process.env.GITHUB_ENV,`${name}=${value}\n`);
console.log(JSON.stringify({status:'prepared',shard,scope:'one synthetic published identity; actual API-issued HMAC access code; no real student data'}));
