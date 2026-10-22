import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { AuthUser, Env } from '../types';
import { createSession, getAuthUser, isTemporarilyLocked, recordLoginAttempt, verifyPassword, verifyTurnstile } from './auth';
import { all, badRequest, forbidden, json, methodNotAllowed, one, uuid } from './db';
import { getEffectiveLicense } from './license';

const encoder = new TextEncoder();
export async function digest(value: string) {
 const bytes = await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function decodeBase64url(value: string) { return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0)); }
export function passkeyOrigin(request: Request, env: Env) {
 const url=new URL(request.url);
 const allowed=url.protocol==='https:' && (['app.anunex.com','demo.anunex.com'].includes(url.hostname) || (env.ENVIRONMENT!=='production' && /^yildiz-sinav-v1\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)));
 const local=env.ENVIRONMENT!=='production' && ['localhost','127.0.0.1'].includes(url.hostname);
 if(!allowed&&!local) return null;
 if(request.headers.get('Origin')!==url.origin) return null;
 // Host-specific credentials prevent a demo account from authenticating on app.
 return {origin:url.origin,rpID:url.hostname};
}
export async function activeAccess(env:Env,user:AuthUser,license=false) {
 if(user.must_change_password) return json({ok:false,error:{code:'PASSWORD_CHANGE_REQUIRED',message:'Önce geçici şifrenizi değiştirin.'}},403);
 // A032b: the Super Admin is never blocked by an institution's state or licence.
 if(user.institution_id&&user.role!=='SUPER_ADMIN'){
  const institution=await one<{status:string}>(env.DB.prepare('SELECT status FROM institutions WHERE id=?').bind(user.institution_id));
  if(!institution||institution.status!=='ACTIVE')return forbidden('Kurumunuz aktif değil.');
  if(license){if((await getEffectiveLicense(env,user.institution_id)).locked)return json({ok:false,error:{code:'LICENSE_REQUIRED',message:'Kurum lisansınızı kontrol edin.'}},402);}
 }
 if(user.role==='STUDENT'&&user.student_id){const student=await one<{status:string}>(env.DB.prepare('SELECT status FROM student_entities WHERE id=?').bind(user.student_id));if(!student||student.status!=='ACTIVE')return forbidden('Öğrenci erişimi aktif değil.');}
 return null;
}
type Challenge={id:string;user_id:string|null;challenge:string;origin:string;rp_id:string;purpose:string};
async function challengeResponse(env:Env,request:Request,options:any,purpose:string,userId:string|null,origin:string,rpID:string){
 const raw=base64url(crypto.getRandomValues(new Uint8Array(32))),hash=await digest(raw);
 // A new challenge replaces only expired challenges; bounded cleanup, no global scans.
 await env.DB.prepare('DELETE FROM passkey_challenges WHERE id IN (SELECT id FROM passkey_challenges WHERE expires_at<? LIMIT 20)').bind(new Date().toISOString()).run();
 const challengeId=uuid('pkc');
 await env.DB.prepare('INSERT INTO passkey_challenges(id,browser_hash,user_id,purpose,challenge,origin,rp_id,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(challengeId,hash,userId,purpose,options.challenge,origin,rpID,new Date(Date.now()+300_000).toISOString()).run();
 const secure=new URL(request.url).protocol==='https:'?'; Secure':'';
 return json({ok:true,options,challengeId},200,{'Set-Cookie':`anunex_passkey=${raw}; Path=/api/auth/passkeys; HttpOnly; SameSite=Strict; Max-Age=300${secure}`});
}
async function consumeChallenge(env:Env,request:Request,id:string,purpose:string,userId:string|null,origin:string){
 const raw=request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('anunex_passkey='))?.slice(15);
 if(!raw||!id)return null;
 // Atomic single-use claim closes concurrent replay and binds to browser, origin and user.
 return one<Challenge>(env.DB.prepare(`UPDATE passkey_challenges SET used_at=CURRENT_TIMESTAMP WHERE id=? AND browser_hash=? AND purpose=? AND origin=? AND user_id IS ? AND used_at IS NULL AND expires_at>? RETURNING *`).bind(id,await digest(raw),purpose,origin,userId,new Date().toISOString()));
}
export async function handlePasskeys(request:Request,env:Env):Promise<Response>{
 const path=new URL(request.url).pathname;
 const context=passkeyOrigin(request,env);
 const user=await getAuthUser(env,request);
 if(path==='/api/auth/passkeys'&&request.method==='GET'){
  if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'Önce hesabınızı doğrulayın.'}},401);
  const blocked=await activeAccess(env,user);if(blocked)return blocked;
  return json({ok:true,passkeys:await all(env.DB.prepare('SELECT credential_id id,label,created_at,last_used_at FROM user_passkeys WHERE user_id=? AND rp_id=?').bind(user.id,new URL(request.url).hostname))});
 }
 if(!context)return forbidden('Doğrulama yalnız güvenli ANUNEX adresinde başlatılabilir.');
 if(request.method!=='POST')return methodNotAllowed();
 if(Number(request.headers.get('Content-Length')||0)>32768)return badRequest('Doğrulama isteği çok büyük.');
 const body:any=await request.json().catch(()=>null);if(!body)return badRequest('Doğrulama isteği okunamadı.');
 try {
  if(path.endsWith('/login/options')){
   const ipKey=`passkey:${request.headers.get('CF-Connecting-IP')||'local'}`;
   if(await isTemporarilyLocked(env,ipKey))return json({ok:false,error:{code:'RATE_LIMITED',message:'Biraz bekleyip tekrar deneyin.'}},429);
   const captcha=await verifyTurnstile(env,body.turnstileToken,request.headers.get('CF-Connecting-IP'));if(!captcha.ok)return forbidden('Robot doğrulamasını tamamlayın.');
   await recordLoginAttempt(env,ipKey,false,request);
   const options=await generateAuthenticationOptions({rpID:context.rpID,userVerification:'required'});
   return challengeResponse(env,request,options,'LOGIN',null,context.origin,context.rpID);
  }
  if(path.endsWith('/login/verify')){
   const challenge=await consumeChallenge(env,request,String(body.challengeId||''),'LOGIN',null,context.origin);
   if(!challenge)return badRequest('Doğrulama süresi doldu. Tekrar başlatın.','PASSKEY_EXPIRED');
   const key=await one<any>(env.DB.prepare(`SELECT p.*,u.id,u.institution_id,u.student_id,u.role,u.display_name,u.email,u.username,u.must_change_password FROM user_passkeys p JOIN users u ON u.id=p.user_id WHERE p.credential_id=? AND p.rp_id=? AND u.active=1`).bind(String(body.response?.id||''),context.rpID));
   if(!key||key.role==='SUPER_ADMIN')return forbidden('Geçiş anahtarı doğrulanamadı.');
   if(body.response?.response?.userHandle!==base64url(encoder.encode(key.user_id)))return forbidden('Geçiş anahtarı doğrulanamadı.');
   const result=await verifyAuthenticationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:context.origin,expectedRPID:context.rpID,requireUserVerification:true,credential:{id:key.credential_id,publicKey:decodeBase64url(key.public_key),counter:key.counter,transports:JSON.parse(key.transports_json)}});
   if(!result.verified)return forbidden('Geçiş anahtarı doğrulanamadı.');
   const blocked=await activeAccess(env,key);if(blocked)return blocked;
   const updated=await env.DB.prepare('UPDATE user_passkeys SET counter=?,last_used_at=CURRENT_TIMESTAMP WHERE credential_id=? AND counter=?').bind(result.authenticationInfo.newCounter,key.credential_id,key.counter).run();
   if(updated.meta.changes!==1)return badRequest('Doğrulamayı yeniden başlatın.','PASSKEY_CONFLICT');
   await recordLoginAttempt(env,`passkey:${request.headers.get('CF-Connecting-IP')||'local'}`,true,request);
   return createSession(env,key.user_id,request,body.remember===true);
  }
  if(!user)return json({ok:false,error:{code:'UNAUTHENTICATED',message:'İlk kullanımda hesabınızı doğrulayın.'}},401);
  if(user.role==='SUPER_ADMIN')return forbidden('Yönetici hesabında mevcut giriş yöntemini kullanın.');
  const blocked=await activeAccess(env,user);if(blocked)return blocked;
  if(path.endsWith('/register/options')||path.endsWith('/remove')){
   if(await isTemporarilyLocked(env,`pk:${user.id}`))return json({ok:false,error:{code:'RATE_LIMITED',message:'Biraz bekleyip tekrar deneyin.'}},429);
   const row=await one<any>(env.DB.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=? AND active=1').bind(user.id));
   const valid=typeof body.password==='string'&&body.password.length<=256&&row&&await verifyPassword(body.password,row.password_salt,row.password_hash,row.password_iterations);
   await recordLoginAttempt(env,`pk:${user.id}`,Boolean(valid),request);
   if(!valid)return forbidden('Mevcut şifrenizi kontrol edin.');
   if(path.endsWith('/remove')){await env.DB.prepare('DELETE FROM user_passkeys WHERE credential_id=? AND user_id=? AND rp_id=?').bind(String(body.credentialId||''),user.id,context.rpID).run();return json({ok:true});}
   const keys=await all<{credential_id:string;transports_json:string}>(env.DB.prepare('SELECT credential_id,transports_json FROM user_passkeys WHERE user_id=? AND rp_id=?').bind(user.id,context.rpID));
   if(keys.length>=5)return badRequest('En fazla beş geçiş anahtarı ekleyebilirsiniz.');
   const options=await generateRegistrationOptions({rpName:'ANUNEX Nibiru',rpID:context.rpID,userID:encoder.encode(user.id),userName:user.username||user.id,userDisplayName:user.display_name,attestationType:'none',supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:keys.map(k=>({id:k.credential_id,transports:JSON.parse(k.transports_json) as AuthenticatorTransportFuture[]}))});
   return challengeResponse(env,request,options,'REGISTER',user.id,context.origin,context.rpID);
  }
  if(path.endsWith('/register/verify')){
   const challenge=await consumeChallenge(env,request,String(body.challengeId||''),'REGISTER',user.id,context.origin);
   if(!challenge)return badRequest('Doğrulama süresi doldu. Tekrar başlatın.','PASSKEY_EXPIRED');
   const result=await verifyRegistrationResponse({response:body.response,expectedChallenge:challenge.challenge,expectedOrigin:context.origin,expectedRPID:context.rpID,requireUserVerification:true,supportedAlgorithmIDs:[-7,-257]});
   if(!result.verified)return forbidden('Geçiş anahtarı oluşturulamadı.');
   const info=result.registrationInfo;
   await env.DB.prepare('INSERT INTO user_passkeys(credential_id,user_id,rp_id,public_key,counter,transports_json,device_type,backed_up) VALUES(?,?,?,?,?,?,?,?)').bind(info.credential.id,user.id,context.rpID,base64url(info.credential.publicKey),info.credential.counter,JSON.stringify(info.credential.transports||[]),info.credentialDeviceType,info.credentialBackedUp?1:0).run();
   return json({ok:true});
  }
  return methodNotAllowed();
 }catch{return badRequest('Geçiş anahtarı doğrulanamadı. Yeniden deneyin.','PASSKEY_VERIFICATION_FAILED');}
}
