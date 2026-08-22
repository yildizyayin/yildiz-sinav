import app from './academic-growth-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json } from './lib/db';
import { handlePlatformApi } from './lib/platform-expansion';
import { handleAdvancedPlatformApi } from './lib/platform-advanced';
import { materializeNetworkAndPublisherAnalytics, networkRanksForParticipant, publisherQuestionAnalytics } from './lib/platform-ranking';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/platform/')) {
      const user = await getAuthUser(env, request);
      if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);

      const advanced = await handleAdvancedPlatformApi(request, env, user);
      if (advanced) return advanced;

      const response = await handlePlatformApi(request, env, user);
      if (!response) return json({ ok: false, error: { code: 'NOT_FOUND', message: 'Platform API yolu bulunamadı.' } }, 404);

      const freezeMatch = url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/freeze$/);
      if (freezeMatch && request.method === 'POST' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        if (payload?.ok && Number(payload.version) > 0) {
          await materializeNetworkAndPublisherAnalytics(env, freezeMatch[1], Number(payload.version));
          return json({ ...payload, comparisonScopesReady: true, publisherQuestionAnalyticsReady: true });
        }
      }

      const resultMatch = url.pathname.match(/^\/api\/platform\/exam-center\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'GET' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        const r = payload?.result;
        if (r?.participant_id && r?.snapshot_version) {
          const networkRanks = await networkRanksForParticipant(env, resultMatch[1], r.participant_id, Number(r.snapshot_version));
          return json({ ...payload, result: { ...r, networkRanks } });
        }
      }

      const publisherMatch = url.pathname.match(/^\/api\/platform\/publishers\/([^/]+)\/analytics$/);
      if (publisherMatch && request.method === 'GET' && response.ok) {
        const payload: any = await response.clone().json().catch(() => null);
        const requestedExamId = url.searchParams.get('examId') || payload?.exams?.find((x:any)=>Number(x.snapshot_version||0)>0)?.id || null;
        const analytics = await publisherQuestionAnalytics(env, publisherMatch[1], requestedExamId);
        return json({ ...payload, ...analytics });
      }
      return response;
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if ('scheduled' in app && typeof app.scheduled === 'function') return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
