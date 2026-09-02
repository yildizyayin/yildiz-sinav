import type { AuthUser,Env } from './types';
import { getAuthUser } from './lib/auth';
import { all,audit,badRequest,forbidden,json,normalizeName,one,uuid } from './lib/db';

function safeError(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
async function requireSuper(request:Request,env:Env):Promise<AuthUser|Response>{const user=await getAuthUser(env,request);if(!user)return safeError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.');if(user.role!=='SUPER_ADMIN')return forbidden();return user}
function clean(value:unknown,max=180){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max)}

async function listDirectory(request:Request,env:Env){
 const url=new URL(request.url),q=clean(url.searchParams.get('q'),120),city=clean(url.searchParams.get('city'),80),district=clean(url.searchParams.get('district'),80),status=clean(url.searchParams.get('status'),20),limit=Math.min(200,Math.max(10,Number(url.searchParams.get('limit')||100)||100));const like=`%${normalizeName(q)}%`;
 const rows=await all<any>(env.DB.prepare(`
  SELECT n.meb_code,n.name,n.city,n.district,n.institution_type,n.ownership,n.education_level,n.official_url,n.source_url,n.source_updated_at,n.status,n.synced_at,
    a.id account_id,a.identifier account_identifier,a.status account_status,a.can_evaluate
  FROM national_institution_directory n
  LEFT JOIN result_institution_accounts a ON a.meb_code=n.meb_code
  WHERE (?='' OR n.normalized_name LIKE ? OR n.meb_code LIKE ?)
    AND (?='' OR UPPER(n.city)=UPPER(?))
    AND (?='' OR UPPER(n.district)=UPPER(?))
    AND (?='' OR n.status=?)
  ORDER BY n.city,n.district,n.name LIMIT ?
 `).bind(q,like,`${q}%`,city,city,district,district,status,status,limit));
 return json({ok:true,institutions:rows});
}

async function createDirectoryInstitution(request:Request,env:Env,user:AuthUser){
 const body:any=await request.json().catch(()=>({})),mebCode=clean(body.mebCode,12),name=clean(body.name),city=clean(body.city,80),district=clean(body.district,80),institutionType=clean(body.institutionType,100)||null,ownership=['PUBLIC','PRIVATE'].includes(String(body.ownership))?String(body.ownership):null,educationLevel=clean(body.educationLevel,80)||null,officialUrl=clean(body.officialUrl,300)||null;
 if(!/^\d{5,12}$/.test(mebCode)||!name||!city||!district)return badRequest('MEB kurum kodu, kurum adı, il ve ilçe zorunludur.');
 const existing=await one<any>(env.DB.prepare(`SELECT meb_code FROM national_institution_directory WHERE meb_code=?`).bind(mebCode));if(existing)return badRequest('Bu MEB kurum kodu zaten kayıtlı.');
 const sourceUrl='https://sonuc.anunex.com/admin/manual';await env.DB.prepare(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,institution_type,ownership,education_level,official_url,source_url,source_updated_at,status,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'ACTIVE',CURRENT_TIMESTAMP)`).bind(mebCode,name,normalizeName(name),city,district,institutionType,ownership,educationLevel,officialUrl,sourceUrl).run();
 const syncId=uuid('idsync');await env.DB.prepare(`INSERT INTO institution_directory_sync_runs(id,source_type,source_url,status,rows_seen,rows_upserted,completed_at,created_by,summary_json) VALUES(?,'MANUAL_VERIFIED',?,'COMPLETED',1,1,CURRENT_TIMESTAMP,?,?)`).bind(syncId,sourceUrl,user.id,JSON.stringify({mebCode,action:'CREATE'})).run();await audit(env.DB,user.id,null,'RESULT_DIRECTORY_INSTITUTION_CREATED','national_institution_directory',mebCode,{name,city,district});return json({ok:true,mebCode},201);
}

async function updateDirectoryInstitution(request:Request,env:Env,user:AuthUser,mebCode:string){
 const current=await one<any>(env.DB.prepare(`SELECT * FROM national_institution_directory WHERE meb_code=?`).bind(mebCode));if(!current)return safeError(404,'DIRECTORY_INSTITUTION_NOT_FOUND','Kurum kaydı bulunamadı.');const body:any=await request.json().catch(()=>({}));const name=body.name==null?current.name:clean(body.name),city=body.city==null?current.city:clean(body.city,80),district=body.district==null?current.district:clean(body.district,80),institutionType=body.institutionType==null?current.institution_type:(clean(body.institutionType,100)||null),ownership=body.ownership==null?current.ownership:(['PUBLIC','PRIVATE'].includes(String(body.ownership))?String(body.ownership):null),educationLevel=body.educationLevel==null?current.education_level:(clean(body.educationLevel,80)||null),officialUrl=body.officialUrl==null?current.official_url:(clean(body.officialUrl,300)||null),status=body.status==null?current.status:String(body.status);
 if(!name||!city||!district||!['ACTIVE','CLOSED','UNVERIFIED'].includes(status))return badRequest('Kurum adı, il, ilçe veya durum bilgisi geçersiz.');
 await env.DB.prepare(`UPDATE national_institution_directory SET name=?,normalized_name=?,city=?,district=?,institution_type=?,ownership=?,education_level=?,official_url=?,status=?,source_url='https://sonuc.anunex.com/admin/manual',source_updated_at=CURRENT_TIMESTAMP,synced_at=CURRENT_TIMESTAMP WHERE meb_code=?`).bind(name,normalizeName(name),city,district,institutionType,ownership,educationLevel,officialUrl,status,mebCode).run();
 await env.DB.prepare(`UPDATE institutions SET name=?,city=?,district=?,status=CASE WHEN ?='ACTIVE' THEN 'ACTIVE' ELSE 'PASSIVE' END,updated_at=CURRENT_TIMESTAMP WHERE code=? AND result_network_only=1`).bind(name,city,district,status,`RN-${mebCode}`).run();await audit(env.DB,user.id,null,'RESULT_DIRECTORY_INSTITUTION_UPDATED','national_institution_directory',mebCode,{name,city,district,status});return json({ok:true,mebCode,status});
}

export async function handleResultDirectoryAdminRequest(request:Request,env:Env):Promise<Response|null>{
 const url=new URL(request.url),p=url.pathname;
 if(p==='/api/admin/result-institutions'&&request.method==='GET'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return listDirectory(request,env)}
 if(p==='/api/admin/result-institutions'&&request.method==='POST'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return createDirectoryInstitution(request,env,user)}
 const edit=p.match(/^\/api\/admin\/result-institutions\/(\d{5,12})$/);if(edit&&request.method==='PATCH'){const user=await requireSuper(request,env);if(user instanceof Response)return user;return updateDirectoryInstitution(request,env,user,edit[1])}
 return null;
}
