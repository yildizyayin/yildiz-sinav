import app from './nibiru-license-entry';
import type { AuthUser,Env } from './types';
import { currentSessionTokenHash,getAuthUser,hashPassword,revokeSession,verifyPassword } from './lib/auth';
import { all,audit,badRequest,forbidden,json,one,uuid } from './lib/db';
import { getEffectiveLicense } from './lib/license';

const PACKAGE_CODES=new Set(['STANDARD','PREMIUM','CUSTOM']);

function fail(status:number,code:string,message:string){return json({ok:false,error:{code,message}},status)}
function randomPassword(){
 const bytes=crypto.getRandomValues(new Uint8Array(18));
 const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
 return [...bytes].map(value=>chars[value%chars.length]).join('');
}
function normalizeCode(value:string){return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24)}

async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{return (await getAuthUser(env,request))||fail(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}
function isResponse(value:AuthUser|Response):value is Response{return value instanceof Response}

async function catalog(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const [packages,features,mappings]=await Promise.all([
  all<any>(env.DB.prepare(`SELECT code,name,description FROM product_packages WHERE active=1 ORDER BY sort_order`)),
  all<any>(env.DB.prepare(`SELECT feature_key,label,stage FROM platform_features WHERE feature_key<>'STANDARD_READINESS' ORDER BY stage,label`)),
  all<any>(env.DB.prepare(`SELECT package_code,feature_key FROM product_package_features WHERE enabled=1`)),
 ]);
 return json({ok:true,packages,features,mappings});
}

async function packageFeatures(env:Env,packageCode:string,selected:string[]){
 const valid=await all<{feature_key:string}>(env.DB.prepare(`SELECT feature_key FROM platform_features WHERE feature_key<>'STANDARD_READINESS'`));
 const allowed=new Set(valid.map(item=>item.feature_key));
 if(packageCode==='CUSTOM')return [...new Set(['EXAM_CENTER',...selected])].filter(key=>allowed.has(key));
 const rows=await all<{feature_key:string}>(env.DB.prepare(`SELECT feature_key FROM product_package_features WHERE package_code=? AND enabled=1`).bind(packageCode));
 return rows.map(item=>item.feature_key);
}

async function createInstitution(request:Request,env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden('Kurum oluşturmayı yalnız Süper Admin kullanabilir.');
 const body=await request.json<any>().catch(()=>null);if(!body)return badRequest('Kurum bilgileri geçersiz.');
 const name=String(body.name||'').trim().slice(0,160),code=normalizeCode(String(body.code||''));
 const packageCode=String(body.packageCode||'STANDARD').toUpperCase();
 const academicYear=String(body.academicYear||'2026-2027').trim().slice(0,20);
 const managerName=String(body.managerName||'').trim().slice(0,120),managerEmail=String(body.managerEmail||'').trim().toLowerCase().slice(0,190);
 if(name.length<3)return badRequest('Kurum adı en az 3 karakter olmalıdır.');
 if(code.length<3)return badRequest('Kurum kodu en az 3 karakter olmalıdır.');
 if(!PACKAGE_CODES.has(packageCode))return badRequest('Geçersiz paket seçimi.');
 if(!/^\d{4}-\d{4}$/.test(academicYear))return badRequest('Akademik yıl 2026-2027 biçiminde olmalıdır.');
 if(managerName.length<3||!/^\S+@\S+\.\S+$/.test(managerEmail))return badRequest('Kurum yöneticisi adı ve geçerli e-posta zorunludur.');
 if(await one(env.DB.prepare(`SELECT id FROM institutions WHERE code=?`).bind(code)))return fail(409,'INSTITUTION_CODE_EXISTS','Bu kurum kodu zaten kullanılıyor.');
 if(await one(env.DB.prepare(`SELECT id FROM users WHERE lower(email)=?`).bind(managerEmail)))return fail(409,'MANAGER_EMAIL_EXISTS','Bu e-posta başka bir kullanıcı tarafından kullanılıyor.');

 const selected=await packageFeatures(env,packageCode,Array.isArray(body.selectedFeatures)?body.selectedFeatures.map(String):[]);
 if(!selected.includes('EXAM_CENTER'))return badRequest('Sınav Merkezi zorunlu çekirdek modüldür.');
 const allFeatures=await all<{feature_key:string}>(env.DB.prepare(`SELECT feature_key FROM platform_features`));
 const enabled=new Set(selected),institutionId=uuid('inst'),seasonId=uuid('season'),managerId=uuid('usr'),licenseId=uuid('lic');
 const password=String(body.temporaryPassword||randomPassword());if(password.length<12)return badRequest('Geçici şifre en az 12 karakter olmalıdır.');
 const passwordData=await hashPassword(password),now=new Date(),expires=new Date(now.getTime()+7*86400000);
 const statements:D1PreparedStatement[]=[
  env.DB.prepare(`INSERT INTO institutions(id,name,code,city,district,contact_name,contact_phone,contact_email,status,demo_mode) VALUES(?,?,?,?,?,?,?,?,'ACTIVE',1)`).bind(institutionId,name,code,String(body.city||'').trim()||null,String(body.district||'').trim()||null,String(body.contactName||managerName).trim()||null,String(body.contactPhone||'').trim()||null,String(body.contactEmail||managerEmail).trim().toLowerCase()||null),
  env.DB.prepare(`INSERT INTO institution_seasons(id,institution_id,academic_year,status,started_at) VALUES(?,?,?,'ACTIVE',?)`).bind(seasonId,institutionId,academicYear,now.toISOString()),
  env.DB.prepare(`INSERT INTO users(id,institution_id,role,display_name,email,username,password_hash,password_salt,password_iterations,password_algo,active,must_change_password) VALUES(?,?,'INSTITUTION_MANAGER',?,?,?,?,?,?,?,'PBKDF2-SHA256-v1',1,1)`).bind(managerId,institutionId,managerName,managerEmail,managerEmail,passwordData.hash,passwordData.salt,passwordData.iterations),
  env.DB.prepare(`INSERT INTO institution_onboarding_profiles(institution_id,package_code,onboarding_status,address,website,network_name,created_by) VALUES(?,?,'MANAGER_CREATED',?,?,?,?)`).bind(institutionId,packageCode,String(body.address||'').trim()||null,String(body.website||'').trim()||null,String(body.networkName||'').trim()||null,user.id),
  env.DB.prepare(`INSERT INTO institution_licenses(id,institution_id,plan_code,status,trial_started_at,trial_expires_at,note,created_by) VALUES(?,?,'TRIAL_7_DAY','ACTIVE',?,?,?,?)`).bind(licenseId,institutionId,now.toISOString(),expires.toISOString(),`${packageCode} paket · 7 günlük demo`,user.id),
  env.DB.prepare(`INSERT INTO institution_license_events(id,institution_id,license_id,event_type,actor_user_id,details_json) VALUES(?,?,?,'TRIAL_STARTED',?,?)`).bind(uuid('licev'),institutionId,licenseId,user.id,JSON.stringify({days:7,expires:expires.toISOString(),packageCode,features:selected,source:'ONBOARDING'})),
 ];
 for(const feature of allFeatures)statements.push(env.DB.prepare(`INSERT INTO institution_feature_overrides(institution_id,feature_key,enabled) VALUES(?,?,?)`).bind(institutionId,feature.feature_key,enabled.has(feature.feature_key)?1:0));
 await env.DB.batch(statements);
 await audit(env.DB,user.id,institutionId,'INSTITUTION_ONBOARDED','institution',institutionId,{packageCode,academicYear,features:selected,trialExpiresAt:expires.toISOString(),managerId});
 return json({ok:true,institution:{id:institutionId,name,code},license:await getEffectiveLicense(env,institutionId),packageCode,features:selected,manager:{id:managerId,name:managerName,email:managerEmail,temporaryPassword:password,passwordMustChange:true}},201);
}

async function enrichedLicenses(env:Env,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const rows=await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.status,i.demo_mode,p.package_code,p.onboarding_status,p.annual_consent_status,p.annual_consent_at,(SELECT count(DISTINCT se.student_id) FROM student_enrollments se WHERE se.institution_id=i.id AND se.status='ACTIVE') student_count FROM institutions i LEFT JOIN institution_onboarding_profiles p ON p.institution_id=i.id ORDER BY i.name`));
 const licenses=[];for(const row of rows)licenses.push({...row,license:await getEffectiveLicense(env,row.id)});
 return json({ok:true,licenses});
}

async function annualConsent(request:Request,env:Env,user:AuthUser){
 if(user.role!=='INSTITUTION_MANAGER'||!user.institution_id)return forbidden('Yıllık lisans kararını kurum yöneticisi verebilir.');
 const body=await request.json<{approved?:boolean;note?:string}>().catch(()=>({} as {approved?:boolean;note?:string}));
 const status=body.approved?'APPROVED':'DECLINED';
 await env.DB.prepare(`UPDATE institution_onboarding_profiles SET annual_consent_status=?,annual_consent_by=?,annual_consent_at=CURRENT_TIMESTAMP,annual_consent_note=?,updated_at=CURRENT_TIMESTAMP WHERE institution_id=?`).bind(status,user.id,String(body.note||'').slice(0,1000)||null,user.institution_id).run();
 await audit(env.DB,user.id,user.institution_id,'ANNUAL_LICENSE_CONSENT','institution',user.institution_id,{status,note:String(body.note||'').slice(0,1000)||null});
 return json({ok:true,status});
}

async function onboardingStatus(env:Env,user:AuthUser){
 if(!user.institution_id)return json({ok:true,onboarding:null,license:null});
 const onboarding=await one<any>(env.DB.prepare(`SELECT package_code,onboarding_status,annual_consent_status,annual_consent_at,annual_consent_note FROM institution_onboarding_profiles WHERE institution_id=?`).bind(user.institution_id));
 return json({ok:true,onboarding,license:await getEffectiveLicense(env,user.institution_id)});
}

async function accountSessions(request:Request,env:Env,user:AuthUser){
 const currentHash=await currentSessionTokenHash(request);
 const rows=await all<any>(env.DB.prepare(`SELECT id,token_hash,created_at,expires_at,revoked_at,user_agent FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).bind(user.id));
 return json({ok:true,sessions:rows.map(row=>({id:row.id,createdAt:row.created_at,expiresAt:row.expires_at,revokedAt:row.revoked_at,userAgent:row.user_agent||'Bilinmeyen cihaz',current:row.token_hash===currentHash,active:!row.revoked_at&&new Date(row.expires_at).getTime()>Date.now()}))});
}

async function changePassword(request:Request,env:Env,user:AuthUser){
 const body=await request.json<{currentPassword?:string;newPassword?:string}>().catch(()=>({} as {currentPassword?:string;newPassword?:string}));
 const current=String(body.currentPassword||''),next=String(body.newPassword||'');
 if(next.length<12||!/[A-ZÇĞİÖŞÜ]/.test(next)||!/[a-zçğıöşü]/.test(next)||!/[0-9]/.test(next))return badRequest('Yeni şifre en az 12 karakter; büyük harf, küçük harf ve rakam içermelidir.');
 const row=await one<any>(env.DB.prepare(`SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?`).bind(user.id));
 if(!row||!await verifyPassword(current,row.password_salt,row.password_hash,row.password_iterations))return fail(400,'CURRENT_PASSWORD_INVALID','Mevcut şifreniz yanlış.');
 const password=await hashPassword(next),currentHash=await currentSessionTokenHash(request);
 await env.DB.batch([
  env.DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_algo='PBKDF2-SHA256-v1',must_change_password=0,password_changed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(password.hash,password.salt,password.iterations,user.id),
  env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL AND token_hash<>?`).bind(user.id,currentHash||''),
 ]);
 await audit(env.DB,user.id,user.institution_id,'PASSWORD_CHANGED','user',user.id,{otherSessionsRevoked:true});
 return json({ok:true,message:'Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı.'});
}

async function revokeAccountSession(request:Request,env:Env,user:AuthUser,sessionId:string){
 const row=await one<any>(env.DB.prepare(`SELECT id,token_hash FROM sessions WHERE id=? AND user_id=?`).bind(sessionId,user.id));if(!row)return fail(404,'SESSION_NOT_FOUND','Oturum bulunamadı.');
 const currentHash=await currentSessionTokenHash(request);
 if(row.token_hash===currentHash)return revokeSession(env,request);
 await env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND revoked_at IS NULL`).bind(sessionId,user.id).run();
 await audit(env.DB,user.id,user.institution_id,'SESSION_REVOKED','session',sessionId,{current:false});
 return json({ok:true,current:false});
}

async function revokeAllAccountSessions(request:Request,env:Env,user:AuthUser){
 await env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL`).bind(user.id).run();
 await audit(env.DB,user.id,user.institution_id,'ALL_SESSIONS_REVOKED','user',user.id,{});
 return revokeSession(env,request);
}

async function enforceConsent(request:Request,env:Env,ctx:ExecutionContext,user:AuthUser){
 if(user.role!=='SUPER_ADMIN')return forbidden();
 const body=await request.clone().json<{institutionId?:string}>().catch(()=>({} as {institutionId?:string}));if(!body.institutionId)return badRequest('Kurum seçilmelidir.');
 const license=await getEffectiveLicense(env,body.institutionId);
 if(license.planCode==='TRIAL_7_DAY'){
  const profile=await one<{annual_consent_status:string}>(env.DB.prepare(`SELECT annual_consent_status FROM institution_onboarding_profiles WHERE institution_id=?`).bind(body.institutionId));
  if(profile&&profile.annual_consent_status!=='APPROVED')return fail(409,'ANNUAL_CONSENT_REQUIRED','Kurum yıllık lisans dönüşümünü henüz onaylamadı.');
 }
 return app.fetch(request,env,ctx);
}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const path=new URL(request.url).pathname;
 if(path==='/api/admin/onboarding/catalog'&&request.method==='GET'){
  const user=await requireUser(env,request);return isResponse(user)?user:catalog(env,user);
 }
 if(path==='/api/institutions'&&request.method==='POST'){
  const user=await requireUser(env,request);return isResponse(user)?user:createInstitution(request,env,user);
 }
 if(path==='/api/admin/licenses'&&request.method==='GET'){
  const user=await requireUser(env,request);return isResponse(user)?user:enrichedLicenses(env,user);
 }
 if(path==='/api/license/annual-consent'&&request.method==='POST'){
  const user=await requireUser(env,request);return isResponse(user)?user:annualConsent(request,env,user);
 }
 if(path==='/api/license/onboarding'&&request.method==='GET'){
  const user=await requireUser(env,request);return isResponse(user)?user:onboardingStatus(env,user);
 }
 if(path==='/api/auth/sessions'&&request.method==='GET'){
  const user=await requireUser(env,request);return isResponse(user)?user:accountSessions(request,env,user);
 }
 const sessionMatch=path.match(/^\/api\/auth\/sessions\/([^/]+)$/);
 if(sessionMatch&&request.method==='DELETE'){
  const user=await requireUser(env,request);return isResponse(user)?user:revokeAccountSession(request,env,user,sessionMatch[1]);
 }
 if(path==='/api/auth/sessions/revoke-all'&&request.method==='POST'){
  const user=await requireUser(env,request);return isResponse(user)?user:revokeAllAccountSessions(request,env,user);
 }
 if(path==='/api/auth/change-password'&&request.method==='POST'){
  const user=await requireUser(env,request);return isResponse(user)?user:changePassword(request,env,user);
 }
 if(path==='/api/admin/licenses/annual'&&request.method==='POST'){
  const user=await requireUser(env,request);return isResponse(user)?user:enforceConsent(request,env,ctx,user);
 }
 return app.fetch(request,env,ctx);
}} satisfies ExportedHandler<Env>;
