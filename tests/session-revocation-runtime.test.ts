import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {getAuthUser,revokeSession} from '../worker/lib/auth';

it('logout revokes the presented session while retaining other sessions and blocks reuse',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE institutions(id TEXT,status TEXT);
   CREATE TABLE users(id TEXT,institution_id TEXT,student_id TEXT,role TEXT,display_name TEXT,email TEXT,username TEXT,must_change_password INTEGER,active INTEGER);
   CREATE TABLE sessions(token_hash TEXT,expires_at TEXT,revoked_at TEXT);
   INSERT INTO institutions VALUES('school','ACTIVE');
   INSERT INTO users VALUES('user','school',NULL,'INSTITUTION_ADMIN','Synthetic',NULL,'synthetic',0,1);`);
  db.exec('ALTER TABLE sessions ADD COLUMN user_id TEXT');
  const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
  for(const token of ['current-synthetic','other-synthetic'])db.prepare('INSERT INTO sessions VALUES(?,?,NULL,?)').run(hash(token),'2099-01-01','user');
  const prepare=(sql:string,args:any[]=[]):any=>({
   bind:(...values:any[])=>prepare(sql,values),
   first:async()=>db.prepare(sql).get(...args),
   run:async()=>({success:true,meta:{changes:db.prepare(sql).run(...args).changes}}),
  });
  const env={DB:{prepare},ENVIRONMENT:'production'} as any;
  const request=new Request('https://app.example/api/auth/logout',{method:'POST',headers:{cookie:'yildiz_session=current-synthetic'}});
  expect((await getAuthUser(env,request))?.id).toBe('user');
  const result=await revokeSession(env,request);
  expect(result.status).toBe(200);
  expect(result.headers.get('set-cookie')).toContain('Max-Age=0; Secure');
  expect(await getAuthUser(env,request)).toBeNull();
  const other=new Request('https://app.example/api/auth/me',{headers:{cookie:'yildiz_session=other-synthetic'}});
  expect((await getAuthUser(env,other))?.id).toBe('user');
  expect((await revokeSession(env,request)).status).toBe(200);
 }finally{db.close();}
});

it('does not report logout success if server revocation fails',async()=>{
 const env={DB:{prepare:()=>({bind:()=>({run:async()=>{throw new Error('synthetic storage unavailable')}})})},ENVIRONMENT:'production'} as any;
 const request=new Request('https://app.example/api/auth/logout',{method:'POST',headers:{cookie:'yildiz_session=synthetic'}});
 await expect(revokeSession(env,request)).rejects.toThrow('synthetic storage unavailable');
});

it('returns a temporary failure without claiming revocation when the Free D1 write budget is exhausted',async()=>{
 const env={DB:{prepare:()=>({bind:()=>({run:async()=>{throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit.")}})})},ENVIRONMENT:'production'} as any;
 const request=new Request('https://app.example/api/auth/logout',{method:'POST',headers:{cookie:'yildiz_session=synthetic'}});
 const response=await revokeSession(env,request);
 expect(response.status).toBe(503);
 expect(response.headers.get('set-cookie')).toBeNull();
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toMatchObject({ok:false,error:{code:'SESSION_REVOCATION_TEMPORARILY_UNAVAILABLE'}});
});
