import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A045: student import. Bulk add with class/section, duplicate checks (in the file and against the school),
 * a person resolves unclear rows, and nothing crosses into another institution. Synthetic names only.
 */
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

describe('A045: student import', () => {
  it('bulk add with sections; in-file duplicates and impossible grades wait for a person; numbers taken meanwhile are not duplicated', async () => {
    const t = await setup();
    try {
      const pre = await t.as('mgr', '/api/imports/preview', 'POST', t.csv(['numara;ad_soyad;sınıf', '101;ALI YILMAZ;8/A', '201;AYŞE KAYA;8/B', '201;AYSE KAYA;8/B', '202;MEHMET DEMİR;13/A', '203;ZEYNEP AK;8/B']));
      expect(pre.status, pre.text).toBe(200);
      expect(pre.data.summary).toEqual({ total: 5, matched: 1, new: 2, review: 2 });
      const id = pre.data.importJobId;
      const job = await t.as('mgr', `/api/imports/${id}`);
      const byRow = Object.fromEntries(job.data.rows.map((r: any) => [r.row_no, r]));
      expect([byRow[2].match_status, byRow[3].match_status, byRow[4].match_status, byRow[5].match_status, byRow[6].match_status]).toEqual(['ACTIVE_MATCH', 'NEW_GUEST', 'REVIEW_DUPLICATE', 'REVIEW_GRADE', 'NEW_GUEST']);
      expect(byRow[4].issues[0]).toContain('3. satırda');
      expect((await t.as('mgr', `/api/imports/${id}/commit`, 'POST', {})).status).toBe(400);

      // a person decides; an impossible grade cannot become a student
      expect((await t.as('mgr', `/api/imports/${id}/rows/${byRow[5].id}/resolve`, 'POST', { action: 'NEW' })).status).toBe(400);
      expect((await t.as('mgr', `/api/imports/${id}/rows/${byRow[5].id}/resolve`, 'POST', { action: 'SKIP' })).data.remaining).toBe(1);
      // linking to a student of another school is refused
      expect((await t.as('mgr', `/api/imports/${id}/rows/${byRow[4].id}/resolve`, 'POST', { action: 'MATCH', studentId: 'so1' })).status).toBe(400);
      expect((await t.as('mgr', `/api/imports/${id}/rows/${byRow[4].id}/resolve`, 'POST', { action: 'SKIP' })).data).toMatchObject({ remaining: 0 });

      // between preview and commit another student got number 203
      t.db.exec(`INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES('s203','B','C','b c','ACTIVE');
        INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES('e203','s203','school','season','203',8,'B','ACTIVE');`);
      const commit = await t.as('mgr', `/api/imports/${id}/commit`, 'POST', {});
      expect(commit.status, commit.text).toBe(200);
      expect(commit.data).toMatchObject({ created: 1, reused: 1, skipped: 2, conflicts: [6] });
      expect(t.db.prepare(`SELECT student_number n,grade_level g,section s FROM student_enrollments WHERE institution_id='school' AND student_number IN ('201','203') ORDER BY n`).all()).toEqual([{ n: '201', g: 8, s: 'B' }, { n: '203', g: 8, s: 'B' }]);
      expect(t.db.prepare(`SELECT count(*) c FROM student_enrollments WHERE institution_id='school' AND student_number='203'`).get()).toEqual({ c: 1 });
      expect(t.db.prepare(`SELECT count(*) c FROM classes WHERE institution_id='school' AND grade_level=8 AND section='B'`).get()).toEqual({ c: 1 });
      // committing twice changes nothing
      expect((await t.as('mgr', `/api/imports/${id}/commit`, 'POST', {})).data.alreadyCommitted).toBe(true);
    } finally { t.db.close(); }
  }, 60000);

  it('no cross-institution leak: foreign season refused, foreign jobs invisible, only managers import', async () => {
    const t = await setup();
    try {
      expect((await t.as('mgr', '/api/imports/preview', 'POST', t.csv(['numara;ad_soyad;sınıf', '301;YENİ ÖĞRENCİ;8/A'], { seasonId: 'season2' }))).data.error.code).toBe('SEASON_NOT_IN_INSTITUTION');
      // the other school's existing number 901 is not a match for this school
      const pre = await t.as('mgr', '/api/imports/preview', 'POST', t.csv(['numara;ad_soyad;sınıf', '901;ELİF SOY;8/A']));
      expect(pre.data.summary).toMatchObject({ matched: 0, new: 1 });
      for (const path of [`/api/imports/${pre.data.importJobId}`]) expect((await t.as('othermgr', path)).status).toBe(404);
      expect((await t.as('othermgr', `/api/imports/${pre.data.importJobId}/commit`, 'POST', {})).status).toBe(404);
      expect((await t.as('teacher', '/api/imports/preview', 'POST', t.csv(['numara;ad_soyad', '1;A B']))).status).toBe(403);
      expect((await t.as('mgr', `/api/imports/${pre.data.importJobId}/commit`, 'POST', {})).data).toMatchObject({ created: 1 });
      expect(t.db.prepare(`SELECT count(*) c FROM student_enrollments WHERE institution_id='other'`).get()).toEqual({ c: 1 });
    } finally { t.db.close(); }
  }, 60000);
});
