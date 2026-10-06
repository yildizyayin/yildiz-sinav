import { handleRubricObservations } from './lib/rubric-observations';
import worksheetApp from './worksheet-admin-entry';
import { handleMaarifRegistry } from './lib/maarif-rubric-registry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, sanitizeAuditDetails, uuid } from './lib/db';
import { parseCurriculumCsv, validateCurriculumHierarchy, validateCurriculumImportMetadata } from './lib/curriculum-import';
import { inferOfficialSourceKind,validateOfficialSource,type OfficialSourceKind } from './lib/official-education-source';

function apiError(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}

async function requireSuper(env:Env,request:Request):Promise<AuthUser|Response>{
 const user=await getAuthUser(env,request);if(!user)return apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden('Müfredat ve kazanım merkezini yalnız Super Admin yönetebilir.');return user;
}

function safeName(value:string){return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'curriculum.csv'}
async function sha256Hex(data:ArrayBuffer){const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}

async function listVersions(env:Env,url:URL):Promise<Response>{
 const year=url.searchParams.get('academicYear');const program=url.searchParams.get('programCode');const params:any[]=[];let where='1=1';if(year){where+=' AND cv.academic_year=?';params.push(year)}if(program){where+=' AND cv.program_code=?';params.push(program)}
 const rows=await all<any>(env.DB.prepare(`SELECT cv.*,
   u.display_name verified_by_name,
   (SELECT count(*) FROM outcomes o WHERE o.curriculum_version_id=cv.id AND o.active=1) outcome_count,
   (SELECT count(DISTINCT o.subject_id) FROM outcomes o WHERE o.curriculum_version_id=cv.id AND o.active=1) subject_count
   FROM curriculum_versions cv LEFT JOIN users u ON u.id=cv.verified_by
   WHERE ${where} ORDER BY cv.academic_year DESC,cv.program_code,coalesce(cv.grade_level,99),cv.program_version DESC`).bind(...params));
 return json({ok:true,versions:rows});
}

async function options(env:Env):Promise<Response>{const subjects=await all<any>(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1 ORDER BY name'));return json({ok:true,subjects,authorities:['MEB','TTKB','ÖSYM'],programs:['SCHOOL','TYT','AYT'],hierarchyNodeTypes:['UNIT','TOPIC','OUTCOME','SUB_OUTCOME']})}

async function previewImport(request:Request,env:Env,actor:AuthUser):Promise<Response>{
 const form=await request.formData();const file=form.get('file');if(!(file instanceof File))return badRequest('Kazanım CSV dosyası seçilmelidir.');if(file.size>8*1024*1024)return badRequest('CSV dosyası 8 MB sınırını aşıyor.');
 const programCode=String(form.get('programCode')||'SCHOOL');const gradeRaw=String(form.get('gradeLevel')||'').trim();const gradeLevel=gradeRaw?Number(gradeRaw):null;
 const metadata=validateCurriculumImportMetadata({academicYear:String(form.get('academicYear')||''),programCode,gradeLevel,programVersion:String(form.get('programVersion')||''),authority:String(form.get('authority')||''),sourceUrl:String(form.get('sourceUrl')||''),sourceTitle:String(form.get('sourceTitle')||'')});
 if(!metadata.valid)return badRequest('Import bilgileri doğrulanamadı.','INVALID_CURRICULUM_METADATA',metadata.errors);
 const meta=metadata.normalized as any;const sourceCheck=validateOfficialSource({authority:meta.authority,sourceUrl:meta.sourceUrl,sourceTitle:meta.sourceTitle});if(!sourceCheck.valid)return badRequest(sourceCheck.message,sourceCheck.code);const sourceKind=sourceCheck.sourceKind as OfficialSourceKind;
 const exists=await one(env.DB.prepare(`SELECT id FROM curriculum_versions WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND program_version=?`).bind(meta.academicYear,meta.programCode,meta.gradeLevel,meta.programVersion));if(exists)return apiError(409,'CURRICULUM_VERSION_EXISTS','Bu akademik yıl/program/sürüm zaten mevcut. Yeni bir sürüm adı kullanın.');
 const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);const parsed=parseCurriculumCsv(text,meta.programCode,meta.gradeLevel);if(parsed.errors.length)return badRequest('CSV yapısı okunamadı.','INVALID_CURRICULUM_CSV',parsed.errors);if(parsed.rows.length===0)return badRequest('CSV içinde veri satırı bulunamadı.');if(parsed.rows.length>10000)return badRequest('Tek aktarımda en fazla 10.000 kazanım satırı desteklenir.');
 const subjects=await all<any>(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1'));const byCode=new Map(subjects.map(s=>[String(s.code).toLocaleUpperCase('tr-TR'),s]));
 const seenExistingCodes=new Set<string>();const enriched=parsed.rows.map(r=>{const issues=[...r.issues];const sub=byCode.get(r.subjectCode);if(!sub)issues.push(`Ders kodu sistemde bulunamadı: ${r.subjectCode||'(boş)'}`);const uniqueCode=r.outcomeCode?`${r.subjectCode}|${r.gradeLevel??''}|${r.outcomeCode}`:'';if(uniqueCode){if(seenExistingCodes.has(uniqueCode))issues.push(`Aynı kazanım kodu tekrar ediyor: ${r.outcomeCode}`);else seenExistingCodes.add(uniqueCode)}return {...r,subjectId:sub?.id||null,issues}});
 const validCount=enriched.filter(r=>r.issues.length===0).length;const invalidCount=enriched.length-validCount;const jobId=uuid('cimp');
 const chunks:string[]=[];let chunk:string[]=[];let chunkBytes=2;
 for(const r of enriched){const encoded=JSON.stringify({id:uuid('cir'),rowNo:r.rowNo,subjectCode:r.subjectCode,subjectId:r.subjectId,gradeLevel:r.gradeLevel,outcomeCode:r.outcomeCode,topic:r.topic,subtopic:r.subtopic,title:r.title,parentCode:r.parentCode,nodeType:r.nodeType,unit:r.unit,valid:r.issues.length?0:1,issues:JSON.stringify(r.issues)});const size=new TextEncoder().encode(encoded).byteLength;
  if(size+2>450000)return badRequest('Tek bir CSV satırı aktarım boyutu sınırını aşıyor.');
  if(chunk.length&&(chunk.length>=100||chunkBytes+size+1>450000)){chunks.push('['+chunk.join(',')+']');chunk=[];chunkBytes=2;}
  chunk.push(encoded);chunkBytes+=size+1;
 }
 if(chunk.length)chunks.push('['+chunk.join(',')+']');
 const hash=await sha256Hex(bytes);const objectKey=`curriculum-imports/${meta.academicYear}/${jobId}/${Date.now()}-${safeName(file.name||'outcomes.csv')}`;await env.FILES.put(objectKey,bytes,{httpMetadata:{contentType:file.type||'text/csv'}});
 const sourcePublishedAt=String(form.get('sourcePublishedAt')||'').trim()||null;const status=invalidCount===0?'READY':'PREVIEW';
 await env.DB.prepare(`INSERT INTO curriculum_import_jobs (id,academic_year,program_code,grade_level,program_version,authority,source_kind,source_url,source_title,source_published_at,source_file_key,source_file_name,source_file_hash,status,row_count,valid_count,invalid_count,created_by)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(jobId,meta.academicYear,meta.programCode,meta.gradeLevel,meta.programVersion,meta.authority,sourceKind,sourceCheck.sourceUrl,meta.sourceTitle,sourcePublishedAt,objectKey,file.name,hash,'PREVIEW',enriched.length,validCount,invalidCount,actor.id).run();
 for(const chunkJson of chunks)await env.DB.prepare(`INSERT INTO curriculum_import_rows (id,job_id,row_no,subject_code,subject_id,grade_level,outcome_code,topic,subtopic,title,parent_code,node_type,unit,valid,issues_json)
  SELECT json_extract(value,'$.id'),?,json_extract(value,'$.rowNo'),json_extract(value,'$.subjectCode'),json_extract(value,'$.subjectId'),json_extract(value,'$.gradeLevel'),json_extract(value,'$.outcomeCode'),json_extract(value,'$.topic'),json_extract(value,'$.subtopic'),json_extract(value,'$.title'),json_extract(value,'$.parentCode'),json_extract(value,'$.nodeType'),json_extract(value,'$.unit'),json_extract(value,'$.valid'),json_extract(value,'$.issues') FROM json_each(?)`).bind(jobId,chunkJson).run();
 // READY is visible only after every expected staging row was stored.
 await env.DB.prepare(`UPDATE curriculum_import_jobs SET status=? WHERE id=? AND status='PREVIEW' AND row_count=(SELECT count(*) FROM curriculum_import_rows WHERE job_id=?)`).bind(status,jobId,jobId).run();
 await audit(env.DB,actor.id,null,'CURRICULUM_IMPORT_PREVIEWED','curriculum_import',jobId,{academicYear:meta.academicYear,programCode:meta.programCode,gradeLevel:meta.gradeLevel,programVersion:meta.programVersion,authority:meta.authority,sourceKind,rowCount:enriched.length,validCount,invalidCount,sourceHash:hash});
 return json({ok:true,jobId,status,rowCount:enriched.length,validCount,invalidCount,sourceHash:hash,sourceKind,preview:enriched.slice(0,30)});
}

async function getImport(env:Env,id:string):Promise<Response>{const job=await one<any>(env.DB.prepare('SELECT * FROM curriculum_import_jobs WHERE id=?').bind(id));if(!job)return notFound('Müfredat aktarımı bulunamadı.');const rows=await all<any>(env.DB.prepare(`SELECT row_no,subject_code,grade_level,outcome_code,parent_code,node_type,unit,topic,subtopic,title,valid,issues_json FROM curriculum_import_rows WHERE job_id=? ORDER BY row_no LIMIT 500`).bind(id));return json({ok:true,job,rows:rows.map(r=>({...r,issues:r.issues_json?JSON.parse(r.issues_json):[]}))})}

async function commitImport(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
 const job=await one<any>(env.DB.prepare('SELECT * FROM curriculum_import_jobs WHERE id=?').bind(id));if(!job)return notFound('Müfredat aktarımı bulunamadı.');if(job.status==='COMMITTED')return apiError(409,'ALREADY_COMMITTED','Bu aktarım daha önce tamamlanmış.');if(job.invalid_count>0||job.status!=='READY')return badRequest('Hatalı satırlar varken aktarım tamamlanamaz.','CURRICULUM_IMPORT_HAS_ERRORS');
 let body:{confirmedOfficial?:boolean}|null;try{body=await request.json<{confirmedOfficial?:boolean}|null>();}catch{return badRequest('Onay gövdesi geçerli JSON olmalıdır.');}if(body?.confirmedOfficial!==true)return badRequest('Resmî kaynak doğrulaması açıkça onaylanmalıdır.','OFFICIAL_CONFIRMATION_REQUIRED');const sourceKind=(job.source_kind||inferOfficialSourceKind(job.authority,job.source_url)) as OfficialSourceKind|null;const sourceCheck=validateOfficialSource({sourceKind,authority:job.authority,sourceUrl:job.source_url,sourceTitle:job.source_title});if(!sourceCheck.valid)return badRequest(sourceCheck.message,sourceCheck.code);
 const duplicate=await one(env.DB.prepare(`SELECT id FROM curriculum_versions WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND program_version=?`).bind(job.academic_year,job.program_code,job.grade_level,job.program_version));if(duplicate)return apiError(409,'CURRICULUM_VERSION_EXISTS','Hedef müfredat sürümü zaten oluşturulmuş.');
 const rows=await all<any>(env.DB.prepare('SELECT * FROM curriculum_import_rows WHERE job_id=? ORDER BY row_no').bind(id));
 if(!rows.length||rows.length!==Number(job.row_count)||Number(job.valid_count)!==rows.length||rows.some(r=>r.valid!==1))return badRequest('Aktarım satırları eksik veya geçersiz. Yeni önizleme oluşturun.','CURRICULUM_IMPORT_INCOMPLETE');
 const hierarchy=rows.map(r=>({subjectCode:r.subject_code,gradeLevel:r.grade_level,outcomeCode:r.outcome_code,parentCode:r.parent_code,issues:[] as string[]}));validateCurriculumHierarchy(hierarchy);
 if(hierarchy.some(r=>r.issues.length))return badRequest('Üst kayıt bağlantıları geçersiz. CSV dosyasını düzeltip yeniden önizleyin.','CURRICULUM_HIERARCHY_INVALID');
 const versionId=uuid('cv'),verifiedAt=new Date().toISOString();
 const details=JSON.stringify(sanitizeAuditDetails({jobId:id,authority:job.authority,sourceKind:sourceCheck.sourceKind,sourceUrl:sourceCheck.sourceUrl,sourceHash:job.source_file_hash,outcomeCount:rows.length}));
 // A fixed-size transaction publishes the version, all outcomes, provenance
 // and commit state together. A competing commit sees READY no longer present.
 let results:D1Result[];
 try{results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO curriculum_versions (id,academic_year,grade_level,program_version,authority,verified,source_url,program_code,source_kind,source_title,source_published_at,verified_by,verified_at)
   SELECT ?,j.academic_year,j.grade_level,j.program_version,?,1,?,j.program_code,?,j.source_title,j.source_published_at,?,? FROM curriculum_import_jobs j
   WHERE j.id=? AND j.status='READY' AND j.invalid_count=0 AND j.row_count=? AND j.valid_count=j.row_count
   AND j.source_file_hash=? AND j.source_url=?
   AND j.row_count=(SELECT count(*) FROM curriculum_import_rows r WHERE r.job_id=j.id)
   AND NOT EXISTS(SELECT 1 FROM curriculum_import_rows r LEFT JOIN subjects s ON s.id=r.subject_id WHERE r.job_id=j.id AND (r.valid<>1 OR s.id IS NULL OR s.active<>1 OR r.title IS NULL OR trim(r.title)=''
    OR r.node_type NOT IN ('UNIT','TOPIC','OUTCOME','SUB_OUTCOME')
    OR (r.node_type IN ('OUTCOME','SUB_OUTCOME') AND (r.outcome_code IS NULL OR trim(r.outcome_code)=''))
    OR (j.program_code='SCHOOL' AND (r.grade_level IS NULL OR r.grade_level<>j.grade_level))
    OR (j.program_code<>'SCHOOL' AND r.grade_level IS NOT NULL)))`)
   .bind(versionId,sourceCheck.authority,sourceCheck.sourceUrl,sourceCheck.sourceKind,actor.id,verifiedAt,id,rows.length,job.source_file_hash,job.source_url),
  env.DB.prepare(`INSERT INTO outcomes (id,curriculum_version_id,subject_id,grade_level,code,topic,subtopic,title,parent_outcome_id,node_type,unit,official,active)
   SELECT 'out_'||r.id,?,r.subject_id,r.grade_level,r.outcome_code,r.topic,r.subtopic,r.title,
    (SELECT 'out_'||p.id FROM curriculum_import_rows p WHERE p.job_id=r.job_id AND p.subject_id=r.subject_id AND p.grade_level IS r.grade_level AND p.outcome_code=r.parent_code LIMIT 1),r.node_type,r.unit,1,1
   FROM curriculum_import_rows r WHERE r.job_id=? AND EXISTS(SELECT 1 FROM curriculum_versions WHERE id=?)`).bind(versionId,id,versionId),
  env.DB.prepare(`INSERT INTO official_knowledge_events(id,source_kind,authority,entity_type,entity_id,academic_year,source_url,source_title,source_published_at,source_verified_at,content_hash,row_count,created_by)
   SELECT ?,cv.source_kind,cv.authority,'CURRICULUM_VERSION',cv.id,cv.academic_year,cv.source_url,cv.source_title,cv.source_published_at,cv.verified_at,?, ?,? FROM curriculum_versions cv WHERE cv.id=?`).bind(uuid('oke'),job.source_file_hash,rows.length,actor.id,versionId),
  env.DB.prepare(`UPDATE curriculum_import_jobs SET status='COMMITTED',confirmed_official=1,curriculum_version_id=?,committed_by=?,committed_at=CURRENT_TIMESTAMP WHERE id=? AND status='READY' AND EXISTS(SELECT 1 FROM curriculum_versions WHERE id=?)`).bind(versionId,actor.id,id,versionId),
  env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) SELECT ?,?,NULL,'CURRICULUM_IMPORT_COMMITTED','curriculum_version',?,? WHERE EXISTS(SELECT 1 FROM curriculum_versions WHERE id=?)`).bind(uuid('aud'),actor.id,versionId,details,versionId),
 ]);}catch(e){if(e instanceof Error&&/UNIQUE constraint failed: curriculum_versions\./.test(e.message))return apiError(409,'CURRICULUM_VERSION_EXISTS','Hedef müfredat sürümü başka bir aktarımda oluşturulmuş.');throw e;}
 if(!results[0].meta.changes)return apiError(409,'CURRICULUM_IMPORT_CONTEXT_CHANGED','Aktarım durumu veya satır bağlamı değişti. Önizlemeyi yenileyin.');
 return json({ok:true,versionId,outcomeCount:rows.length,sourceKind:sourceCheck.sourceKind});
}

async function versionDetail(env:Env,id:string):Promise<Response>{const version=await one<any>(env.DB.prepare(`SELECT cv.*,u.display_name verified_by_name FROM curriculum_versions cv LEFT JOIN users u ON u.id=cv.verified_by WHERE cv.id=?`).bind(id));if(!version)return notFound('Müfredat sürümü bulunamadı.');const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.subject_id,s.code subject_code,s.name subject_name,o.grade_level,o.code,o.parent_outcome_id,o.node_type,o.unit,o.topic,o.subtopic,o.title,o.official,o.active FROM outcomes o JOIN subjects s ON s.id=o.subject_id WHERE o.curriculum_version_id=? ORDER BY s.name,o.unit,o.topic,o.subtopic,o.code`).bind(id));return json({ok:true,version,outcomes})}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(url.pathname.startsWith('/api/learning-observations/')){const user=await getAuthUser(env,request);if(!user)return apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');try{return await handleRubricObservations(request,env,user)||notFound();}catch{return apiError(500,'SERVER_ERROR','Gözlem işlemi tamamlanamadı.');}}if(!url.pathname.startsWith('/api/curriculum-admin'))return worksheetApp.fetch(request,env);try{const actor=await requireSuper(env,request);if(actor instanceof Response)return actor;const rubricResponse=await handleMaarifRegistry(request,env,actor);if(rubricResponse)return rubricResponse;if(url.pathname==='/api/curriculum-admin/options'&&request.method==='GET')return options(env);if(url.pathname==='/api/curriculum-admin'&&request.method==='GET')return listVersions(env,url);if(url.pathname==='/api/curriculum-admin/import-preview'&&request.method==='POST')return previewImport(request,env,actor);const commit=url.pathname.match(/^\/api\/curriculum-admin\/imports\/([^/]+)\/commit$/);if(commit)return request.method==='POST'?commitImport(request,env,actor,commit[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');const imp=url.pathname.match(/^\/api\/curriculum-admin\/imports\/([^/]+)$/);if(imp)return request.method==='GET'?getImport(env,imp[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');const ver=url.pathname.match(/^\/api\/curriculum-admin\/versions\/([^/]+)$/);if(ver)return request.method==='GET'?versionDetail(env,ver[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');return notFound('Müfredat yönetim API yolu bulunamadı.')}catch(e){console.error('Curriculum admin error',e);return apiError(500,'SERVER_ERROR','Müfredat işlemi sırasında sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
