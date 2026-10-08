import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { it, expect } from 'vitest';
import { resultIdentity } from '../worker/result-network-entry';
it('loads minimal identity fields while rechecking revocation, expiry and IP every request', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE result_portal_sessions(identity_id TEXT,token_hash TEXT,ip_hash TEXT,revoked_at TEXT,expires_at TEXT);
      CREATE TABLE result_access_identities(id TEXT,result_institution_id TEXT,normalized_name TEXT,grade_level INTEGER,student_number_lookup_token TEXT,tckn_lookup_token TEXT,expires_at TEXT,access_code_hash TEXT,access_code_salt TEXT);
      CREATE TABLE result_network_institutions(id TEXT,meb_code TEXT,display_name_snapshot TEXT);
      INSERT INTO result_network_institutions VALUES('school','code','Synthetic');
      INSERT INTO result_access_identities VALUES('identity','school','Synthetic',7,'number',NULL,'2099-01-01','secret-hash','secret-salt');`);
    const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
    db.prepare('INSERT INTO result_portal_sessions VALUES(?,?,?,NULL,?)').run('identity',hash('synthetic-cookie'),hash('local'),'2099-01-01');
    const prepare=(sql:string,args:any[]=[]):any=>({bind:(...values:any[])=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args)});
    const env={DB:{prepare}} as any;
    const request=new Request('https://test',{headers:{cookie:'anunex_result_session=synthetic-cookie'}});
    const identity=await resultIdentity(request,env);
    expect(identity?.id).toBe('identity');expect(identity).not.toHaveProperty('access_code_hash');expect(identity).not.toHaveProperty('access_code_salt');
    expect(await resultIdentity(new Request('https://test',{headers:{cookie:'anunex_result_session=synthetic-cookie','CF-Connecting-IP':'192.0.2.1'}}),env)).toBeNull();
    db.exec("UPDATE result_portal_sessions SET revoked_at=CURRENT_TIMESTAMP");expect(await resultIdentity(request,env)).toBeNull();
    db.exec("UPDATE result_portal_sessions SET revoked_at=NULL;UPDATE result_access_identities SET expires_at='2000-01-01'");expect(await resultIdentity(request,env)).toBeNull();
    db.exec("UPDATE result_access_identities SET expires_at='2099-01-01';UPDATE result_portal_sessions SET expires_at='2000-01-01'");expect(await resultIdentity(request,env)).toBeNull();
  } finally { db.close(); }
});
