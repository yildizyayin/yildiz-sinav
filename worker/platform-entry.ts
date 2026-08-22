import app from './academic-growth-entry';
import type { Env } from './types';
import { getAuthUser } from './lib/auth';
import { json } from './lib/db';
import { handlePlatformApi } from './lib/platform-expansion';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/platform/')) {
      const user = await getAuthUser(env, request);
      if (!user) return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
      const response = await handlePlatformApi(request, env, user);
      return response || json({ ok: false, error: { code: 'NOT_FOUND', message: 'Platform API yolu bulunamadı.' } }, 404);
    }
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if ('scheduled' in app && typeof app.scheduled === 'function') return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env>;
