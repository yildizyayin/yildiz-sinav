import app from './school-operations-entry';
import type { AuthUser, CapacityJobMessage, Env, Role } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, methodNotAllowed, one, uuid } from './lib/db';

const PANEL_ROLES: Role[]=['INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT'];
const HEX=/^#[0-9A-F]{6}$/i;
export function canManagePanelExperience(role:Role){return role==='SUPER_ADMIN'}
export function validPanelAccent(value:string){return HEX.test(value)}
export function validSpecialDayWindow(startsAt:string,endsAt:string){const start=new Date(startsAt),end=new Date(endsAt);return !Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime())&&end>start}

function unauthenticated(){return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Oturum açmanız gerekiyor.'}},401)}
async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{return await getAuthUser(env,request)||unauthenticated()}
async function requireSuperAdmin(env:Env,request:Request):Promise<AuthUser|Response>{const user=await requireUser(env,request);if(user instanceof Response)return user;return canManagePanelExperience(user.role)?user:forbidden('Tema ve özel gün yönetimini yalnız Süper Admin yapabilir.')}

async function currentExperience(env:Env,user:AuthUser){
  const themes=user.role==='SUPER_ADMIN'
    ? await all<any>(env.DB.prepare(`SELECT theme_key,name,description,is_standard FROM panel_themes WHERE active=1 ORDER BY sort_order,name`))
    : await all<any>(env.DB.prepare(`SELECT DISTINCT t.theme_key,t.name,t.description,t.is_standard FROM panel_themes t LEFT JOIN institution_panel_theme_access a ON a.theme_key=t.theme_key AND a.institution_id=? AND a.role=? AND a.enabled=1 WHERE t.active=1 AND (t.is_standard=1 OR a.theme_key IS NOT NULL) ORDER BY t.sort_order,t.name`).bind(user.institution_id,user.role));
  const specialDay=await one<any>(env.DB.prepare(`SELECT id,title,short_message,theme_key,accent_color,starts_at,ends_at FROM special_day_experiences WHERE active=1 AND datetime(starts_at)<=CURRENT_TIMESTAMP AND datetime(ends_at)>CURRENT_TIMESTAMP AND (institution_id IS NULL OR institution_id=?) AND (role IS NULL OR role=?) ORDER BY priority DESC,created_at DESC LIMIT 1`).bind(user.institution_id,user.role));
  return json({ok:true,defaultTheme:'ANUNEX_STANDARD',allowedThemes:themes,specialDay});
}

async function adminOverview(env:Env){
  const [themes,access,campaigns]=await Promise.all([
    all<any>(env.DB.prepare(`SELECT * FROM panel_themes ORDER BY sort_order,name`)),
    all<any>(env.DB.prepare(`SELECT a.*,i.name institution_name,t.name theme_name FROM institution_panel_theme_access a JOIN institutions i ON i.id=a.institution_id JOIN panel_themes t ON t.theme_key=a.theme_key ORDER BY i.name,a.role,t.sort_order`)),
    all<any>(env.DB.prepare(`SELECT s.*,i.name institution_name,t.name theme_name FROM special_day_experiences s LEFT JOIN institutions i ON i.id=s.institution_id LEFT JOIN panel_themes t ON t.theme_key=s.theme_key ORDER BY s.starts_at DESC,s.priority DESC LIMIT 100`)),
  ]);
  return json({ok:true,themes,access,campaigns,roles:PANEL_ROLES});
}

async function updateTheme(request:Request,env:Env,user:AuthUser,themeKey:string){
  const body:{active?:boolean}=await request.json<{active?:boolean}>().catch(()=>({}));
  const theme=await one<any>(env.DB.prepare(`SELECT theme_key,is_standard FROM panel_themes WHERE theme_key=?`).bind(themeKey));
  if(!theme)return badRequest('Tema bulunamadı.');
  if(theme.is_standard&&body.active===false)return badRequest('ANUNEX Standard tema kapatılamaz.');
  await env.DB.prepare(`UPDATE panel_themes SET active=?,updated_at=CURRENT_TIMESTAMP WHERE theme_key=?`).bind(body.active===false?0:1,themeKey).run();
  await audit(env.DB,user.id,null,'PANEL_THEME_STATUS_UPDATED','PANEL_THEME',themeKey,{active:body.active!==false});
  return json({ok:true});
}

async function saveAccess(request:Request,env:Env,user:AuthUser){
  const body:{institutionId?:string;themeKey?:string;role?:Role;enabled?:boolean}=await request.json<{institutionId?:string;themeKey?:string;role?:Role;enabled?:boolean}>().catch(()=>({}));
  if(!body.institutionId||!body.themeKey||!body.role||!PANEL_ROLES.includes(body.role))return badRequest('Kurum, tema ve geçerli kullanıcı rolü seçilmelidir.');
  const [institution,theme]=await Promise.all([
    one<any>(env.DB.prepare(`SELECT id FROM institutions WHERE id=?`).bind(body.institutionId)),
    one<any>(env.DB.prepare(`SELECT theme_key,active FROM panel_themes WHERE theme_key=?`).bind(body.themeKey)),
  ]);
  if(!institution||!theme)return badRequest('Kurum veya tema bulunamadı.');
  if(!theme.active&&body.enabled!==false)return badRequest('Önce temayı sistem genelinde etkinleştirin.');
  await env.DB.prepare(`INSERT INTO institution_panel_theme_access(institution_id,theme_key,role,enabled,updated_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(institution_id,theme_key,role) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(body.institutionId,body.themeKey,body.role,body.enabled===false?0:1,user.id).run();
  await audit(env.DB,user.id,body.institutionId,'PANEL_THEME_ACCESS_UPDATED','PANEL_THEME',body.themeKey,{role:body.role,enabled:body.enabled!==false});
  return json({ok:true});
}

async function createSpecialDay(request:Request,env:Env,user:AuthUser){
  const body=await request.json<any>().catch(()=>({}));
  const title=String(body.title||'').trim(),message=String(body.shortMessage||'').trim();
  const role=body.role?String(body.role) as Role:null,accent=String(body.accentColor||'#C51F2E').toUpperCase();
  if(!title||title.length>80||!message||message.length>180)return badRequest('Başlık ve kısa mesaj zorunludur.');
  if(!body.startsAt||!body.endsAt||!validSpecialDayWindow(body.startsAt,body.endsAt))return badRequest('Geçerli başlangıç ve bitiş zamanı seçilmelidir.');
  if(role&&!PANEL_ROLES.includes(role))return badRequest('Geçersiz hedef rol.');
  if(!validPanelAccent(accent))return badRequest('Vurgu rengi #RRGGBB biçiminde olmalıdır.');
  if(body.themeKey){const theme=await one<any>(env.DB.prepare(`SELECT theme_key FROM panel_themes WHERE theme_key=? AND active=1`).bind(body.themeKey));if(!theme)return badRequest('Özel gün için etkin bir tema seçilmelidir.');}
  const startsAt=new Date(body.startsAt).toISOString(),endsAt=new Date(body.endsAt).toISOString();
  const id=uuid('special');
  await env.DB.prepare(`INSERT INTO special_day_experiences(id,title,short_message,theme_key,accent_color,institution_id,role,starts_at,ends_at,priority,active,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)`).bind(id,title,message,body.themeKey||null,accent,body.institutionId||null,role,startsAt,endsAt,Math.max(0,Math.min(100,Number(body.priority||0))),user.id).run();
  await audit(env.DB,user.id,body.institutionId||null,'SPECIAL_DAY_EXPERIENCE_CREATED','SPECIAL_DAY_EXPERIENCE',id,{title,role,startsAt,endsAt});
  return json({ok:true,id},201);
}

async function updateSpecialDay(request:Request,env:Env,user:AuthUser,id:string){
  const body:{active?:boolean}=await request.json<{active?:boolean}>().catch(()=>({}));
  const campaign=await one<any>(env.DB.prepare(`SELECT id,institution_id FROM special_day_experiences WHERE id=?`).bind(id));
  if(!campaign)return badRequest('Özel gün kaydı bulunamadı.');
  await env.DB.prepare(`UPDATE special_day_experiences SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(body.active===false?0:1,id).run();
  await audit(env.DB,user.id,campaign.institution_id,'SPECIAL_DAY_EXPERIENCE_STATUS_UPDATED','SPECIAL_DAY_EXPERIENCE',id,{active:body.active!==false});
  return json({ok:true,id,active:body.active!==false});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url),path=url.pathname;
    if(path==='/api/panel-experience'&&request.method==='GET'){const user=await requireUser(env,request);return user instanceof Response?user:currentExperience(env,user)}
    if(path==='/api/admin/panel-experience'&&request.method==='GET'){const user=await requireSuperAdmin(env,request);return user instanceof Response?user:adminOverview(env)}
    const themeMatch=path.match(/^\/api\/admin\/panel-themes\/([^/]+)$/);
    if(themeMatch){if(request.method!=='PATCH')return methodNotAllowed();const user=await requireSuperAdmin(env,request);return user instanceof Response?user:updateTheme(request,env,user,decodeURIComponent(themeMatch[1]))}
    if(path==='/api/admin/panel-theme-access'){if(request.method!=='POST')return methodNotAllowed();const user=await requireSuperAdmin(env,request);return user instanceof Response?user:saveAccess(request,env,user)}
    if(path==='/api/admin/special-day-experiences'){if(request.method!=='POST')return methodNotAllowed();const user=await requireSuperAdmin(env,request);return user instanceof Response?user:createSpecialDay(request,env,user)}
    const specialDayMatch=path.match(/^\/api\/admin\/special-day-experiences\/([^/]+)$/);
    if(specialDayMatch){if(request.method!=='PATCH')return methodNotAllowed();const user=await requireSuperAdmin(env,request);return user instanceof Response?user:updateSpecialDay(request,env,user,decodeURIComponent(specialDayMatch[1]))}
    return app.fetch(request,env,ctx);
  },
  async queue(batch:MessageBatch<CapacityJobMessage>,env:Env,ctx:ExecutionContext){if('queue' in app&&typeof app.queue==='function')return app.queue(batch,env,ctx)},
  async scheduled(event:ScheduledController,env:Env,ctx:ExecutionContext){if('scheduled' in app&&typeof app.scheduled==='function')return app.scheduled(event,env,ctx)},
} satisfies ExportedHandler<Env,CapacityJobMessage>;
