import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base='https://demo.anunex.com',api='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID;
const report={environment:'staging',model:'@cf/zai-org/glm-4.7-flash',providerCalls:0,generatedQuestions:0};
async function cf(path,body){const r=await fetch(api+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error('Cloudflare audit failed HTTP '+r.status+' codes '+(p.errors||[]).map(e=>e.code).join(','));return p.result;}
async function req(path,cookie,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json().catch(()=>({}));if(!r.ok)throw Error('Staging API '+path+' HTTP '+r.status+' '+(p.error?.code||''));return {r,p};}
try{
 const {r,p}=await req('/api/auth/login',null,{identifier:'super',password:process.env.SMOKE_DEMO_PASSWORD||'Demo123!',turnstileToken:'XXXX.DUMMY.TOKEN.XXXX',remember:false});if(!p.ok)throw Error('Staging admin unavailable');
 const cookie=(r.headers.get('set-cookie')||'').match(/(yildiz_session=[^;]+)/)?.[1];if(!cookie)throw Error('Staging session missing');
 if(process.env.QUESTION_PILOT_IMPORT_OFFICIAL==='true'){
 const spec=JSON.parse(await readFile('data/question-pilot-math5-curriculum.json','utf8'));
 const versions=(await req('/api/curriculum-admin?academicYear='+spec.academicYear,cookie)).p;
 let version=(versions.versions||[]).find(v=>v.program_version===spec.programVersion);
 if(!version){
 const sourceResponse=await fetch(spec.sourceUrl);if(!sourceResponse.ok)throw Error('Official MEB source unavailable');const source=(await sourceResponse.text()).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');for(const o of spec.outcomes){if(!source.includes(o.code)||!source.includes(o.title))throw Error('Official source text mismatch: '+o.code);}
 const options=(await req('/api/curriculum-admin/options',cookie)).p;const subject=options.subjects.find(x=>x.code==='MAT');if(!subject)throw Error('Canonical math subject not found');
 const cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const csv=[['subject_code','grade_level','outcome_code','title','topic','unit','node_type'],...spec.outcomes.map(o=>[subject.code,spec.gradeLevel,o.code,o.title,o.topic,'Sayılar ve Nicelikler (1)','OUTCOME'])].map(row=>row.map(cell).join(';')).join('\n');
 const form=new FormData();form.set('file',new Blob([csv],{type:'text/csv'}),'meb-mat5-pilot.csv');for(const key of ['academicYear','gradeLevel','programCode','programVersion','authority','sourceUrl','sourceTitle'])form.set(key,String(spec[key]));
 const response=await fetch(base+'/api/curriculum-admin/import-preview',{method:'POST',headers:{Origin:base,Cookie:cookie},body:form});const preview=await response.json();if(!response.ok||preview.invalidCount!==0||preview.rowCount!==2)throw Error('Official curriculum preview failed '+JSON.stringify(preview.error||preview));
 const committed=(await req('/api/curriculum-admin/imports/'+preview.jobId+'/commit',cookie,{confirmedOfficial:true})).p;report.officialImport={versionId:committed.versionId,outcomeCount:committed.outcomeCount,scope:spec.scope};
 }else report.officialImport={reused:true,versionId:version.id,scope:spec.scope};
 }
 report.readiness=(await req('/api/question-bank-standard/agent-pilot/readiness',cookie)).p;
 const versions=await cf('/workers/scripts/yildiz-sinav-v1/versions');const version=versions.items?.[0]?.id||versions[0]?.id;if(!version)throw Error('Staging worker version unavailable');const detail=await cf('/workers/scripts/yildiz-sinav-v1/versions/'+version);
 const db=detail.resources.bindings.find(b=>b.name==='DB'&&b.type==='d1');if(!db)throw Error('Staging D1 unavailable');
 const query=async sql=>(await cf('/d1/database/'+(db.id||db.database_id)+'/query',{sql}))[0].results;
 report.curriculum=await query("SELECT cv.id,cv.academic_year,cv.grade_level,cv.program_version,cv.authority,cv.program_code,cv.verified,cv.source_url,COUNT(o.id) outcome_count,SUM(CASE WHEN o.official=1 AND o.active=1 THEN 1 ELSE 0 END) official_active FROM curriculum_versions cv LEFT JOIN outcomes o ON o.curriculum_version_id=cv.id WHERE cv.grade_level IN (5,6,7,9,10,11) GROUP BY cv.id ORDER BY cv.academic_year DESC,cv.grade_level LIMIT 100");
 report.candidates=await query("SELECT o.id,o.code,o.title,o.grade_level,o.subject_id,cv.id curriculum_version_id,cv.academic_year,cv.program_version,cv.authority,cv.source_url FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE cv.verified=1 AND o.official=1 AND o.active=1 AND cv.academic_year='2026-2027' AND o.grade_level=cv.grade_level AND o.grade_level IN (5,6,7,9,10,11) AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.academic_year=cv.academic_year AND n.grade_level=o.grade_level AND n.subject_id=o.subject_id) ORDER BY o.grade_level,o.subject_id,o.code LIMIT 100");
 report.jobs=await query("SELECT status,COUNT(*) jobs,SUM(question_count) requested,SUM(generated_count) generated FROM question_generation_jobs GROUP BY status");
 report.budget=await query("SELECT question_cap,reserved_count FROM question_agent_pilot_budget WHERE id='pilot_50'");
 report.status='AUDITED';console.log(JSON.stringify(report,null,2));
}catch(e){report.status='BLOCKED';report.error=e.message;console.log(JSON.stringify(report,null,2));process.exitCode=1;}
await mkdir('tmp/question-pilot',{recursive:true});await writeFile('tmp/question-pilot/audit.json',JSON.stringify(report,null,2));
