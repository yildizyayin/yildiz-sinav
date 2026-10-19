import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createSession,getAuthUser,hashPassword,isServiceAccountId} from '../worker/lib/auth';
import {validateScheduledActor} from '../worker/lib/question-agent-dispatch-plan';
import worker from '../worker/index';

const migration=readFileSync(new URL('../migrations/0115_question_agent_service_actor.sql',import.meta.url),'utf8');
const productionConfig=readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8');

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE institutions(id TEXT PRIMARY KEY,name TEXT,code TEXT,status TEXT NOT NULL DEFAULT 'ACTIVE');
 CREATE TABLE users(id TEXT PRIMARY KEY,institution_id TEXT,student_id TEXT,role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT')),display_name TEXT NOT NULL,email TEXT UNIQUE,phone TEXT,username TEXT UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,password_iterations INTEGER NOT NULL DEFAULT 100000,password_algo TEXT NOT NULL DEFAULT 'PBKDF2-SHA256-v1',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,must_change_password INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,revoked_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,user_agent TEXT,ip_hash TEXT);
 CREATE TABLE login_attempts(id TEXT PRIMARY KEY,identifier_hash TEXT NOT NULL,success INTEGER NOT NULL,ip_hash TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async(col?:string)=>{const r:any=db.prepare(sql).get(...args);return col?r?.[col]:r??null;},all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};}});
 const env={DB:{prepare},ENVIRONMENT:'test'} as any;
 return {db,env};
}
const loginRequest=(identifier:string,password:string)=>new Request('https://app.example.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,password})});

it('creates one active, non-human SUPER_ADMIN service row with unknowable password material and is idempotent',()=>{
 const {db}=setup();
 db.exec(migration);
 const row:any=db.prepare("SELECT * FROM users WHERE id='svc-soru-ajani'").get();
 expect(row).toMatchObject({role:'SUPER_ADMIN',active:1,email:null,phone:null,institution_id:null,password_algo:'SERVICE_ACCOUNT_NO_LOGIN'});
 expect(row.password_hash).toMatch(/^[0-9A-F]{64}$/);
 db.prepare("UPDATE users SET active=0 WHERE id='svc-soru-ajani'").run();
 db.exec(migration);
 const again:any=db.prepare("SELECT active,password_hash FROM users WHERE id='svc-soru-ajani'").get();
 expect(again).toEqual({active:0,password_hash:row.password_hash});
 expect((db.prepare('SELECT count(*) n FROM users').get() as any).n).toBe(1);
});

it('never issues or honours a session for a service account',async()=>{
 const {db,env}=setup();
 db.exec(migration);
 const refused=await createSession(env,'svc-soru-ajani',new Request('https://app.example.test/'),false);
 expect(refused.status).toBe(401);
 expect((db.prepare('SELECT count(*) n FROM sessions').get() as any).n).toBe(0);
 const raw='forged-service-token';
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES('s1','svc-soru-ajani',?,?)").run(digest,new Date(Date.now()+86400000).toISOString());
 expect(await getAuthUser(env,new Request('https://app.example.test/',{headers:{Cookie:`yildiz_session=${raw}`}}))).toBeNull();
});

it('rejects service-account login with the generic credential error even if a password were set, while a human admin still signs in',async()=>{
 const {db,env}=setup();
 db.exec(migration);
 const known=await hashPassword('known-pass-123');
 db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=? WHERE id='svc-soru-ajani'").run(known.hash,known.salt,known.iterations);
 db.prepare("INSERT INTO users(id,role,display_name,username,password_hash,password_salt,password_iterations) VALUES('human-admin','SUPER_ADMIN','Synthetic admin','synthetic-admin',?,?,?)").run(known.hash,known.salt,known.iterations);
 const svc=await worker.fetch(loginRequest('svc-soru-ajani','known-pass-123'),env,{waitUntil(){},passThroughOnException(){}} as any);
 expect(svc.status).toBe(401);
 expect((await svc.json() as any).error.code).toBe('INVALID_CREDENTIALS');
 const human=await worker.fetch(loginRequest('synthetic-admin','known-pass-123'),env,{waitUntil(){},passThroughOnException(){}} as any);
 expect(human.status).toBe(200);
 expect((db.prepare("SELECT count(*) n FROM sessions WHERE user_id='svc-soru-ajani'").get() as any).n).toBe(0);
 expect((db.prepare("SELECT count(*) n FROM sessions WHERE user_id='human-admin'").get() as any).n).toBe(1);
});

it('production points the scheduler at the dedicated service row, which the actor check accepts',()=>{
 expect(productionConfig).toMatch(/"QUESTION_AGENT_SERVICE_ACTOR_ID":\s*"svc-soru-ajani"/);
 expect(isServiceAccountId('svc-soru-ajani')).toBe(true);
 expect(isServiceAccountId('human-admin')).toBe(false);
 expect(validateScheduledActor({id:'svc-soru-ajani',role:'SUPER_ADMIN',active:true},'svc-soru-ajani')).toEqual({ok:true,reasons:[]});
});
