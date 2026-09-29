import chunkedEvaluationApp from './chunked-evaluation-entry';
import type { Env } from './types';
import { json } from './lib/db';
import { persistTytOptionalPhilosophyEvidence } from './tyt-optional-philosophy-evaluation';

/**
 * Evaluation wrapper for the official TYT score envelope plus optional evidence.
 *
 * Core evaluation owns the scored 120-question TYT result. The optional five-question
 * Philosophy branch is deliberately persisted afterwards in its own evidence tables,
 * so it can be reported without changing official net/score/rank calculations.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/scan-batches\/([^/]+)\/evaluate$/);
    if (!match || request.method !== 'POST') return chunkedEvaluationApp.fetch(request, env);

    const response = await chunkedEvaluationApp.fetch(request, env);
    if (!response.ok) return response;

    try {
      const payload = await response.clone().json() as any;
      if (payload?.ok) await persistTytOptionalPhilosophyEvidence(env, match[1]);
      return response;
    } catch (error) {
      console.error('TYT optional philosophy evidence persistence failed', error);
      const details = env.ENVIRONMENT === 'staging' && error instanceof Error ? error.message : undefined;
      return json({
        ok: false,
        error: {
          code: 'TYT_OPTIONAL_EVIDENCE_FAILED',
          message: 'TYT seçmeli Felsefe kanıt sonucu kaydedilemedi. Ana 120 soruluk değerlendirme değiştirilmedi; işlem güvenli şekilde tekrar denenebilir.',
          details,
        },
      }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
