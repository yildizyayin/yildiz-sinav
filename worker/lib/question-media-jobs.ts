import {autonomousYear} from './question-autonomous-queue';
import {editorialIssues,visualBlock} from './question-editorial';
import type {AuthUser,Env} from '../types';
import {all,one,json,uuid,forbidden,badRequest,notFound} from './db';
import {buildQuestionVideoPlan} from './question-video-plan';
import {mediaSourceFence,mediaSourceValid,questionTeamPaused,sha256} from './question-team-policy';
import {speakNibiru,voiceProviderStatus} from './nibiru-voice';
const base='/api/question-bank-standard/media-jobs';
const fail=(status:number,code:string,message:string)=>json({ok:false,error:{code,message}},status);
const find=(env:Env,id:string)=>one<any>(env.DB.prepare('SELECT * FROM question_media_jobs WHERE id=?').bind(id));
const dto=(j:any)=>({id:j.id,questionId:j.question_id,sourceRevision:j.source_revision,synthetic:!!j.synthetic,narrationMode:j.narration_mode,instructionNote:j.instruction_note,status:j.status,attemptCount:j.attempt_count,errorCode:j.error_code,createdAt:j.created_at,updatedAt:j.updated_at,hasAudio:!!j.has_audio,durationSeconds:j.duration_seconds,outputSha256:j.output_sha256,outputBytes:j.output_bytes,attachedAssetId:j.attached_asset_id,previewUrl:j.output_key?`${base}/${encodeURIComponent(j.id)}/file`:null});
const controlFence=(env:Env)=>env.QUESTION_TEAM_CONTROLS_ENABLED==='true'?" AND EXISTS(SELECT 1 FROM question_team_control WHERE id=1 AND paused=0) AND 2=(SELECT count(*) FROM question_team_agent_control WHERE agent_key IN ('MEDIA','VIDEO')) AND NOT EXISTS(SELECT 1 FROM question_team_agent_control WHERE paused=1 AND agent_key IN ('MEDIA','VIDEO'))":'';
async function tokenJob(request:Request,env:Env,id:string){
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token||env.QUESTION_VIDEO_RENDER_ENABLED!=='true')return null;
 const hash=await sha256(token);
 return one<any>(env.DB.prepare(`SELECT j.* FROM question_media_jobs j WHERE j.id=? AND j.status='RENDERING' AND j.lease_hash=? AND j.lease_until>? AND ${mediaSourceFence('j',env.ENVIRONMENT==='staging')}${controlFence(env)}`).bind(id,hash,new Date().toISOString()));
}
async function renderRoute(request:Request,env:Env,id:string,action:string){
 const j=await tokenJob(request,env,id);if(!j)return fail(403,'RENDER_LEASE_INVALID','Render yetkisi geçersiz, duraklatılmış veya kaynak değişmiş.');
 if(action==='input'&&request.method==='GET')return json({ok:true,id:j.id,plan:JSON.parse(j.plan_json),narrationMode:j.narration_mode,narrationSha256:j.narration_sha256,narrationBytes:j.narration_bytes,audioUrl:j.narration_key?`${base}/${j.id}/render/audio`:null});
 if(action==='audio'&&request.method==='GET'){
  if(!j.narration_key)return notFound('Ses kaydı yok.');const obj=await env.FILES.get(j.narration_key);if(!obj||obj.size!==j.narration_bytes)return fail(409,'NARRATION_MISSING','Ses dosyası doğrulanamadı.');
  return new Response(obj.body,{headers:{'content-type':j.narration_mime,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 if(action==='output'&&request.method==='POST'){
  if(request.headers.get('content-type')!=='video/mp4'||Number(request.headers.get('content-length')||0)>30*1024*1024)return badRequest('En fazla30 MB MP4 gönderin.','INVALID_RENDER_OUTPUT');
  const duration=Number(request.headers.get('x-video-duration')),hasAudio=request.headers.get('x-video-has-audio')==='true';
  if(!Number.isFinite(duration)||duration<=0||duration>600||j.narration_mode==='NARRATED'&&!hasAudio)return badRequest('Süre veya ses bilgisi geçersiz.','INVALID_RENDER_OUTPUT');
  const bytes=await request.arrayBuffer();if(bytes.byteLength<16||bytes.byteLength>30*1024*1024||new TextDecoder().decode(bytes.slice(4,8))!=='ftyp')return badRequest('Geçersiz MP4 dosyası.','INVALID_RENDER_OUTPUT');
  const hash=await sha256(bytes),key=`question-media/immutable/${hash.slice(0,2)}/${hash}`;
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:'video/mp4',cacheControl:'private, no-store'},customMetadata:{sha256:hash,questionMediaJob:j.id,synthetic:String(!!j.synthetic)}});
  const head=await env.FILES.head(key);if(!head||head.size!==bytes.byteLength||head.customMetadata?.sha256!==hash)return fail(503,'VIDEO_STORAGE_UNVERIFIED','Video depolaması doğrulanamadı.');
  const r=await env.DB.prepare(`UPDATE question_media_jobs AS j SET status='REVIEW',output_key=?,output_sha256=?,output_bytes=?,duration_seconds=?,has_audio=?,lease_hash=NULL,lease_until=NULL,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='RENDERING' AND lease_hash=? AND lease_until>? AND ${mediaSourceFence('j',env.ENVIRONMENT==='staging')}${controlFence(env)}`).bind(key,hash,bytes.byteLength,duration,hasAudio?1:0,j.id,j.lease_hash,new Date().toISOString()).run();
  if(Number(r.meta?.changes||0)<1)return fail(409,'RENDER_SOURCE_CHANGED','Render sırasında kaynak veya görev değişti; video yayımlanmadı.');
  return json({ok:true,job:dto(await find(env,j.id)),humanReviewRequired:true,published:false});
 }
 return fail(405,'METHOD_NOT_ALLOWED','Geçersiz render işlemi.');
}
async function create(request:Request,env:Env,user:AuthUser){
 const b:any=await request.json().catch(()=>null);
 if(!b||typeof b.questionId!=='string'||b.questionId.length>100||!Number.isInteger(b.expectedRevision)||!/^[a-f0-9-]{36}$/i.test(b.requestKey??'')||!['CAPTIONS','NARRATED'].includes(b.narrationMode)||typeof(b.instructionNote??'')!=='string'||(b.instructionNote??'').length>1000)return badRequest('Soru, sürüm, işlem anahtarı ve video türü gereklidir.','INVALID_MEDIA_REQUEST');
 const prior=await one<any>(env.DB.prepare('SELECT * FROM question_media_jobs WHERE request_key=?').bind(b.requestKey));
 if(prior)return prior.question_id===b.questionId&&prior.source_revision===b.expectedRevision&&prior.narration_mode===b.narrationMode&&prior.instruction_note===(b.instructionNote??'')?json({ok:true,job:dto(prior),reused:true}):fail(409,'REQUEST_KEY_CONFLICT','Anahtar farklı bir video işi için kullanılmış.');
 const q=await one<any>(env.DB.prepare('SELECT * FROM question_bank WHERE id=?').bind(b.questionId));if(!q)return notFound('Soru bulunamadı.');
 if(q.review_revision!==b.expectedRevision)return fail(409,'QUESTION_REVIEW_CHANGED','Güncel soru sürümünü açın.');
 const refs=await all<any>(env.DB.prepare(`SELECT o.id,o.code,o.title,o.active,o.grade_level,o.subject_id,cv.id curriculumVersionId,cv.program_version programVersion,cv.verified,cv.grade_level cvGrade,cv.academic_year academicYear FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id WHERE l.question_id=? ORDER BY o.id LIMIT 2`).bind(q.id));
 let error:string|null=null;
 if(q.review_status!=='APPROVED'||!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(q.copyright_status))error='HUMAN_AND_RIGHTS_APPROVAL_REQUIRED';
 const outcome=refs[0]??null;if(refs.length!==1||!outcome?.verified||!outcome?.active||outcome.grade_level!==q.grade_level||outcome.cvGrade!==q.grade_level||outcome.subject_id!==q.subject_id||outcome.academicYear!==q.academic_year)error??='VERIFIED_CURRICULUM_REQUIRED';
 const packet=await one<any>(env.DB.prepare("SELECT (SELECT count(*) FROM question_assets WHERE question_id=? AND NOT(asset_type='SOLUTION_VIDEO' AND placement='SOLUTION'))+(SELECT count(*) FROM question_content_blocks WHERE question_id=?) n").bind(q.id,q.id));
 let visual:any=undefined;
 if(q.question_type!=='MULTIPLE_CHOICE')error??='RICH_VIDEO_PACKET_NOT_SUPPORTED';
 if(q.content_mode!=='TEXT'||Number(packet?.n)>0){
  try{
   const editorial=JSON.parse(q.editorial_packet_json||'null');
   if(editorialIssues({editorial,options:JSON.parse(q.options_json),correctAnswer:q.correct_answer}).length)throw Error('INVALID_EDITORIAL_VISUAL');
   const expected=visualBlock(editorial);if(!expected)throw Error('VISUAL_REQUIRED');
   const blocks=await all<any>(env.DB.prepare('SELECT placement,block_type,payload_json FROM question_content_blocks WHERE question_id=?').bind(q.id));
   const assets=await one<any>(env.DB.prepare("SELECT count(*) n FROM question_assets WHERE question_id=? AND NOT(asset_type='SOLUTION_VIDEO' AND placement='SOLUTION')").bind(q.id));
   if(Number(assets?.n)>0||blocks.length!==1||blocks[0].placement!=='STEM'||blocks[0].block_type!==expected.blockType||JSON.stringify(JSON.parse(blocks[0].payload_json))!==JSON.stringify(expected.payload))throw Error('VISUAL_MISMATCH');
   const {schemaVersion,...data}=expected.payload;visual=data;
  }catch{error??='RICH_VIDEO_PACKET_NOT_SUPPORTED'}
 }
 let plan:any=null;try{plan=buildQuestionVideoPlan(q,false,visual)}catch{error??='VIDEO_PLAN_INVALID'}
 if(env.QUESTION_VIDEO_RENDER_ENABLED!=='true')error??='RENDERER_NOT_ENABLED';
 if(b.narrationMode==='NARRATED'&&!voiceProviderStatus(env).standardConfigured)error??='NARRATION_PROVIDER_NOT_ENABLED';
 if(b.narrationMode==='NARRATED'&&(plan?.narrationText.length??0)>3600)error??='NARRATION_TOO_LONG';
 const snapshot={sourceKind:'QUESTION_BANK',question:{id:q.id,reviewRevision:q.review_revision,stemText:q.stem_text,optionsJson:q.options_json,correctAnswer:q.correct_answer,solutionText:q.solution_text,editorialPacketJson:q.editorial_packet_json??null},outcome};
 const source=JSON.stringify(snapshot),id=uuid('qvj');
 await env.DB.prepare(`INSERT INTO question_media_jobs(id,request_key,question_id,source_revision,source_snapshot_json,source_sha256,plan_json,narration_mode,instruction_note,status,error_code,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,b.requestKey,q.id,q.review_revision,source,await sha256(source),JSON.stringify(plan),b.narrationMode,b.instructionNote??'',error?'BLOCKED':'QUEUED',error,user.id).run();
 return json({ok:true,job:dto(await find(env,id)),reused:false},201);
}
async function prepare(env:Env,user:AuthUser,j:any){
 if(env.QUESTION_VIDEO_RENDER_ENABLED!=='true')return fail(503,'RENDERER_NOT_ENABLED','Video işleyicisi etkin değil.');
 if(await questionTeamPaused(env,['MEDIA','VIDEO']))return fail(409,'QUESTION_TEAM_PAUSED','Medya/video ekibi duraklatıldı.');
 if(['READY_TO_RENDER','RENDERING','REVIEW','APPROVED'].includes(j.status))return json({ok:true,job:dto(j),reused:true});
 if(j.status==='CANCELLED'||j.attempt_count>=3)return fail(409,'MEDIA_JOB_EXHAUSTED','İş iptal edilmiş veya deneme sınırına ulaşmış.');
 if(!await mediaSourceValid(env,j.id))return fail(409,'MEDIA_SOURCE_CHANGED','Onaylı kaynak sürümü veya kazanım eşleşmiyor. Yeni kaynak için yeni iş oluşturun.');
 const plan=JSON.parse(j.plan_json);if(!plan||!Array.isArray(plan.scenes))return fail(409,'VIDEO_PLAN_INVALID','Geçerli sahne planı yok.');
 if(j.narration_mode==='NARRATED'&&!voiceProviderStatus(env).standardConfigured)return fail(503,'NARRATION_PROVIDER_NOT_ENABLED','Mevcut ses sağlayıcısı politikası seslendirmeye izin vermiyor.');
 const token=uuid('prepare'),until=new Date(Date.now()+180000).toISOString();
 const claim=await env.DB.prepare(`UPDATE question_media_jobs AS j SET status='PREPARING',lease_hash=?,lease_until=?,attempt_count=attempt_count+1,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND attempt_count<3 AND (status IN ('QUEUED','BLOCKED','FAILED') OR (status='PREPARING' AND lease_until<?)) AND ${mediaSourceFence('j',env.ENVIRONMENT==='staging')}${controlFence(env)}`).bind(token,until,j.id,new Date().toISOString()).run();
 if(Number(claim.meta?.changes||0)<1)return fail(409,'MEDIA_JOB_ACTIVE','İş başka bir yürütücüde veya duraklatıldı.');
 try{
  let audio:{key:string;hash:string;mime:string;size:number;provider:string}|null=null;
  if(j.narration_mode==='NARRATED'){
   const result=await speakNibiru(env,plan.narrationText,'STANDARD'),bytes=result.audio.bytes;
   if(bytes.byteLength>8*1024*1024)throw Error('NARRATION_TOO_LARGE');
   const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);const hash=await sha256(copy.buffer),key=`question-media/immutable/${hash.slice(0,2)}/${hash}`;
   await env.FILES.put(key,copy,{httpMetadata:{contentType:result.audio.contentType,cacheControl:'private, no-store'},customMetadata:{sha256:hash,questionMediaJob:j.id}});
   audio={key,hash,mime:result.audio.contentType,size:bytes.byteLength,provider:result.audio.provider};
  }
  const r=await env.DB.prepare(`UPDATE question_media_jobs AS j SET status='READY_TO_RENDER',narration_key=?,narration_sha256=?,narration_mime=?,narration_bytes=?,narration_provider=?,lease_hash=NULL,lease_until=NULL,error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PREPARING' AND lease_hash=? AND lease_until>? AND ${mediaSourceFence('j',env.ENVIRONMENT==='staging')}${controlFence(env)}`).bind(audio?.key??null,audio?.hash??null,audio?.mime??null,audio?.size??null,audio?.provider??null,j.id,token,new Date().toISOString()).run();
  if(Number(r.meta?.changes||0)<1)throw Error('MEDIA_SOURCE_CHANGED');
 }catch(e){await env.DB.prepare("UPDATE question_media_jobs SET status='FAILED',lease_hash=NULL,lease_until=NULL,error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='PREPARING' AND lease_hash=?").bind(String(e).includes('SOURCE_CHANGED')?'MEDIA_SOURCE_CHANGED':'MEDIA_PREPARATION_FAILED',j.id,token).run();return fail(422,'MEDIA_PREPARATION_FAILED','Ses/medya hazırlığı tamamlanamadı. Kaynak ve sağlayıcı durumunu kontrol edin.');}
 await env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'QUESTION_VIDEO_PREPARED','question_media_job',?,?)").bind(uuid('aud'),user.id,j.id,JSON.stringify({sourceRevision:j.source_revision,narrationMode:j.narration_mode,humanApproved:false})).run();
 return json({ok:true,job:dto(await find(env,j.id)),humanReviewRequired:true});
}
async function approve(request:Request,env:Env,user:AuthUser,j:any){
 const b:any=await request.json().catch(()=>null);
 if(!b||b.expectedSourceRevision!==j.source_revision||b.expectedOutputHash!==j.output_sha256||!['OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED'].includes(b.rightsStatus)||!b.checks||!['watchedEntireVideo','answerAndNarration','visualReadability','rights'].every(k=>b.checks[k]===true))return badRequest('Video sürümü, kullanım hakkı ve dört insan inceleme kontrolü gerekir.','MEDIA_HUMAN_REVIEW_REQUIRED');
 if(j.synthetic)return fail(409,'SYNTHETIC_CANNOT_PUBLISH','Teknik test videosu öğrenci içeriği olarak yayımlanamaz.');
 if(j.status==='APPROVED')return json({ok:true,job:dto(j),reused:true});
 if(j.status!=='REVIEW'||!j.output_key||!await mediaSourceValid(env,j.id))return fail(409,'MEDIA_SOURCE_CHANGED','Güncel onaylı kaynak ve tamamlanmış video gerekir.');
 const obj=await env.FILES.get(j.output_key);if(!obj||obj.size!==j.output_bytes||obj.size>30*1024*1024||await sha256(await obj.arrayBuffer())!==j.output_sha256)return fail(409,'VIDEO_INTEGRITY_FAILED','Video içeriği doğrulanamadı.');
 const asset=uuid('qa');
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO question_assets(id,question_id,asset_type,r2_key,title,approved,placement,sort_order,alt_text,mime_type,width,height,rights_status,byte_sha256,byte_size,sealed_at)
   SELECT ?,j.question_id,'SOLUTION_VIDEO',j.output_key,'Onaylanan video çözüm',1,'SOLUTION',0,'Sorunun adım adım video çözümü','video/mp4',1280,720,'VERIFIED',j.output_sha256,j.output_bytes,CURRENT_TIMESTAMP FROM question_media_jobs j WHERE j.id=? AND j.status='REVIEW' AND j.output_sha256=? AND ${mediaSourceFence('j',false)}`).bind(asset,j.id,b.expectedOutputHash),
  env.DB.prepare("UPDATE question_bank SET review_status='REVIEW',review_checks_json=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM question_assets WHERE id=?)").bind(j.question_id,asset),
  env.DB.prepare("UPDATE question_media_jobs SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP,attached_asset_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='REVIEW' AND EXISTS(SELECT 1 FROM question_assets WHERE id=?)").bind(user.id,asset,j.id,asset),
  env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) SELECT ?,?,NULL,'QUESTION_VIDEO_HUMAN_APPROVED','question_media_job',?,? WHERE EXISTS(SELECT 1 FROM question_assets WHERE id=?)").bind(uuid('aud'),user.id,j.id,JSON.stringify({outputHash:j.output_sha256,rightsStatus:b.rightsStatus,checks:b.checks,questionReviewRequired:true}),asset),
 ]);
 const after=await find(env,j.id);if(after.status!=='APPROVED')return fail(409,'MEDIA_SOURCE_CHANGED','Video onayı sırasında kaynak değişti; ilişki kurulmadı.');
 return json({ok:true,job:dto(after),questionReviewRequired:true,published:false});
}
export async function handleQuestionMediaJobs(request:Request,env:Env,user:AuthUser|null){
 const p=new URL(request.url).pathname,render=p.match(/^\/api\/question-bank-standard\/media-jobs\/([^/]+)\/render\/(input|audio|output)$/);
 if(render)return renderRoute(request,env,render[1],render[2]);
 if(!user)return fail(401,'UNAUTHENTICATED','Oturum açın.');if(user.role!=='SUPER_ADMIN')return forbidden('Medya ekibini yalnız Süper Admin yönetebilir.');
 if(request.method!=='GET'&&request.headers.get('Origin')!==new URL(request.url).origin)return forbidden('İşlemi ANUNEX üzerinden başlatın.');
 if(p===base&&request.method==='GET'){const jobs=await all<any>(env.DB.prepare('SELECT * FROM question_media_jobs ORDER BY created_at DESC,id DESC LIMIT 50'));return json({ok:true,jobs:jobs.map(dto),rendererEnabled:env.QUESTION_VIDEO_RENDER_ENABLED==='true',narrationConfigured:voiceProviderStatus(env).standardConfigured});}
 if(p===base&&request.method==='POST')return create(request,env,user);
 const action=p.match(/^\/api\/question-bank-standard\/media-jobs\/([^/]+)\/(prepare|cancel|approve|file)$/);if(!action)return notFound('Medya işlemi bulunamadı.');
 const j=await find(env,action[1]);if(!j)return notFound('Medya işi bulunamadı.');
 if(action[2]==='file'&&request.method==='GET'){if(!j.output_key)return notFound('Video henüz üretilmedi.');const obj=await env.FILES.get(j.output_key);if(!obj)return notFound('Video dosyası yok.');return new Response(obj.body,{headers:{'content-type':'video/mp4','content-length':String(obj.size),'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
 if(action[2]==='prepare'&&request.method==='POST')return prepare(env,user,j);
 if(action[2]==='approve'&&request.method==='POST')return approve(request,env,user,j);
 if(action[2]==='cancel'&&request.method==='PATCH'){await env.DB.prepare("UPDATE question_media_jobs SET status='CANCELLED',lease_hash=NULL,lease_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('CANCELLED','APPROVED')").bind(j.id).run();return json({ok:true,job:dto(await find(env,j.id))});}
 return fail(405,'METHOD_NOT_ALLOWED','Geçersiz medya işlemi.');
}

/** Autonomous preparation uses a separately configured active D1 actor; never approves output. */
export async function prepareAutonomousQuestionVideo(env:Env){
 if(env.QUESTION_AUTOMATED_PILOT_MODE!=='true'||env.QUESTION_AGENT_EXECUTION_ENABLED!=='true'||env.QUESTION_VIDEO_RENDER_ENABLED!=='true'||!autonomousYear(env.QUESTION_AUTOMATED_ACADEMIC_YEAR))return {prepared:false,reason:'AUTOMATED_MEDIA_DISABLED'};
 if(!voiceProviderStatus(env).standardConfigured)return {prepared:false,reason:'NARRATION_PROVIDER_NOT_ENABLED'};
 if(await questionTeamPaused(env,['MEDIA','VIDEO']))return {prepared:false,reason:'TEAM_PAUSED'};
 const actor=await one<any>(env.DB.prepare("SELECT id FROM users WHERE id=? AND role='SUPER_ADMIN' AND active=1").bind(env.QUESTION_AGENT_SERVICE_ACTOR_ID??''));
 if(!actor)return {prepared:false,reason:'SERVICE_ACTOR_NOT_VERIFIED'};
 const q=await one<any>(env.DB.prepare(`SELECT q.id,q.review_revision FROM question_bank q
 WHERE q.owner_type='PLATFORM' AND q.academic_year=? AND q.review_status='APPROVED' AND q.copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN')
 AND q.question_type='MULTIPLE_CHOICE' AND (q.content_mode='TEXT' OR q.editorial_packet_json IS NOT NULL)
 AND NOT EXISTS(SELECT 1 FROM question_media_jobs j WHERE j.question_id=q.id AND j.source_revision=q.review_revision)
 AND NOT EXISTS(SELECT 1 FROM question_assets a WHERE a.question_id=q.id)
 ORDER BY q.id LIMIT 1`).bind(env.QUESTION_AUTOMATED_ACADEMIC_YEAR));
 if(!q)return {prepared:false,reason:'NO_APPROVED_SOURCE'};
 const user:AuthUser={id:actor.id,role:'SUPER_ADMIN',institution_id:null,student_id:null,display_name:'Scheduled Media Agent',email:null,username:null};
 const hash=await sha256('AUTO_VIDEO_V1:'+q.id+':'+q.review_revision);
 const requestKey=`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
 const response=await create(new Request('https://internal.invalid/api/question-bank-standard/media-jobs',{method:'POST',body:JSON.stringify({questionId:q.id,expectedRevision:q.review_revision,requestKey,narrationMode:'NARRATED',instructionNote:'Onaylı kaynak için otonom video hazırlığı; insan video incelemesi zorunlu.'})}),env,user);
 const result:any=await response.json();if(!response.ok||result.job?.status!=='QUEUED')return {prepared:false,reason:result.job?.errorCode??'MEDIA_REQUEST_REJECTED'};
 const job=await find(env,result.job.id);const prepared=await prepare(env,user,job);return {prepared:prepared.ok,reason:prepared.ok?'READY_TO_RENDER':'MEDIA_PREPARATION_FAILED'};
}
