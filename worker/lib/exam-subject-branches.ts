import type { AuthUser, Env } from '../types';
import { all, audit, badRequest, json, uuid } from './db';

/**
 * Alt ders aralıkları (owner decision 2 Nov). TYT only for now: the sub-subjects the approved student design shows.
 * A range is a question position inside its test (1 = the test's first question), so it holds for every booklet:
 * answers are stored against the canonical question. Ranges inside one test may not overlap and stay within the
 * test's question count. Saving changes nothing already frozen; the next freeze/publication carries the rows.
 */
export const TYT_BRANCHES: Record<string, Array<{ code: string; name: string }>> = {
  TYT_SOS: [{ code: 'TYT_TAR', name: 'Tarih' }, { code: 'TYT_COG', name: 'Coğrafya' }, { code: 'TYT_FEL', name: 'Felsefe' }, { code: 'TYT_DIN', name: 'Din Kültürü' }],
  TYT_FEN: [{ code: 'TYT_FIZ', name: 'Fizik' }, { code: 'TYT_KIM', name: 'Kimya' }, { code: 'TYT_BIY', name: 'Biyoloji' }],
  TYT_MAT: [{ code: 'TYT_MATEMATIK', name: 'Matematik' }, { code: 'TYT_GEO', name: 'Geometri' }],
};

async function examSubjects(env: Env, examId: string) {
  return all<any>(env.DB.prepare(`SELECT es.subject_id,s.code,s.name,es.question_count FROM exam_subjects es JOIN subjects s ON s.id=es.subject_id WHERE es.exam_id=? ORDER BY es.sort_order`).bind(examId));
}

export async function getExamBranches(env: Env, exam: any): Promise<Response> {
  const [subjects, branches] = await Promise.all([examSubjects(env, exam.id), all<any>(env.DB.prepare(`SELECT subject_id,branch_code,branch_name,question_start,question_end,sort_order FROM exam_subject_branches WHERE exam_id=? ORDER BY subject_id,sort_order`).bind(exam.id))]);
  const supported = /^TYT/i.test(String(exam.exam_type || ''));
  return json({ ok: true, supported, subjects: subjects.filter((s) => TYT_BRANCHES[String(s.code).toUpperCase()]).map((s) => ({ subjectId: s.subject_id, code: s.code, name: s.name, questionCount: Number(s.question_count), options: TYT_BRANCHES[String(s.code).toUpperCase()] })), branches });
}

/** PUT { branches: [{ subjectId, code, start, end }] } — replaces the exam's ranges. */
export async function putExamBranches(request: Request, env: Env, user: AuthUser, exam: any): Promise<Response> {
  if (!/^TYT/i.test(String(exam.exam_type || ''))) return badRequest('Alt ders aralıkları şimdilik yalnız TYT sınavları için tanımlanır.', 'BRANCHES_TYT_ONLY');
  const body: any = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.branches) ? body.branches : null;
  if (!rows || rows.length > 40) return badRequest('Alt ders listesi gönderin.', 'BRANCHES_REQUIRED');
  const subjects = await examSubjects(env, exam.id);
  const clean: Array<{ subjectId: string; code: string; name: string; start: number; end: number; order: number }> = [];
  for (const r of rows) {
    const subject = subjects.find((s) => s.subject_id === String(r?.subjectId || ''));
    const options = subject ? TYT_BRANCHES[String(subject.code).toUpperCase()] : undefined;
    const option = options?.find((o) => o.code === String(r?.code || ''));
    if (!subject || !options || !option) return badRequest('Alt ders bu teste ait değil.', 'BRANCH_NOT_ALLOWED');
    const start = Number(r.start), end = Number(r.end), count = Number(subject.question_count);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > count) return badRequest(`${subject.name} · ${option.name}: aralık 1–${count} içinde ve başlangıç bitişten küçük olmalı.`, 'BRANCH_RANGE_INVALID');
    clean.push({ subjectId: subject.subject_id, code: option.code, name: option.name, start, end, order: options.indexOf(option) });
  }
  if (new Set(clean.map((c) => c.code)).size !== clean.length) return badRequest('Aynı alt ders iki kez tanımlanmış.', 'BRANCH_DUPLICATE');
  for (const a of clean) for (const b of clean) if (a !== b && a.subjectId === b.subjectId && a.start <= b.end && b.start <= a.end) return badRequest(`${a.name} ve ${b.name} aralıkları çakışıyor.`, 'BRANCH_OVERLAP');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM exam_subject_branches WHERE exam_id=?`).bind(exam.id),
    ...clean.map((c) => env.DB.prepare(`INSERT INTO exam_subject_branches(id,exam_id,subject_id,branch_code,branch_name,question_start,question_end,sort_order,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uuid('esb'), exam.id, c.subjectId, c.code, c.name, c.start, c.end, c.order, user.id)),
  ]);
  await audit(env.DB, user.id, exam.institution_id || null, 'EXAM_SUBJECT_BRANCHES_SAVED', 'exam', exam.id, { branches: clean.map((c) => `${c.code}:${c.start}-${c.end}`) });
  return getExamBranches(env, exam);
}
