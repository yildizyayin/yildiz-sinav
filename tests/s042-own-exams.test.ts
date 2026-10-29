import { describe, expect, it } from 'vitest';
import { setup } from './helpers/sonuc-setup';
import { generatedSheets } from './helpers/evaluation-snapshot';
import { centralExamOpenTo } from '../worker/lib/exam-audience';

process.env.TZ = 'UTC';

/** S042 (D-S039, D-S041): a school's and a dealer's own exam on sonuc. Synthetic schools, people and answers only. */
const KEY_A = { TUR: 'ABCDABCDABCDABCDABCD', INK: 'ABCDABCDAB', DIN: 'ABCDABCDAB', YAB: 'ABCDABCDAB', MAT: 'DCBADCBADCBADCBADCBA', FEN: 'ABCDABCDABCDABCDABCD' };
const KEY_B = { ...KEY_A, TUR: 'BCDABCDABCDABCDABCDA', MAT: 'ABCDABCDABCDABCDABCX' };

async function world() {
  const s = await setup();
  s.t.db.exec(`
    INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,source_url) VALUES
      ('740002','Kartal Deneme Ortaokulu','KARTAL DENEME ORTAOKULU','İstanbul','Kartal','https://www.meb.gov.tr/x'),
      ('060001','Çankaya Deneme Ortaokulu','CANKAYA DENEME ORTAOKULU','Ankara','Çankaya','https://www.meb.gov.tr/x');
    INSERT INTO institutions(id,name,code,meb_code,city,district,status) VALUES
      ('kP','Pendik Deneme Lisesi','740001','740001','İstanbul','Pendik','ACTIVE'),
      ('kK','Kartal Deneme Ortaokulu','740002','740002','İstanbul','Kartal','ACTIVE'),
      ('kA','Çankaya Deneme Ortaokulu','060001','060001','Ankara','Çankaya','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES
      ('mgrP','INSTITUTION_MANAGER','Pendik Müdür','u','u',1,'kP'),
      ('mgrK','INSTITUTION_MANAGER','Kartal Müdür','u','u',1,'kK'),
      ('mgrA','INSTITUTION_MANAGER','Çankaya Müdür','u','u',1,'kA');`);
  const line = (x: { no: string; name: string; TUR: string; MAT: string }) => '7108'.padEnd(10) + x.no.padStart(5) + x.name.padEnd(20) + '8A' + ' '.repeat(13) + 'A' + x.TUR.replace(/_/g, ' ').padEnd(20) + ' '.repeat(60) + x.MAT.replace(/_/g, ' ').padEnd(20) + ' '.repeat(20);
  const upload = (who: string, examId: string, institutionId: string, sheets = generatedSheets(4, 5)) => { const f = new FormData(); f.set('institutionId', institutionId); f.set('templateVersionId', 'optik-7108-sekonic-v1'); f.set('file', new File([sheets.map(line).join('\r\n')], `d${Math.random()}.txt`, { type: 'text/plain' })); return s.call(who, `/api/admin/result-network/operations/exams/${examId}/preview-file`, { method: 'POST', body: f }); };
  const create = (who: string, body: any) => s.call(who, '/api/admin/result-network/operations/own-exams', { method: 'POST', body: { title: 'Okulumuz LGS 1', preset: 'LGS', examDate: '2026-11-07', booklets: ['A', 'B'], keys: { A: KEY_A, B: KEY_B }, ...body } });
  const catalogIds = async (who: string, mode = 'INSTITUTION') => ((await s.call(who, `/api/admin/result-network/operations/catalog?mode=${mode}`)).data?.exams || []).map((e: any) => e.id);
  return { ...s, upload, create, catalogIds };
}

describe('S042 own exams on sonuc', () => {
  it('a school builds its own LGS exam from the ready structure with booklets; only that school sees and uses it', async () => {
    const { t, create, catalogIds, upload, call } = await world();
    const bad = await create('mgrP', { keys: { A: { ...KEY_A, TUR: 'ABC' }, B: { ...KEY_B, FEN: 'ABCDABCDABCDABCDABCQ' } } });
    expect(bad.status).toBe(400);
    expect(bad.data.problems.join(' ')).toContain('A kitapçığı Türkçe: 20 cevap olmalı, 3 yazıldı');
    expect(bad.data.problems.join(' ')).toContain('geçersiz harf "Q"');
    expect((t.db.prepare(`SELECT count(*) n FROM exams WHERE title='Okulumuz LGS 1'`).get() as any).n).toBe(0);

    const made = await create('mgrP', {});
    expect(made.status, made.text).toBe(201);
    const id = made.data.exam.id;
    const exam: any = t.db.prepare('SELECT owner_type,institution_id,status,exam_type,grade_level FROM exams WHERE id=?').get(id);
    expect(exam).toMatchObject({ owner_type: 'INSTITUTION', institution_id: 'kP', status: 'ACTIVE', exam_type: 'LGS', grade_level: 8 });
    expect((t.db.prepare(`SELECT count(*) n FROM exam_booklets WHERE exam_id=? AND active=1`).get(id) as any).n).toBe(2);
    expect((t.db.prepare(`SELECT count(*) n FROM answer_keys ak JOIN exam_questions q ON q.id=ak.exam_question_id WHERE q.exam_id=?`).get(id) as any).n).toBe(180);
    expect((t.db.prepare(`SELECT count(*) n FROM exam_questions WHERE exam_id=? AND question_status='CANCELLED'`).get(id) as any).n).toBe(1);

    expect(await catalogIds('mgrP')).toContain(id);
    expect(await catalogIds('admin')).toContain(id);
    for (const who of ['mgrK', 'mgrA']) expect(await catalogIds(who)).not.toContain(id);
    expect(await catalogIds('dealerI', 'DEALER')).not.toContain(id);

    expect((await upload('mgrK', id, 'kK')).status).toBe(403);
    expect((await upload('dealerI', id, 'kP')).status).toBe(403);
    const ok = await upload('mgrP', id, 'kP');
    expect(ok.status, ok.text).toBe(200);
    const ev = await call('mgrP', `/api/admin/result-network/operations/scan-batches/${ok.data.batchId}/evaluate`, { method: 'POST' });
    expect(ev.status, ev.text).toBe(200);
    expect((t.db.prepare('SELECT count(*) n FROM exam_participants WHERE exam_id=?').get(id) as any).n).toBe(4);
    // D-S041: the owner opens its own exam's results; nobody else can
    expect((await call('mgrK', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' })).status).toBe(403);
    expect((await call('dealerI', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' })).status).toBe(403);
    const st = await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}`);
    expect(st.data.participants).toBe(4);
    expect(st.data.administration.status).not.toBe('PUBLISHED');
    const pub = await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' });
    expect(pub.status, pub.text).toBe(200);
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}`)).data.administration.status).toBe('PUBLISHED');
    expect((t.db.prepare('SELECT count(*) n FROM exam_result_snapshots WHERE exam_id=? AND national_rank IS NULL').get(id) as any).n).toBe(4);
    // central exams stay with the Super Admin
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${t.examId}/publish`, { method: 'POST' })).status).toBe(403);
  });

  it('a dealer\'s exam is used by the dealer and the schools in its scope, never opened in the app to others, and has no Türkiye rank', async () => {
    const { t, create, catalogIds, upload, call } = await world();
    const made = await create('dealerI', { mode: 'DEALER', title: 'Bayi LGS', booklets: ['A'], keys: { A: KEY_A } });
    expect(made.status, made.text).toBe(201);
    const id = made.data.exam.id;
    expect(t.db.prepare('SELECT owner_kind,dealer_id FROM result_network_own_exams WHERE exam_id=?').get(id)).toEqual({ owner_kind: 'DEALER', dealer_id: 'dI' });
    expect(await catalogIds('dealerI', 'DEALER')).toContain(id);
    expect(await catalogIds('mgrP')).toContain(id);
    expect(await catalogIds('mgrK')).toContain(id);
    expect(await catalogIds('mgrA')).not.toContain(id);
    // app: a central exam with no institution list is open to all, but a dealer's own exam is not; its app channel is closed
    expect(await centralExamOpenTo(t.env, id, 'kA')).toBe(false);
    expect(await centralExamOpenTo(t.env, id, 'kP')).toBe(false);
    expect(await centralExamOpenTo(t.env, t.examId, 'kA')).toBe(true);
    expect(t.db.prepare(`SELECT status FROM exam_channel_publications WHERE exam_id=? AND channel='LICENSED'`).get(id)).toBeUndefined();

    expect((await upload('mgrA', id, 'kA')).status).toBe(403);
    const byDealer = await upload('dealerI', id, 'kK', generatedSheets(3, 7));
    expect(byDealer.status, byDealer.text).toBe(200);
    expect((await call('dealerI', `/api/admin/result-network/operations/scan-batches/${byDealer.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);
    const bySchool = await upload('mgrP', id, 'kP', generatedSheets(2, 13).map((x, i) => ({ ...x, no: String(4000 + i) })));
    expect(bySchool.status, bySchool.text).toBe(200);
    expect((await call('mgrP', `/api/admin/result-network/operations/scan-batches/${bySchool.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);

    const adm = (t.db.prepare(`SELECT id FROM exam_administrations WHERE exam_id=? AND channel='RESULT_NETWORK'`).get(id) as any).id;
    expect(adm).toBeTruthy();
    const pub = await call('dealerI', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' });
    expect(pub.status, pub.text).toBe(200);
    const ranks = t.db.prepare(`SELECT national_rank,institution_rank FROM exam_result_snapshots WHERE exam_id=?`).all(id) as any[];
    expect(ranks.length).toBe(5);
    expect(ranks.every((r) => r.national_rank === null && r.institution_rank !== null)).toBe(true);
  });

  it('the owner corrects the key (results taken back, uploads evaluated again, opened again) and removes the exam', async () => {
    const { t, create, catalogIds, upload, call } = await world();
    const id = (await create('mgrP', { booklets: ['A'], keys: { A: KEY_A } })).data.exam.id;
    const up = await upload('mgrP', id, 'kP');
    expect((await call('mgrP', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' })).status).toBe(200);
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' })).status).toBe(200);
    const nets = () => (t.db.prepare(`SELECT sum(er.net) n FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`).get(id) as any).n;
    const before = nets();
    const st = (await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}`)).data;
    expect(st.keys.A.TUR).toBe(KEY_A.TUR);
    expect(st.sections.map((x: any) => x.subjectCode)).toEqual(['TUR', 'INK', 'DIN', 'YAB', 'MAT', 'FEN']);
    const fixed = { ...KEY_A, TUR: 'DCBADCBADCBADCBADCBA', MAT: 'ABCDABCDABCDABCDABCD' };
    const path = `/api/admin/result-network/operations/own-exams/${id}/answer-key`;
    expect((await call('mgrK', path, { method: 'POST', body: { keys: { A: fixed }, reason: 'Anahtar yanlıştı' } })).status).toBe(403);
    expect((await call('mgrP', path, { method: 'POST', body: { keys: { A: fixed } } })).status).toBe(400);
    const fix = await call('mgrP', path, { method: 'POST', body: { keys: { A: fixed }, reason: 'Matematik anahtarı yanlış girilmişti' } });
    expect(fix.status, fix.text).toBe(200);
    expect(fix.data.wasPublished).toBe(true);
    expect(fix.data.reevaluateBatchIds).toEqual([up.data.batchId]);
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}`)).data.administration.status).not.toBe('PUBLISHED');
    let done = false; for (let i = 0; i < 10 && !done; i++) { const ev = await call('mgrP', `/api/admin/result-network/operations/scan-batches/${up.data.batchId}/evaluate`, { method: 'POST' }); expect(ev.status, ev.text).toBe(200); done = ev.data.done !== false; }
    expect(nets()).not.toBe(before);
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}`)).data.keys.A.MAT).toBe(fixed.MAT);
    expect((await call('mgrP', `/api/admin/result-network/operations/own-exams/${id}/publish`, { method: 'POST' })).status).toBe(200);
    // remove: reason required when students have results; then gone from the catalog and from students
    const rm = `/api/admin/result-network/operations/own-exams/${id}/remove`;
    expect((await call('mgrK', rm, { method: 'POST', body: { reason: 'Yanlış sınav' } })).status).toBe(403);
    expect((await call('mgrP', rm, { method: 'POST', body: {} })).status).toBe(400);
    const gone = await call('mgrP', rm, { method: 'POST', body: { reason: 'Yanlış sınav eklendi' } });
    expect(gone.status, gone.text).toBe(200);
    expect(await catalogIds('mgrP')).not.toContain(id);
    expect((t.db.prepare(`SELECT status FROM exam_channel_publications WHERE exam_id=? AND channel='RESULT_NETWORK'`).get(id) as any).status).toBe('ARCHIVED');
  });

  it('only a school manager or an approved dealer adds an own exam', async () => {
    const { create } = await world();
    expect((await create('admin', {})).status).toBe(400);
    expect((await create('dealerI', {})).status).toBe(403);
    expect((await create('mgrP', { mode: 'DEALER' })).status).toBe(403);
    expect((await create('mgrP', { preset: 'KPSS' })).status).toBe(400);
    expect((await create('mgrP', { booklets: ['E'] })).status).toBe(400);
  });
});
