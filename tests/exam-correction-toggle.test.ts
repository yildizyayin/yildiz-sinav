import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
process.env.TZ = 'UTC';

/** 3 Nov (owner): one correction switch opens and closes the app and the result network publication together. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  Object.assign(t.env, { RESULT_LOOKUP_SECRET: 'synthetic-lookup-secret' });
  const participant = (t.db.prepare(`SELECT id FROM exam_participants WHERE institution_id='school' LIMIT 1`).get() as any).id;
  t.db.exec(`UPDATE institutions SET code='11111111' WHERE id='school';
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES('11111111','Synthetic School','SYNTHETIC SCHOOL','ANKARA','ÇANKAYA','https://example.invalid');
    INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status) VALUES('adm','${t.examId}','2026-2027','RESULT_NETWORK','READY');`);
  const admin = (await createSession(t.env, 'admin', new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const sonuc = async (path: string, body: any) => { const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: 'POST', headers: { Cookie: admin, Origin: 'https://sonuc.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), t.env, { waitUntil: () => {}, passThroughOnException: () => {} }); return { status: r.status, text: await r.text() }; };
  expect((await sonuc('/api/admin/result-network/access', { administrationId: 'adm', participantId: participant, mebCode: '11111111', studentNumber: '101', gradeLevel: 8, fullName: 'ALI YILMAZ' })).status).toBeLessThan(300);
  const fin = await sonuc('/api/admin/result-network/administrations/adm/finalize', {});
  expect(fin.status, fin.text).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/freeze`, 'POST')).response.status).toBe(200);
  expect((await t.request(`/api/platform/exam-center/${t.examId}/publish`, 'POST')).response.status).toBe(200);
  return t;
}
const state = (t: any) => ({ app: (t.db.prepare('SELECT result_freeze_status s FROM exam_delivery_profiles WHERE exam_id=?').get(t.examId) as any).s, net: (t.db.prepare(`SELECT status s FROM exam_administrations WHERE id='adm'`).get() as any).s });

describe('one correction switch', () => {
  it('opens both publications with a reason, closes only after re-evaluation, and restores both', async () => {
    const t = await setup();
    try {
      const url = `/api/exam-definitions/${t.examId}/correction`;
      let s = await t.request(url);
      expect(s.data).toMatchObject({ open: false, canOpen: true, app: { state: 'PUBLISHED' }, network: { status: 'PUBLISHED' } });
      expect((await t.request(url, 'POST', { action: 'OPEN', reason: 'kısa' })).data.error.code).toBe('CORRECTION_REASON_REQUIRED');
      expect((await t.request(url, 'POST', { action: 'OPEN', reason: 'Puanlama profili yanlış seçilmiş' }, 'teacher')).response.status).toBe(403);
      const opened = await t.request(url, 'POST', { action: 'OPEN', reason: 'Puanlama profili yanlış seçilmiş' });
      expect(opened.response.status, opened.text).toBe(200);
      expect(opened.data.steps).toEqual(['NETWORK_REOPENED', 'APP_REOPENED']);
      expect(opened.data.state.open).toBe(true);
      expect(state(t)).toEqual({ app: 'OPEN', net: 'READY' });
      // the scoring profile can now be changed (the guard sees an open correction)
      expect((await t.request(`/api/exam-definitions/${t.examId}/scoring-profile`)).data.correctionOpen).toBe(true);

      const early = await t.request(url, 'POST', { action: 'CLOSE' });
      expect(early.response.status).toBe(409);
      expect(early.data.error.code).toBe('CORRECTION_PENDING_EVALUATION');
      for (const b of early.data.state.pending) expect((await t.request(`/api/scan-batches/${b.id}/evaluate`, 'POST')).response.status).toBe(200);
      const closed = await t.request(url, 'POST', { action: 'CLOSE' });
      expect(closed.response.status, closed.text).toBe(200);
      expect(closed.data.steps).toEqual(['APP_FROZEN', 'APP_PUBLISHED', 'NETWORK_PUBLISHED']);
      expect(closed.data.state.open).toBe(false);
      expect(state(t)).toEqual({ app: 'PUBLISHED', net: 'PUBLISHED' });
      const audits = (t.db.prepare(`SELECT action FROM audit_logs WHERE action IN ('EXAM_RESULTS_REOPENED','RESULT_NETWORK_RESULTS_REOPENED') ORDER BY created_at`).all() as any[]).map((a) => a.action).sort();
      expect(audits).toEqual(['EXAM_RESULTS_REOPENED', 'RESULT_NETWORK_RESULTS_REOPENED']);
    } finally { t.db.close(); }
  }, 60000);
});
