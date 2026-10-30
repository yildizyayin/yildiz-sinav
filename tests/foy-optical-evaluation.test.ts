import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import resultWorker from '../worker/result-worker-entry';
import { createSession } from '../worker/lib/auth';

/**
 * Föy değerlendirme (30 Oct): the Super Admin enters the föy key; on sonuc a paper föy optic is uploaded, matched to
 * the school's registered students and scored into FOY evidence. First submission counts. Synthetic data only.
 */
const line = (no: string, name: string, tur: string, mat: string) => '7108'.padEnd(10) + no.padStart(5) + name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + tur.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + mat.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);

async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO worksheets(id,academic_year,grade_level,track,sequence_no,title,status,program_code) VALUES('ws1','2026-2027',8,'NUMERIC',1,'8. Sınıf Sayısal Föy 1','PUBLISHED','SCHOOL');
    INSERT INTO worksheet_subjects(id,worksheet_id,subject_id,question_count) VALUES('wss1','ws1','sub_tur',4),('wss2','ws1','sub_mat',4);
    INSERT INTO worksheet_question_links(id,worksheet_id,subject_id,question_no,outcome_id) VALUES('wql1','ws1','sub_tur',1,'o_tur1');`);
  return t;
}

describe('föy paper optic on sonuc', () => {
  it('needs a complete key, scores registered students into FOY evidence and counts the first submission', async () => {
    const t = await setup();
    const sessions: Record<string, string> = {};
    for (const id of ['admin', 'teacher']) sessions[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const sonuc = async (path: string, method = 'GET', body?: any, as = 'admin') => {
      const form = body instanceof FormData;
      const res = await (resultWorker as any).fetch(new Request(`https://sonuc.anunex.com${path}`, { method, headers: { Cookie: sessions[as], Origin: 'https://sonuc.anunex.com', ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) }), t.env, ctx);
      const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, text };
    };
    const upload = (lines: string[], name: string) => { const f = new FormData(); f.set('worksheetId', 'ws1'); f.set('institutionId', 'school'); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([lines.join('\r\n')], name, { type: 'text/plain' })); return sonuc('/api/admin/result-network/operations/foy/upload', 'POST', f); };
    const poolBefore = (t.db.prepare('SELECT count(*) c FROM question_bank').get() as any).c;

    // without a key the föy is not offered and cannot be uploaded
    let cat = await sonuc('/api/admin/result-network/operations/foy/catalog');
    expect(cat.status, cat.text).toBe(200);
    expect(cat.data.worksheets.map((w: any) => w.id)).not.toContain('ws1');
    const waiting = cat.data.waitingForKey;
    expect(waiting).toBeGreaterThanOrEqual(1);
    expect((await upload([line('101', 'ALI YILMAZ', 'ABCC', 'DC__')], 'a.txt')).data.error.code).toBe('FOY_KEY_INCOMPLETE');

    // the key is the Super Admin's
    expect((await t.request('/api/worksheet-admin/ws1/answer-key', 'PUT', { subjects: [{ subjectId: 'sub_tur', answers: 'ABCF' }] })).response.status).toBe(400);
    expect((await t.request('/api/worksheet-admin/ws1/answer-key', 'PUT', { subjects: [{ subjectId: 'sub_tur', answers: 'ABCD' }] }, 'teacher')).response.status).toBe(403);
    const saved = await t.request('/api/worksheet-admin/ws1/answer-key', 'PUT', { subjects: [{ subjectId: 'sub_tur', answers: 'ABCD' }, { subjectId: 'sub_mat', answers: ['D', 'C', 'B', 'A'] }] });
    expect(saved.response.status, saved.text).toBe(200);
    expect(saved.data).toMatchObject({ complete: true, missing: 0, locked: false });
    cat = await sonuc('/api/admin/result-network/operations/foy/catalog');
    expect(cat.data.worksheets.map((w: any) => w.id)).toContain('ws1');
    expect(cat.data.waitingForKey).toBe(waiting - 1);

    // a teacher cannot evaluate on sonuc
    expect((await sonuc('/api/admin/result-network/operations/foy/catalog', 'GET', undefined, 'teacher')).status).toBe(403);

    // upload: the registered student is matched by number, the unknown sheet is set aside with its reason
    const up = await upload([line('101', 'ALI YILMAZ', 'ABCC', 'DC__'), line('555', 'BILINMEYEN OGRENCI', 'ABCD', 'DCBA')], 'sinif.txt');
    expect(up.status, up.text).toBe(200);
    expect(up.data.counts, JSON.stringify(up.data.records)).toMatchObject({ total: 2, ready: 1, setAside: 1 });
    expect(up.data.records.find((r: any) => r.status === 'SET_ASIDE').reason).toMatch(/öğrenci listesinde bulunamadı/);
    expect((await upload([line('101', 'ALI YILMAZ', 'ABCC', 'DC__'), line('555', 'BILINMEYEN OGRENCI', 'ABCD', 'DCBA')], 'kopya.txt')).data.error.code).toBe('DUPLICATE_UPLOAD');

    const ev = await sonuc(`/api/admin/result-network/operations/foy/batches/${up.data.batch.id}/evaluate`, 'POST');
    expect(ev.status, ev.text).toBe(200);
    expect(ev.data.done).toBe(true);
    expect(ev.data.batch.status).toBe('COMMITTED');
    expect(ev.data.records.find((r: any) => r.status === 'SCORED')).toMatchObject({ correct: 5, wrong: 1, blank: 2, student_name: 'ALI YILMAZ' });
    const run = t.db.prepare(`SELECT source_type,source_id,delivery_mode,score,assignment_id FROM assessment_runs WHERE id='asr_foyws_ws1_s1'`).get() as any;
    expect(run).toMatchObject({ source_type: 'FOY', source_id: 'ws1', delivery_mode: 'OPTICAL', assignment_id: null });
    expect(run.score).toBeCloseTo(5 / 8);
    const evidence = t.db.prepare(`SELECT subject_id,result_status,context_valid,outcome_refs_json FROM frozen_foy_response_evidence WHERE run_id='asr_foyws_ws1_s1' ORDER BY subject_id,response_id`).all() as any[];
    expect(evidence).toHaveLength(8);
    const valid = evidence.filter((e) => e.context_valid === 1);
    expect(valid).toHaveLength(1);
    expect(JSON.parse(valid[0].outcome_refs_json)[0]).toMatchObject({ outcomeCode: 'T.8.1.1' });
    expect(evidence.filter((e) => e.result_status === 'BLANK')).toHaveLength(2);

    // the key is locked once evidence exists; an evaluated upload cannot be deleted
    expect((await t.request('/api/worksheet-admin/ws1/answer-key', 'PUT', { subjects: [{ subjectId: 'sub_tur', answers: 'AAAA' }] })).data.error.code).toBe('FOY_KEY_LOCKED');
    expect((await sonuc(`/api/admin/result-network/operations/foy/batches/${up.data.batch.id}`, 'DELETE')).status).toBe(409);

    // a second sheet of the same student does not overwrite the first submission
    const again = await upload([line('101', 'ALI YILMAZ', 'ABCD', 'DCBA')], 'ikinci.txt');
    const ev2 = await sonuc(`/api/admin/result-network/operations/foy/batches/${again.data.batch.id}/evaluate`, 'POST');
    expect(ev2.data.records[0]).toMatchObject({ status: 'SET_ASIDE' });
    expect(ev2.data.records[0].reason).toMatch(/ilk gönderim sayılır/);
    expect((t.db.prepare(`SELECT score FROM assessment_runs WHERE id='asr_foyws_ws1_s1'`).get() as any).score).toBeCloseTo(5 / 8);

    const hist = await sonuc('/api/admin/result-network/operations/foy/batches');
    expect(hist.data.batches).toHaveLength(2);
    expect((t.db.prepare('SELECT count(*) c FROM question_bank').get() as any).c).toBe(poolBefore);
  });
});
