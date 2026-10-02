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
 if(env.RESULT_ARTIFACTS_ENABLED!=='true'||env.RESULT_ARTIFACT_CLEANUP_ENABLED!=='true'||!env.RESULT_FILES)return badRequest('Sonuç dosyası hazırlama henüz etkinleştirilmedi.','RESULT_ARTIFACTS_DISABLED');
 const body:any=await request.json().catch(()=>({}));
 const version=body.expectedSnapshotVersion,cursor=body.cursor??'';
 if(!Number.isSafeInteger(version)||version<1||typeof cursor!=='string'||cursor.length>200)return badRequest('Güncel sürüm ve geçerli devam bilgisi gereklidir.');
 const administration=await env.DB.prepare("SELECT exam_id FROM exam_administrations WHERE id=? AND channel='RESULT_NETWORK'").bind(id).first<{exam_id:string}>();
 if(!administration)return json({ok:false,error:{code:'ADMINISTRATION_NOT_FOUND',message:'Sınav yönetimi bulunamadı.'}},404);
 return withExamOperationLock(env,administration.exam_id,'RESULT_ARTIFACT_PREPARE',async(env)=>{
  const current=await env.DB.prepare("SELECT id FROM exam_administrations ea WHERE id=? AND status='PUBLISHED' AND published_snapshot_version=? AND NOT EXISTS(SELECT 1 FROM result_artifact_retirements retired WHERE retired.administration_id=ea.id AND retired.retired_through_version>=ea.published_snapshot_version)").bind(id,version).first();
  if(!current)return json({ok:false,error:{code:'RESULT_PUBLICATION_STATE_CHANGED',message:'Yayın veya sürüm değişti.'}},409);
  const rows=await all<any>(env.DB.prepare(`SELECT s.* FROM exam_result_snapshots s JOIN result_access_identities rai ON rai.participant_id=s.participant_id AND rai.administration_id=? WHERE s.exam_id=? AND s.snapshot_version=? AND s.participant_id>? ORDER BY s.participant_id LIMIT 51`).bind(id,administration.exam_id,version,cursor));
  const page=rows.slice(0,50);
  // Preflight the entire page before creating any objects.
  const artifacts=await Promise.all(page.map(row=>encodeResultArtifact(id,row)));
  const statements:D1PreparedStatement[]=[];
  for(let i=0;i<page.length;i++){
   const artifact=artifacts[i];await storeResultArtifact(env.RESULT_FILES!,artifact);
   statements.push(env.DB.prepare(`INSERT INTO result_artifact_manifest(administration_id,participant_id,snapshot_version,object_key,content_sha256) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM exam_administrations WHERE id=? AND status='PUBLISHED' AND published_snapshot_version=?) ON CONFLICT(administration_id,snapshot_version,participant_id) DO NOTHING`).bind(id,page[i].participant_id,version,artifact.key,artifact.digest,id,version));
  }
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,NULL,'RESULT_ARTIFACT_PAGE_PREPARED','exam_administration',?,?)`).bind(uuid('aud'),user.id,id,JSON.stringify({version,count:page.length,hasMore:rows.length>50})));
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
