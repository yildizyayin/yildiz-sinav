import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S004: a result-network dealer reaches only the institutions in its own scope, and loses them when suspended or descoped. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','99999999','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgrA','INSTITUTION_MANAGER','A','u','u',1,'school'),('mgrB','INSTITUTION_MANAGER','B','u','u',1,'other');
    INSERT INTO scan_batches(id,exam_id,institution_id,source_type,status,created_by) VALUES('bA','${t.examId}','school','TXT','COMMITTED','admin'),('bB','${t.examId}','other','TXT','COMMITTED','admin');`);
  // a participant of the other institution in the same exam
  const cols = (table: string) => (t.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name);
  const copy = (table: string, set: Record<string, string>, where: string) => { const c = cols(table); t.db.exec(`INSERT INTO ${table}(${c.join(',')}) SELECT ${c.map((n) => set[n] ?? n).join(',')} FROM ${table} WHERE ${where} LIMIT 1`); };
  t.db.exec('PRAGMA foreign_keys=OFF');
  copy('exam_participants', { id: "'pOther'", institution_id: "'other'", season_id: "'season2'", student_id: 'NULL', name_snapshot: "'BASKA OGRENCI'" }, `institution_id='school'`);
  copy('exam_results', { id: "'rOther'", participant_id: "'pOther'", institution_id: "'other'" }, `participant_id=(SELECT id FROM exam_participants WHERE institution_id='school' LIMIT 1)`);
  t.db.exec('PRAGMA foreign_keys=ON');
  const cookies: Record<string, string> = {};
  t.db.exec(`UPDATE institutions SET code='11111111' WHERE id='school';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('11111111','Synthetic School','SYNTHETIC SCHOOL','ANKARA','ÇANKAYA','https://example.invalid'),('99999999','Other School','OTHER SCHOOL','İZMİR','KONAK','https://example.invalid');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi A','u','u',1,NULL),('dealerB','INSTITUTION_MANAGER','Bayi B','u','u',1,NULL),('dealerC','INSTITUTION_MANAGER','Bayi C','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED'),('dB','dealerB','APPROVED'),('dC','dealerC','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,meb_code,city,district) VALUES('sA','dA','INSTITUTION','11111111',NULL,NULL),('sB','dB','INSTITUTION','99999999',NULL,NULL),('sC','dC','CITY',NULL,'İZMİR',NULL);`);
  for (const id of ['dealerA', 'dealerB', 'dealerC', 'admin']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const as = async (who: string, path: string) => {
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com' } }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text };
  };
  return { t, as };
}

const report = (batch: string) => `/api/admin/result-network/operations/scan-batches/${batch}/report`;

describe('S004 result portal dealer access', () => {
  it('lets a dealer reach only institutions inside its own scope', async () => {
    const { as } = await setup();
    expect((await as('dealerA', report('bA'))).status).toBe(200);
    expect((await as('dealerA', report('bB'))).status).toBe(403);
    expect((await as('dealerB', report('bB'))).status).toBe(200);
    expect((await as('dealerB', report('bA'))).status).toBe(403);
    expect((await as('dealerC', report('bB'))).status).toBe(200); // İzmir city scope
    expect((await as('dealerC', report('bA'))).status).toBe(403);
    const theirs = await as('dealerB', report('bB'));
    expect(theirs.data.rows.map((r: any) => r.participant_id)).toEqual(['pOther']);
    const catalog = async (who: string) => (await as(who, '/api/admin/result-network/operations/catalog?mode=DEALER')).data.institutions.map((i: any) => i.id);
    expect(await catalog('dealerA')).toEqual(['school']);
    expect(await catalog('dealerB')).toEqual(['other']);
    expect(await catalog('dealerC')).toEqual(['other']);
    // a dealer account is not an institution manager in the app: it sees no exam definitions
    const defs = await as('dealerA', '/api/exam-definitions');
    expect(defs.status, defs.text).toBe(200);
    expect(defs.data.exams).toEqual([]);
    expect((await as('admin', '/api/exam-definitions')).data.exams.length).toBeGreaterThan(0);
  });

  it('closes a dealer when it is suspended or its scope is removed, without touching other dealers', async () => {
    const { t, as } = await setup();
    t.db.exec(`UPDATE result_network_dealers SET status='SUSPENDED' WHERE id='dA'; UPDATE result_network_dealer_scopes SET active=0 WHERE id='sC';`);
    expect((await as('dealerA', report('bA'))).status).toBe(403);
    expect((await as('dealerC', report('bB'))).status).toBe(403);
    expect((await as('dealerA', '/api/admin/result-network/operations/catalog?mode=DEALER')).status).toBe(403);
    expect((await as('dealerB', report('bB'))).status).toBe(200);
  });

  it('keeps network administration with the Super Admin', async () => {
    const { as } = await setup();
    expect((await as('dealerA', '/api/admin/result-network/administrations')).status).toBe(403);
  });
});
