import chunkedEvaluationApp from './chunked-evaluation-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { badRequest, forbidden, json, notFound, one } from './lib/db';
import { canEvaluateExam } from './lib/permissions';

/**
 * Production correctness gate for semantics not yet part of the core TYT score envelope.
 *
 * The native evaluator consumes booklet-specific printed order, alternative accepted
 * answers and CANCELLED/EXCLUDED question states directly. The five-question optional
 * TYT Philosophy branch remains outside the 120-question scored envelope, so an exam
 * carrying that optional key is held until its separate evidence-only path is wired.
 */
async function assertEvaluationSafe(request: Request, env: Env, batchId: string): Promise<Response | null> {
  const user = await getAuthUser(env, request);
  if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
  if (!canEvaluateExam(user.role)) return forbidden();

  const batch = await one<any>(env.DB.prepare('SELECT id,exam_id,institution_id FROM scan_batches WHERE id=?').bind(batchId));
  if (!batch) return notFound('Değerlendirme paketi bulunamadı.');
  if (user.role !== 'SUPER_ADMIN' && user.institution_id !== batch.institution_id) return forbidden();

  const optional = await one<{ c: number }>(env.DB.prepare('SELECT count(*) c FROM exam_optional_answer_keys WHERE exam_id=?').bind(batch.exam_id));
  if (Number(optional?.c || 0) > 0) {
    return badRequest(
      'Bu TYT sınavında 120 soruluk ana puan zarfına ek seçmeli Felsefe cevap anahtarı bulunuyor. Seçmeli dal ana puanı değiştirmeden ayrı kanıt akışına bağlanana kadar değerlendirme doğruluk korumasıyla durduruldu.',
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
    const blocked = await assertEvaluationSafe(request, env, match[1]);
    if (blocked) return blocked;
    return chunkedEvaluationApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
