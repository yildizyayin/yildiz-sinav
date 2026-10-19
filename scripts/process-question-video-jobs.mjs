import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
// Explicit target allowlist; never infer a production database from a user-provided URL.
const target=process.env.QUESTION_VIDEO_TARGET||'staging';
if(!['staging','production'].includes(target))throw Error('Invalid video target');
if(target==='production'&&process.env.QUESTION_VIDEO_FIXTURE==='true')throw Error('Synthetic production video forbidden');
const base=target==='production'?'https://app.anunex.com':'https://demo.anunex.com',workerName=target==='production'?'yildiz-sinav-prod':'yildiz-sinav-v1',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const digest=b=>createHash('sha256').update(b).digest('hex');let dbid;
async function cf(path,body){const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const p=await r.json();if(!r.ok||!p.success)throw Error(`CF request failed ${r.status}`);return p.result;}
async function query(sql,params=[]){if(!dbid){const v=await cf(`/workers/scripts/${workerName}/versions`),id=v.items?.[0]?.id||v[0]?.id,d=await cf(`/workers/scripts/${workerName}/versions/`+id);const b=d.resources.bindings.find(x=>x.name==='DB'&&x.type==='d1');if(!b)throw Error('Target DB binding not found');dbid=b.id||b.database_id;}return (await cf(`/d1/database/${dbid}/query`,{sql,params}))[0];}
const health=await fetch(base+'/api/health').then(r=>r.json());if(health.environment!==target)throw Error('Video environment boundary failed');
await mkdir('tmp/question-video-render',{recursive:true});await mkdir('tmp/question-video-proof',{recursive:true});
if(process.env.QUESTION_VIDEO_FIXTURE==='true'){
 const id='qvj_synthetic_technical_20261014',requestKey='2fbdab79-bb3e-4a73-8272-2c08ec37f430';
 const plan={version:1,width:1280,height:720,language:'tr-TR',sourceQuestionId:'SYNTHETIC_TECHNICAL',sourceRevision:0,synthetic:true,scenes:[{title:'Sentetik teknik test',text:'Bu video yalnızca render hattını doğrular.\nÖğrenci sorusu veya insan onaylı içerik değildir.',spokenText:'Bu video yalnızca render hattını doğrular.'},{title:'Örnek işlem',text:'2 + 3 = 5\nGörüntü, Türkçe yazı ve MP4 oynatma kontrolü.',spokenText:'İki artı üç eşittir beş.'}],narrationText:''};
 const snapshot=JSON.stringify({sourceKind:'SYNTHETIC_TECHNICAL',purpose:'No human approval or student exposure'});
 await query(`INSERT OR IGNORE INTO question_media_jobs(id,request_key,question_id,source_revision,source_snapshot_json,source_sha256,plan_json,synthetic,narration_mode,status,created_by) SELECT ?,?,NULL,0,?,?,?,1,'CAPTIONS','READY_TO_RENDER',id FROM users WHERE role='SUPER_ADMIN' AND active=1 ORDER BY id LIMIT 1`,[id,requestKey,snapshot,digest(snapshot),JSON.stringify(plan)]);
}
const control=(await query('SELECT paused FROM question_team_control WHERE id=1')).results[0];
const paused=(await query("SELECT count(*) total,COALESCE(sum(paused),0) n FROM question_team_agent_control WHERE agent_key IN ('MEDIA','VIDEO')")).results[0];
if(!control||control.paused||paused.total!==2||paused.n){console.log('VIDEO_RENDER_PAUSED');process.exit(0);}
const now=new Date().toISOString();
// A crashed lease may be reclaimed, but never an active lease or approved output.
const jobs=(await query("SELECT id FROM question_media_jobs WHERE (?='staging' OR synthetic=0) AND attempt_count<3 AND (status='READY_TO_RENDER' OR (status='RENDERING' AND lease_until<?)) ORDER BY created_at,id LIMIT 1",[target,now])).results;
if(!jobs.length){console.log('VIDEO_RENDER_IDLE');process.exit(0);}
const id=jobs[0].id,lease=randomBytes(32).toString('hex'),hash=digest(lease),until=new Date(Date.now()+600000).toISOString();console.log('::add-mask::'+lease);
const claim=await query(`UPDATE question_media_jobs SET status='RENDERING',lease_hash=?,lease_until=?,attempt_count=attempt_count+1,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND attempt_count<3 AND (status='READY_TO_RENDER' OR (status='RENDERING' AND lease_until<?)) AND EXISTS(SELECT 1 FROM question_team_control WHERE id=1 AND paused=0) AND NOT EXISTS(SELECT 1 FROM question_team_agent_control WHERE agent_key IN ('MEDIA','VIDEO') AND paused=1)`,[hash,until,id,now]);
if(!claim.meta?.changes){console.log('VIDEO_RENDER_CLAIM_LOST');process.exit(0);}
const headers={Authorization:`Bearer ${lease}`};
try{
 const input=await fetch(`${base}/api/question-bank-standard/media-jobs/${encodeURIComponent(id)}/render/input`,{headers});if(!input.ok)throw Error(`VIDEO_SOURCE_OR_LEASE_INVALID ${input.status}`);const data=await input.json();
 await writeFile('tmp/question-video-render/plan.json',JSON.stringify(data.plan));
 const args=['scripts/render-question-video.py','tmp/question-video-render/plan.json','tmp/question-video-render/solution.mp4'];
 if(data.audioUrl){
  if(!data.audioUrl.startsWith('/api/question-bank-standard/media-jobs/'+id+'/render/audio'))throw Error('Unexpected audio path');
  const r=await fetch(base+data.audioUrl,{headers});if(!r.ok)throw Error('Narration unavailable');const bytes=Buffer.from(await r.arrayBuffer());
  if(bytes.length!==data.narrationBytes||digest(bytes)!==data.narrationSha256)throw Error('Narration integrity failed');await writeFile('tmp/question-video-render/narration.audio',bytes);args.push('--audio','tmp/question-video-render/narration.audio');
 }
 const render=spawnSync('python3',args,{encoding:'utf8',timeout:360000});if(render.status!==0)throw Error('VIDEO_RENDER_FAILED');
 const meta=JSON.parse(await readFile('tmp/question-video-render/solution.mp4.json','utf8')),bytes=await readFile('tmp/question-video-render/solution.mp4');
 const output=await fetch(`${base}/api/question-bank-standard/media-jobs/${encodeURIComponent(id)}/render/output`,{method:'POST',headers:{...headers,'content-type':'video/mp4','x-video-duration':String(meta.durationSeconds),'x-video-has-audio':String(meta.hasAudio)},body:bytes});
 if(!output.ok)throw Error(`VIDEO_UPLOAD_FAILED ${output.status}`);const result=await output.json();
 const proof={jobId:id,sourceQuestionId:data.plan.sourceQuestionId,synthetic:data.plan.synthetic,...meta,sha256:digest(bytes),status:result.job.status,published:false};await writeFile('tmp/question-video-proof/evidence.json',JSON.stringify(proof,null,2));if(data.plan.synthetic){await copyFile('tmp/question-video-render/solution.mp4','tmp/question-video-proof/synthetic-test.mp4');await copyFile('tmp/question-video-render/plan.json','tmp/question-video-proof/synthetic-plan.json');}console.log('VIDEO_RENDER_EVIDENCE '+JSON.stringify(proof));
}catch(e){await query("UPDATE question_media_jobs SET status='FAILED',lease_hash=NULL,lease_until=NULL,error_code='VIDEO_RENDER_FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RENDERING' AND lease_hash=?",[id,hash]);throw Error(String(e).replaceAll(lease,'[redacted]'));}
