import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/** A074: data transfer re-runs — the same file twice and two simultaneous commits create no copies and lose nothing. Synthetic names only. */
function memoryBucket() { const files = new Map<string, Uint8Array>(); return { files, async put(k: string, b: any) { files.set(k, new Uint8Array(await new Response(b).arrayBuffer())); return {}; }, async get() { return null; } }; }
async function setup() {
  const t = await evaluatedExam('direct');
  (t.env as any).FILES = memoryBucket();
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season2','other','2026-2027','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other');
    INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('so1','ELİF','SOY','elif soy','ACTIVE');
    INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('eo1','so1','other','season2','901',8,'A','ACTIVE');`);
  const cookies: Record<string, string> = {};
  for (const id of ['mgr', 'othermgr', 'teacher']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (who: string, path: string, method = 'GET', body?: any) => {
    const form = body instanceof FormData;
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[who], Origin: 'https://app.anunex.com', ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ } return { status: res.status, text, data };
  };
  const csv = (lines: string[], extra: Record<string, string> = {}) => { const f = new FormData(); f.append('file', new File([lines.join('\n')], 'ogrenciler.csv', { type: 'text/csv' })); for (const [k, v] of Object.entries(extra)) f.append(k, v); return f; };
  return { ...t, as, csv };
}

describe('A074 transfer re-runs', () => {
  it('importing the same file again matches instead of copying, and parallel commits do not duplicate', async () => {
    const t = await setup();
    try {
      const lines = ['numara;ad_soyad;sınıf', '301;DENIZ AY;8/C', '302;EFE SU;8/C'];
      const first = await t.as('mgr', '/api/imports/preview', 'POST', t.csv(lines));
      expect(first.data.summary).toMatchObject({ total: 2, new: 2 });
      const [a, b] = await Promise.all([t.as('mgr', `/api/imports/${first.data.importJobId}/commit`, 'POST', {}), t.as('mgr', `/api/imports/${first.data.importJobId}/commit`, 'POST', {})]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const count = () => (t.db.prepare(`SELECT count(*) c FROM student_enrollments WHERE institution_id='school' AND student_number IN ('301','302')`).get() as any).c;
      expect(count()).toBe(2);
      // the same file again: both rows are recognised, nothing new is created, nothing is lost
      const again = await t.as('mgr', '/api/imports/preview', 'POST', t.csv(lines));
      expect(again.data.summary).toMatchObject({ total: 2, matched: 2, new: 0 });
      expect((await t.as('mgr', `/api/imports/${again.data.importJobId}/commit`, 'POST', {})).data).toMatchObject({ created: 0, reused: 2 });
      expect(count()).toBe(2);
      expect((t.db.prepare(`SELECT count(*) c FROM student_entities WHERE normalized_name IN ('deniz ay','efe su')`).get() as any).c).toBe(2);
      // another school's manager cannot commit or read this job
      expect((await t.as('othermgr', `/api/imports/${again.data.importJobId}`)).status).toBe(404);
      expect((await t.as('othermgr', `/api/imports/${again.data.importJobId}/commit`, 'POST', {})).status).toBe(404);
    } finally { t.db.close(); }
  }, 60000);
});
