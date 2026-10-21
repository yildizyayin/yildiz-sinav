import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import definitions from '../worker/exam-admin-entry';
import examApi from '../worker/index';
import chunkedApi from '../worker/chunked-evaluation-entry';
import { createSession } from '../worker/lib/auth';
import { normalizeName } from '../worker/lib/db';
import { parseFmtText } from '../worker/lib/fmt';

/**
 * A028b: a middle-school LGS-style exam read from two optical forms.
 * Sayısal (Mat 20, Fen 20) is coded on the built-in Sekonic 7108 sheet, which also has empty Türkçe,
 * Sosyal (=İnkılap), Din and İngilizce blocks; sözel (Türkçe 20, İnkılap 10, Din 10, İngilizce 10) on a
 * separate 840-style form described by its FMT. Every way of uploading must give the same single result:
 * two files in either order, or one TXT holding both forms, through direct and chunked evaluation.
 * Students may get different booklets in the two sessions. All names and numbers are synthetic.
 */
const SUBJECTS = [
  { id: 'sub_tur', code: 'TUR', q: 20, w: 4 }, { id: 'sub_ink', code: 'INK', q: 10, w: 1 }, { id: 'sub_din', code: 'DIN', q: 10, w: 1 },
  { id: 'sub_yab', code: 'YAB', q: 10, w: 1 }, { id: 'sub_mat', code: 'MAT', q: 20, w: 4 }, { id: 'sub_fen', code: 'FEN', q: 20, w: 4 },
];
const SAYISAL = ['MAT', 'FEN'], SOZEL = ['TUR', 'INK', 'DIN', 'YAB'];
const L = 'ABCD';
const key = (code: string, booklet: string) => { const k = SUBJECTS.findIndex((s) => s.code === code), q = SUBJECTS[k].q; return Array.from({ length: q }, (_, i) => L[booklet === 'A' ? (i + k) % 4 : (i * 3 + k + 1) % 4]).join(''); };
const answer = (seed: number, code: string, booklet: string) => Array.from(key(code, booklet), (c, i) => { const m = (i * 7 + seed) % 6; return m === 3 ? L[(L.indexOf(c) + 1) % 4] : m === 4 ? ' ' : c; }).join('');

type Student = { no: string; name: string; seed: number; say?: string; soz?: string; roster: boolean };
const STUDENTS: Student[] = [
  { no: '101', name: 'ALI YILMAZ', seed: 1, say: 'A', soz: 'A', roster: true },
  { no: '102', name: 'AYSE KAYA', seed: 2, say: 'A', soz: 'B', roster: true },
  { no: '103', name: 'MEHMET DEMIR', seed: 3, say: 'B', roster: true },
  { no: '999', name: 'ZEYNEP ARSLAN', seed: 4, say: 'B', soz: 'B', roster: false },
];
const pad = (v: string, n: number) => v.padStart(n, ' ').slice(0, n);
const padR = (v: string, n: number) => v.padEnd(n, ' ').slice(0, n);
// Built-in optik-7108-sekonic-v1: 171 chars, no 10–15, name 15–35, class 35–37, booklet 50, TUR/SOS/DIN/ING/MAT/FEN 20 each from 51.
const sayisalLine = (s: Student) => padR('7108', 10) + pad(s.no, 5) + padR(s.name, 20) + '8A' + ' '.repeat(13) + s.say + ' '.repeat(80) + answer(s.seed, 'MAT', s.say!) + answer(s.seed, 'FEN', s.say!);
const FMT_840 = [
  '01=01=10=10=K=D=8=X2=KOD-1=', '10=10=10=10=K=D=4=X2=KOD-2=', '30=30=02=02=K=D=0=X2=KOD-3=',
  '01=10=02=06=K=D=0123456789=X2=ÖĞRENCİ NO=',
  '33=61=02=21=K=D=ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ=X2=ADI SOYADI=',
  '01=09=22=23=K=D=5678 =X2=SINIF=',
  '13=13=08=10=K=Y=A B=X2=KİTAPÇIK=',
  '16=35=24=27=K=Y=ABCD=X2=TÜRKÇE=',
  '16=25=30=33=K=Y=ABCD=X2=T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK=',
  '16=25=36=39=K=Y=ABCD=X2=DİN KÜLTÜRÜ VE AHLAK BİLGİSİ=',
  '16=25=42=45=K=Y=ABCD=X2=İNGİLİZCE=',
].join('\r\n');
const sozelLine = (s: Student) => '840' + pad(s.no, 5) + padR(s.name, 20) + '8A' + s.soz + SOZEL.map((c) => answer(s.seed, c, s.soz!)).join('');
// Both sessions on 7108 sheets: the sözel sheet fills Türkçe/Sosyal/Din/İngilizce (first 10 of the 20 rows for 10-question tests).
const sozel7108Line = (s: Student, hideIdentity = false) => padR('7108', 10) + (hideIdentity ? '     ' : pad(s.no, 5)) + padR(s.name, 20) + (hideIdentity ? '  ' : '8A') + ' '.repeat(13) + s.soz + SOZEL.map((c) => padR(answer(s.seed, c, s.soz!), 20)).join('') + ' '.repeat(40);
const sayisalFile = () => STUDENTS.filter((s) => s.say).map(sayisalLine).join('\r\n');
const sozelFile = () => STUDENTS.filter((s) => s.soz).map(sozelLine).join('\r\n');
const mixedFile = (unmergeable = false) => STUDENTS.flatMap((s) => [s.soz ? (unmergeable && s.name === 'AYSE KAYA' ? sozelLine(s).slice(0, 3) + '     ' + sozelLine(s).slice(8, 28) + '  ' + sozelLine(s).slice(30) : sozelLine(s)) : null, s.say ? sayisalLine(s) : null]).filter(Boolean).join('\r\n');

/** Expected results, computed here from the sheets and keys without the system's code. */
function expected() {
  const out: Record<string, { subjects: Record<string, [number, number, number, number]>; score: number | null }> = {};
  for (const s of STUDENTS) {
    const subjects: Record<string, [number, number, number, number]> = {};
    const raw: Record<string, number> = {};
    for (const [codes, booklet] of [[SAYISAL, s.say], [SOZEL, s.soz]] as const) {
      if (!booklet) continue;
      for (const code of codes) {
        const k = key(code, booklet), a = answer(s.seed, code, booklet);
        let d = 0, y = 0, b = 0;
        for (let i = 0; i < k.length; i++) { if (a[i] === ' ') b++; else if (a[i] === k[i]) d++; else y++; }
        raw[code] = d - y / 3;
        subjects[code] = [d, y, b, Math.round(raw[code] * 100) / 100];
      }
    }
    const complete = SUBJECTS.every((x) => subjects[x.code]);
    const score = complete ? Math.round((100 + 400 * SUBJECTS.reduce((t, x) => t + x.w * Math.max(0, raw[x.code]), 0) / SUBJECTS.reduce((t, x) => t + x.w * x.q, 0)) * 100) / 100 : null;
    out[s.name] = { subjects, score };
  }
  return out;
}

async function setup(mode: 'direct' | 'chunked') {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  const prepare = (sql: string, args: any[] = []): any => ({ bind: (...v: any[]) => prepare(sql, v), first: async (c?: string) => { const r = db.prepare(sql).get(...args) as any; return c ? r?.[c] : r; }, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ results: [], meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) });
  const env = { ENVIRONMENT: 'test', DB: { prepare, batch: async (st: any[]) => { db.exec('BEGIN'); try { const r = []; for (const s of st) r.push(await s.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } } as any;
  db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('school','Synthetic School','SYNTHETIC','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active) VALUES('admin','SUPER_ADMIN','Synthetic Admin','unused','unused',1);
    INSERT INTO institution_seasons(id,institution_id,academic_year,status) VALUES('season','school','2026-2027','ACTIVE');`);
  STUDENTS.filter((s) => s.roster).forEach((s, n) => {
    const [first, last] = s.name.split(' ');
    db.prepare('INSERT INTO student_entities(id,first_name,last_name,normalized_name,status) VALUES(?,?,?,?,?)').run(`s${n + 1}`, first, last, normalizeName(s.name), 'ACTIVE');
    db.prepare('INSERT INTO student_enrollments(id,student_id,institution_id,season_id,student_number,grade_level,section,status) VALUES(?,?,?,?,?,?,?,?)').run(`enr${n + 1}`, `s${n + 1}`, 'school', 'season', s.no, 8, 'A', 'ACTIVE');
  });
  const fmt = parseFmtText(FMT_840, 'OPT_K-840_SEKONIC.fmt');
  expect(fmt.ok, fmt.errors.join(' ')).toBe(true);
  db.prepare(`INSERT INTO optical_templates(id,name,status,active) VALUES('opt840','Sekonic Optik 840','READY',1)`).run();
  db.prepare(`INSERT INTO optical_template_versions(id,template_id,version,parser_definition,active) VALUES('opt840v1','opt840','1',?,1)`).run(JSON.stringify(fmt.definition));
  const session = await createSession(env, 'admin', new Request('https://demo.anunex.com'), false);
  const cookie = session.headers.get('Set-Cookie')!.split(';')[0];
  const request = async (path: string, method = 'GET', body?: any) => {
    const form = body instanceof FormData;
    const req = new Request(`https://demo.anunex.com${path}`, { method, headers: { Cookie: cookie, ...(form || body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
    const res = await (path.startsWith('/api/exam-definitions') ? definitions : mode === 'chunked' && path.endsWith('/evaluate') ? chunkedApi : examApi).fetch(req, env);
    return { response: res, data: await res.json() as any };
  };
  const created = await request('/api/exam-definitions', 'POST', { ownerType: 'CENTRAL', academicYear: '2026-2027', title: 'LGS Deneme 1', examType: 'LGS', gradeLevel: 8, publisherName: 'Sentetik', sessionLabel: 'Sözel + Sayısal', scoringRuleVersionId: 'srv_meb_lgs_2627', outcomeMode: 'OPTIONAL' });
  expect(created.response.status, JSON.stringify(created.data)).toBe(201);
  const base = `/api/exam-definitions/${created.data.id}`;
  let start = 1;
  const structure = SUBJECTS.map((s, i) => { const row = { subjectId: s.id, questionCount: s.q, questionStart: start, questionEnd: start + s.q - 1, optionCount: 4, wrongDivisor: 3, sortOrder: i + 1 }; start += s.q; return row; });
  expect((await request(`${base}/structure`, 'PUT', { booklets: ['A', 'B'], subjects: structure })).response.status).toBe(200);
  const saved = await request(`${base}/answer-key`, 'PUT', { entries: SUBJECTS.flatMap((s) => ['A', 'B'].map((b) => ({ subjectId: s.id, bookletCode: b, answers: key(s.code, b), optionCount: 4 }))) });
  expect(saved.response.status, JSON.stringify(saved.data)).toBe(200);
  expect((await request(`${base}/institutions`, 'PUT', { institutionIds: ['school'] })).response.status).toBe(200);
  expect((await request(`${base}/status`, 'PATCH', { status: 'ACTIVE' })).response.status).toBe(200);
  const examId = created.data.id as string;

  const upload = async (text: string, name: string) => {
    const form = new FormData(); form.set('institutionId', 'school'); form.set('file', new File([text], name, { type: 'text/plain' }));
    const res = await request(`/api/exams/${examId}/preview-file`, 'POST', form);
    expect(res.response.status, JSON.stringify(res.data)).toBe(200);
    const batchPath = `/api/scan-batches/${res.data.batchId}`;
    const batch = (await request(batchPath)).data;
    for (const r of batch.records) if (['NEW_GUEST', 'AMBIGUOUS', 'INVALID'].includes(r.match_status) || r.issues.length) {
      const rosterId = `s${STUDENTS.filter((x) => x.roster).findIndex((x) => x.name === String(r.canonical.name).trim()) + 1}`;
      const resolved = await request(`${batchPath}/records/${r.id}/resolve`, 'POST', r.match_status === 'NEW_GUEST' && rosterId === 's0' ? { action: 'GUEST' } : { action: 'MATCH', studentId: r.matched_student_id || rosterId });
      expect(resolved.response.status, JSON.stringify(resolved.data)).toBe(200);
    }
    let evaluated = await request(`${batchPath}/evaluate`, 'POST');
    while (mode === 'chunked' && evaluated.data.done === false) evaluated = await request(`${batchPath}/evaluate`, 'POST');
    expect(evaluated.response.status, JSON.stringify(evaluated.data)).toBe(200);
    return { preview: res.data, batch };
  };
  const results = () => {
    const rows = db.prepare(`SELECT ep.name_snapshot n,s.code c,sr.correct_count d,sr.wrong_count y,sr.blank_count b,sr.net FROM subject_results sr JOIN exam_participants ep ON ep.id=sr.participant_id JOIN subjects s ON s.id=sr.subject_id WHERE ep.exam_id=?`).all(examId) as any[];
    const out: Record<string, { subjects: Record<string, [number, number, number, number]>; score: number | null }> = {};
    for (const r of rows) { const k = String(r.n).trim(); out[k] ??= { subjects: {}, score: null }; out[k].subjects[r.c] = [r.d, r.y, r.b, Math.round(Number(r.net) * 100) / 100]; }
    for (const r of db.prepare(`SELECT ep.name_snapshot n,er.score FROM exam_results er JOIN exam_participants ep ON ep.id=er.participant_id WHERE ep.exam_id=?`).all(examId) as any[]) out[String(r.n).trim()].score = r.score;
    return out;
  };
  const participants = () => Number((db.prepare('SELECT count(*) c FROM exam_participants WHERE exam_id=?').get(examId) as any).c);
  const answerBooklets = (name: string) => Object.fromEntries((db.prepare(`SELECT s.code c, group_concat(DISTINCT ak.booklet_code) b FROM student_answers sa JOIN exam_participants ep ON ep.id=sa.participant_id JOIN exam_questions q ON q.id=sa.exam_question_id JOIN subjects s ON s.id=q.subject_id JOIN answer_keys ak ON ak.exam_question_id=q.id AND ak.correct_answer IS NOT NULL WHERE ep.exam_id=? AND trim(ep.name_snapshot)=? GROUP BY s.code`).all(examId, name) as any[]).map((r) => [r.c, r.b]));
  return { db, upload, results, participants, answerBooklets };
}

describe('A028b: sayısal and sözel sessions on two optical forms', () => {
  for (const mode of ['direct', 'chunked'] as const) {
    it(`${mode}: two separate files (sözel first, then sayısal) give one complete result per student`, async () => {
      const t = await setup(mode);
      try {
        const soz = await t.upload(sozelFile(), 'sozel.txt');
        expect(soz.preview.detection.templateName).toBe('Sekonic Optik 840');
        expect(soz.preview.missingSubjects).toEqual(['MAT', 'FEN']);
        // After the first session only: nets, but no LGS estimate yet.
        expect(Object.values(t.results()).every((r) => r.score === null)).toBe(true);
        const say = await t.upload(sayisalFile(), 'sayisal.txt');
        expect(say.preview.detection.templateId).toBe('optik-7108-sekonic-v1');
        expect(say.preview.missingSubjects).toEqual(['TUR', 'INK', 'DIN', 'YAB']);
        expect(say.preview.notes.join(' ')).toContain('Bu dosyada şu derslerin cevabı yok');
        expect(t.results()).toEqual(expected());
        expect(t.participants()).toBe(4);
      } finally { t.db.close(); }
    }, 30000);

    it(`${mode}: the opposite order (sayısal first) gives the same results`, async () => {
      const t = await setup(mode);
      try {
        await t.upload(sayisalFile(), 'sayisal.txt');
        await t.upload(sozelFile(), 'sozel.txt');
        expect(t.results()).toEqual(expected());
        expect(t.participants()).toBe(4);
      } finally { t.db.close(); }
    }, 30000);

    it(`${mode}: one TXT holding both forms gives the same results, with each session's own booklet`, async () => {
      const t = await setup(mode);
      try {
        const mixed = await t.upload(mixedFile(), 'lgs-tum.txt');
        expect(mixed.preview.detection.forms.map((f: any) => f.name).sort()).toEqual(['Optik 7108 · Sekonic', 'Sekonic Optik 840']);
        expect(mixed.preview.total).toBe(4);
        expect(mixed.preview.notes.join(' ')).toContain('3 öğrencinin iki oturum optiği tek kayıtta birleştirildi');
        expect(t.results()).toEqual(expected());
        expect(t.participants()).toBe(4);
        expect(t.answerBooklets('AYSE KAYA')).toMatchObject({ MAT: 'A,B', TUR: 'A,B' });
      } finally { t.db.close(); }
    }, 30000);
  }

  for (const mode of ['direct', 'chunked'] as const) it(`${mode}: two sheets of one student that could not be joined in the file (no number, no class on the sözel sheet) still give one result`, async () => {
    const t = await setup(mode);
    try {
      const mixed = await t.upload(mixedFile(true), 'lgs-tum.txt');
      expect(mixed.preview.total).toBe(5);
      expect(mixed.batch.duplicates).toEqual([]);
      expect(t.results()).toEqual(expected());
      expect(t.participants()).toBe(4);
    } finally { t.db.close(); }
  }, 30000);

  for (const mode of ['direct', 'chunked'] as const) it(`${mode}: both sessions on the same 7108 form in one TXT, one sheet not joinable: blank tests of one sheet do not erase the other`, async () => {
    const t = await setup(mode);
    try {
      const lines = STUDENTS.flatMap((s) => [s.say ? sayisalLine(s) : null, s.soz ? sozel7108Line(s, s.name === 'AYSE KAYA') : null]).filter(Boolean);
      const up = await t.upload(lines.join('\r\n'), 'lgs-7108.txt');
      expect(up.preview.total).toBe(5);
      const { 'MEHMET DEMIR': mehmet, ...rest } = t.results();
      const { 'MEHMET DEMIR': mehmetExpected, ...restExpected } = expected();
      expect(rest).toEqual(restExpected);
      // Known limit: on a single shared form a missing second sheet looks exactly like blank sözel tests,
      // so MEHMET's sözel tests are scored as all blank (separate forms or separate files avoid this).
      expect(mehmet.subjects).toEqual({ ...mehmetExpected.subjects, TUR: [0, 0, 20, 0], INK: [0, 0, 10, 0], DIN: [0, 0, 10, 0], YAB: [0, 0, 10, 0] });
      expect(t.participants()).toBe(4);
    } finally { t.db.close(); }
  }, 30000);

  it('the session booklet is used per test: AYSE KAYA is scored with sayısal A and sözel B keys', async () => {
    const t = await setup('direct');
    try {
      await t.upload(mixedFile(), 'lgs-tum.txt');
      const ayse = t.results()['AYSE KAYA'];
      expect(ayse.subjects.MAT).toEqual(expected()['AYSE KAYA'].subjects.MAT);
      expect(ayse.subjects.TUR).toEqual(expected()['AYSE KAYA'].subjects.TUR);
      // Scored against the wrong booklet the Türkçe count would differ: make sure the fixture can tell them apart.
      const wrong = Array.from(key('TUR', 'A')).filter((c, i) => answer(2, 'TUR', 'B')[i] === c).length;
      expect(wrong).not.toBe(ayse.subjects.TUR[0]);
    } finally { t.db.close(); }
  }, 30000);
});
