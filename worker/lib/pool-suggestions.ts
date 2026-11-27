/**
 * "Havuza öner" (owner, 27 Nov 2026: "Beyan + yayın ekibi onayı"). A teacher suggests a question they cropped for the
 * shared pool, declaring that they wrote it or that it belongs to their institution and allowing ANUNEX to use it.
 * A suggestion never becomes a pool question by itself: the editorial team (Super Admin) looks at it, writes and
 * approves the pool question through the normal review, and records the decision here. The teacher sees the result.
 */
import type { AuthUser, Env } from '../types';
import { all, audit, json, one, uuid } from './db';

export const SUGGEST_STATEMENT = 'Bu soruyu ben yazdım ya da kurumumuza aittir; ANUNEX’in ortak soru havuzunda kullanmasına izin veriyorum.';
const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
const clean = (v: unknown, max: number) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** POST /api/quick-tests/:id/questions/:qid/suggest — called by the Hızlı Test handler with the test it already authorised. */
export async function suggestQuestion(request: Request, env: Env, user: AuthUser, t: any, qid: string) {
  const q = await one<any>(env.DB.prepare(`SELECT * FROM quick_test_questions WHERE id=? AND test_id=?`).bind(qid, t.id));
  if (!q) return fail(404, 'NOT_FOUND', 'Soru bulunamadı.');
  if (q.kind !== 'IMAGE' || !q.image_key) return fail(409, 'ALREADY_POOL', 'Bu soru zaten ortak havuzdan geliyor.');
  const b: any = await request.json().catch(() => ({}));
  if (b?.declared !== true) return fail(400, 'DECLARATION_REQUIRED', 'Soruyu sizin yazdığınızı ya da kurumunuza ait olduğunu onaylayın.');
  const existing = await one<any>(env.DB.prepare(`SELECT id,status FROM pool_suggestions WHERE quick_test_question_id=?`).bind(qid));
  if (existing) return json({ ok: true, suggestion: { id: existing.id, status: existing.status }, duplicate: true });
  const obj = await env.FILES.get(q.image_key);
  if (!obj) return fail(409, 'IMAGE_MISSING', 'Sorunun görseli bulunamadı.');
  const id = uuid('pgs');
  // the suggestion keeps its own copy: deleting the quick test never removes what the editorial team is looking at
  const key = `pool-suggestions/${t.institution_id}/${id}.${String(q.image_key).endsWith('.png') ? 'png' : 'jpg'}`;
  await env.FILES.put(key, new Uint8Array(await obj.arrayBuffer()), { httpMetadata: { contentType: String(q.image_key).endsWith('.png') ? 'image/png' : 'image/jpeg' } });
  await env.DB.prepare(`INSERT INTO pool_suggestions(id,institution_id,quick_test_question_id,image_key,image_width,image_height,correct_answer,grade_level,subject_label,note,statement,suggested_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, t.institution_id, qid, key, q.image_width, q.image_height, q.correct_answer, t.grade_level, t.subject_label, clean(b.note, 400) || null, SUGGEST_STATEMENT, user.id).run();
  await audit(env.DB, user.id, t.institution_id, 'POOL_SUGGESTION_CREATED', 'pool_suggestion', id, { quickTestId: t.id, questionId: qid, declared: true });
  return json({ ok: true, suggestion: { id, status: 'PENDING' } }, 201);
}

/** Suggestion status per quick-test question, for the editor (a missing table is "none", the editor still works). */
export async function suggestionsFor(env: Env, questionIds: string[]): Promise<Map<string, { status: string; note: string | null }>> {
  if (!questionIds.length) return new Map();
  const rows = await all<any>(env.DB.prepare(`SELECT quick_test_question_id,status,review_note FROM pool_suggestions WHERE quick_test_question_id IN (${questionIds.map(() => '?').join(',')})`).bind(...questionIds)).catch(() => [] as any[]);
  return new Map(rows.map((r) => [r.quick_test_question_id, { status: r.status, note: r.review_note || null }]));
}

/** The editorial team's queue: GET /api/admin/pool-suggestions, GET …/:id/image, POST …/:id/decide. Super Admin only. */
export async function handlePoolSuggestions(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/api\/admin\/pool-suggestions(?:\/([^/]+)\/(image|decide))?$/);
  if (!m) return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Havuz önerilerini yalnız yayın ekibi görür.');
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) return fail(403, 'FORBIDDEN', 'İsteği ANUNEX üzerinden başlatın.');
  const [, id, action] = m;
  if (!id && request.method === 'GET') {
    const status = ['PENDING', 'ACCEPTED', 'REJECTED'].includes(String(url.searchParams.get('status'))) ? url.searchParams.get('status') : 'PENDING';
    const rows = await all<any>(env.DB.prepare(`SELECT s.*,i.name institution_name,u.display_name teacher_name FROM pool_suggestions s JOIN institutions i ON i.id=s.institution_id LEFT JOIN users u ON u.id=s.suggested_by
      WHERE s.status=? ORDER BY s.created_at ${status === 'PENDING' ? 'ASC' : 'DESC'} LIMIT 200`).bind(status));
    const counts = await all<any>(env.DB.prepare(`SELECT status,COUNT(*) n FROM pool_suggestions GROUP BY status`));
    return json({ ok: true, counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), suggestions: rows.map((r) => ({
      id: r.id, institution: r.institution_name, teacher: r.teacher_name || 'Öğretmen', gradeLevel: r.grade_level, subject: r.subject_label, correctAnswer: r.correct_answer,
      width: r.image_width, height: r.image_height, note: r.note, statement: r.statement, status: r.status, reviewNote: r.review_note, questionBankId: r.question_bank_id, createdAt: r.created_at, reviewedAt: r.reviewed_at })) });
  }
  const s = id ? await one<any>(env.DB.prepare(`SELECT * FROM pool_suggestions WHERE id=?`).bind(id)) : null;
  if (!s) return fail(404, 'NOT_FOUND', 'Öneri bulunamadı.');
  if (action === 'image' && request.method === 'GET') {
    const obj = await env.FILES.get(s.image_key);
    if (!obj) return fail(404, 'IMAGE_MISSING', 'Görsel bulunamadı.');
    return new Response(obj.body, { headers: { 'Content-Type': String(s.image_key).endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff' } });
  }
  if (action === 'decide' && request.method === 'POST') {
    const b: any = await request.json().catch(() => ({}));
    const decision = b?.decision === 'ACCEPTED' ? 'ACCEPTED' : b?.decision === 'REJECTED' ? 'REJECTED' : null;
    if (!decision) return fail(400, 'DECISION_REQUIRED', 'Kabul ya da ret seçin.');
    const note = clean(b.note, 400);
    if (decision === 'REJECTED' && note.length < 3) return fail(400, 'NOTE_REQUIRED', 'Öğretmen nedenini bilsin: kısa bir not yazın.');
    let bankId: string | null = null;
    if (decision === 'ACCEPTED') {
      // accepted means the team has written the pool question: it must exist (its own review decides when students see it)
      bankId = clean(b.questionBankId, 100) || null;
      if (!bankId) return fail(400, 'QUESTION_REQUIRED', 'Havuza yazılan sorunun kimliğini girin.');
      if (!(await one(env.DB.prepare(`SELECT 1 x FROM question_bank WHERE id=?`).bind(bankId)))) return fail(404, 'QUESTION_NOT_FOUND', 'Bu kimlikte bir havuz sorusu yok.');
    }
    await env.DB.prepare(`UPDATE pool_suggestions SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,question_bank_id=? WHERE id=?`).bind(decision, note || null, user.id, bankId, s.id).run();
    await audit(env.DB, user.id, s.institution_id, `POOL_SUGGESTION_${decision}`, 'pool_suggestion', s.id, { questionBankId: bankId });
    return json({ ok: true, status: decision });
  }
  return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
}
