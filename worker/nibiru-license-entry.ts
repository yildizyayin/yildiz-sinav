import app from './calibration-v2-entry';
import type { AuthUser, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, audit, badRequest, forbidden, json, one, uuid } from './lib/db';
import { activateAnnual, getEffectiveLicense, licenseAccessMessage, renewAnnual, setLicenseStatus, startTrial } from './lib/license';
import { runNibiru } from './lib/nibiru';
import { extractWhatsAppMessages, sendWhatsAppText, verifyWhatsAppSignature, whatsappReady } from './lib/whatsapp';

const WHATSAPP_ROLES = new Set(['PARENT','TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER']);

function apiError(status:number,code:string,message:string,details?:unknown){return json({ok:false,error:{code,message,details}},status)}

async function sha256Hex(value:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}

function secureSixDigits(){
  const limit=4294000000;
  let n=0;
  do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=limit);
  return String(n%1000000).padStart(6,'0');
}

async function requireUser(env:Env,request:Request):Promise<AuthUser|Response>{return (await getAuthUser(env,request))||apiError(401,'UNAUTHENTICATED','Oturum açmanız gerekiyor.')}
function isResponse(v:AuthUser|Response):v is Response{return v instanceof Response}

async function settings(env:Env){return one<any>(env.DB.prepare(`SELECT * FROM nibiru_settings WHERE id='platform'`))}

async function institutionBlock(env:Env,user:AuthUser){
  if(!user.institution_id)return null;
  const institution=await one<{status:string}>(env.DB.prepare(`SELECT status FROM institutions WHERE id=?`).bind(user.institution_id));
  if(!institution||institution.status==='PASSIVE')return {code:'INSTITUTION_PASSIVE',message:'Kurum hesabınız şu anda aktif değildir.'};
  const license=await getEffectiveLicense(env,user.institution_id);
  if(license.locked)return {code:'LICENSE_EXPIRED',message:licenseAccessMessage(license),license};
  return null;
}

async function userFromIdentity(env:Env,phone:string):Promise<AuthUser|null>{
  return one<AuthUser>(env.DB.prepare(`SELECT u.id,u.institution_id,u.student_id,u.role,u.display_name,u.email,u.username FROM nibiru_whatsapp_identities wi JOIN users u ON u.id=wi.user_id WHERE wi.phone_e164=? AND wi.status='VERIFIED' AND u.active=1 LIMIT 1`).bind(phone));
}

async function pairByCode(env:Env,phone:string,code:string){
  const hash=await sha256Hex(code);
  const now=new Date().toISOString();
  const row=await one<any>(env.DB.prepare(`SELECT pc.id,pc.user_id,u.role,u.active FROM nibiru_pairing_codes pc JOIN users u ON u.id=pc.user_id WHERE pc.code_hash=? AND pc.used_at IS NULL AND pc.expires_at>? LIMIT 1`).bind(hash,now));
  if(!row||!row.active||!WHATSAPP_ROLES.has(row.role))return null;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM nibiru_whatsapp_identities WHERE user_id=? OR phone_e164=?`).bind(row.user_id,phone),
    env.DB.prepare(`INSERT INTO nibiru_whatsapp_identities(id,user_id,phone_e164,status,verification_method,verified_at,last_seen_at) VALUES(?,?,?,'VERIFIED','PAIRING_CODE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(uuid('nibi'),row.user_id,phone),
    env.DB.prepare(`UPDATE nibiru_pairing_codes SET used_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id),
  ]);
  return userFromIdentity(env,phone);
}

function identityHelp(){return `🤖 Nibiru: Ben Anunex’in yapay zekâ akademik asistanıyım. Bu WhatsApp numarası henüz bir kullanıcı hesabına bağlanmamış. Kurumunuzdan Nibiru eşleştirme kodu alın ve “BAĞLA 123456” şeklinde gönderin.`}

async function handleWhatsAppMessage(env:Env,message:{from:string;id:string;type:string;text:string|null}){
  const seen=await one(env.DB.prepare(`SELECT provider_message_id FROM nibiru_whatsapp_receipts WHERE provider_message_id=?`).bind(message.id));
  if(seen)return;
  await env.DB.prepare(`INSERT INTO nibiru_whatsapp_receipts(provider_message_id,phone_e164) VALUES(?,?)`).bind(message.id,message.from).run();
  try{
    const s=await settings(env);
    if(!s?.enabled||!s?.whatsapp_enabled){await env.DB.prepare(`UPDATE nibiru_whatsapp_receipts SET processed_at=CURRENT_TIMESTAMP WHERE provider_message_id=?`).bind(message.id).run();return}
    if(message.type!=='text'||!message.text){await sendWhatsAppText(env,message.from,'🤖 Nibiru: Şu anda WhatsApp üzerinden metin mesajlarını yanıtlayabiliyorum. Öğrenci gelişimi, sınavlar ve kazanımlar hakkında yazarak sorabilirsiniz.');return}
    const pair=message.text.match(/^\s*(?:BAĞLA|BAGLA)\s+(\d{6})\s*$/i);
    if(pair){
      const linked=await pairByCode(env,message.from,pair[1]);
      if(!linked){await sendWhatsAppText(env,message.from,'🤖 Nibiru: Eşleştirme kodu geçersiz veya süresi dolmuş. Kurumunuzdan yeni bir kod isteyebilirsiniz.');return}
      const blocked=await institutionBlock(env,linked);
      if(blocked){await sendWhatsAppText(env,message.from,`🤖 Nibiru: ${blocked.message}`);return}
      await sendWhatsAppText(env,message.from,`🤖 Nibiru: Eşleştirme tamamlandı. Merhaba ${linked.display_name}. Ben yapay zekâ akademik asistanınızım. Yetkiniz kapsamındaki öğrenci gelişimi, sınavlar, kazanımlar ve çalışma önerileri hakkında bana yazabilirsiniz.`);
      return;
    }
    const user=await userFromIdentity(env,message.from);
    if(!user){await sendWhatsAppText(env,message.from,identityHelp());await env.DB.prepare(`INSERT INTO nibiru_audit_events(id,channel,role,intent,outcome,message_chars) VALUES(?,'WHATSAPP',NULL,'IDENTITY','UNVERIFIED',?)`).bind(uuid('niba'),message.text.length).run();return}
    if(!WHATSAPP_ROLES.has(user.role)){await sendWhatsAppText(env,message.from,'🤖 Nibiru: Bu kullanıcı rolü için WhatsApp erişimi etkin değildir.');return}
    const blocked=await institutionBlock(env,user);
    if(blocked){await sendWhatsAppText(env,message.from,`🤖 Nibiru: ${blocked.message}`);return}
    const result=await runNibiru(env,user,message.text,'WHATSAPP',message.from);
    await sendWhatsAppText(env,message.from,result.answer);
    await env.DB.prepare(`UPDATE nibiru_whatsapp_identities SET last_seen_at=CURRENT_TIMESTAMP WHERE phone_e164=?`).bind(message.from).run();
  }catch(error){
    console.error(JSON.stringify({event:'nibiru_whatsapp_error',messageId:message.id,error:error instanceof Error?error.message:String(error)}));
    try{await sendWhatsAppText(env,message.from,'🤖 Nibiru: Şu anda akademik veriye erişirken kısa süreli bir sorun oluştu. Lütfen daha sonra yeniden deneyin.')}catch{}
  }finally{
    await env.DB.prepare(`UPDATE nibiru_whatsapp_receipts SET processed_at=CURRENT_TIMESTAMP WHERE provider_message_id=?`).bind(message.id).run();
  }
}

async function whatsappWebhook(request:Request,env:Env,ctx:ExecutionContext){
  const url=new URL(request.url);
  if(request.method==='GET'){
    const mode=url.searchParams.get('hub.mode'),token=url.searchParams.get('hub.verify_token'),challenge=url.searchParams.get('hub.challenge')||'';
    if(mode==='subscribe'&&env.WHATSAPP_VERIFY_TOKEN&&token===env.WHATSAPP_VERIFY_TOKEN)return new Response(challenge,{status:200,headers:{'Content-Type':'text/plain'}});
    return new Response('Forbidden',{status:403});
  }
  if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
  const raw=await request.arrayBuffer();
  if(env.WHATSAPP_APP_SECRET){const valid=await verifyWhatsAppSignature(env.WHATSAPP_APP_SECRET,raw,request.headers.get('X-Hub-Signature-256'));if(!valid)return new Response('Invalid signature',{status:401})}
  else if(env.ENVIRONMENT==='production')return new Response('WhatsApp app secret not configured',{status:503});
  let payload:any;try{payload=JSON.parse(new TextDecoder().decode(raw))}catch{return new Response('Bad Request',{status:400})}
  const messages=extractWhatsAppMessages(payload);
  if(messages.length)ctx.waitUntil(Promise.all(messages.map(m=>handleWhatsAppMessage(env,m))).then(()=>undefined));
  return new Response('EVENT_RECEIVED',{status:200});
}

async function nibiruSettings(request:Request,env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return forbidden();
  if(request.method==='GET'){
    const row=await settings(env);
    return json({ok:true,settings:row,provider:{ready:whatsappReady(env),verifyToken:Boolean(env.WHATSAPP_VERIFY_TOKEN),appSecret:Boolean(env.WHATSAPP_APP_SECRET),accessToken:Boolean(env.WHATSAPP_ACCESS_TOKEN),phoneNumberId:Boolean(env.WHATSAPP_PHONE_NUMBER_ID)}});
  }
  if(request.method==='PUT'){
    if(user.role!=='SUPER_ADMIN')return forbidden('Nibiru platform ayarlarını yalnız Süper Admin değiştirebilir.');
    const body=await request.json<{enabled?:boolean;whatsappEnabled?:boolean;publicWhatsappNumber?:string|null}>();
    await env.DB.prepare(`UPDATE nibiru_settings SET enabled=?,whatsapp_enabled=?,public_whatsapp_number=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='platform'`).bind(body.enabled===false?0:1,body.whatsappEnabled?1:0,body.publicWhatsappNumber?.trim()||null,user.id).run();
    await audit(env.DB,user.id,null,'NIBIRU_SETTINGS_UPDATED','nibiru_settings','platform',{enabled:body.enabled!==false,whatsappEnabled:Boolean(body.whatsappEnabled)});
    return nibiruSettings(new Request(request.url,{method:'GET',headers:request.headers}),env,user);
  }
  return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
}

async function nibiruUsers(env:Env,user:AuthUser,url:URL){
  if(user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return forbidden();
  const institutionId=user.role==='SUPER_ADMIN'?(url.searchParams.get('institutionId')||null):user.institution_id;
  if(user.role==='INSTITUTION_MANAGER'&&!institutionId)return forbidden();
  const rows=await all<any>(env.DB.prepare(`SELECT u.id,u.institution_id,u.role,u.display_name,u.email,u.phone,u.username,wi.phone_e164,wi.status whatsapp_status,wi.last_seen_at FROM users u LEFT JOIN nibiru_whatsapp_identities wi ON wi.user_id=u.id WHERE u.active=1 AND u.role IN ('PARENT','TEACHER','GUIDANCE_TEACHER','INSTITUTION_MANAGER') ${institutionId?'AND u.institution_id=?':''} ORDER BY u.role,u.display_name`).bind(...(institutionId?[institutionId]:[])));
  return json({ok:true,users:rows});
}

async function createPairing(request:Request,env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return forbidden();
  const body=await request.json<{userId?:string}>();if(!body.userId)return badRequest('Kullanıcı seçilmelidir.');
  const target=await one<any>(env.DB.prepare(`SELECT id,institution_id,role,display_name,active FROM users WHERE id=?`).bind(body.userId));
  if(!target||!target.active||!WHATSAPP_ROLES.has(target.role))return badRequest('Bu kullanıcı Nibiru WhatsApp için uygun değil.');
  if(user.role!=='SUPER_ADMIN'&&target.institution_id!==user.institution_id)return forbidden();
  const code=secureSixDigits(),hash=await sha256Hex(code),expires=new Date(Date.now()+15*60000).toISOString();
  await env.DB.prepare(`UPDATE nibiru_pairing_codes SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL`).bind(target.id).run();
  await env.DB.prepare(`INSERT INTO nibiru_pairing_codes(id,user_id,code_hash,expires_at,created_by) VALUES(?,?,?,?,?)`).bind(uuid('nibc'),target.id,hash,expires,user.id).run();
  await audit(env.DB,user.id,target.institution_id,'NIBIRU_PAIRING_CODE_CREATED','user',target.id,{expiresAt:expires,role:target.role});
  return json({ok:true,code,expiresAt:expires,user:{id:target.id,displayName:target.display_name,role:target.role},instruction:`WhatsApp'tan “BAĞLA ${code}” yazın.`});
}

async function nibiruChat(request:Request,env:Env,user:AuthUser){
  if(request.method!=='POST')return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  const body=await request.json<{message?:string}>();const message=body.message?.trim()||'';
  if(!message||message.length>1200)return badRequest('Mesaj 1–1200 karakter arasında olmalıdır.');
  const blocked=await institutionBlock(env,user);
  if(blocked)return json({ok:true,answer:`🤖 Nibiru: ${blocked.message}`,intent:'ACCESS',locked:true});
  const result=await runNibiru(env,user,message,'WEB',user.id);
  return json({ok:true,...result});
}

async function licenseStatus(env:Env,user:AuthUser){if(!user.institution_id)return json({ok:true,license:null});return json({ok:true,license:await getEffectiveLicense(env,user.institution_id)})}

async function adminLicenses(env:Env,user:AuthUser){
  if(user.role!=='SUPER_ADMIN')return forbidden();
  const institutions=await all<any>(env.DB.prepare(`SELECT i.id,i.name,i.code,i.status,i.demo_mode,(SELECT count(DISTINCT se.student_id) FROM student_enrollments se WHERE se.institution_id=i.id AND se.status='ACTIVE') student_count FROM institutions i ORDER BY i.name`));
  const items=[];for(const institution of institutions)items.push({...institution,license:await getEffectiveLicense(env,institution.id)});
  return json({ok:true,licenses:items});
}

async function licenseMutation(request:Request,env:Env,user:AuthUser,kind:'trial'|'annual'|'renew'|'status'){
  if(user.role!=='SUPER_ADMIN')return forbidden('Lisans yönetimini yalnız Süper Admin kullanabilir.');
  const body=await request.json<any>();const institutionId=String(body.institutionId||'');if(!institutionId)return badRequest('Kurum seçilmelidir.');
  try{
    if(kind==='trial')return json({ok:true,license:await startTrial(env,institutionId,user,Number(body.days||7),body.note)});
    if(kind==='annual'){const mode=body.mode==='RESET_DATA'?'RESET_DATA':'KEEP_DATA';return json({ok:true,...await activateAnnual(env,institutionId,user,mode,Number(body.days||365),body.note)});}
    if(kind==='renew')return json({ok:true,license:await renewAnnual(env,institutionId,user,Number(body.days||365),body.note)});
    const status=body.status;if(!['ACTIVE','SUSPENDED','CANCELLED'].includes(status))return badRequest('Geçersiz lisans durumu.');
    return json({ok:true,license:await setLicenseStatus(env,institutionId,user,status)});
  }catch(error){return apiError(400,'LICENSE_OPERATION_FAILED',error instanceof Error?error.message:'Lisans işlemi tamamlanamadı.')}
}

async function nibiruAudit(env:Env,user:AuthUser,url:URL){
  if(user.role!=='SUPER_ADMIN'&&user.role!=='INSTITUTION_MANAGER')return forbidden();
  const institutionId=user.role==='SUPER_ADMIN'?(url.searchParams.get('institutionId')||null):user.institution_id;
  const rows=await all<any>(env.DB.prepare(`SELECT a.*,u.display_name FROM nibiru_audit_events a LEFT JOIN users u ON u.id=a.user_id ${institutionId?'WHERE a.institution_id=?':''} ORDER BY a.created_at DESC LIMIT 100`).bind(...(institutionId?[institutionId]:[])));
  return json({ok:true,events:rows});
}

function canPassLocked(path:string){return path.startsWith('/api/auth/')||path==='/api/license/status'||path==='/api/nibiru/chat'||path==='/api/public-config'}

export default {async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/nibiru/whatsapp/webhook')return whatsappWebhook(request,env,ctx);

  if(path==='/api/nibiru/settings'||path==='/api/nibiru/users'||path==='/api/nibiru/pairing-code'||path==='/api/nibiru/chat'||path==='/api/nibiru/audit'||path==='/api/license/status'||path==='/api/admin/licenses'||path.startsWith('/api/admin/licenses/')){
    const userOr=await requireUser(env,request);if(isResponse(userOr))return userOr;const user=userOr;
    if(user.role!=='SUPER_ADMIN'&&user.institution_id&&path!=='/api/license/status'&&path!=='/api/nibiru/chat'){
      const blocked=await institutionBlock(env,user);
      if(blocked)return apiError(blocked.code==='LICENSE_EXPIRED'?402:403,blocked.code,blocked.message,'license' in blocked?blocked.license:undefined);
    }
    if(path==='/api/nibiru/settings')return nibiruSettings(request,env,user);
    if(path==='/api/nibiru/users'&&request.method==='GET')return nibiruUsers(env,user,url);
    if(path==='/api/nibiru/pairing-code'&&request.method==='POST')return createPairing(request,env,user);
    if(path==='/api/nibiru/chat')return nibiruChat(request,env,user);
    if(path==='/api/nibiru/audit'&&request.method==='GET')return nibiruAudit(env,user,url);
    if(path==='/api/license/status'&&request.method==='GET')return licenseStatus(env,user);
    if(path==='/api/admin/licenses'&&request.method==='GET')return adminLicenses(env,user);
    if(path==='/api/admin/licenses/trial'&&request.method==='POST')return licenseMutation(request,env,user,'trial');
    if(path==='/api/admin/licenses/annual'&&request.method==='POST')return licenseMutation(request,env,user,'annual');
    if(path==='/api/admin/licenses/renew'&&request.method==='POST')return licenseMutation(request,env,user,'renew');
    if(path==='/api/admin/licenses/status'&&request.method==='POST')return licenseMutation(request,env,user,'status');
    return apiError(405,'METHOD_NOT_ALLOWED','Bu yöntem desteklenmiyor.');
  }

  if(path.startsWith('/api/')&&!canPassLocked(path)){
    const user=await getAuthUser(env,request);
    if(user?.institution_id){const blocked=await institutionBlock(env,user);if(blocked)return apiError(blocked.code==='LICENSE_EXPIRED'?402:403,blocked.code,blocked.message,'license' in blocked?blocked.license:undefined)}
  }
  return app.fetch(request,env);
}} satisfies ExportedHandler<Env>;
