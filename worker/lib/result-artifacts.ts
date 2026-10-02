import type {AuthUser,Env} from '../types';
import {all,badRequest,forbidden,json,uuid} from './db';
import {withExamOperationLock} from './exam-operation-lock';
import {readNetworkSnapshot,snapshotDetail,snapshotSummary} from './result-network-snapshot';

// Call only for a durably retired version. Repeated sweeps catch late writes;
// an empty sweep is not proof that the version can be forgotten permanently.
export async function sweepRetiredResultArtifactVersion(bucket:R2Bucket,administrationId:string,version:number){
 if(typeof administrationId!=='string'||!administrationId.trim()||!Number.isSafeInteger(version)||version<1)throw Error('RESULT_ARTIFACT_CLEANUP_SCOPE_INVALID');
 const prefix=`private-results/${encodeURIComponent(administrationId)}/v${version}/`;
 // Restart at the prefix on every retry: deleted-object cursors can skip keys.
 const page=await bucket.list({prefix,limit:51});
 if(page.objects.length>51||page.objects.some(object=>!object.key.startsWith(prefix)))throw Error('RESULT_ARTIFACT_CLEANUP_SCOPE_FAILED');
 const keys=page.objects.slice(0,50).map(object=>object.key);
 if(keys.length)await bucket.delete(keys);
 return {deleted:keys.length,hasMore:page.truncated||page.objects.length>50};
}

export async function encodeResultArtifact(administrationId:string,row:any){
 const payload=readNetworkSnapshot(row.payload_json);
 if(!payload||!row.exam_id||!row.participant_id||!row.institution_id||!Number.isSafeInteger(row.snapshot_version)||row.snapshot_version<1)throw Error('RESULT_ARTIFACT_SOURCE_INVALID');
 const body=JSON.stringify({schemaVersion:1,administrationId,examId:row.exam_id,participantId:row.participant_id,institutionId:row.institution_id,snapshotVersion:row.snapshot_version,summary:snapshotSummary(row),detail:snapshotDetail(payload),wrongQuestionIds:Array.isArray(payload.wrongQuestionIds)?payload.wrongQuestionIds:null});
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
 const digest=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const key=`private-results/${encodeURIComponent(administrationId)}/v${row.snapshot_version}/${encodeURIComponent(row.participant_id)}/${digest}.json`;
 return {body,digest,key};
}
export async function storeResultArtifact(bucket:R2Bucket,artifact:Awaited<ReturnType<typeof encodeResultArtifact>>){
 const stored=await bucket.put(artifact.key,artifact.body,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'},customMetadata:{sha256:artifact.digest}});
 if(!stored){const existing=await bucket.get(artifact.key);if(!existing||await existing.text()!==artifact.body)throw Error('RESULT_ARTIFACT_CONTENT_CONFLICT')}
}
// The preparer is intentionally disabled by default. Readers are not switched
// until private binding, revocation, retention cleanup and load gates pass.
export async function prepareResultArtifacts(request:Request,env:Env,user:AuthUser,id:string):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(env.RESULT_ARTIFACTS_ENABLED!=='true'||env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||env.RESULT_RETENTION_QUEUE_ENABLED!=='true'||!env.RESULT_RETENTION_QUEUE||!env.RESULT_FILES)return badRequest('Sonuç dosyası hazırlama henüz etkinleştirilmedi.','RESULT_ARTIFACTS_DISABLED');
 const body:any=await request.json().catch(()=>({}));
 if(body.managed===true&&env.RESULT_ARTIFACT_BACKGROUND_ENABLED!=='true')return badRequest('Arka plan dosya hazırlama etkin değil.','RESULT_ARTIFACT_BACKGROUND_DISABLED');
 if(body.managed===true&&(typeof body.attemptToken!=='string'||body.attemptToken.length>100||!body.attemptToken.startsWith('artifact-attempt_')))return badRequest('Geçerli hazırlama denemesi gereklidir.');
 const version=body.expectedSnapshotVersion;let cursor=body.cursor??'';
 if(!Number.isSafeInteger(version)||version<1||typeof cursor!=='string'||cursor.length>200)return badRequest('Güncel sürüm ve geçerli devam bilgisi gereklidir.');
 const administration=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!administration)return json({ok:false,error:{code:'ADMINISTRATION_NOT_FOUND',message:'Sınav yönetimi bulunamadı.'}},404);
 return withExamOperationLock(env,administration.exam_id,'RESULT_ARTIFACT_PREPARE',async(env)=>{
  const current=await env.DB.prepare("SELECT id FROM exam_administrations ea WHERE id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=? AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements retired WHERE retired.administration_id=ea.id AND retired.retired_through_version>=ea.published_snapshot_version)").bind(id,version).first();
  if(!current)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın veya sürüm değişti.'}},409);
  const job=body.managed===true?await env.DB.prepare("SELECT participant_cursor,source_generation FROM result_artifact_preparation_jobs WHERE administration_id=? AND snapshot_version=? AND status='RUNNING'").bind(id,version).first<{participant_cursor:string;source_generation:number}>():null;
  if(body.managed===true&&!job)return json({ok:false,error:{code:'RESULT_ARTIFACT_JOB_NOT_RUNNING',message:'Hazırlama kaydı etkin değil.'}},409);
  if(job&&body.queueToken){
   const ticket=await env.DB.prepare("SELECT dispatch_token FROM result_artifact_queue_jobs WHERE kind='PREPARE' AND administration_id=? AND snapshot_version=? AND source_generation=? AND dispatch_token=? AND page_cursor=? AND status<>'DONE'").bind(id,version,body.expectedGeneration,body.queueToken,body.expectedCursor).first();
   if(!ticket||job.source_generation!==body.expectedGeneration||job.participant_cursor!==body.expectedCursor)return json({ok:false,error:{code:'RESULT_ARTIFACT_QUEUE_STALE',message:'Kuyruk kaydı değişti.'}},409);
  }
  if(job){
   cursor=job.participant_cursor;
   await env.DB.prepare("UPDATE result_artifact_preparation_jobs SET last_attempted_at=CURRENT_TIMESTAMP,attempt_token=? WHERE administration_id=? AND snapshot_version=? AND status='RUNNING'").bind(body.attemptToken,id,version).run();
  }
  const rows=await all<any>(env.DB.prepare(`SELECT rai.participant_id identity_participant_id,s.*,m.object_key existing_object_key,m.content_sha256 existing_content_sha256,CASE WHEN ep.exam_id=s.exam_id AND ep.institution_id=s.institution_id AND rni.administration_id=rai.administration_id AND (rni.licensed_institution_id=s.institution_id OR (rni.meb_code<>'' AND rni.meb_code=institution.code)) THEN 1 ELSE 0 END scope_valid FROM result_access_identities rai LEFT JOIN exam_result_snapshots s ON s.participant_id=rai.participant_id AND s.exam_id=? AND s.snapshot_version=? LEFT JOIN exam_participants ep ON ep.id=s.participant_id LEFT JOIN result_network_institutions rni ON rni.id=rai.result_institution_id LEFT JOIN institutions institution ON institution.id=s.institution_id LEFT JOIN result_artifact_manifest m ON m.administration_id=rai.administration_id AND m.participant_id=s.participant_id AND m.snapshot_version=s.snapshot_version WHERE rai.administration_id=? AND rai.participant_id>? ORDER BY rai.participant_id LIMIT 51`).bind(administration.exam_id,version,id,cursor));
  const page=rows.slice(0,50);
  // Preflight the entire page before creating any objects.
  if(page.some(row=>!row.participant_id))return json({ok:false,error:{code:'RESULT_ARTIFACT_SOURCE_INCOMPLETE',message:'Bazı öğrencilerin dondurulmuş sonucu eksik.'}},409);
  if(page.some(row=>row.scope_valid!==1))return json({ok:false,error:{code:'RESULT_ARTIFACT_SOURCE_INVALID',message:'Sonuç kurum kapsamı doğrulanamadı.'}},409);
  const artifacts=await Promise.all(page.map(row=>encodeResultArtifact(id,row)));
  if(page.some((row,i)=>row.existing_object_key&&(row.existing_object_key!==artifacts[i].key||row.existing_content_sha256!==artifacts[i].digest)))return json({ok:false,error:{code:'RESULT_ARTIFACT_MANIFEST_CONFLICT',message:'Dosya kaydı yayın kaynağı ile uyuşmuyor.'}},409);
  const statements:D1PreparedStatement[]=[];
  for(let i=0;i<page.length;i++){
   const artifact=artifacts[i];await storeResultArtifact(env.RESULT_FILES!,artifact);
   statements.push(env.DB.prepare(`INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=?) ON CONFLICT(administration_id,snapshot_version,participant_id) DO NOTHING`).bind(id,page[i].participant_id,version,artifact.key,artifact.digest,id,version));
  }
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ARTIFACT_PAGE_PREPARED','exam_administration',?,?)`).bind(uuid('aud'),user.id,id,JSON.stringify({version,count:page.length,hasMore:rows.length>50})));
  if(job){
   const hasMore=rows.length>50,next=page.at(-1)?.participant_id??cursor;
   statements.push(env.DB.prepare(`UPDATE result_artifact_preparation_jobs SET participant_cursor=?,prepared_count=prepared_count+?,status=?,last_error_code=NULL,next_attempt_at=NULL,attempt_token=NULL,updated_at=CURRENT_TIMESTAMP WHERE administration_id=? AND snapshot_version=? AND status='RUNNING' AND participant_cursor=? AND attempt_token=?`).bind(next,page.length,hasMore?'RUNNING':'PREPARED',id,version,cursor,body.attemptToken));
  }
  await env.DB.batch(statements);
  return json({ok:true,prepared:page.length,snapshotVersion:version,nextCursor:rows.length>50?page.at(-1)?.participant_id:null,readerEnabled:env.RESULT_ARTIFACT_READS_ENABLED==='true'});
 });
}

export interface ArtifactAccess {
 administration_id:string;exam_id:string;participant_id:string;institution_id:string;snapshot_version:number;object_key:string|null;content_sha256:string|null;
}
// Access must come from the current authorized publication query, never the
// request body or a cached session. This helper only loads and validates bytes.
export async function readResultArtifact(bucket:R2Bucket,access:ArtifactAccess):Promise<any|null>{
 if(!access.object_key||!access.content_sha256)return null;
 if(!/^[a-f0-9]{64}$/.test(access.content_sha256))throw Error('RESULT_ARTIFACT_INTEGRITY_FAILED');
 const expected=`private-results/${encodeURIComponent(access.administration_id)}/v${access.snapshot_version}/${encodeURIComponent(access.participant_id)}/${access.content_sha256}.json`;
 if(access.object_key!==expected)throw Error('RESULT_ARTIFACT_SCOPE_FAILED');
 const object=await bucket.get(expected);if(!object)return null;
 const body=await object.text();
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body));
 const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==access.content_sha256)throw Error('RESULT_ARTIFACT_INTEGRITY_FAILED');
 let artifact:any;try{artifact=JSON.parse(body)}catch{throw Error('RESULT_ARTIFACT_INTEGRITY_FAILED')}
 if(artifact.schemaVersion!==1||artifact.administrationId!==access.administration_id||artifact.examId!==access.exam_id||artifact.participantId!==access.participant_id||artifact.institutionId!==access.institution_id||artifact.snapshotVersion!==access.snapshot_version)throw Error('RESULT_ARTIFACT_SCOPE_FAILED');
 if(!Array.isArray(artifact.detail?.subjects)||!Array.isArray(artifact.detail?.outcomes)||!Array.isArray(artifact.detail?.optionalPhilosophy)||!(artifact.wrongQuestionIds===null||Array.isArray(artifact.wrongQuestionIds)))throw Error('RESULT_ARTIFACT_INTEGRITY_FAILED');
 return artifact;
}

// Bounded operator audit, not a durable completeness certificate or rollout gate.
export async function inspectResultArtifactReadiness(request:Request,env:Env,user:AuthUser,id:string,includeCoverage=true):Promise<Response>{
 if(user.role!=='SUPER_ADMIN')return forbidden();
 if(!env.RESULT_FILES)return json({ok:false,error:{code:'RESULT_PRIVATE_BUCKET_NOT_CONFIGURED',message:'Özel sonuç dosyası bağlantısı tanımlı değil.'}},503);
 const params=new URL(request.url).searchParams;
 const version=Number(params.get('expectedSnapshotVersion')),cursor=params.get('cursor')??'';
 if(!Number.isSafeInteger(version)||version<1||cursor.length>200)return badRequest('Güncel sürüm ve geçerli devam bilgisi gereklidir.');
 const currentSql=`SELECT exam_id FROM exam_administrations ea WHERE id=? AND channel='RESULT_NETWORK' AND status='PUBLISHED' AND published_snapshot_version=? AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements retired WHERE retired.administration_id=ea.id AND retired.retired_through_version>=ea.published_snapshot_version)`;
 const current=await env.DB.prepare(currentSql).bind(id,version).first<{exam_id:string}>();
 if(!current)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın veya sürüm değişti.'}},409);
 const joins=`FROM result_access_identities rai LEFT JOIN exam_result_snapshots s ON s.participant_id=rai.participant_id AND s.exam_id=? AND s.snapshot_version=? LEFT JOIN result_artifact_manifest m ON m.administration_id=rai.administration_id AND m.participant_id=rai.participant_id AND m.snapshot_version=? LEFT JOIN exam_participants ep ON ep.id=rai.participant_id LEFT JOIN result_network_institutions rni ON rni.id=rai.result_institution_id LEFT JOIN institutions institution ON institution.id=s.institution_id WHERE rai.administration_id=?`;
 const coverage=includeCoverage?await env.DB.prepare(`SELECT COUNT(*) expected,COUNT(s.participant_id) snapshots,COUNT(m.participant_id) manifests ${joins}`).bind(current.exam_id,version,version,id).first<any>():null;
 const rows=await all<any>(env.DB.prepare(`SELECT rai.participant_id identity_participant_id,s.*,m.object_key,m.content_sha256,CASE WHEN ep.exam_id=s.exam_id AND ep.institution_id=s.institution_id AND rni.administration_id=rai.administration_id AND (rni.licensed_institution_id=s.institution_id OR (rni.meb_code<>'' AND rni.meb_code=institution.code)) THEN 1 ELSE 0 END scope_valid ${joins} AND rai.participant_id>? ORDER BY rai.participant_id LIMIT 51`).bind(current.exam_id,version,version,id,cursor));
 const page=rows.slice(0,50),counts={verified:0,missingSnapshot:0,invalidSnapshot:0,missingManifest:0,invalidManifest:0,missingObject:0,invalidObject:0};
 for(const row of page){
  if(!row.participant_id){counts.missingSnapshot++;continue}
  if(row.scope_valid!==1){counts.invalidSnapshot++;continue}
  let expected:Awaited<ReturnType<typeof encodeResultArtifact>>;
  try{expected=await encodeResultArtifact(id,row)}catch{counts.invalidSnapshot++;continue}
  if(!row.object_key||!row.content_sha256){counts.missingManifest++;continue}
  if(row.object_key!==expected.key||row.content_sha256!==expected.digest){counts.invalidManifest++;continue}
  // Keep transport failures separate from corrupt content. Never expose raw errors.
  let object:R2ObjectBody|null;
  try{object=await env.RESULT_FILES.get(expected.key)}catch{return json({ok:false,error:{code:'RESULT_ARTIFACT_AUDIT_UNAVAILABLE',message:'Özel dosya denetimi tamamlanamadı.'}},503)}
  if(!object){counts.missingObject++;continue}
  let body:string;
  try{body=await object.text()}catch{return json({ok:false,error:{code:'RESULT_ARTIFACT_AUDIT_UNAVAILABLE',message:'Özel dosya denetimi tamamlanamadı.'}},503)}
  if(body!==expected.body){counts.invalidObject++;continue}
  counts.verified++;
 }
 const final=await env.DB.prepare(currentSql).bind(id,version).first<{exam_id:string}>();
 if(!final||final.exam_id!==current.exam_id)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın veya sürüm değişti.'}},409);
 return json({ok:true,snapshotVersion:version,coverage:coverage?{expected:Number(coverage.expected),snapshots:Number(coverage.snapshots),manifests:Number(coverage.manifests)}:null,page:{checked:page.length,...counts},nextCursor:rows.length>50?page.at(-1)?.identity_participant_id:null,rolloutReady:false,verificationScope:'CURRENT_PAGE_ONLY',message:'Sayfa denetimi canlıya geçiş veya tüm dosyaların eksiksizliği için kalıcı kanıt değildir.'});
}
