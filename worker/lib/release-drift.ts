/**
 * S006: show the Super Admin whether sonuc.anunex.com runs the same release as the app.
 * The result Worker shares the app's code but is deployed separately (deploy-result-network.yml, with approval),
 * so app fixes reach the result portal only after that deploy. This endpoint only reads and compares; it never
 * starts a deployment.
 */
import type { AuthUser, Env } from '../types';
import { json } from './db';

const fail = (status: number, code: string, message: string) => json({ ok: false, error: { code, message } }, status);
export const releaseOf = (env: Env) => (typeof env.RELEASE_SHA === 'string' && /^[0-9a-f]{7,40}$/i.test(env.RELEASE_SHA) ? env.RELEASE_SHA.slice(0, 12).toLowerCase() : null);

export function compareReleases(app: string | null, result: string | null) {
  if (!app || !result) return { status: 'UNKNOWN' as const, message: 'Sürüm bilgisi eksik; bir sonraki dağıtımdan sonra karşılaştırılabilir.' };
  if (app === result) return { status: 'SAME' as const, message: 'Sonuç portalı app ile aynı sürümde.' };
  return { status: 'DIFFERENT' as const, message: 'Sonuç portalı app ile farklı sürümde. app düzeltmeleri sonuç portalına ancak "Deploy ANUNEX Result Network" onaylı dağıtımıyla geçer; otomatik yayın yapılmaz.' };
}

async function resultRelease(env: Env): Promise<{ release: string | null; reachable: boolean }> {
  const origin = env.RESULT_PORTAL_ORIGIN || 'https://sonuc.anunex.com';
  try {
    const r = await fetch(`${origin}/api/health`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) });
    const body: any = await r.json().catch(() => null);
    const release = typeof body?.release === 'string' && /^[0-9a-f]{7,12}$/.test(body.release) ? body.release : null;
    return { release, reachable: true };
  } catch { return { release: null, reachable: false }; }
}

export async function handleReleaseDrift(request: Request, env: Env): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/admin/release-drift') return null;
  const { getAuthUser } = await import('./auth');
  const user: AuthUser | null = await getAuthUser(env, request);
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.');
  if (user.role !== 'SUPER_ADMIN') return fail(403, 'FORBIDDEN', 'Sürüm farkını yalnız Süper Admin görür.');
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.');
  const app = releaseOf(env); const result = await resultRelease(env);
  return json({ ok: true, app, result: result.release, resultReachable: result.reachable, ...compareReleases(app, result.release) }, 200, { 'Cache-Control': 'no-store' });
}
