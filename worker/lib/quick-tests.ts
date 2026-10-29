import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';

/**
 * S044 Hızlı Test — the Studio's quick path (reference: onlinetestmaker.net, made easier and faster):
 *  1. Questions: crop them from a PDF or a photo in the browser (or take an approved Studio test from the pool).
 *  2. Mark each answer with one tap, reorder, and print the test with a phone-readable optical form and answer key.
 *  3. Or run it as a timed online exam: students join with a code, the clock runs on the server, answers are saved
 *     as they go and the exam is handed in by itself when time is up.
 *
 * Governance: cropped questions stay private to the institution and never enter the governed question pool; the
 * person declares that they may use the material. Pool questions come only from APPROVED Studio items.
 */
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const MAX_IMAGE = 1_500_000;
const MAX_QUESTIONS = 120;
const fail = (status: number, code: string, message: string, details?: unknown) => json({ ok: false, error: { code, message, ...(details ? { details } : {}) } }, status);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (v: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)));
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
const sqlTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
const parseTime = (v: unknown) => { const s = String(v || ''); const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return Number.isNaN(d.getTime()) ? null : d; };
const clean = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
function sniff(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------------------------------------------
const STAFF = ['SUPER_ADMIN', 'INSTITUTION_MANAGER', 'TEACHER', 'GUIDANCE_TEACHER'];

async function ownedTest(env: Env, user: AuthUser, id: string) {
  const t = await one<any>(env.DB.prepare(`SELECT * FROM quick_tests WHERE id=? AND status='ACTIVE'`).bind(id));
  if (!t) return null;
  if (user.role === 'SUPER_ADMIN') return t;
  if (t.institution_id !== user.institution_id) return null;
  if (user.role === 'INSTITUTION_MANAGER' || t.created_by === user.id) return t;
  return null;
}

function settingsOf(t: any) { try { const s = JSON.parse(t.layout_json || '{}'); return { columns: s.columns === 1 ? 1 : s.columns === 2 ? 2 : 0, wrongDivisor: [0, 3, 4].includes(Number(s.wrongDivisor)) ? Number(s.wrongDivisor) : 0 }; } catch { return { columns: 0, wrongDivisor: 0 }; } }

async function questionsOf(env: Env, testId: string) {
  return all<any>(env.DB.prepare(`SELECT q.id,q.sort_order,q.kind,q.image_key,q.image_width,q.image_height,q.correct_answer,q.question_bank_id,b.stem_text,b.options_json
    FROM quick_test_questions q LEFT JOIN question_bank b ON b.id=q.question_bank_id WHERE q.test_id=? ORDER BY q.sort_order,q.created_at`).bind(testId));
}

function bankOptions(raw: string | null): string[] {
  try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.map((o: any) => typeof o === 'string' ? o : String(o?.text ?? o?.label ?? '')) : Object.values(v || {}).map(String); } catch { return []; }
}

async function listTests(env: Env, user: AuthUser, url: URL) {
  const inst = user.role === 'SUPER_ADMIN' ? url.searchParams.get('institutionId') : user.institution_id;
  const mine = user.role === 'TEACHER' || user.role === 'GUIDANCE_TEACHER';
  const where = [`t.status='ACTIVE'`]; const args: unknown[] = [];
  if (inst) { where.push('t.institution_id=?'); args.push(inst); } else if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Kurum kapsamı bulunamadı.');
  if (mine) { where.push('t.created_by=?'); args.push(user.id); }
  const rows = await all<any>(env.DB.prepare(`SELECT t.id,t.title,t.grade_level,t.subject_label,t.option_count,t.source_kind,t.updated_at,i.name institution_name,
      (SELECT count(*) FROM quick_test_questions q WHERE q.test_id=t.id) questions,
      (SELECT count(*) FROM quick_test_questions q WHERE q.test_id=t.id AND q.correct_answer IS NULL) unanswered,
      (SELECT count(*) FROM quick_test_attempts a WHERE a.test_id=t.id AND a.submitted_at IS NOT NULL) results,
      (SELECT code FROM quick_test_sessions s WHERE s.test_id=t.id AND s.status='OPEN' AND s.closes_at>CURRENT_TIMESTAMP ORDER BY s.created_at DESC LIMIT 1) open_code
    FROM quick_tests t JOIN institutions i ON i.id=t.institution_id WHERE ${where.join(' AND ')} ORDER BY t.updated_at DESC LIMIT 200`).bind(...args));
  return json({ ok: true, tests: rows });
}

async function createTest(request: Request, env: Env, user: AuthUser) {
  const b: any = await request.json().catch(() => ({}));
  const institutionId = user.role === 'SUPER_ADMIN' ? clean(b.institutionId, 100) : user.institution_id;
  if (!institutionId) return fail(400, 'INSTITUTION_REQUIRED', 'Kurum seçin.');
  if (!(await one(env.DB.prepare('SELECT 1 x FROM institutions WHERE id=?').bind(institutionId)))) return fail(404, 'INSTITUTION_NOT_FOUND', 'Kurum bulunamadı.');
  const title = clean(b.title, 140);
  if (title.length < 3) return fail(400, 'VALIDATION_ERROR', 'Testin adını yazın (en az 3 harf).');
  if (b.rightsDeclared !== true) return fail(400, 'RIGHTS_REQUIRED', 'Soruları kullanma hakkınız olduğunu onaylayın.');
  const grade = b.gradeLevel == null || b.gradeLevel === '' ? null : Number(b.gradeLevel);
  if (grade != null && (!Number.isInteger(grade) || grade < 1 || grade > 12)) return fail(400, 'VALIDATION_ERROR', 'Sınıf düzeyi 1–12 olmalı.');
  const optionCount = Number(b.optionCount) === 5 ? 5 : 4;
  const id = uuid('qt');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO quick_tests(id,institution_id,created_by,title,grade_level,subject_label,option_count,source_kind,rights_declared_by,rights_declared_at,layout_json) VALUES(?,?,?,?,?,?,?,'CROP',?,CURRENT_TIMESTAMP,?)`)
      .bind(id, institutionId, user.id, title, grade, clean(b.subjectLabel, 60) || null, optionCount, user.id, JSON.stringify({ columns: 0, wrongDivisor: 0 })),
    env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?,?)').bind(uuid('aud'), user.id, institutionId, 'QUICK_TEST_CREATED', 'quick_test', id, JSON.stringify({ title, rightsDeclared: true })),
  ]);
  return json({ ok: true, id }, 201);
}

async function testDetail(env: Env, user: AuthUser, t: any) {
  const [questions, sessions] = await Promise.all([questionsOf(env, t.id), all<any>(env.DB.prepare(`SELECT s.*,(SELECT count(*) FROM quick_test_attempts a WHERE a.session_id=s.id) started,(SELECT count(*) FROM quick_test_attempts a WHERE a.session_id=s.id AND a.submitted_at IS NOT NULL) submitted FROM quick_test_sessions s WHERE s.test_id=? ORDER BY s.created_at DESC`).bind(t.id))]);
  return json({ ok: true, test: { ...t, settings: settingsOf(t) }, questions: questions.map((q) => ({ id: q.id, kind: q.kind, correctAnswer: q.correct_answer, width: q.image_width, height: q.image_height, stem: q.kind === 'BANK' ? q.stem_text : undefined, options: q.kind === 'BANK' ? bankOptions(q.options_json) : undefined })), sessions });
}

async function updateTest(request: Request, env: Env, user: AuthUser, t: any) {
  const b: any = await request.json().catch(() => ({}));
  const s = settingsOf(t);
  const title = b.title === undefined ? t.title : clean(b.title, 140);
  if (title.length < 3) return fail(400, 'VALIDATION_ERROR', 'Testin adını yazın (en az 3 harf).');
  const optionCount = b.optionCount === undefined ? t.option_count : Number(b.optionCount) === 5 ? 5 : 4;
  if (optionCount === 4 && (await one(env.DB.prepare(`SELECT 1 x FROM quick_test_questions WHERE test_id=? AND correct_answer='E'`).bind(t.id)))) return fail(409, 'E_ANSWER_USED', 'Bir sorunun cevabı E; şık sayısını 4 yapmadan önce o cevabı değiştirin.');
  const next = { columns: b.columns === undefined ? s.columns : Number(b.columns) === 1 ? 1 : Number(b.columns) === 2 ? 2 : 0, wrongDivisor: b.wrongDivisor === undefined ? s.wrongDivisor : [0, 3, 4].includes(Number(b.wrongDivisor)) ? Number(b.wrongDivisor) : 0 };
  await env.DB.prepare(`UPDATE quick_tests SET title=?,option_count=?,layout_json=?,subject_label=COALESCE(?,subject_label),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(title, optionCount, JSON.stringify(next), b.subjectLabel === undefined ? null : clean(b.subjectLabel, 60), t.id).run();
  return json({ ok: true });
}

async function addImageQuestion(request: Request, env: Env, user: AuthUser, t: any) {
  if (t.source_kind !== 'CROP') return fail(409, 'POOL_TEST', 'Havuzdan gelen teste görsel soru eklenmez; yeni bir hızlı test açın.');
  const count = Number((await one<any>(env.DB.prepare('SELECT count(*) c FROM quick_test_questions WHERE test_id=?').bind(t.id)))?.c || 0);
  if (count >= MAX_QUESTIONS) return fail(409, 'TOO_MANY_QUESTIONS', `Bir testte en fazla ${MAX_QUESTIONS} soru olabilir.`);
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File)) return fail(400, 'IMAGE_REQUIRED', 'Kırpılan soru görseli gelmedi.');
  if (file.size > MAX_IMAGE) return fail(413, 'IMAGE_TOO_LARGE', 'Kırpılan görsel çok büyük (en fazla 1,5 MB).');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniff(bytes);
  if (!format) return fail(400, 'IMAGE_FORMAT', 'Görsel PNG veya JPEG olmalı.');
  const width = Math.round(Number(form?.get('width')) || 0), height = Math.round(Number(form?.get('height')) || 0);
  if (width < 20 || height < 20 || width > 5000 || height > 5000) return fail(400, 'IMAGE_SIZE', 'Kırpılan alan çok küçük ya da geçersiz.');
  const answer = String(form?.get('correctAnswer') || '').toUpperCase();
  const correct = [...LETTERS.slice(0, t.option_count), 'X'].includes(answer) ? answer : null;
  const id = uuid('qtq');
  const key = `quick-tests/${t.institution_id}/${t.id}/${id}.${format === 'png' ? 'png' : 'jpg'}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: format === 'png' ? 'image/png' : 'image/jpeg' } });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO quick_test_questions(id,test_id,sort_order,kind,image_key,image_width,image_height,correct_answer) VALUES(?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM quick_test_questions WHERE test_id=?),'IMAGE',?,?,?,?)`).bind(id, t.id, t.id, key, width, height, correct),
    env.DB.prepare('UPDATE quick_tests SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(t.id),
  ]);
  return json({ ok: true, question: { id, kind: 'IMAGE', correctAnswer: correct, width, height } }, 201);
}

async function setAnswer(request: Request, env: Env, t: any, qid: string) {
  const b: any = await request.json().catch(() => ({}));
  const answer = b.correctAnswer == null || b.correctAnswer === '' ? null : String(b.correctAnswer).toUpperCase();
  if (answer !== null && ![...LETTERS.slice(0, t.option_count), 'X'].includes(answer)) return fail(400, 'VALIDATION_ERROR', `Cevap ${LETTERS.slice(0, t.option_count).join(', ')} ya da iptal (X) olmalı.`);
  const r = await env.DB.prepare('UPDATE quick_test_questions SET correct_answer=? WHERE id=? AND test_id=?').bind(answer, qid, t.id).run();
  if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Soru bulunamadı.');
  await env.DB.prepare('UPDATE quick_tests SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(t.id).run();
  return json({ ok: true });
}

async function deleteQuestion(env: Env, t: any, qid: string) {
  const q = await one<any>(env.DB.prepare('SELECT image_key FROM quick_test_questions WHERE id=? AND test_id=?').bind(qid, t.id));
  if (!q) return fail(404, 'NOT_FOUND', 'Soru bulunamadı.');
  if (await one(env.DB.prepare(`SELECT 1 x FROM quick_test_attempts WHERE test_id=? AND submitted_at IS NOT NULL`).bind(t.id))) return fail(409, 'HAS_RESULTS', 'Bu testte teslim edilmiş sonuç var; soru silinemez. Testi kopyalayıp yenisinde düzenleyin.');
  await env.DB.prepare('DELETE FROM quick_test_questions WHERE id=?').bind(qid).run();
  if (q.image_key) { try { await env.FILES.delete(q.image_key); } catch { /* file cleanup is best effort */ } }
  return json({ ok: true });
}

async function reorder(request: Request, env: Env, t: any) {
  const b: any = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String) : [];
  const existing = (await all<any>(env.DB.prepare('SELECT id FROM quick_test_questions WHERE test_id=?').bind(t.id))).map((r) => r.id);
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some((x) => !existing.includes(x))) return fail(400, 'VALIDATION_ERROR', 'Sıralama listesi testteki sorularla uyuşmuyor; sayfayı yenileyin.');
  await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE quick_test_questions SET sort_order=? WHERE id=? AND test_id=?').bind(i + 1, id, t.id)));
  return json({ ok: true });
}

async function questionImage(env: Env, testId: string, qid: string) {
  const q = await one<any>(env.DB.prepare(`SELECT image_key FROM quick_test_questions WHERE id=? AND test_id=? AND kind='IMAGE'`).bind(qid, testId));
  if (!q) return fail(404, 'NOT_FOUND', 'Görsel bulunamadı.');
  const obj = await env.FILES.get(q.image_key);
  if (!obj) return fail(404, 'NOT_FOUND', 'Görsel bulunamadı.');
  return new Response(obj.body, { headers: { 'Content-Type': q.image_key.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}

/** A Studio document's APPROVED pool questions (booklet A) as a quick test, for online delivery. Text questions only. */
async function fromStudio(env: Env, user: AuthUser, docId: string) {
  const doc = await one<any>(env.DB.prepare('SELECT * FROM studio_documents WHERE id=?').bind(docId));
  if (!doc) return fail(404, 'NOT_FOUND', 'Studio belgesi bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && doc.institution_id !== user.institution_id) return fail(403, 'FORBIDDEN', 'Bu belgeye erişiminiz yok.');
  if (!doc.institution_id) return fail(400, 'INSTITUTION_REQUIRED', 'Belgenin kurumu yok.');
  const items = await all<any>(env.DB.prepare(`SELECT q.id,q.correct_answer,q.review_status,q.option_count,
      (SELECT count(*) FROM question_assets a WHERE a.question_id=q.id) assets
    FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(docId)).catch(async () => all<any>(env.DB.prepare(`SELECT q.id,q.correct_answer,q.review_status,q.option_count,0 assets FROM studio_document_items i JOIN question_bank q ON q.id=i.question_id WHERE i.document_id=? AND i.booklet_code='A' ORDER BY i.sort_order`).bind(docId)));
  if (!items.length) return fail(409, 'EMPTY', 'Belgede soru yok.');
  if (items.some((q) => q.review_status !== 'APPROVED')) return fail(409, 'NOT_APPROVED', 'Belgede onaylanmamış soru var; online sınava yalnız onaylı sorular çıkar.');
  const visual = items.findIndex((q) => Number(q.assets) > 0);
  if (visual >= 0) return fail(409, 'VISUAL_QUESTION', `${visual + 1}. soru görsel içeriyor; bu tür sorular şimdilik yalnız kâğıt (PDF) olarak verilir.`);
  const optionCount = items.some((q) => Number(q.option_count) === 5) ? 5 : 4;
  const id = uuid('qt');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO quick_tests(id,institution_id,created_by,title,grade_level,option_count,source_kind,studio_document_id,layout_json) VALUES(?,?,?,?,?,?,'POOL',?,?)`).bind(id, doc.institution_id, user.id, doc.title, doc.grade_level, optionCount, docId, JSON.stringify({ columns: 0, wrongDivisor: 0 })),
    ...items.map((q, i) => env.DB.prepare(`INSERT INTO quick_test_questions(id,test_id,sort_order,kind,question_bank_id,correct_answer) VALUES(?,?,?,'BANK',?,?)`).bind(uuid('qtq'), id, i + 1, q.id, LETTERS.includes(String(q.correct_answer || '').toUpperCase()) ? String(q.correct_answer).toUpperCase() : null)),
  ]);
  return json({ ok: true, id }, 201);
}

function answerKeyOf(questions: any[]): string[] { return questions.map((q) => String(q.correct_answer || '')); }
function readiness(t: any, questions: any[]) {
  if (!questions.length) return 'Teste henüz soru eklenmedi.';
  const missing = questions.findIndex((q) => !q.correct_answer);
  if (missing >= 0) return `${missing + 1}. sorunun doğru cevabını işaretleyin.`;
  if (questions.every((q) => q.correct_answer === 'X')) return 'Bütün sorular iptal; en az bir geçerli soru gerekir.';
  return '';
}

async function createSession(request: Request, env: Env, user: AuthUser, t: any) {
  const questions = await questionsOf(env, t.id);
  const notReady = readiness(t, questions); if (notReady) return fail(409, 'TEST_NOT_READY', notReady);
  const b: any = await request.json().catch(() => ({}));
  const duration = Math.round(Number(b.durationMinutes));
  if (!Number.isInteger(duration) || duration < 1 || duration > 300) return fail(400, 'VALIDATION_ERROR', 'Sınav süresi 1–300 dakika olmalı.');
  const now = new Date();
  const opens = b.opensAt ? parseTime(b.opensAt) : now;
  const closes = b.closesAt ? parseTime(b.closesAt) : new Date((opens || now).getTime() + Math.max(duration + 30, 24 * 60) * 60000);
  if (!opens || !closes) return fail(400, 'VALIDATION_ERROR', 'Başlangıç ya da bitiş zamanı geçersiz.');
  if (closes.getTime() <= opens.getTime() + 60000) return fail(400, 'VALIDATION_ERROR', 'Bitiş, başlangıçtan sonra olmalı.');
  if (closes.getTime() < now.getTime()) return fail(400, 'VALIDATION_ERROR', 'Bitiş zamanı geçmiş.');
  const resultMode = ['AFTER_SUBMIT', 'AFTER_CLOSE', 'HIDDEN'].includes(b.resultMode) ? b.resultMode : 'AFTER_SUBMIT';
  const alphabet = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  let code = '';
  for (let tries = 0; tries < 8; tries++) {
    const rnd = crypto.getRandomValues(new Uint8Array(6)); code = [...rnd].map((x) => alphabet[x % alphabet.length]).join('');
    if (!(await one(env.DB.prepare('SELECT 1 x FROM quick_test_sessions WHERE code=?').bind(code)))) break;
  }
  const id = uuid('qts');
  await env.DB.prepare(`INSERT INTO quick_test_sessions(id,test_id,code,opens_at,closes_at,duration_minutes,shuffle_questions,result_mode,created_by) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(id, t.id, code, sqlTime(opens), sqlTime(closes), duration, b.shuffle === false ? 0 : 1, resultMode, user.id).run();
  return json({ ok: true, session: { id, code, opensAt: sqlTime(opens), closesAt: sqlTime(closes), durationMinutes: duration } }, 201);
}

async function closeSession(env: Env, t: any, sid: string) {
  const r = await env.DB.prepare(`UPDATE quick_test_sessions SET status='CLOSED',closes_at=MIN(closes_at,CURRENT_TIMESTAMP) WHERE id=? AND test_id=?`).bind(sid, t.id).run();
  if (!r.meta.changes) return fail(404, 'NOT_FOUND', 'Oturum bulunamadı.');
  await finalizeExpired(env, sid);
  return json({ ok: true });
}

function score(order: string[], key: Map<string, string>, answers: Record<string, string>, wrongDivisor: number) {
  let correct = 0, wrong = 0, blank = 0;
  for (const qid of order) {
    const k = key.get(qid); if (!k || k === 'X') continue;
    const a = String(answers[qid] || '').toUpperCase();
    if (!a) blank++; else if (a === k) correct++; else wrong++;
  }
  const valid = correct + wrong + blank;
  const net = wrongDivisor ? Math.round((correct - wrong / wrongDivisor) * 100) / 100 : correct;
  return { correct, wrong, blank, net, score: valid ? Math.round((Math.max(0, net) / valid) * 10000) / 100 : 0 };
}

async function keyMap(env: Env, testId: string) { return new Map((await all<any>(env.DB.prepare('SELECT id,correct_answer FROM quick_test_questions WHERE test_id=?').bind(testId))).map((r) => [r.id, String(r.correct_answer || '')])); }

/** Attempts whose time ran out are handed in with what they saved (the browser may have been closed). */
async function finalizeExpired(env: Env, sessionId?: string) {
  const rows = await all<any>(env.DB.prepare(`SELECT a.*,t.layout_json FROM quick_test_attempts a JOIN quick_tests t ON t.id=a.test_id JOIN quick_test_sessions s ON s.id=a.session_id
    WHERE a.channel='ONLINE' AND a.submitted_at IS NULL AND (a.deadline_at<=CURRENT_TIMESTAMP OR s.status='CLOSED' OR s.closes_at<=CURRENT_TIMESTAMP) ${sessionId ? 'AND a.session_id=?' : ''} LIMIT 300`).bind(...(sessionId ? [sessionId] : [])));
  const keys = new Map<string, Map<string, string>>();
  for (const a of rows) {
    if (!keys.has(a.test_id)) keys.set(a.test_id, await keyMap(env, a.test_id));
    const s = score(JSON.parse(a.question_order_json), keys.get(a.test_id)!, JSON.parse(a.answers_json || '{}'), settingsOf(a).wrongDivisor);
    await env.DB.prepare(`UPDATE quick_test_attempts SET submitted_at=MIN(COALESCE(deadline_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP),correct_count=?,wrong_count=?,blank_count=?,net=?,score=? WHERE id=? AND submitted_at IS NULL`).bind(s.correct, s.wrong, s.blank, s.net, s.score, a.id).run();
  }
  return rows.length;
}
export { finalizeExpired as finalizeExpiredQuickTests };

async function results(env: Env, t: any, url: URL) {
  const sessionId = url.searchParams.get('sessionId');
  await finalizeExpired(env, sessionId || undefined).catch(() => 0);
  const attempts = await all<any>(env.DB.prepare(`SELECT id,session_id,channel,taker_name,taker_number,taker_class,started_at,submitted_at,deadline_at,correct_count,wrong_count,blank_count,net,score,answers_json,question_order_json FROM quick_test_attempts WHERE test_id=? ${sessionId ? 'AND session_id=?' : ''} ORDER BY COALESCE(net,-999) DESC,taker_name`).bind(t.id, ...(sessionId ? [sessionId] : [])));
  const questions = await questionsOf(env, t.id);
  const done = attempts.filter((a) => a.submitted_at);
  // Per question: how many answered correctly — the teacher sees which questions the class missed.
  const stats = questions.map((q, i) => {
    let c = 0, w = 0, b = 0; const picks: Record<string, number> = {};
    for (const a of done) { const ans = String(JSON.parse(a.answers_json || '{}')[q.id] || '').toUpperCase(); if (!ans) b++; else { picks[ans] = (picks[ans] || 0) + 1; if (ans === q.correct_answer) c++; else w++; } }
    return { no: i + 1, id: q.id, correctAnswer: q.correct_answer, correct: c, wrong: w, blank: b, picks, rate: done.length ? Math.round((c / done.length) * 100) : null };
  });
  return json({ ok: true, attempts: attempts.map(({ answers_json, question_order_json, ...a }) => ({ ...a, inProgress: !a.submitted_at })), stats, average: done.length ? Math.round(done.reduce((s, a) => s + Number(a.net || 0), 0) / done.length * 100) / 100 : null });
}

async function deleteAttempt(env: Env, t: any, aid: string) {
  const r = await env.DB.prepare('DELETE FROM quick_test_attempts WHERE id=? AND test_id=?').bind(aid, t.id).run();
  return r.meta.changes ? json({ ok: true }) : fail(404, 'NOT_FOUND', 'Kayıt bulunamadı.');
}

/** A paper sheet read with the phone camera (or typed): scored against the key in the printed order. */
async function paperResult(request: Request, env: Env, user: AuthUser, t: any) {
  const b: any = await request.json().catch(() => ({}));
  const name = clean(b.name, 80), number = clean(b.number, 20);
  if (name.length < 2) return fail(400, 'VALIDATION_ERROR', 'Öğrencinin adını yazın.');
  const questions = await questionsOf(env, t.id);
  const notReady = readiness(t, questions); if (notReady) return fail(409, 'TEST_NOT_READY', notReady);
  const seq = String(b.answers || '').toUpperCase();
  const answers: Record<string, string> = {};
  questions.forEach((q, i) => { const c = seq[i]; if (c && LETTERS.slice(0, t.option_count).includes(c)) answers[q.id] = c; });
  const order = questions.map((q) => q.id);
  const s = score(order, await keyMap(env, t.id), answers, settingsOf(t).wrongDivisor);
  const id = uuid('qta');
  await env.DB.prepare(`INSERT INTO quick_test_attempts(id,test_id,channel,taker_name,taker_number,taker_class,question_order_json,answers_json,submitted_at,correct_count,wrong_count,blank_count,net,score,created_by) VALUES(?,?,'PAPER',?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?)`)
    .bind(id, t.id, name, number || '-', clean(b.className, 20) || null, JSON.stringify(order), JSON.stringify(answers), s.correct, s.wrong, s.blank, s.net, s.score, user.id).run();
  return json({ ok: true, id, result: s }, 201);
}

export async function handleQuickTests(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/public/quick-tests')) return handlePublic(request, env, url);
  if (!url.pathname.startsWith('/api/quick-tests')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (!STAFF.includes(user.role)) return fail(403, 'FORBIDDEN', 'Hızlı Test öğretmen ve yöneticilere açıktır.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const p = url.pathname, m = request.method;
  if (p === '/api/quick-tests' && m === 'GET') return listTests(env, user, url);
  if (p === '/api/quick-tests' && m === 'POST') return createTest(request, env, user);
  let x = p.match(/^\/api\/quick-tests\/from-studio\/([^/]+)$/); if (x && m === 'POST') return fromStudio(env, user, x[1]);
  x = p.match(/^\/api\/quick-tests\/([^/]+)(?:\/(.+))?$/);
  if (!x) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const t = await ownedTest(env, user, x[1]);
  if (!t) return fail(404, 'NOT_FOUND', 'Test bulunamadı.');
  const rest = x[2] || '';
  if (!rest && m === 'GET') return testDetail(env, user, t);
  if (!rest && m === 'PATCH') return updateTest(request, env, user, t);
  if (!rest && m === 'DELETE') { await env.DB.batch([env.DB.prepare(`UPDATE quick_tests SET status='ARCHIVED',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(t.id), env.DB.prepare(`UPDATE quick_test_sessions SET status='CLOSED' WHERE test_id=?`).bind(t.id)]); return json({ ok: true }); }
  if (rest === 'questions' && m === 'POST') return addImageQuestion(request, env, user, t);
  if (rest === 'order' && m === 'PUT') return reorder(request, env, t);
  let y = rest.match(/^questions\/([^/]+)$/);
  if (y && m === 'PATCH') return setAnswer(request, env, t, y[1]);
  if (y && m === 'DELETE') return deleteQuestion(env, t, y[1]);
  y = rest.match(/^questions\/([^/]+)\/image$/); if (y && m === 'GET') return questionImage(env, t.id, y[1]);
  if (rest === 'sessions' && m === 'POST') return createSession(request, env, user, t);
  y = rest.match(/^sessions\/([^/]+)\/close$/); if (y && m === 'POST') return closeSession(env, t, y[1]);
  if (rest === 'results' && m === 'GET') return results(env, t, url);
  y = rest.match(/^attempts\/([^/]+)$/); if (y && m === 'DELETE') return deleteAttempt(env, t, y[1]);
  if (rest === 'paper' && m === 'POST') return paperResult(request, env, user, t);
  if ((rest === 'pdf' || rest === 'answer-key' || rest === 'optical-template') && m === 'GET') {
    const questions = await questionsOf(env, t.id);
    const notReady = readiness(t, questions); if (notReady) return fail(409, 'TEST_NOT_READY', notReady);
    const pdf = await import('./quick-test-pdf');
    if (rest === 'optical-template') return json({ ok: true, template: pdf.quickTestOpticalTemplate(t, questions.length) });
    const branding = await pdf.brandingFor(env, t.institution_id);
    const out = rest === 'pdf' ? await pdf.renderQuickTestPdf(env, t, questions, branding, (url.searchParams.has('columns') ? (Number(url.searchParams.get('columns')) === 1 ? 1 : Number(url.searchParams.get('columns')) === 2 ? 2 : 0) : settingsOf(t).columns) as 0 | 1 | 2) : await pdf.renderQuickTestAnswerKey(t, answerKeyOf(questions));
    const name = `${t.title}${rest === 'pdf' ? '' : ' - Cevap Anahtari'}.pdf`.replace(/[^\p{L}\p{N} ._-]/gu, '_');
    return new Response(out, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' } });
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}

// ---------------------------------------------------------------------------------------------------------------
// Student side (no account): code → name, number → timed exam
// ---------------------------------------------------------------------------------------------------------------
async function sessionByCode(env: Env, code: string) {
  return one<any>(env.DB.prepare(`SELECT s.*,t.title,t.option_count,t.layout_json,t.status test_status,i.name institution_name,(SELECT count(*) FROM quick_test_questions q WHERE q.test_id=t.id AND q.correct_answer<>'X') question_count
    FROM quick_test_sessions s JOIN quick_tests t ON t.id=s.test_id JOIN institutions i ON i.id=t.institution_id WHERE s.code=?`).bind(code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)));
}
function stateOf(s: any) {
  const now = Date.now(), o = parseTime(s.opens_at)!.getTime(), c = parseTime(s.closes_at)!.getTime();
  if (s.test_status !== 'ACTIVE' || s.status === 'CLOSED' || now >= c) return 'CLOSED';
  return now < o ? 'NOT_OPEN' : 'OPEN';
}
async function attemptFor(env: Env, attemptId: string, token: string) {
  if (!token) return null;
  const a = await one<any>(env.DB.prepare(`SELECT a.*,s.result_mode,s.closes_at,s.status session_status,s.code,t.layout_json,t.option_count,t.title FROM quick_test_attempts a JOIN quick_test_sessions s ON s.id=a.session_id JOIN quick_tests t ON t.id=a.test_id WHERE a.id=? AND a.channel='ONLINE'`).bind(attemptId));
  return a && a.token_hash === (await sha(token)) ? a : null;
}
async function examPayload(env: Env, a: any) {
  const order: string[] = JSON.parse(a.question_order_json);
  const qs = new Map((await questionsOf(env, a.test_id)).map((q) => [q.id, q]));
  return order.map((id, i) => { const q = qs.get(id); return q ? { id, no: i + 1, kind: q.kind, width: q.image_width, height: q.image_height, stem: q.kind === 'BANK' ? q.stem_text : undefined, options: q.kind === 'BANK' ? bankOptions(q.options_json) : undefined } : null; }).filter(Boolean);
}
function resultFor(a: any, closed: boolean) {
  const show = a.result_mode === 'AFTER_SUBMIT' || (a.result_mode === 'AFTER_CLOSE' && closed);
  return show ? { correct: a.correct_count, wrong: a.wrong_count, blank: a.blank_count, net: a.net, score: a.score } : null;
}

async function handlePublic(request: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname, m = request.method;
  if (m !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği sınav sayfasından başlatın.');
  let x = p.match(/^\/api\/public\/quick-tests\/([A-Za-z0-9]{4,8})$/);
  if (x && m === 'GET') {
    const s = await sessionByCode(env, x[1]);
    if (!s) return fail(404, 'CODE_NOT_FOUND', 'Bu kodla bir sınav bulunamadı. Kodu öğretmeninize sorun.');
    return json({ ok: true, exam: { title: s.title, institution: s.institution_name, questionCount: Number(s.question_count), durationMinutes: s.duration_minutes, opensAt: s.opens_at, closesAt: s.closes_at, state: stateOf(s), optionCount: s.option_count } });
  }
  x = p.match(/^\/api\/public\/quick-tests\/([A-Za-z0-9]{4,8})\/start$/);
  if (x && m === 'POST') {
    const b: any = await request.json().catch(() => ({}));
    const s = await sessionByCode(env, x[1]);
    if (!s) return fail(404, 'CODE_NOT_FOUND', 'Bu kodla bir sınav bulunamadı.');
    const state = stateOf(s);
    if (state === 'NOT_OPEN') return fail(409, 'NOT_OPEN', 'Sınav henüz başlamadı.');
    if (state === 'CLOSED') return fail(409, 'CLOSED', 'Sınav süresi bitti.');
    const name = clean(b.name, 80), number = clean(b.number, 20).replace(/\s/g, ''), className = clean(b.className, 20);
    if (name.length < 3 || !/\S+\s+\S+/.test(name)) return fail(400, 'VALIDATION_ERROR', 'Adınızı ve soyadınızı yazın.');
    if (!/^[0-9A-Za-z-]{1,20}$/.test(number)) return fail(400, 'VALIDATION_ERROR', 'Öğrenci numaranızı yazın.');
    const ip = request.headers.get('CF-Connecting-IP') || 'local', ipHash = await sha(ip);
    // Resume on the same device: the token stored in the browser brings the same attempt back with the time left.
    const existing = await one<any>(env.DB.prepare('SELECT * FROM quick_test_attempts WHERE session_id=? AND taker_number=?').bind(s.id, number));
    if (existing) {
      if (b.resumeToken && existing.token_hash === (await sha(String(b.resumeToken)))) {
        const a = await attemptFor(env, existing.id, String(b.resumeToken));
        if (a.submitted_at) return json({ ok: true, attemptId: a.id, submitted: true, result: resultFor(a, stateOf(s) === 'CLOSED') });
        return json({ ok: true, attemptId: a.id, token: String(b.resumeToken), deadlineAt: a.deadline_at, serverNow: sqlTime(new Date()), answers: JSON.parse(a.answers_json || '{}'), questions: await examPayload(env, a), title: s.title, optionCount: s.option_count });
      }
      return fail(409, 'ALREADY_STARTED', 'Bu numarayla sınava başlanmış. Aynı cihazdan devam edebilirsiniz; başka bir cihaz için öğretmeninizden kaydı sıfırlamasını isteyin.');
    }
    const turnstile = await (await import('./auth')).verifyTurnstile(env, b.turnstileToken, ip);
    if (!turnstile.ok) return fail(400, 'TURNSTILE_FAILED', 'Robot doğrulaması tamamlanamadı; sayfayı yenileyip tekrar deneyin.');
    const recent = Number((await one<any>(env.DB.prepare(`SELECT count(*) c FROM quick_test_attempts WHERE ip_hash=? AND started_at>datetime('now','-10 minutes')`).bind(ipHash)))?.c || 0);
    if (recent >= 200) return fail(429, 'RATE_LIMITED', 'Çok fazla deneme yapıldı; biraz bekleyin.');
    const questions = (await questionsOf(env, s.test_id)).filter((q) => q.correct_answer !== 'X');
    const order = questions.map((q) => q.id);
    if (s.shuffle_questions) for (let i = order.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const deadline = new Date(Math.min(Date.now() + s.duration_minutes * 60000, parseTime(s.closes_at)!.getTime()));
    const token = randomToken(), id = uuid('qta');
    try {
      await env.DB.prepare(`INSERT INTO quick_test_attempts(id,session_id,test_id,channel,taker_name,taker_number,taker_class,token_hash,question_order_json,deadline_at,ip_hash) VALUES(?,?,?,'ONLINE',?,?,?,?,?,?,?)`)
        .bind(id, s.id, s.test_id, name, number, className || null, await sha(token), JSON.stringify(order), sqlTime(deadline), ipHash).run();
    } catch { return fail(409, 'ALREADY_STARTED', 'Bu numarayla sınava başlanmış.'); }
    const a = await attemptFor(env, id, token);
    return json({ ok: true, attemptId: id, token, deadlineAt: sqlTime(deadline), serverNow: sqlTime(new Date()), answers: {}, questions: await examPayload(env, a), title: s.title, optionCount: s.option_count }, 201);
  }
  x = p.match(/^\/api\/public\/quick-tests\/attempts\/([^/]+)\/(answers|submit|image\/[^/]+|result)$/);
  if (!x) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const token = url.searchParams.get('t') || request.headers.get('X-Exam-Token') || '';
  const a = await attemptFor(env, x[1], token);
  if (!a) return fail(403, 'FORBIDDEN', 'Sınav oturumu bulunamadı; kodla yeniden girin.');
  const action = x[2];
  if (action.startsWith('image/') && m === 'GET') {
    const qid = action.slice(6);
    if (!JSON.parse(a.question_order_json).includes(qid)) return fail(404, 'NOT_FOUND', 'Görsel bulunamadı.');
    return questionImage(env, a.test_id, qid);
  }
  const closed = a.session_status === 'CLOSED' || Date.now() >= parseTime(a.closes_at)!.getTime();
  if (action === 'result' && m === 'GET') {
    if (!a.submitted_at) await finalizeExpired(env, a.session_id);
    const fresh = await attemptFor(env, a.id, token);
    return json({ ok: true, submitted: !!fresh.submitted_at, result: fresh.submitted_at ? resultFor(fresh, closed) : null, resultMode: fresh.result_mode, closesAt: fresh.closes_at });
  }
  if (a.submitted_at) return json({ ok: true, submitted: true, result: resultFor(a, closed) });
  const b: any = await request.json().catch(() => ({}));
  const order: string[] = JSON.parse(a.question_order_json);
  const letters = LETTERS.slice(0, a.option_count);
  const answers: Record<string, string> = {};
  for (const [qid, v] of Object.entries(b.answers || {})) { const c = String(v || '').toUpperCase(); if (order.includes(qid) && letters.includes(c)) answers[qid] = c; }
  // The server's clock decides: 15 seconds of grace for the last save, then the attempt is handed in as saved.
  const late = Date.now() > parseTime(a.deadline_at)!.getTime() + 15000;
  if (action === 'answers' && m === 'PUT') {
    if (late) { await finalizeExpired(env, a.session_id); return fail(409, 'TIME_UP', 'Süre doldu; son kaydedilen cevaplarınız teslim edildi.'); }
    await env.DB.prepare('UPDATE quick_test_attempts SET answers_json=? WHERE id=? AND submitted_at IS NULL').bind(JSON.stringify(answers), a.id).run();
    return json({ ok: true, savedAt: sqlTime(new Date()) });
  }
  if (action === 'submit' && m === 'POST') {
    const final = late ? JSON.parse(a.answers_json || '{}') : answers;
    const s = score(order, await keyMap(env, a.test_id), final, settingsOf(a).wrongDivisor);
    await env.DB.prepare(`UPDATE quick_test_attempts SET answers_json=?,submitted_at=CURRENT_TIMESTAMP,correct_count=?,wrong_count=?,blank_count=?,net=?,score=? WHERE id=? AND submitted_at IS NULL`).bind(JSON.stringify(final), s.correct, s.wrong, s.blank, s.net, s.score, a.id).run();
    const fresh = await attemptFor(env, a.id, token);
    return json({ ok: true, submitted: true, late, result: resultFor(fresh, closed), resultMode: a.result_mode });
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}
