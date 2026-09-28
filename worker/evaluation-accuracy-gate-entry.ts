import chunkedEvaluationApp from './chunked-evaluation-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { badRequest, forbidden, json, notFound, one } from './lib/db';
import { canEvaluateExam } from './lib/permissions';

/**
 * Production correctness gate for the legacy chunked evaluator.
 *
 * The exam-definition model already supports booklet-specific printed order,
 * alternative accepted answers and CANCELLED/EXCLUDED questions. Until the
 * chunked evaluator consumes those semantics directly, it must never silently
 * score such an exam with canonical question order / primary-answer-only logic.
 */
async function assertLegacyEvaluatorSafe(request: Request, env: Env, batchId: string): Promise<Response | null> {
  const user = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (!canEvaluateExam(user.role)) return forbidden();

  const batch = await one<any>(env.DB.prepare('SELECT id,exam_id,institution_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound('Değerlendirme paketi bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && user.institution_id !== batch.institution_id) return forbidden();

  const unsafe = await one<{ c: number }>(env.DB.prepare(`
    SELECT count(*) c FROM (
      SELECT q.id
      FROM exam_questions q
      JOIN answer_keys ak ON ak.exam_question_id=q.id
      LEFT JOIN exam_question_booklet_orders bqo
        ON bqo.exam_question_id=q.id AND bqo.booklet_code=ak.booklet_code
      WHERE q.exam_id=?
        AND (
          coalesce(bqo.printed_question_no,q.question_no)<>q.question_no
          OR coalesce(ak.question_status,q.question_status,'ACTIVE')<>'ACTIVE'
          OR (
            trim(coalesce(ak.accepted_answers,''))<>''
            AND trim(coalesce(ak.accepted_answers,''))<>ak.correct_answer
            AND trim(coalesce(ak.accepted_answers,''))<>json_array(ak.correct_answer)
          )
        )
      UNION ALL
      SELECT oak.id
      FROM exam_optional_answer_keys oak
      WHERE oak.exam_id=?
    ) risk
  `).bind(batch.exam_id, batch.exam_id));

  if (Number(unsafe?.c || 0) > 0) {
    return badRequest(
      'Bu sınav farklı kitapçık soru sırası, alternatif cevap, iptal/değerlendirme dışı soru veya TYT seçmeli dalı içeriyor. Doğruluk koruması nedeniyle eski değerlendirme motoru çalıştırılmadı.',
      'EVALUATION_ACCURACY_GATE',
    );
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/evaluate$/);
    if (!match || request.method !== 'POST') return chunkedEvaluationApp.fetch(request, env);
    const blocked = await assertLegacyEvaluatorSafe(request, env, match[1]);
    if (blocked) return blocked;
    return chunkedEvaluationApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
