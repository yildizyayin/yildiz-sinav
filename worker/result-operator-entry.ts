import type { AuthUser,Env } from './types';
import { getAuthUser,hashPassword,verifyPassword } from './lib/auth';
import { all,audit,badRequest,forbidden,json,one,uuid } from './lib/db';

const OPERATOR_COOKIE='anunex_result_operator';
const SESSION_MS=8*60*60*1000;
const IDENTIFIER=/^[A-Za-z0-9._@+-]{3,100}$/;

async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function rawCookie(request:Request,name:string){for(const part of (request.headers.get('cookie')||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='))}return null}
function clientIp(request:Request){return request.headers.get('CF-Connecting-IP')||'local'}
function safeError(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
function generatedSecret(prefix='ANX'){return `${prefix}-${crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase()}`}
function normalizedLocation(value:unknown){return String(value||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('tr-TR')}

async function requireSuper(request:Request,env:Env):Promise<AuthUser|Response>{const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();return user}

async function createOperator(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({}));const displayName=String(body.displayName||'').trim().slice(0,120),identifier=String(body.identifier||'').trim().toLocaleLowerCase('tr-TR'),requestedPassword=String(body.password||'');const scopes=Array.isArray(body.scopes)?body.scopes:[];
 if(!displayName||!IDENTIFIER.test(identifier)||!scopes.length||scopes.length>50)return badRequest('Bayi/operatör adı, geçerli giriş bilgisi ve en az bir coğrafi kapsam zorunludur.');
 const cleanScopes=scopes.map((scope:any)=>({city:normalizedLocation(scope.city),district:normalizedLocation(scope.district)||null})).filter((scope:any)=>scope.city);
 if(!cleanScopes.length)return badRequest('En az bir il kapsamı zorunludur.');
 const password=requestedPassword||generatedSecret('ANX');if(password.length<10||password.length>128)return badRequest('Operatör parolası en az 10 karakter olmalıdır.');
 const encoded=await hashPassword(password),id=uuid('rop');
 try{
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO result_operators(id,display_name,identifier,password_hash,password_salt,created_by) VALUES(?,?,?,?,?,?)`).bind(id,displayName,identifier,encoded.hash,encoded.salt,user.id),
   ...cleanScopes.map((scope:any)=>env.DB.prepare(`INSERT INTO result_operator_scopes(id,operator_id,city,district,created_by) VALUES(?,?,?,?,?)`).bind(uuid('rosc'),id,scope.city,scope.district,user.id)),
  ]);
 }catch{return badRequest('Bu giriş bilgisine sahip bir sonuç operatörü zaten var veya kapsam kaydedilemedi.');}
 await audit(env.DB,user.id,null,'RESULT_OPERATOR_CREATED','result_operator',id,{displayName,identifier,scopes:cleanScopes});
 return json({ok:true,operator:{id,displayName,identifier,scopes:cleanScopes},oneTimePassword:requestedPassword?undefined:password},201);
}

async function listOperators(env:Env){
 const operators=await all<any>(env.DB.prepare(`SELECT id,display_name,identifier,status,failed_attempts,locked_until,created_at,updated_at FROM result_operators ORDER BY display_name`));
 const scopes=await all<any>(env.DB.prepare(`SELECT id,operator_id,city,district,status FROM result_operator_scopes ORDER BY city,district`));
 return json({ok:true,operators:operators.map(operator=>({...operator,scopes:scopes.filter(scope=>scope.operator_id===operator.id)}))});
}

async function replaceScopes(request:Request,env:Env,user:AuthUser,operatorId:string){
 const operator=await one<any>(env.DB.prepare(`SELECT id,display_name FROM result_operators WHERE id=?`).bind(operatorId));if(!operator)return safeError(404,'RESULT_OPERATOR_NOT_FOUND','Sonuç operatörü bulunamadı.');
 const body:any=await request.json().catch(()=>({})),scopes=Array.isArray(body.scopes)?body.scopes:[];if(!scopes.length||scopes.length>50)return badRequest('En az bir ve en fazla 50 coğrafi kapsam tanımlanabilir.');
 const clean=scopes.map((scope:any)=>({city:normalizedLocation(scope.city),district:normalizedLocation(scope.district)||null})).filter((scope:any)=>scope.city);if(!clean.length)return badRequest('Geçerli il kapsamı bulunamadı.');
 const current=await all<any>(env.DB.prepare(`SELECT id FROM result_operator_scopes WHERE operator_id=? AND status='ACTIVE'`).bind(operatorId));
 await env.DB.batch([...current.map(row=>env.DB.prepare(`UPDATE result_operator_scopes SET status='REVOKED' WHERE id=?`).bind(row.id)),...clean.map((scope:any)=>env.DB.prepare(`INSERT INTO result_operator_scopes(id,operator_id,city,district,created_by) VALUES(?,?,?,?,?)`).bind(uuid('rosc'),operatorId,scope.city,scope.district,user.id))]);
 await audit(env.DB,user.id,null,'RESULT_OPERATOR_SCOPE_REPLACED','result_operator',operatorId,{scopes:clean});return json({ok:true,operatorId,scopes:clean});
}

async function setOperatorStatus(request:Request,env:Env,user:AuthUser,operatorId:string){
 const body:any=await request.json().catch(()=>({})),status=String(body.status||'');if(!['ACTIVE','SUSPENDED','REVOKED'].includes(status))return badRequest('Operatör durumu geçersiz.');
 const result=await env.DB.prepare(`UPDATE result_operators SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status,operatorId).run();if(!result.meta.changes)return safeError(404,'RESULT_OPERATOR_NOT_FOUND','Sonuç operatörü bulunamadı.');
 if(status!=='ACTIVE')await env.DB.prepare(`UPDATE result_operator_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE operator_id=? AND revoked_at IS NULL`).bind(operatorId).run();
 await audit(env.DB,user.id,null,'RESULT_OPERATOR_STATUS_CHANGED','result_operator',operatorId,{status});return json({ok:true,operatorId,status});
}

async function operatorLogin(request:Request,env:Env){
 const body:any=await request.json().catch(()=>({})),identifier=String(body.identifier||'').trim().toLocaleLowerCase('tr-TR'),password=String(body.password||'');if(!IDENTIFIER.test(identifier)||!password)return safeError(401,'OPERATOR_LOGIN_FAILED','Giriş bilgileri eşleşmedi.');
 const row=await one<any>(env.DB.prepare(`SELECT * FROM result_operators WHERE identifier=?`).bind(identifier));if(!row||row.status!=='ACTIVE'||(row.locked_until&&new Date(row.locked_until).getTime()>Date.now()))return safeError(401,'OPERATOR_LOGIN_FAILED','Giriş bilgileri eşleşmedi.');
 const ok=await verifyPassword(password,row.password_salt,row.password_hash,100000);if(!ok){const failures=Number(row.failed_attempts||0)+1;await env.DB.prepare(`UPDATE result_operators SET failed_attempts=?,locked_until=CASE WHEN ?>=8 THEN datetime('now','+15 minutes') ELSE locked_until END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(failures,failures,row.id).run();return safeError(401,'OPERATOR_LOGIN_FAILED','Giriş bilgileri eşleşmedi.');}
 const raw=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha256(raw),ipHash=await sha256(clientIp(request)),expires=new Date(Date.now()+SESSION_MS).toISOString();await env.DB.batch([env.DB.prepare(`UPDATE result_operators SET failed_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id),env.DB.prepare(`INSERT INTO result_operator_sessions(id,operator_id,token_hash,ip_hash,expires_at) VALUES(?,?,?,?,?)`).bind(uuid('rops'),row.id,tokenHash,ipHash,expires),env.DB.prepare(`INSERT INTO result_operator_audit(id,operator_id,action,ip_hash,metadata_json) VALUES(?,?,'LOGIN',?,?)`).bind(uuid('roa'),row.id,ipHash,JSON.stringify({identifier}))]);
 const secure=env.ENVIRONMENT==='production'?'; Secure':'';return json({ok:true,operator:{id:row.id,displayName:row.display_name}},200,{'Set-Cookie':`${OPERATOR_COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS/1000}${secure}`});
}

async function currentOperator(request:Request,env:Env){
 const raw=rawCookie(request,OPERATOR_COOKIE);if(!raw)return null;const tokenHash=await sha256(raw),ipHash=await sha256(clientIp(request));return one<any>(env.DB.prepare(`SELECT o.id,o.display_name,o.identifier,o.status,s.id session_id FROM result_operator_sessions s JOIN result_operators o ON o.id=s.operator_id WHERE s.token_hash=? AND s.ip_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND o.status='ACTIVE' LIMIT 1`).bind(tokenHash,ipHash));
}

async function operatorMe(request:Request,env:Env){const operator=await currentOperator(request,env);if(!operator)return safeError(401,'RESULT_OPERATOR_SESSION_REQUIRED','Bayi sonuç oturumu gerekli.');const scopes=await all<any>(env.DB.prepare(`SELECT city,district FROM result_operator_scopes WHERE operator_id=? AND status='ACTIVE' ORDER BY city,district`).bind(operator.id));return json({ok:true,operator:{id:operator.id,displayName:operator.display_name,identifier:operator.identifier,scopes}})}
async function operatorLogout(request:Request,env:Env){const operator=await currentOperator(request,env);if(operator)await env.DB.prepare(`UPDATE result_operator_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(operator.session_id).run();return json({ok:true},200,{'Set-Cookie':`${OPERATOR_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`})}

async function operatorInstitutions(request:Request,env:Env){
 const operator=await currentOperator(request,env);if(!operator)return safeError(401,'RESULT_OPERATOR_SESSION_REQUIRED','Bayi sonuç oturumu gerekli.');const url=new URL(request.url),q=String(url.searchParams.get('q')||'').trim(),like=`%${q}%`;
 const rows=await all<any>(env.DB.prepare(`SELECT n.meb_code,n.name,n.city,n.district,n.institution_type,n.ownership,n.education_level FROM national_institution_directory n WHERE n.status='ACTIVE' AND EXISTS(SELECT 1 FROM result_operator_scopes s WHERE s.operator_id=? AND s.status='ACTIVE' AND UPPER(s.city)=UPPER(n.city) AND (s.district IS NULL OR s.district='' OR UPPER(s.district)=UPPER(n.district))) AND (?='' OR n.normalized_name LIKE ? OR n.meb_code LIKE ? OR n.district LIKE ?) ORDER BY n.city,n.district,n.name LIMIT 100`).bind(operator.id,q,like,`${q}%`,like));
 return json({ok:true,institutions:rows.map(row=>({code:row.meb_code,name:row.name,city:row.city,district:row.district,type:row.institution_type,ownership:row.ownership,level:row.education_level}))});
}

async function operatorExams(request:Request,env:Env){
 const operator=await currentOperator(request,env);if(!operator)return safeError(401,'RESULT_OPERATOR_SESSION_REQUIRED','Bayi sonuç oturumu gerekli.');
 const rows=await all<any>(env.DB.prepare(`SELECT ea.id administration_id,ea.status administration_status,e.id exam_id,e.title,e.exam_type,e.grade_level,e.exam_date,e.academic_year,e.publisher_name,e.catalog_code FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.channel='RESULT_NETWORK' AND e.owner_type='CENTRAL' AND e.status IN ('ACTIVE','CLOSED') AND ea.status NOT IN ('ARCHIVED','PURGED') ORDER BY e.exam_date DESC,e.created_at DESC LIMIT 250`));return json({ok:true,exams:rows});
}

async function operatorCanAccessInstitution(env:Env,operatorId:string,mebCode:string){return one<any>(env.DB.prepare(`SELECT n.* FROM national_institution_directory n WHERE n.meb_code=? AND n.status='ACTIVE' AND EXISTS(SELECT 1 FROM result_operator_scopes s WHERE s.operator_id=? AND s.status='ACTIVE' AND UPPER(s.city)=UPPER(n.city) AND (s.district IS NULL OR s.district='' OR UPPER(s.district)=UPPER(n.district)))`).bind(mebCode,operatorId))}

async function attachInstitution(request:Request,env:Env,administrationId:string){
 const operator=await currentOperator(request,env);if(!operator)return safeError(401,'RESULT_OPERATOR_SESSION_REQUIRED','Bayi sonuç oturumu gerekli.');const body:any=await request.json().catch(()=>({})),mebCode=String(body.mebCode||'').trim();if(!/^\d{5,12}$/.test(mebCode))return badRequest('MEB kurum kodu geçersiz.');
 const directory=await operatorCanAccessInstitution(env,operator.id,mebCode);if(!directory)return safeError(403,'RESULT_OPERATOR_GEO_SCOPE_DENIED','Bu kurum bayi hizmet bölgenizin dışında.');const administration=await one<any>(env.DB.prepare(`SELECT ea.id FROM exam_administrations ea JOIN exams e ON e.id=ea.exam_id WHERE ea.id=? AND ea.channel='RESULT_NETWORK' AND e.owner_type='CENTRAL' AND e.status IN ('ACTIVE','CLOSED') AND ea.status NOT IN ('ARCHIVED','PURGED')`).bind(administrationId));if(!administration)return safeError(404,'RESULT_ADMINISTRATION_NOT_FOUND','Değerlendirmeye açık merkezi sınav bulunamadı.');
 const existing=await one<any>(env.DB.prepare(`SELECT id,result_operator_id FROM result_network_institutions WHERE administration_id=? AND meb_code=?`).bind(administrationId,mebCode));if(existing&&existing.result_operator_id&&existing.result_operator_id!==operator.id)return safeError(409,'RESULT_INSTITUTION_ALREADY_ASSIGNED','Bu kurum ve sınav başka bir sonuç operatörü tarafından işleme alınmış.');
 const id=existing?.id||uuid('rni');if(existing)await env.DB.prepare(`UPDATE result_network_institutions SET result_operator_id=?,display_name_snapshot=?,city_snapshot=?,district_snapshot=?,access_status='ACTIVE' WHERE id=?`).bind(operator.id,directory.name,directory.city,directory.district,id).run();else await env.DB.prepare(`INSERT INTO result_network_institutions(id,administration_id,meb_code,result_operator_id,display_name_snapshot,city_snapshot,district_snapshot) VALUES(?,?,?,?,?,?,?)`).bind(id,administrationId,mebCode,operator.id,directory.name,directory.city,directory.district).run();
 const ipHash=await sha256(clientIp(request));await env.DB.prepare(`INSERT INTO result_operator_audit(id,operator_id,action,meb_code,administration_id,ip_hash,metadata_json) VALUES(?,?,'INSTITUTION_ATTACHED',?,?,?,?)`).bind(uuid('roa'),operator.id,mebCode,administrationId,ipHash,JSON.stringify({city:directory.city,district:directory.district})).run();return json({ok:true,id,administrationId,institution:{code:mebCode,name:directory.name,city:directory.city,district:directory.district}},201);
}

async function issueInstitutionKey(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({})),mebCode=String(body.mebCode||'').trim(),label=String(body.label||'').trim().slice(0,120);if(!/^\d{5,12}$/.test(mebCode))return badRequest('MEB kurum kodu zorunludur.');const institution=await one<any>(env.DB.prepare(`SELECT meb_code,name,city,district FROM national_institution_directory WHERE meb_code=? AND status='ACTIVE'`).bind(mebCode));if(!institution)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','MEB referans kurum kaydı bulunamadı.');
 const raw=generatedSecret('KRM'),keyHash=await sha256(raw),id=uuid('rik');await env.DB.prepare(`INSERT INTO result_institution_keys(id,meb_code,label,key_hash,key_prefix,issued_by) VALUES(?,?,?,?,?,?)`).bind(id,mebCode,label||institution.name,keyHash,raw.slice(0,7),user.id).run();await audit(env.DB,user.id,null,'RESULT_INSTITUTION_KEY_ISSUED','national_institution_directory',mebCode,{keyId:id,label:label||institution.name});return json({ok:true,key:{id,mebCode,label:label||institution.name,prefix:raw.slice(0,7)},oneTimeKey:raw},201);
}

async function revokeInstitutionKey(env:Env,user:AuthUser,id:string){const result=await env.DB.prepare(`UPDATE result_institution_keys SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'`).bind(id).run();if(!result.meta.changes)return safeError(404,'RESULT_INSTITUTION_KEY_NOT_FOUND','Aktif kurum anahtarı bulunamadı.');await audit(env.DB,user.id,null,'RESULT_INSTITUTION_KEY_REVOKED','result_institution_key',id,{});return json({ok:true,id,status:'REVOKED'})}

export async function handleResultOperatorRequest(request:Request,env:Env):Promise<Response|null>{
 const url=new URL(request.url),p=url.pathname;
 if(p==='/api/result-operator/login'&&request.method==='POST')return operatorLogin(request,env);
 if(p==='/api/result-operator/me'&&request.method==='GET')return operatorMe(request,env);
 if(p==='/api/result-operator/logout'&&request.method==='POST')return operatorLogout(request,env);
 if(p==='/api/result-operator/institutions'&&request.method==='GET')return operatorInstitutions(request,env);
 if(p==='/api/result-operator/exams'&&request.method==='GET')return operatorExams(request,env);
 const attach=p.match(/^\/api\/result-operator\/administrations\/([^/]+)\/institutions$/);if(attach&&request.method==='POST')return attachInstitution(request,env,attach[1]);
 if(p==='/api/admin/result-operators'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return listOperators(env)}
 if(p==='/api/admin/result-operators'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return createOperator(request,env,user)}
 const scopes=p.match(/^\/api\/admin\/result-operators\/([^/]+)\/scopes$/);if(scopes&&request.method==='PUT'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return replaceScopes(request,env,user,scopes[1])}
 const status=p.match(/^\/api\/admin\/result-operators\/([^/]+)\/status$/);if(status&&request.method==='PATCH'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return setOperatorStatus(request,env,user,status[1])}
 if(p==='/api/admin/result-institution-keys'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return issueInstitutionKey(request,env,user)}
 const revoke=p.match(/^\/api\/admin\/result-institution-keys\/([^/]+)\/revoke$/);if(revoke&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return revokeInstitutionKey(env,user,revoke[1])}
 return null;
}
