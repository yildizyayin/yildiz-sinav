import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { base64url, decodeBase64url, digest, handlePasskeys } from '../worker/lib/passkeys';
import { hashPassword } from '../worker/lib/auth';

let db:DatabaseSync,env:any;
const origin='https://app.anunex.com';
const authCookie='yildiz_session=synthetic-current';
const encoder=new TextEncoder();
beforeEach(async()=>{
 db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE institutions(id TEXT PRIMARY KEY,status TEXT);INSERT INTO institutions VALUES('a','ACTIVE');CREATE TABLE users(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,role TEXT,display_name TEXT,email TEXT,username TEXT,must_change_password INTEGER,active INTEGER,password_hash TEXT,password_salt TEXT,password_iterations INTEGER);CREATE TABLE student_entities(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE subjects(id TEXT PRIMARY KEY);CREATE TABLE classes(id TEXT PRIMARY KEY);CREATE TABLE sessions(id TEXT,user_id TEXT,token_hash TEXT,expires_at TEXT,revoked_at TEXT,user_agent TEXT,ip_hash TEXT);CREATE TABLE login_attempts(id TEXT,identifier_hash TEXT,success INTEGER,ip_hash TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 db.exec(readFileSync(new URL('../migrations/0087_nibiru_direct_access_calendar.sql',import.meta.url),'utf8'));
 const password=await hashPassword('Synthetic123!');db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('pa','a',null,'PARENT','Synthetic Parent',null,'parent',0,1,password.hash,password.salt,password.iterations);db.prepare('INSERT INTO sessions VALUES(?,?,?,?,NULL,NULL,NULL)').run('ses','pa',await digest('synthetic-current'),'2099-01-01');
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 env={DB:{prepare},ENVIRONMENT:'production',TURNSTILE_SECRET_KEY:undefined};
});
afterEach(()=>db.close());
const request=(path:string,body:any,cookie=authCookie,requestOrigin=origin)=>new Request(`${origin}/api/auth/passkeys${path}`,{method:'POST',headers:{origin:requestOrigin,cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function challenge(purpose='REGISTER',userId:string|null='pa',browser='synthetic-browser'){
 const id=`challenge-${crypto.randomUUID()}`,challenge=base64url(crypto.getRandomValues(new Uint8Array(32)));
 db.prepare('INSERT INTO passkey_challenges(id,browser_hash,user_id,purpose,challenge,origin,rp_id,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,await digest(browser),userId,purpose,challenge,origin,'app.anunex.com','2099-01-01');
 return {id,challenge,cookie:`anunex_passkey=${browser}`};
}
async function authenticator(){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);const privateJwk=await crypto.subtle.exportKey('jwk',keys.privateKey);
 const id=crypto.getRandomValues(new Uint8Array(32));
 const publicKey=encodeCBOR(new Map<any,any>([[1,2],[3,-7],[-1,1],[-2,decodeBase64url(jwk.x!)],[-3,decodeBase64url(jwk.y!)]]));
 const rpHash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('app.anunex.com')));
 const register=(c:string,flags=0x45)=>{const authData=new Uint8Array(37+16+2+id.length+publicKey.length);authData.set(rpHash);authData[32]=flags;authData[53]=0;authData[54]=id.length;authData.set(id,55);authData.set(publicKey,55+id.length);return {id:base64url(id),rawId:base64url(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:base64url(encoder.encode(JSON.stringify({type:'webauthn.create',challenge:c,origin,crossOrigin:false}))),attestationObject:base64url(encodeCBOR(new Map<any,any>([['fmt','none'],['attStmt',new Map()],['authData',authData]]))),transports:['internal']}}};
 const login=async(c:string,flags=0x05)=>{const authData=new Uint8Array(37);authData.set(rpHash);authData[32]=flags;authData[36]=1;const clientData=encoder.encode(JSON.stringify({type:'webauthn.get',challenge:c,origin,crossOrigin:false}));const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',clientData));const signature=sign('sha256',Buffer.concat([authData,clientHash]),createPrivateKey({key:privateJwk as any,format:'jwk'}));return {id:base64url(id),rawId:base64url(id),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:base64url(clientData),authenticatorData:base64url(authData),signature:base64url(signature),userHandle:base64url(encoder.encode('pa'))}}};
 return {register,login};
}
describe('passkey identity with real WebAuthn verification and SQL',()=>{
 it('requires same origin and existing authentication before registering',async()=>{expect((await handlePasskeys(request('/register/options',{password:'Synthetic123!'},authCookie,'https://evil.example'),env)).status).toBe(403);expect((await handlePasskeys(request('/register/options',{password:'Synthetic123!'},''),env)).status).toBe(401)});
 it('requires current password and rejects temporary-password accounts',async()=>{expect((await handlePasskeys(request('/register/options',{password:'wrong'}),env)).status).toBe(403);db.exec('UPDATE users SET must_change_password=1');expect((await handlePasskeys(request('/register/options',{password:'Synthetic123!'}),env)).status).toBe(403)});
 it('registers a verified key, authenticates it and rejects replay',async()=>{const a=await authenticator(),reg=await challenge();const registration=await handlePasskeys(request('/register/verify',{challengeId:reg.id,response:a.register(reg.challenge)},`${authCookie}; ${reg.cookie}`),env);expect(registration.status).toBe(200);expect((db.prepare('SELECT count(*) n FROM user_passkeys').get() as any).n).toBe(1);expect((await handlePasskeys(request('/register/verify',{challengeId:reg.id,response:a.register(reg.challenge)},`${authCookie}; ${reg.cookie}`),env)).status).toBe(400);const log=await challenge('LOGIN',null);const response=await a.login(log.challenge);const result=await handlePasskeys(request('/login/verify',{challengeId:log.id,response},log.cookie),env);expect(result.status).toBe(200);expect(result.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax');expect(result.headers.get('set-cookie')).toContain('Secure');expect((await handlePasskeys(request('/login/verify',{challengeId:log.id,response},log.cookie),env)).status).toBe(400)});
 it('rejects a different browser, expired challenge and missing user verification',async()=>{const a=await authenticator(),r=await challenge();expect((await handlePasskeys(request('/register/verify',{challengeId:r.id,response:a.register(r.challenge)},`${authCookie}; anunex_passkey=other-browser`),env)).status).toBe(400);db.prepare('UPDATE passkey_challenges SET expires_at=? WHERE id=?').run('2000-01-01',r.id);expect((await handlePasskeys(request('/register/verify',{challengeId:r.id,response:a.register(r.challenge)},`${authCookie}; ${r.cookie}`),env)).status).toBe(400);const r2=await challenge();expect((await handlePasskeys(request('/register/verify',{challengeId:r2.id,response:a.register(r2.challenge,0x41)},`${authCookie}; ${r2.cookie}`),env)).status).toBe(400);expect((db.prepare('SELECT count(*) n FROM user_passkeys').get() as any).n).toBe(0)});
 it('rejects a valid key when the account or institution becomes inactive',async()=>{const a=await authenticator(),r=await challenge();expect((await handlePasskeys(request('/register/verify',{challengeId:r.id,response:a.register(r.challenge)},`${authCookie}; ${r.cookie}`),env)).status).toBe(200);db.exec("UPDATE institutions SET status='PASSIVE'");const c=await challenge('LOGIN',null);expect((await handlePasskeys(request('/login/verify',{challengeId:c.id,response:await a.login(c.challenge)},c.cookie),env)).status).toBe(403);db.exec("UPDATE institutions SET status='ACTIVE'; UPDATE users SET active=0");const c2=await challenge('LOGIN',null);expect((await handlePasskeys(request('/login/verify',{challengeId:c2.id,response:await a.login(c2.challenge)},c2.cookie),env)).status).toBe(403)});
 it('does not create a passkey login session for super admin',async()=>{db.exec("UPDATE users SET role='SUPER_ADMIN'");expect((await handlePasskeys(request('/register/options',{password:'Synthetic123!'}),env)).status).toBe(403)});
});
