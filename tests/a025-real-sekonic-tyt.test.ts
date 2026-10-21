import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-admin-entry';
import examApi from '../worker/index';
import chunkedApi from '../worker/chunked-evaluation-entry';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';
import { parseFmtText } from '../worker/lib/fmt';
import { decodeUploadedBytes } from '../worker/lib/parse';
import { parseAnswerKeyFileText } from '../src/lib/guidedDefinitions';

/**
 * A025 acceptance on real, permitted files sent by the user (21 Oct 2026): ÇAP TYT Deneme 0.
 * - OPT_K-129_SEKONIC.fmt exactly as received (its Turkish letters arrived as U+FFFD)
 * - the optical reader's TXT with names/ID numbers replaced (answers, booklets, layout untouched)
 * - the publisher's answer-key table (Kitapçık;Test;Ders;A Soru;B Soru;Cevap;Kazanım Kodu)
 * Expected results were computed separately (Python, straight from the publisher PDF/table), not by this code.
 */
const dir = new URL('./fixtures/a025/', import.meta.url);
const bytes = (name: string) => { const b = readFileSync(new URL(name, dir)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const EXPECTED: Record<string, { booklet: string; TYT_TUR: [number, number, number, number]; TYT_SOS: [number, number, number, number]; TYT_MAT: [number, number, number, number]; TYT_FEN: [number, number, number, number] }> = {
  'STUDENT1 TEST': { booklet: 'A', TYT_TUR: [31, 8, 1, 29], TYT_SOS: [11, 8, 1, 9], TYT_MAT: [4, 4, 32, 3], TYT_FEN: [7, 6, 7, 5.5] },
  'STUDENT2 TEST': { booklet: 'B', TYT_TUR: [35, 4, 1, 34], TYT_SOS: [12, 4, 4, 11], TYT_MAT: [5, 4, 31, 4], TYT_FEN: [0, 0, 20, 0] },
  'STUDENT3 TEST': { booklet: 'A', TYT_TUR: [32, 5, 3, 30.75], TYT_SOS: [9, 7, 4, 7.25], TYT_MAT: [5, 2, 33, 4.5], TYT_FEN: [0, 1, 19, -0.25] },
  'STUDENT4 TEST': { booklet: 'B', TYT_TUR: [35, 0, 5, 35], TYT_SOS: [11, 3, 6, 10.25], TYT_MAT: [5, 2, 33, 4.5], TYT_FEN: [5, 2, 13, 4.5] },
  'STUDENT5 TEST': { booklet: 'B', TYT_TUR: [27, 12, 1, 24], TYT_SOS: [11, 8, 1, 9], TYT_MAT: [15, 17, 8, 10.75], TYT_FEN: [16, 2, 2, 15.5] },
  'STUDENT6 TEST': { booklet: 'A', TYT_TUR: [37, 3, 0, 36.25], TYT_SOS: [19, 1, 0, 18.75], TYT_MAT: [19, 4, 17, 18], TYT_FEN: [20, 0, 0, 20] },
};
const SUBJECTS = [{ id: 'sub_tyt_tur', code: 'TYT_TUR', name: 'TYT Türkçe' }, { id: 'sub_tyt_sos', code: 'TYT_SOS', name: 'TYT Sosyal Bilimler' }, { id: 'sub_tyt_mat', code: 'TYT_MAT', name: 'TYT Temel Matematik' }, { id: 'sub_tyt_fen', code: 'TYT_FEN', name: 'TYT Fen Bilimleri' }, { id: 'sub_tyt_fel', code: 'TYT_FEL', name: 'TYT Seçmeli Felsefe' }];

describe('A025: real Sekonic 129 FMT + TXT + publisher key', () => {
  it('reads the FMT although its Turkish letters were lost, and the key table with booklet orders and the optional philosophy', () => {
    const fmt = parseFmtText(decodeUploadedBytes(bytes('OPT_K-129_SEKONIC.fmt')), 'OPT_K-129_SEKONIC.fmt');
    expect(fmt.ok, fmt.errors.join(' ')).toBe(true);
    expect(fmt.definition!.recordLength).toBe(222);
    expect(Object.fromEntries(Object.entries(fmt.definition!.answers).map(([k, v]) => [k, [v.start, v.length]]))).toEqual({ TYT_TUR: [56, 40], TYT_SOS: [96, 46], TYT_MAT: [142, 40], TYT_FEN: [182, 40], TYT_FEL: [116, 5] });
    const key = parseAnswerKeyFileText(decodeUploadedBytes(bytes('cap_tyt0_key.csv')), SUBJECTS as any);
    expect(key.unknownLines).toEqual([]);expect(key.warnings).toEqual([]);
    expect(key.detectedBooklets).toEqual(['A', 'B']);
    expect(key.questionCounts).toEqual({ sub_tyt_tur: 40, sub_tyt_sos: 20, sub_tyt_mat: 40, sub_tyt_fen: 20 });
    const fel = Object.fromEntries(key.entries.filter(e => e.subjectId === 'sub_tyt_fel').map(e => [e.bookletCode, e.answers]));
    expect(fel).toEqual({ A: 'EDCAA', B: 'AACDE' });
    const turB = key.entries.find(e => e.subjectId === 'sub_tyt_tur' && e.bookletCode === 'B')!;
    expect(turB.bookletQuestionNumbers!.slice(0, 4)).toEqual([4, 3, 2, 1]);
  });

  for (const templateVersion of ['opt129v1', 'optik-129-sekonic-v1']) for (const mode of ['direct', 'chunked'] as const) it(`${mode} / ${templateVersion}: evaluating the real TXT gives exactly the independently computed results`, async () => {
    const db = new DatabaseSync(':memory:');
    for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    const prepare = (sql: string, args: any[] = []): any => ({ bind: (...v: any[]) => prepare(sql, v), first: async (c?: string) => { const r = db.prepare(sql).get(...args) as any; return c ? r?.[c] : r; }, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) });
    const env = { ENVIRONMENT: 'test', DB: { prepare, batch: async (st: any[]) => { db.exec('BEGIN'); try { const r = []; for (const s of st) r.push(await s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } } as any;
    try {
      db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','Synthetic School','SYNTHETIC','ACTIVE');
        INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','Synthetic Admin','unused','unused',1);
        INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');
        INSERT OR IGNORE INTO subjects(id,code,name,category) VALUES('sub_tyt_fel','TYT_FEL','TYT Seçmeli Felsefe','VERBAL');`);
      for (let n = 1; n <= 6; n++) {
        db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run(`s${n}`, `Student${n}`, 'Test', normalizeName(`Student${n} Test`), 'ACTIVE');
        db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run(`enr${n}`, `s${n}`, 'school', 'season', String(100 + n), 12, 'A', 'ACTIVE');
      }
      const fmt = parseFmtText(decodeUploadedBytes(bytes('OPT_K-129_SEKONIC.fmt')), 'OPT_K-129_SEKONIC.fmt');
      db.prepare(`INSERT INTO optical_templates(id,name,status,active) VALUES('opt129','Sekonic Optik 129','READY',1)`).run();
      db.prepare(`INSERT INTO optical_template_versions(id,template_id,version,parser_definition,active) VALUES('opt129v1','opt129','1',?,1)`).run(JSON.stringify(fmt.definition));
      const session = await createSession(env, 'admin', new Request('https://demo.anunex.com'), false);
      const cookie = session.headers.get('Set-Cookie')!.split(';')[0];
      const request = async (path: string, method = 'GET', body?: any) => { const form = body instanceof FormData; const req = new Request(`https://demo.anunex.com${path}`, { method, headers: { Cookie: cookie, ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) }); const res = await (path.startsWith('/api/exam-definitions') ? definitions : mode === 'chunked' && path.endsWith('/evaluate') ? chunkedApi : examApi).fetch(req, env); return { response: res, data: await res.json() as any }; };

      const key = parseAnswerKeyFileText(decodeUploadedBytes(bytes('cap_tyt0_key.csv')), SUBJECTS as any);
      const created = await request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'ÇAP TYT 0', examType: 'TYT', gradeLevel: 12, publisherName: 'ÇAP', sessionLabel: 'TYT', scoringRuleVersionId: 'srv_osym_tyt_2627', outcomeMode: 'OPTIONAL' });
      expect(created.response.status, JSON.stringify(created.data)).toBe(201);
      const base = `/api/exam-definitions/${created.data.id}`;
      const subjects = Object.entries(key.questionCounts).map(([subjectId, questionCount], i) => ({ subjectId, questionCount, questionStart: key.questionStarts[subjectId], questionEnd: key.questionStarts[subjectId] + questionCount - 1, optionCount: 5, wrongDivisor: 4, sortOrder: i + 1 }));
      expect((await request(`${base}/structure`, 'PUT', { booklets: key.detectedBooklets, subjects })).response.status).toBe(200);
      const saved = await request(`${base}/answer-key`, 'PUT', { entries: key.entries });
      expect(saved.response.status, JSON.stringify(saved.data)).toBe(200);
      expect((await request(`${base}/institutions`, 'PUT', { institutionIds: ['school'] })).response.status).toBe(200);
      expect((await request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).response.status).toBe(200);

      // The built-in Sekonic 129 definition and the uploaded FMT both fit: the system must ask, listing only those two.
      const auto = new FormData(); auto.set('institutionId', 'school'); auto.set('file', new File([bytes('cap_tyt0_anon.txt')], 'cap_tyt0.txt', { type: 'text/plain' }));
      const ambiguous = await request(`/api/exams/${created.data.id}/preview-file`, 'POST', auto);
      expect(ambiguous.data.error.code).toBe('OPTICAL_TEMPLATE_AMBIGUOUS');
      expect(ambiguous.data.error.details.templates.map((t: any) => t.id).sort()).toEqual(['opt129v1', 'optik-129-sekonic-v1']);
      const form = new FormData(); form.set('institutionId', 'school'); form.set('templateVersionId', templateVersion); form.set('file', new File([bytes('cap_tyt0_anon.txt')], 'cap_tyt0.txt', { type: 'text/plain' }));
      const uploaded = await request(`/api/exams/${created.data.id}/preview-file`, 'POST', form);
      expect(uploaded.response.status, JSON.stringify(uploaded.data)).toBe(200);
      expect(uploaded.data.total).toBe(6);
      const batchPath = `/api/scan-batches/${uploaded.data.batchId}`;
      const preview = (await request(batchPath)).data;
      for (const r of preview.records) if (r.match_status !== 'MATCHED' || r.issues?.length) await request(`${batchPath}/records/${r.id}/resolve`, 'POST', { action: 'MATCH', studentId: `s${String(r.canonical.name).match(/STUDENT(\d)/)![1]}` });
      let evaluated = await request(`${batchPath}/evaluate`, 'POST');
      while (mode === 'chunked' && evaluated.data.done === false) evaluated = await request(`${batchPath}/evaluate`, 'POST');
      expect(evaluated.response.status, JSON.stringify(evaluated.data)).toBe(200);

      const rows = db.prepare(`SELECT ep.name_snapshot n,ep.booklet_code b,s.code c,sr.correct_count d,sr.wrong_count y,sr.blank_count e,sr.net FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id JOIN subjects s ON s.id=sr.subject_id WHERE ep.exam_id=?`).all(created.data.id) as any[];
      const got: Record<string, any> = {};
      for (const r of rows) { const k = String(r.n).trim(); got[k] ??= { booklet: r.b }; got[k][r.c] = [r.d, r.y, r.e, r.net]; }
      expect(got).toEqual(EXPECTED);
      const totals = db.prepare(`SELECT ep.name_snapshot n,er.net FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`).all(created.data.id) as any[];
      const scores = db.prepare(`SELECT ep.name_snapshot n,er.net,er.score,er.institution_rank r FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`).all(created.data.id) as any[];
      for (const t of scores) {
        const e = EXPECTED[String(t.n).trim()];
        expect(t.net).toBeCloseTo(e.TYT_TUR[3] + e.TYT_SOS[3] + e.TYT_MAT[3] + e.TYT_FEN[3], 4);
        // A024 approved estimate: 100 + 400 × (.33·TUR/40 + .17·SOS/20 + .33·MAT/40 + .17·FEN/20), computed here independently
        const est = Math.round((100 + 400 * (.33 * Math.max(0, e.TYT_TUR[3]) / 40 + .17 * Math.max(0, e.TYT_SOS[3]) / 20 + .33 * Math.max(0, e.TYT_MAT[3]) / 40 + .17 * Math.max(0, e.TYT_FEN[3]) / 20)) * 100) / 100;
        expect(t.score, String(t.n)).toBe(est);
      }
      expect(scores.find(x => String(x.n).trim() === 'STUDENT6 TEST')).toMatchObject({ score: 410.78, r: 1 });
      // Nobody in this sample answered the optional philosophy questions: each gets a 5-blank optional result, Sosyal stays on 20.
      expect(db.prepare(`SELECT correct_count c,wrong_count w,blank_count b FROM tyt_optional_philosophy_results WHERE exam_id=?`).all(created.data.id).map((r: any) => [r.c, r.w, r.b])).toEqual(Array(6).fill([0, 0, 5]));
    } finally { db.close(); }
  }, 20000);
});
