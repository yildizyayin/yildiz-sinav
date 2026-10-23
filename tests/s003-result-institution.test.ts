import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S003: on sonuc.anunex.com an institution operator sees only its own institution, and a closed institution loses access. Synthetic data only. */
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
  for (const id of ['mgrA', 'mgrB', 'admin', 'teacher', 'stuuser']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const as = async (who: string, path: string) => {
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com' } }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text };
  };
  return { t, as };
}

describe('S003 result portal institution access', () => {
  it('shows a manager only their own institution and its own participants', async () => {
    const { t, as } = await setup();
    const own = await as('mgrA', '/api/admin/result-network/operations/scan-batches/bA/report');
    expect(own.status, own.text).toBe(200);
    expect(own.data.rows.length).toBeGreaterThan(0);
    const schoolParticipants = new Set((t.db.prepare(`SELECT id FROM exam_participants WHERE institution_id='school'`).all() as any[]).map((r) => r.id));
    expect(own.data.rows.every((r: any) => schoolParticipants.has(r.participant_id))).toBe(true);
    expect(own.data.rows.some((r: any) => r.participant_id === 'pOther')).toBe(false);
    const theirs = await as('mgrB', '/api/admin/result-network/operations/scan-batches/bB/report');
    expect(theirs.data.rows.map((r: any) => r.participant_id)).toEqual(['pOther']);
    expect((await as('mgrB', '/api/admin/result-network/operations/scan-batches/bA/report')).status).toBe(403);
    expect((await as('mgrA', '/api/admin/result-network/operations/scan-batches/bB/report')).status).toBe(403);
    expect((await as('mgrB', '/api/admin/result-network/operations/scan-batches/bA')).status).toBe(403);
    for (const who of ['teacher', 'stuuser']) expect((await as(who, '/api/admin/result-network/operations/scan-batches/bA/report')).status).toBe(403);
    const catalog = await as('mgrA', '/api/admin/result-network/operations/catalog');
    expect(catalog.status, catalog.text).toBe(200);
    expect(catalog.data.institutions.map((i: any) => i.id)).toEqual(['school']);
  });

  it('closes access when the institution is suspended, frozen or archived', async () => {
    const { t, as } = await setup();
    t.db.exec(`INSERT INTO institution_access_controls(institution_id,lifecycle_status,updated_by) VALUES('school','FROZEN','admin')`);
    expect((await as('mgrA', '/api/admin/result-network/operations/scan-batches/bA/report')).status).toBe(409);
    expect((await as('admin', '/api/admin/result-network/operations/scan-batches/bA/report')).status).toBe(409);
    expect((await as('mgrA', '/api/admin/result-network/operations/catalog')).status).toBe(403);
    t.db.exec(`UPDATE institutions SET status='PASSIVE' WHERE id='school'`);
    expect((await as('mgrA', '/api/admin/result-network/operations/scan-batches/bA/report')).status).toBe(401);
    // the other institution is unaffected
    expect((await as('mgrB', '/api/admin/result-network/operations/scan-batches/bB/report')).status).toBe(200);
  });
});
