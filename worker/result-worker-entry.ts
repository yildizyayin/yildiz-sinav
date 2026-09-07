import app from './privacy-export-entry';
import type { Env } from './types';
import { json } from './lib/db';
import { purgeExpiredResultNetwork } from './result-network-entry';

/**
 * Dedicated production boundary for sonuc.anunex.com.
 *
 * The result product shares the canonical exam catalogue and identity store with
 * ANUNEX, but it must not expose the licensed application's complete API surface.
 */
export function resultApiPathAllowed(pathname: string): boolean {
  if (pathname === '/api/health') return true;
  if (pathname === '/api/auth/login' || pathname === '/api/auth/me' || pathname === '/api/auth/logout') return true;
  if (pathname === '/api/exam-definitions') return true;
  if (pathname === '/api/admin/institution-directory/import') return true;
  if (pathname.startsWith('/api/public/results/')) return true;
  if (pathname.startsWith('/api/admin/result-network/')) return true;
  return false;
}

function unavailable(): Response {
  return json({
    ok: false,
    error: {
      code: 'RESULT_NETWORK_ROUTE_NOT_AVAILABLE',
      message: 'Bu işlem ANUNEX Sonuç Ağı üzerinde kullanılamaz.',
    },
  }, 404, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') && !resultApiPathAllowed(url.pathname)) return unavailable();
    return app.fetch(request, env, ctx);
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purgeExpiredResultNetwork(env));
  },
} satisfies ExportedHandler<Env>;
