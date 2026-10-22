import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';
import { normalizeTable, verificationBlockers } from '../worker/lib/written-scenarios';

/**
 * A037: common written exam distribution tables. Year, term, province, scope, source and distribution are
 * validated; a table is officially verified only from a same-year MEB source whose outcome codes exist in
 * the verified curriculum. Without a 2027-2028 document the 2027-2028 table stays unverified.
 * Real schema, production entry chain, synthetic data.
 */
const SRC_2627 = 'https://www.meb.gov.tr/birinci-donem-ortak-yazili-sinavlarinin-konu-soru-dagilim-tablolari-yayimlandi/haber/00000/tr';
const table = (over: any = {}) => ({
  academicYear: '2026-2027', term: 1, examNo: 1, gradeLevel: 8, subjectId: 'sub_tur', authority: 'ODSGM',
  sourceTitle: 'Birinci dönem ortak yazılı konu-soru dağılım tabloları', sourceUrl: SRC_2627, sourceAcademicYear: '2026-2027',
  scenarios: [
    { label: '1. Senaryo', rows: [{ unit: 'Okuma', topic: 'Ana fikir', outcomeCode: 'T.8.1.1', questionCount: 3 }, { unit: 'Yazma', topic: 'Paragraf', questionCount: 2 }] },
    { label: '2. Senaryo', rows: [{ unit: 'Okuma', topic: 'Ana fikir', outcomeCode: 'T.8.1.1', questionCount: 5 }] },
  ],
  ...over,
});

async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`UPDATE institutions SET city='Ankara' WHERE id='school';
    INSERT INTO institutions(id,name,code,status,city) VALUES('other','Other School','OTHER','ACTIVE','İzmir');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES
      ('mgr','INSTITUTION_MANAGER','Manager','unused','unused',1,'school'),('othermgr','INSTITUTION_MANAGER','Other','unused','unused',1,'other');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr', 'teacher', 'stuuser', 'parent']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (id: string, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[id], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, data };
  };
  const ids = async (id: string, qs = '') => ((await as(id, `/api/written-scenarios${qs}`)).data.tables as any[]).map((r) => r.id);
  return { ...t, as, ids };
}

describe('A037: written exam scenarios', () => {
  it('validation: year, term, scope, source and distribution', () => {
    expect(normalizeTable(table()).errors).toEqual([]);
    const bad = (over: any) => normalizeTable(table(over)).errors.join(' | ');
    expect(bad({ academicYear: '2027-2029' })).toContain('Eğitim yılı');
    expect(bad({ term: 3 })).toContain('Dönem');
    expect(bad({ authority: 'IL_ZUMRE' })).toContain('il belirtilmelidir');
    expect(bad({ province: 'Ankara' })).toContain('ülke geneli');
    expect(bad({ authority: 'OKUL_ZUMRE' })).toContain('okula bağlı');
    expect(bad({ sourceUrl: 'http://meb.gov.tr/x' })).toContain('https');
    expect(bad({ scenarios: [] })).toContain('En az bir senaryo');
    expect(bad({ scenarios: [{ label: 'A', rows: [{ topic: 'x', questionCount: 0 }] }] })).toContain('1–20');
    expect(bad({ scenarios: [{ label: 'A', rows: [{ questionCount: 2 }] }] })).toContain('ünite, konu veya kazanım');
    expect(bad({ scenarios: [{ label: 'A', rows: Array.from({ length: 3 }, () => ({ topic: 'x', questionCount: 20 })) }] })).toContain('en çok 50');
    expect(bad({ scenarios: [{ label: 'A', rows: [{ topic: 'x', questionCount: 1 }] }, { label: 'a', rows: [{ topic: 'x', questionCount: 1 }] }] })).toContain('aynı adda');

    expect(verificationBlockers(table())).toEqual([]);
    // no 2027-2028 document: a 2027-2028 table on a 2026-2027 source is not official
    expect(verificationBlockers(table({ academicYear: '2027-2028' })).join()).toContain('2027-2028 için resmî doğrulama ancak 2027-2028 belgesiyle');
    expect(verificationBlockers(table({ sourceUrl: 'https://ornek-yayin.com/tablo' })).join()).toContain('meb.gov.tr');
    expect(verificationBlockers(table({ sourceUrl: 'https://meb.gov.tr.ornek.com/tablo' })).join()).toContain('meb.gov.tr');
    expect(verificationBlockers(table({ authority: 'IL_ZUMRE', province: 'Ankara', sourceUrl: 'https://ankara.meb.gov.tr/x' }))).toEqual([]);
    expect(verificationBlockers(table({ authority: 'IL_ZUMRE', province: 'Ankara', sourceUrl: 'https://www.meb.gov.tr.evil.com/x' })).length).toBe(1);
    expect(verificationBlockers(table({ authority: 'OKUL_ZUMRE', institutionId: 'x' })).join()).toContain('resmî olarak doğrulanmaz');
    expect(verificationBlockers(table({ sourceAcademicYear: null })).join()).toContain('eğitim yılına');
    expect(verificationBlockers(table(), ['X.1']).join()).toContain('X.1');
  });

  it('Super Admin enters and verifies a same-year ÖDSGM table; it is then locked and visible to schools', async () => {
    const t = await setup();
    try {
      const created = await t.as('admin', '/api/written-scenarios', 'POST', table());
      expect(created.status, created.text).toBe(201);
      expect(created.data).toMatchObject({ unknownOutcomeCodes: [], blockers: [] });
      const id = created.data.id;
      // a draft is not shown to schools
      expect(await t.ids('mgr')).not.toContain(id);
      expect((await t.as('mgr', `/api/written-scenarios/${id}`)).status).toBe(404);
      const detail = await t.as('admin', `/api/written-scenarios/${id}`);
      expect(detail.data.table.scenarios.map((s: any) => [s.label, s.total])).toEqual([['1. Senaryo', 5], ['2. Senaryo', 5]]);
      expect(detail.data.table.scenarios[0].rows[0]).toMatchObject({ outcome_code: 'T.8.1.1', outcome_id: 'o_tur1' });

      expect((await t.as('mgr', `/api/written-scenarios/${id}/verify`, 'POST', {})).status).toBe(403);
      const v = await t.as('admin', `/api/written-scenarios/${id}/verify`, 'POST', {});
      expect(v.status, v.text).toBe(200);
      expect((await t.as('admin', `/api/written-scenarios/${id}`, 'PUT', table())).data.error.code).toBe('TABLE_LOCKED');
      for (const who of ['mgr', 'othermgr', 'teacher']) expect(await t.ids(who), who).toContain(id);
      for (const who of ['stuuser', 'parent']) expect((await t.as(who, '/api/written-scenarios')).status, who).toBe(403);

      const audits = t.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='written_exam_table' AND entity_id=? ORDER BY rowid`).all(id).map((r: any) => r.action);
      expect(audits).toEqual(['WRITTEN_TABLE_CREATED', 'WRITTEN_TABLE_VERIFIED']);
    } finally { t.db.close(); }
  }, 60000);

  it('2027-2028: without a 2027-2028 document the table cannot be verified; unknown outcome codes block it too', async () => {
    const t = await setup();
    try {
      const next = await t.as('admin', '/api/written-scenarios', 'POST', table({ academicYear: '2027-2028' }));
      expect(next.status, next.text).toBe(201);
      // T.8.1.1 is in the verified 2026-2027 programme only
      expect(next.data.unknownOutcomeCodes).toEqual(['T.8.1.1']);
      const v = await t.as('admin', `/api/written-scenarios/${next.data.id}/verify`, 'POST', {});
      expect(v.status).toBe(409);
      expect(v.data.error.code).toBe('VERIFICATION_BLOCKED');
      expect(v.data.error.details.join(' ')).toContain('2027-2028 için resmî doğrulama ancak 2027-2028 belgesiyle');
      expect((t.db.prepare('SELECT status FROM written_exam_tables WHERE id=?').get(next.data.id) as any).status).toBe('DRAFT');
      expect(await t.ids('mgr')).not.toContain(next.data.id);

      const typo = await t.as('admin', '/api/written-scenarios', 'POST', table({ scenarios: [{ label: 'A', rows: [{ topic: 'x', outcomeCode: 'T.8.9.9', questionCount: 2 }] }] }));
      expect((await t.as('admin', `/api/written-scenarios/${typo.data.id}/verify`, 'POST', {})).data.error.details.join()).toContain('T.8.9.9');
      // the detail tells the Super Admin why
      expect((await t.as('admin', `/api/written-scenarios/${typo.data.id}`)).data.blockers.join()).toContain('T.8.9.9');
    } finally { t.db.close(); }
  }, 60000);

  it('a provincial table is seen only by schools of that province', async () => {
    const t = await setup();
    try {
      const il = await t.as('admin', '/api/written-scenarios', 'POST', table({ authority: 'IL_ZUMRE', province: 'Ankara', subjectId: 'sub_mat', sourceUrl: 'https://ankara.meb.gov.tr/tablo', scenarios: [{ label: 'A', rows: [{ topic: 'Üslü ifadeler', outcomeCode: 'M.8.1.1', questionCount: 4 }] }] }));
      expect(il.status, il.text).toBe(201);
      expect((await t.as('admin', `/api/written-scenarios/${il.data.id}/verify`, 'POST', {})).status).toBe(200);
      expect(await t.ids('mgr')).toContain(il.data.id);
      expect(await t.ids('othermgr')).not.toContain(il.data.id);
      expect((await t.as('othermgr', `/api/written-scenarios/${il.data.id}`)).status).toBe(404);
    } finally { t.db.close(); }
  }, 60000);

  it('a school enters its own committee table (never official) and chooses a scenario; others cannot see or change it', async () => {
    const t = await setup();
    try {
      // a manager cannot pose as ÖDSGM or another school: the scope is forced to their own committee
      const own = await t.as('mgr', '/api/written-scenarios', 'POST', table({ authority: 'ODSGM', institutionId: 'other', sourceUrl: null, sourceAcademicYear: null }));
      expect(own.status, own.text).toBe(201);
      expect(t.db.prepare('SELECT authority,institution_id,status FROM written_exam_tables WHERE id=?').get(own.data.id)).toEqual({ authority: 'OKUL_ZUMRE', institution_id: 'school', status: 'ZUMRE' });
      expect((await t.as('admin', `/api/written-scenarios/${own.data.id}/verify`, 'POST', {})).data.error.code).toBe('TABLE_NOT_DRAFT');
      expect(await t.ids('othermgr')).not.toContain(own.data.id);
      expect((await t.as('othermgr', `/api/written-scenarios/${own.data.id}`, 'PUT', table())).status).toBe(404);
      expect((await t.as('teacher', `/api/written-scenarios/${own.data.id}`, 'PUT', table())).status).toBe(403);
      expect((await t.as('teacher', '/api/written-scenarios', 'POST', table())).status).toBe(403);
      expect(await t.ids('teacher')).toContain(own.data.id);

      const detail = await t.as('mgr', `/api/written-scenarios/${own.data.id}`);
      const second = detail.data.table.scenarios[1].id;
      expect((await t.as('teacher', `/api/written-scenarios/${own.data.id}/choice`, 'POST', { scenarioId: second })).status).toBe(403);
      const chose = await t.as('mgr', `/api/written-scenarios/${own.data.id}/choice`, 'POST', { scenarioId: second, note: 'Zümre toplantısı kararı' });
      expect(chose.status, chose.text).toBe(200);
      expect((await t.as('mgr', '/api/written-scenarios')).data.tables.find((r: any) => r.id === own.data.id).chosen_scenario_id).toBe(second);
      expect((await t.as('mgr', `/api/written-scenarios/${own.data.id}/choice`, 'POST', { scenarioId: 'nope' })).status).toBe(400);

      // a draft (unverified) official table cannot be chosen
      const draft = await t.as('admin', '/api/written-scenarios', 'POST', table({ academicYear: '2027-2028' }));
      t.db.prepare(`UPDATE written_exam_tables SET status='DRAFT' WHERE id=?`).run(draft.data.id);
      expect((await t.as('mgr', `/api/written-scenarios/${draft.data.id}/choice`, 'POST', { scenarioId: 'x' })).status).toBe(404);

      // editing the committee table resets the choice; archiving removes it from the list
      expect((await t.as('mgr', `/api/written-scenarios/${own.data.id}`, 'PUT', table())).status).toBe(200);
      expect((t.db.prepare('SELECT count(*) c FROM written_exam_scenario_choices WHERE table_id=?').get(own.data.id) as any).c).toBe(0);
      expect((await t.as('mgr', `/api/written-scenarios/${own.data.id}/archive`, 'POST', {})).status).toBe(200);
      expect(await t.ids('mgr')).not.toContain(own.data.id);
      expect(await t.ids('admin', '?archived=1')).toContain(own.data.id);
    } finally { t.db.close(); }
  }, 60000);
});
