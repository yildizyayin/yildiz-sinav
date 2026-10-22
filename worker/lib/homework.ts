/**
 * A060: online homework. The student opens an assigned homework, marks answers (draft saved), and submits once.
 * Before the reveal moment nothing about the key is sent: no correct answer, solution or video. After it
 * (default: the due date passed; or right after submission when the teacher chose so) the student sees, per
 * question, their own answer, the correct answer, the solution and approved solution videos. Wrong and blank
 * answers of revealed homework form "Yanlışlarım". The teacher sees results per question and outcome.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';
import { recordAssessmentRun } from './assessment-ledger';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
export const runIdFor = (assignmentId: string, studentId: string) => `asr_foy_${assignmentId}_${studentId}`;

/** A date-only due date means the end of that day in Türkiye. */
export function dueMillis(dueAt: string | null | undefined): number | null {
  if (!dueAt) return null;
  const s = String(dueAt).trim();
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T23:59:59+03:00`) : Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(' ', 'T') : `${s.replace(' ', 'T')}+03:00`);
  return Number.isFinite(t) ? t : null;
}
export function revealed(a: { answer_reveal?: string | null; due_at?: string | null }, submitted: boolean, now = Date.now()) {
  if (!submitted) return false;
  if (a.answer_reveal === 'AFTER_SUBMIT') return true;
  const due = dueMillis(a.due_at);
  return due === null || now >= due;
}

async function questionItems(env: Env, assignmentId: string) {
  return all<any>(env.DB.prepare(`SELECT ai.id item_id,ai.reference_id question_id,ai.sort_order,q.stem_text,q.options_json,q.correct_answer,q.solution_text,q.subject_id,s.name subject_name
    FROM assignment_items ai JOIN question_bank q ON q.id=ai.reference_id LEFT JOIN subjects s ON s.id=q.subject_id
    WHERE ai.assignment_id=? AND ai.item_type='QUESTION' AND q.correct_answer IS NOT NULL ORDER BY ai.sort_order`).bind(assignmentId));
}
const cleanAnswers = (raw: any, ids: string[]) => {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') for (const id of ids) { const v = String(raw[id] ?? '').trim().toUpperCase(); if (LETTERS.includes(v)) out[id] = v; }
  return out;
};

/** Shared with /api/platform/foy/attempts: the first submission is the evidence (A054). */
export async function submitHomeworkAnswers(env: Env, user: AuthUser, assignmentId: string, rawAnswers: any): Promise<Response> {
  if (await one(env.DB.prepare(`SELECT 1 FROM assessment_runs WHERE id=? AND status='SCORED'`).bind(runIdFor(assignmentId, user.student_id!)))) return fail(409, 'FOY_ALREADY_SUBMITTED', 'Bu ödevi zaten gönderdiniz; ilk gönderim değerlendirmede kullanılır.');
  const recipient = await one<any>(env.DB.prepare(`SELECT a.id,a.institution_id,a.title,ar.status FROM assignments a JOIN assignment_recipients ar ON ar.assignment_id=a.id WHERE a.id=? AND ar.student_id=? AND a.status='ASSIGNED'`).bind(assignmentId, user.student_id));
  if (!recipient) return fail(403, 'FORBIDDEN', 'Bu ödev size ait değil.');
  const items = await questionItems(env, assignmentId);
  if (!items.length) return fail(400, 'FOY_QUESTIONS_REQUIRED', 'Bu ödevde ölçülebilir soru bulunmuyor.');
  const answers = cleanAnswers(rawAnswers, items.map((i) => i.question_id));
  let correct = 0; const responses: any[] = [];
  for (const item of items) {
    const answer = answers[item.question_id] || null; const ok = !!answer && answer === String(item.correct_answer).toUpperCase(); if (ok) correct++;
    responses.push({ questionId: item.question_id, selectedAnswer: answer, isCorrect: ok, sourceChannel: 'DIGITAL' });
    await env.DB.prepare(`INSERT INTO assignment_attempts(id,assignment_id,student_id,item_id,answer_json,score) VALUES(?,?,?,?,?,?)`).bind(uuid('aat'), assignmentId, user.student_id, item.item_id, JSON.stringify({ answer }), ok ? 1 : 0).run();
  }
  const score = correct / items.length; const runId = runIdFor(assignmentId, user.student_id!);
  await recordAssessmentRun(env.DB, { id: runId, institutionId: recipient.institution_id, studentId: user.student_id!, sourceType: 'FOY', sourceId: assignmentId, assignmentId, deliveryMode: 'DIGITAL', score, metadata: { title: recipient.title, questionCount: items.length }, responses });
  await env.DB.batch([
    env.DB.prepare(`UPDATE assignment_recipients SET status='COMPLETED',progress=1,completed_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND student_id=?`).bind(assignmentId, user.student_id),
    env.DB.prepare('DELETE FROM homework_drafts WHERE assignment_id=? AND student_id=?').bind(assignmentId, user.student_id),
  ]);
  await audit(env.DB, user.id, recipient.institution_id, 'FOY_ASSESSMENT_SUBMITTED', 'assignment', assignmentId, { questionCount: items.length, score });
  return json({ ok: true, runId, score, correct, total: items.length });
}

async function studentView(env: Env, user: AuthUser, assignmentId: string) {
  const a = await one<any>(env.DB.prepare(`SELECT a.id,a.title,a.description,a.due_at,a.answer_reveal,a.status,ar.status recipient_status,ar.completed_at FROM assignments a JOIN assignment_recipients ar ON ar.assignment_id=a.id WHERE a.id=? AND ar.student_id=? AND a.status IN ('ASSIGNED','CLOSED')`).bind(assignmentId, user.student_id));
  if (!a) return fail(404, 'NOT_FOUND', 'Ödev bulunamadı.');
  const items = await questionItems(env, assignmentId);
  const run = await one<any>(env.DB.prepare(`SELECT id,score,completed_at FROM assessment_runs WHERE id=? AND status='SCORED'`).bind(runIdFor(assignmentId, user.student_id!)));
  const show = revealed(a, !!run);
  const responses = run ? await all<any>(env.DB.prepare('SELECT question_id,selected_answer,is_correct FROM assessment_responses WHERE run_id=?').bind(run.id)) : [];
  const draft = !run ? await one<any>(env.DB.prepare('SELECT answers_json,updated_at FROM homework_drafts WHERE assignment_id=? AND student_id=?').bind(assignmentId, user.student_id)) : null;
  const videos = show && items.length ? await all<any>(env.DB.prepare(`SELECT question_id,external_url,title FROM question_assets WHERE asset_type='SOLUTION_VIDEO' AND approved=1 AND external_url IS NOT NULL AND question_id IN (${items.map(() => '?').join(',')})`).bind(...items.map((i) => i.question_id))) : [];
  const outcomes = show && items.length ? await all<any>(env.DB.prepare(`SELECT l.question_id,o.code,o.title FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id IN (${items.map(() => '?').join(',')})`).bind(...items.map((i) => i.question_id))) : [];
  const due = dueMillis(a.due_at);
  return json({ ok: true, assignment: { id: a.id, title: a.title, description: a.description, dueAt: a.due_at, answerReveal: a.answer_reveal, overdue: due !== null && Date.now() > due && !run, submitted: !!run, submittedAt: run?.completed_at ?? null, score: run ? run.score : null, revealed: show,
    revealNote: !run ? 'Cevaplar ve çözümler ödevi gönderdikten sonra açılır.' : show ? null : 'Cevaplar ve çözümler son teslim tarihinden sonra açılacak.' },
    draft: draft ? { answers: JSON.parse(draft.answers_json), savedAt: draft.updated_at } : null,
    questions: items.map((i, k) => {
      const base: any = { no: k + 1, questionId: i.question_id, subject: i.subject_name, stem: i.stem_text, options: i.options_json ? JSON.parse(i.options_json) : [] };
      const r = responses.find((x) => x.question_id === i.question_id);
      if (run) base.yourAnswer = r?.selected_answer ?? null;
      if (show) Object.assign(base, { correctAnswer: String(i.correct_answer).toUpperCase(), result: !r?.selected_answer ? 'BLANK' : r.is_correct ? 'CORRECT' : 'WRONG', solution: i.solution_text || null,
        solutionVideos: videos.filter((v) => v.question_id === i.question_id).map((v) => ({ url: v.external_url, title: v.title })), outcomes: outcomes.filter((o) => o.question_id === i.question_id).map((o) => ({ code: o.code, title: o.title })) });
      return base;
    }) });
}

async function saveDraft(request: Request, env: Env, user: AuthUser, assignmentId: string) {
  const a = await one<any>(env.DB.prepare(`SELECT 1 FROM assignments a JOIN assignment_recipients ar ON ar.assignment_id=a.id WHERE a.id=? AND ar.student_id=? AND a.status='ASSIGNED'`).bind(assignmentId, user.student_id));
  if (!a) return fail(404, 'NOT_FOUND', 'Ödev bulunamadı.');
  if (await one(env.DB.prepare(`SELECT 1 FROM assessment_runs WHERE id=? AND status='SCORED'`).bind(runIdFor(assignmentId, user.student_id!)))) return fail(409, 'FOY_ALREADY_SUBMITTED', 'Ödev gönderildi; taslak değiştirilemez.');
  const body = await request.json().catch(() => ({})) as any;
  const items = await questionItems(env, assignmentId);
  const answers = cleanAnswers(body?.answers, items.map((i) => i.question_id));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO homework_drafts(assignment_id,student_id,answers_json) VALUES(?,?,?) ON CONFLICT(assignment_id,student_id) DO UPDATE SET answers_json=excluded.answers_json,updated_at=CURRENT_TIMESTAMP`).bind(assignmentId, user.student_id, JSON.stringify(answers)),
    env.DB.prepare(`UPDATE assignment_recipients SET status='STARTED',progress=? WHERE assignment_id=? AND student_id=? AND status='ASSIGNED'`).bind(items.length ? Object.keys(answers).length / items.length : 0, assignmentId, user.student_id),
  ]);
  return json({ ok: true, saved: Object.keys(answers).length });
}

async function mistakes(env: Env, user: AuthUser) {
  const rows = await all<any>(env.DB.prepare(`SELECT a.id assignment_id,a.title,a.due_at,a.answer_reveal,r.question_id,r.selected_answer,q.stem_text,q.options_json,q.correct_answer,q.solution_text,s.name subject_name
    FROM assessment_runs run JOIN assignments a ON a.id=run.assignment_id JOIN assessment_responses r ON r.run_id=run.id JOIN question_bank q ON q.id=r.question_id LEFT JOIN subjects s ON s.id=q.subject_id
    WHERE run.student_id=? AND run.source_type='FOY' AND run.status='SCORED' AND (r.is_correct IS NULL OR r.is_correct=0) ORDER BY run.completed_at DESC LIMIT 300`).bind(user.student_id));
  return json({ ok: true, mistakes: rows.filter((r) => revealed(r, true)).map((r) => ({ assignmentId: r.assignment_id, assignmentTitle: r.title, questionId: r.question_id, subject: r.subject_name, stem: r.stem_text, options: r.options_json ? JSON.parse(r.options_json) : [], yourAnswer: r.selected_answer, result: r.selected_answer ? 'WRONG' : 'BLANK', correctAnswer: String(r.correct_answer).toUpperCase(), solution: r.solution_text || null })) });
}

async function teacherResults(env: Env, user: AuthUser, assignmentId: string) {
  const a = await one<any>(env.DB.prepare('SELECT * FROM assignments WHERE id=?').bind(assignmentId));
  if (!a) return fail(404, 'NOT_FOUND', 'Ödev bulunamadı.');
  const allowed = user.role === 'SUPER_ADMIN' || (user.institution_id === a.institution_id && (user.role === 'INSTITUTION_MANAGER' || a.created_by === user.id));
  if (!allowed) return fail(403, 'FORBIDDEN', 'Bu ödevin sonuçlarını göremezsiniz.');
  const items = await questionItems(env, assignmentId);
  const students = await all<any>(env.DB.prepare(`SELECT ar.student_id,ar.status,ar.completed_at,se.first_name,se.last_name,run.score FROM assignment_recipients ar JOIN student_entities se ON se.id=ar.student_id LEFT JOIN assessment_runs run ON run.id='asr_foy_'||ar.assignment_id||'_'||ar.student_id AND run.status='SCORED' WHERE ar.assignment_id=? ORDER BY se.last_name,se.first_name`).bind(assignmentId));
  const resp = await all<any>(env.DB.prepare(`SELECT r.question_id,r.selected_answer,r.is_correct FROM assessment_runs run JOIN assessment_responses r ON r.run_id=run.id WHERE run.assignment_id=? AND run.source_type='FOY' AND run.status='SCORED'`).bind(assignmentId));
  const links = items.length ? await all<any>(env.DB.prepare(`SELECT l.question_id,o.id,o.code,o.title FROM question_learning_links l JOIN outcomes o ON l.node_id='ln_'||o.id WHERE l.question_id IN (${items.map(() => '?').join(',')})`).bind(...items.map((i) => i.question_id))) : [];
  const questions = items.map((i, k) => { const rs = resp.filter((r) => r.question_id === i.question_id); const c = rs.filter((r) => r.is_correct === 1).length, b = rs.filter((r) => !r.selected_answer).length;
    return { no: k + 1, questionId: i.question_id, correctAnswer: String(i.correct_answer).toUpperCase(), correct: c, wrong: rs.length - c - b, blank: b, answered: rs.length, percent: rs.length ? Math.round(c / rs.length * 1000) / 10 : null }; });
  const byOutcome = new Map<string, any>();
  for (const q of questions) for (const o of links.filter((l) => l.question_id === q.questionId)) { const g = byOutcome.get(o.id) ?? { code: o.code, title: o.title, correct: 0, total: 0 }; g.correct += q.correct; g.total += q.answered; byOutcome.set(o.id, g); }
  return json({ ok: true, assignment: { id: a.id, title: a.title, dueAt: a.due_at, answerReveal: a.answer_reveal },
    students: students.map((s) => ({ id: s.student_id, name: `${s.first_name} ${s.last_name}`, status: s.status, submittedAt: s.completed_at, score: s.score })),
    submitted: students.filter((s) => s.score !== null).length, pending: students.filter((s) => s.score === null).length,
    questions, outcomes: [...byOutcome.values()].map((g) => ({ ...g, percent: g.total ? Math.round(g.correct / g.total * 1000) / 10 : null })) });
}

async function setReveal(request: Request, env: Env, user: AuthUser, assignmentId: string) {
  const a = await one<any>(env.DB.prepare('SELECT * FROM assignments WHERE id=?').bind(assignmentId));
  if (!a) return fail(404, 'NOT_FOUND', 'Ödev bulunamadı.');
  if (!(user.role === 'SUPER_ADMIN' || (user.institution_id === a.institution_id && (user.role === 'INSTITUTION_MANAGER' || a.created_by === user.id)))) return fail(403, 'FORBIDDEN', 'Bu ödevi değiştiremezsiniz.');
  const body = await request.json().catch(() => ({})) as any;
  if (!['AFTER_DUE', 'AFTER_SUBMIT'].includes(body?.answerReveal)) return fail(400, 'VALIDATION_ERROR', 'Cevap açılma zamanı AFTER_DUE veya AFTER_SUBMIT olmalıdır.');
  await env.DB.prepare('UPDATE assignments SET answer_reveal=? WHERE id=?').bind(body.answerReveal, assignmentId).run();
  await audit(env.DB, user.id, a.institution_id, 'HOMEWORK_REVEAL_CHANGED', 'assignment', assignmentId, { from: a.answer_reveal, to: body.answerReveal });
  return json({ ok: true });
}

export async function handleHomework(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/homework')) return null;
  const { getAuthUser } = await import('./auth');
  const user = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const student = user.role === 'STUDENT' && !!user.student_id;
  if (url.pathname === '/api/homework/mistakes' && request.method === 'GET') return student ? mistakes(env, user) : fail(403, 'STUDENT_ONLY', 'Yanlışlarım öğrenciye açıktır.');
  const m = url.pathname.match(/^\/api\/homework\/([^/]+)(?:\/(draft|submit|results|reveal))?$/);
  if (!m) return fail(404, 'NOT_FOUND', 'Yol bulunamadı.');
  const [, id, action] = m;
  if (!action && request.method === 'GET') return student ? studentView(env, user, id) : fail(403, 'STUDENT_ONLY', 'Ödevi öğrenci çözer.');
  if (action === 'draft' && request.method === 'PUT') return student ? saveDraft(request, env, user, id) : fail(403, 'STUDENT_ONLY', 'Ödevi öğrenci çözer.');
  if (action === 'submit' && request.method === 'POST') { if (!student) return fail(403, 'STUDENT_ONLY', 'Ödevi öğrenci gönderir.'); const b = await request.json().catch(() => ({})) as any; return submitHomeworkAnswers(env, user, id, b?.answers); }
  if (action === 'results' && request.method === 'GET') return teacherResults(env, user, id);
  if (action === 'reveal' && request.method === 'PATCH') return setReveal(request, env, user, id);
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}
