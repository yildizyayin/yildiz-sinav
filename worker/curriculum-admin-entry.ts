import worksheetApp from './worksheet-admin-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, notFound, one, uuid } from './lib/db';
import { parseCurriculumCsv, validateCurriculumImportMetadata } from './lib/curriculum-import';

function apiError(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}

async function requireSuper(env:Env,request:Request):Promise<AuthUser|Response>{
 const user=await getAuthUser(env,request);if(!user)return apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden('Müfredat ve kazanım merkezini yalnız Super Admin yönetebilir.');return user;
}

function safeName(value:string){return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'curriculum.csv'}
async function sha256Hex(data:ArrayBuffer){const digest=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}

function sourceAuthorityMatches(authority:string,sourceUrl:string){
 try{const host=new URL(sourceUrl).hostname.toLowerCase();if(authority==='MEB'||authority==='TTKB')return host==='meb.gov.tr'||host.endsWith('.meb.gov.tr');if(authority==='ÖSYM')return host==='osym.gov.tr'||host.endsWith('.osym.gov.tr');return false}catch{return false}
}

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

async function options(env:Env):Promise<Response>{const subjects=await all<any>(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1 ORDER BY name'));return json({ok:true,subjects,authorities:['MEB','TTKB','ÖSYM'],programs:['SCHOOL','TYT','AYT']})}

async function previewImport(request:Request,env:Env,actor:AuthUser):Promise<Response>{
 const form=await request.formData();const file=form.get('file');if(!(file instanceof File))return badRequest('Kazanım CSV dosyası seçilmelidir.');if(file.size>8*1024*1024)return badRequest('CSV dosyası 8 MB sınırını aşıyor.');
 const programCode=String(form.get('programCode')||'SCHOOL');const gradeRaw=String(form.get('gradeLevel')||'').trim();const gradeLevel=gradeRaw?Number(gradeRaw):null;
 const metadata=validateCurriculumImportMetadata({academicYear:String(form.get('academicYear')||''),programCode,gradeLevel,programVersion:String(form.get('programVersion')||''),authority:String(form.get('authority')||''),sourceUrl:String(form.get('sourceUrl')||''),sourceTitle:String(form.get('sourceTitle')||'')});
 if(!metadata.valid)return badRequest('Import bilgileri doğrulanamadı.','INVALID_CURRICULUM_METADATA',metadata.errors);
 const meta=metadata.normalized as any;if(!sourceAuthorityMatches(meta.authority,meta.sourceUrl))return badRequest('Kaynak adresi seçilen resmî kurum alan adıyla eşleşmiyor.','OFFICIAL_SOURCE_DOMAIN_MISMATCH');
 const exists=await one(env.DB.prepare(`SELECT id FROM curriculum_versions WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND program_version=?`).bind(meta.academicYear,meta.programCode,meta.gradeLevel,meta.programVersion));if(exists)return apiError(409,'CURRICULUM_VERSION_EXISTS','Bu akademik yıl/program/sürüm zaten mevcut. Yeni bir sürüm adı kullanın.');
 const bytes=await file.arrayBuffer();const text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);const parsed=parseCurriculumCsv(text,meta.programCode,meta.gradeLevel);if(parsed.errors.length)return badRequest('CSV yapısı okunamadı.','INVALID_CURRICULUM_CSV',parsed.errors);if(parsed.rows.length===0)return badRequest('CSV içinde veri satırı bulunamadı.');if(parsed.rows.length>10000)return badRequest('Tek aktarımda en fazla 10.000 kazanım satırı desteklenir.');
 const subjects=await all<any>(env.DB.prepare('SELECT id,code,name FROM subjects WHERE active=1'));const byCode=new Map(subjects.map(s=>[String(s.code).toLocaleUpperCase('tr-TR'),s]));
 const seenExistingCodes=new Set<string>();const enriched=parsed.rows.map(r=>{const issues=[...r.issues];const sub=byCode.get(r.subjectCode);if(!sub)issues.push(`Ders kodu sistemde bulunamadı: ${r.subjectCode||'(boş)'}`);const uniqueCode=r.outcomeCode?`${r.subjectCode}|${r.gradeLevel??''}|${r.outcomeCode}`:'';if(uniqueCode){if(seenExistingCodes.has(uniqueCode))issues.push(`Aynı kazanım kodu tekrar ediyor: ${r.outcomeCode}`);else seenExistingCodes.add(uniqueCode)}return {...r,subjectId:sub?.id||null,issues}});
 const validCount=enriched.filter(r=>r.issues.length===0).length;const invalidCount=enriched.length-validCount;const jobId=uuid('cimp');const hash=await sha256Hex(bytes);const objectKey=`curriculum-imports/${meta.academicYear}/${jobId}/${Date.now()}-${safeName(file.name||'outcomes.csv')}`;await env.FILES.put(objectKey,bytes,{httpMetadata:{contentType:file.type||'text/csv'}});
 const sourcePublishedAt=String(form.get('sourcePublishedAt')||'').trim()||null;const status=invalidCount===0?'READY':'PREVIEW';
 await env.DB.prepare(`INSERT INTO curriculum_import_jobs (id,academic_year,program_code,grade_level,program_version,authority,source_url,source_title,source_published_at,source_file_key,source_file_name,source_file_hash,status,row_count,valid_count,invalid_count,created_by)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(jobId,meta.academicYear,meta.programCode,meta.gradeLevel,meta.programVersion,meta.authority,meta.sourceUrl,meta.sourceTitle,sourcePublishedAt,objectKey,file.name,hash,status,enriched.length,validCount,invalidCount,actor.id).run();
 for(const r of enriched)await env.DB.prepare(`INSERT INTO curriculum_import_rows (id,job_id,row_no,subject_code,subject_id,grade_level,outcome_code,topic,subtopic,title,valid,issues_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uuid('cir'),jobId,r.rowNo,r.subjectCode,r.subjectId,r.gradeLevel,r.outcomeCode,r.topic,r.subtopic,r.title,r.issues.length?0:1,JSON.stringify(r.issues)).run();
 await audit(env.DB,actor.id,null,'CURRICULUM_IMPORT_PREVIEWED','curriculum_import',jobId,{academicYear:meta.academicYear,programCode:meta.programCode,gradeLevel:meta.gradeLevel,programVersion:meta.programVersion,authority:meta.authority,rowCount:enriched.length,validCount,invalidCount,sourceHash:hash});
 return json({ok:true,jobId,status,rowCount:enriched.length,validCount,invalidCount,sourceHash:hash,preview:enriched.slice(0,30)});
}

async function getImport(env:Env,id:string):Promise<Response>{const job=await one<any>(env.DB.prepare('SELECT * FROM curriculum_import_jobs WHERE id=?').bind(id));if(!job)return notFound('Müfredat aktarımı bulunamadı.');const rows=await all<any>(env.DB.prepare(`SELECT row_no,subject_code,grade_level,outcome_code,topic,subtopic,title,valid,issues_json FROM curriculum_import_rows WHERE job_id=? ORDER BY row_no LIMIT 500`).bind(id));return json({ok:true,job,rows:rows.map(r=>({...r,issues:r.issues_json?JSON.parse(r.issues_json):[]}))})}

async function commitImport(request:Request,env:Env,actor:AuthUser,id:string):Promise<Response>{
 const job=await one<any>(env.DB.prepare('SELECT * FROM curriculum_import_jobs WHERE id=?').bind(id));if(!job)return notFound('Müfredat aktarımı bulunamadı.');if(job.status==='COMMITTED')return apiError(409,'ALREADY_COMMITTED','Bu aktarım daha önce tamamlanmış.');if(job.invalid_count>0||job.status!=='READY')return badRequest('Hatalı satırlar varken aktarım tamamlanamaz.','CURRICULUM_IMPORT_HAS_ERRORS');
 const body=await request.json<{confirmedOfficial?:boolean}>();if(!body.confirmedOfficial)return badRequest('Resmî kaynak doğrulaması açıkça onaylanmalıdır.','OFFICIAL_CONFIRMATION_REQUIRED');if(!sourceAuthorityMatches(job.authority,job.source_url))return badRequest('Resmî kaynak alan adı doğrulanamadı.','OFFICIAL_SOURCE_DOMAIN_MISMATCH');
 const duplicate=await one(env.DB.prepare(`SELECT id FROM curriculum_versions WHERE academic_year=? AND program_code=? AND coalesce(grade_level,0)=coalesce(?,0) AND program_version=?`).bind(job.academic_year,job.program_code,job.grade_level,job.program_version));if(duplicate)return apiError(409,'CURRICULUM_VERSION_EXISTS','Hedef müfredat sürümü zaten oluşturulmuş.');
 const versionId=uuid('cv');await env.DB.prepare(`INSERT INTO curriculum_versions (id,academic_year,grade_level,program_version,authority,verified,source_url,program_code,source_title,source_published_at,verified_by,verified_at) VALUES (?,?,?,?,?,1,?,?,?,?,?,?)`).bind(versionId,job.academic_year,job.grade_level,job.program_version,job.authority,job.source_url,job.program_code,job.source_title,job.source_published_at,actor.id,new Date().toISOString()).run();
 const rows=await all<any>(env.DB.prepare('SELECT * FROM curriculum_import_rows WHERE job_id=? AND valid=1 ORDER BY row_no').bind(id));
 for(const r of rows)await env.DB.prepare(`INSERT INTO outcomes (id,curriculum_version_id,subject_id,grade_level,code,topic,subtopic,title,official,active) VALUES (?,?,?,?,?,?,?,?,1,1)`).bind(uuid('out'),versionId,r.subject_id,r.grade_level,r.outcome_code,r.topic,r.subtopic,r.title).run();
 await env.DB.prepare(`UPDATE curriculum_import_jobs SET status='COMMITTED',confirmed_official=1,curriculum_version_id=?,committed_by=?,committed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(versionId,actor.id,id).run();await audit(env.DB,actor.id,null,'CURRICULUM_IMPORT_COMMITTED','curriculum_version',versionId,{jobId:id,authority:job.authority,sourceUrl:job.source_url,sourceHash:job.source_file_hash,outcomeCount:rows.length});return json({ok:true,versionId,outcomeCount:rows.length});
}

async function versionDetail(env:Env,id:string):Promise<Response>{const version=await one<any>(env.DB.prepare(`SELECT cv.*,u.display_name verified_by_name FROM curriculum_versions cv LEFT JOIN users u ON u.id=cv.verified_by WHERE cv.id=?`).bind(id));if(!version)return notFound('Müfredat sürümü bulunamadı.');const outcomes=await all<any>(env.DB.prepare(`SELECT o.id,o.subject_id,s.code subject_code,s.name subject_name,o.grade_level,o.code,o.topic,o.subtopic,o.title,o.official,o.active FROM outcomes o JOIN subjects s ON s.id=o.subject_id WHERE o.curriculum_version_id=? ORDER BY s.name,o.topic,o.title`).bind(id));return json({ok:true,version,outcomes})}

export default {async fetch(request:Request,env:Env):Promise<Response>{const url=new URL(request.url);if(!url.pathname.startsWith('/api/curriculum-admin'))return worksheetApp.fetch(request,env);try{const actor=await requireSuper(env,request);if(actor instanceof Response)return actor;if(url.pathname==='/api/curriculum-admin/options'&&request.method==='GET')return options(env);if(url.pathname==='/api/curriculum-admin'&&request.method==='GET')return listVersions(env,url);if(url.pathname==='/api/curriculum-admin/import-preview'&&request.method==='POST')return previewImport(request,env,actor);const commit=url.pathname.match(/^\/api\/curriculum-admin\/imports\/([^/]+)\/commit$/);if(commit)return request.method==='POST'?commitImport(request,env,actor,commit[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');const imp=url.pathname.match(/^\/api\/curriculum-admin\/imports\/([^/]+)$/);if(imp)return request.method==='GET'?getImport(env,imp[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');const ver=url.pathname.match(/^\/api\/curriculum-admin\/versions\/([^/]+)$/);if(ver)return request.method==='GET'?versionDetail(env,ver[1]):apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');return notFound('Müfredat yönetim API yolu bulunamadı.')}catch(e){console.error('Curriculum admin error',e);return apiError(500,'SERVER_ERROR','Müfredat işlemi sırasında sunucu hatası oluştu.')}}} satisfies ExportedHandler<Env>;
