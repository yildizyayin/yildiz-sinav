import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {beforeEach, afterEach, expect, it, vi} from 'vitest';
vi.mock('../worker/lib/auth',()=>({getAuthUser:vi.fn()}));
vi.mock('../worker/lib/passkeys',()=>({activeAccess:vi.fn(async()=>null),handlePasskeys:vi.fn()}));
import {getAuthUser} from '../worker/lib/auth';
import {createNibiruAccessCalendarEntry} from '../worker/nibiru-access-calendar-entry';

let db:DatabaseSync,env:any,fetch:any,app:any;
beforeEach(()=>{
 db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('parent');CREATE TABLE institutions(id TEXT PRIMARY KEY);CREATE TABLE student_entities(id TEXT PRIMARY KEY,status TEXT,first_name TEXT,last_name TEXT);INSERT INTO student_entities VALUES('s1','ACTIVE','Linked','Student'),('s2','ACTIVE','Other','Student');CREATE TABLE student_enrollments(student_id TEXT,institution_id TEXT,status TEXT,grade_level INTEGER);INSERT INTO student_enrollments VALUES('s1','a','ACTIVE',7),('s2','a','ACTIVE',7);CREATE TABLE parent_student_links(student_id TEXT,parent_user_id TEXT,active INTEGER);INSERT INTO parent_student_links VALUES('s1','parent',1);CREATE TABLE classes(id TEXT PRIMARY KEY);CREATE TABLE subjects(id TEXT PRIMARY KEY);`);
 db.exec(readFileSync(new URL('../migrations/0087_nibiru_direct_access_calendar.sql',import.meta.url),'utf8'));
 const prepare=(sql:string,args:any[]=[]):any=>({bind:(...a:any[])=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 env={DB:{prepare}};fetch=vi.fn(async()=>Response.json({ok:true,answer:'Authorized underlying handler'}));app=createNibiruAccessCalendarEntry({fetch} as any);vi.mocked(getAuthUser).mockResolvedValue({id:'parent',role:'PARENT',institution_id:'a'} as any);
});
afterEach(()=>db.close());
const req=(path:string,body:any)=>new Request(`https://app.anunex.com${path}`,{method:'POST',headers:{origin:'https://app.anunex.com','Content-Type':'application/json'},body:JSON.stringify(body)});
it('guest mode never invokes a provider or personal-data handler',async()=>{vi.mocked(getAuthUser).mockResolvedValue(null);const response=await app.fetch(req('/api/nibiru/public-chat',{message:'Çocuğumun sınav sonucunu göster'}),env,{});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({mode:'GUEST_INFORMATION',personalized:false});expect(fetch).not.toHaveBeenCalled();expect((db.prepare('SELECT count(*) n FROM nibiru_daily_usage').get() as any).n).toBe(0)});
it('rejects an unlinked child and rechecks revoked parent links on each request',async()=>{expect((await app.fetch(req('/api/nibiru/chat',{message:'Öğrencim nasıl?',studentId:'s2'}),env,{})).status).toBe(403);expect(fetch).not.toHaveBeenCalled();expect((await app.fetch(req('/api/nibiru/chat',{message:'Öğrencim nasıl?',studentId:'s1'}),env,{})).status).toBe(200);db.exec('UPDATE parent_student_links SET active=0');fetch.mockClear();expect((await app.fetch(req('/api/nibiru/chat',{message:'Öğrencim nasıl?',studentId:'s1'}),env,{})).status).toBe(403);expect(fetch).not.toHaveBeenCalled()});
it('reserves a bounded daily request before invoking Nibiru',async()=>{db.prepare('INSERT INTO nibiru_daily_usage VALUES(?,?,?)').run('parent',new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),29);expect((await app.fetch(req('/api/nibiru/chat',{message:'Konu anlat'}),env,{})).status).toBe(200);expect((await app.fetch(req('/api/nibiru/chat',{message:'Konu anlat'}),env,{})).status).toBe(429);expect(fetch).toHaveBeenCalledTimes(1)});
it('identity lists only active linked students',async()=>{const response=await app.fetch(new Request('https://app.anunex.com/api/nibiru/identity'),env,{});expect(await response.json()).toMatchObject({students:[{id:'s1',name:'Linked Student'}]});db.exec('UPDATE parent_student_links SET active=0');const after=await app.fetch(new Request('https://app.anunex.com/api/nibiru/identity'),env,{});expect(await after.json()).toMatchObject({students:[]})});
