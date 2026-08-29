import app from './privacy-entry';
import type { CapacityJobMessage, Env } from './types';
import { json } from './lib/db';
import { containsRawCameraMedia, privacyMinimizationPolicy } from './lib/privacy-minimization';

function rawCameraRejected(): Response {
  return json({
    ok: false,
    error: {
      code: 'CAMERA_RAW_MEDIA_NOT_ACCEPTED',
      message: 'Ham fotoğraf/video sunucuya gönderilmez. Optik yalnız cihazda çıkarılan işaretleme kayıtlarıyla işlenmelidir.',
    },
  }, 400);
}

function isCameraPreview(path: string, method: string) {
  return method === 'POST' && /^\/api\/exams\/[^/]+\/camera-preview$/.test(path);
}

function withEphemeralVoiceHeaders(response: Response, path: string): Response {
  if (path !== '/api/nibiru/voice/transcribe') return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Anunex-Raw-Audio-Retention', 'ephemeral');
  headers.set('X-Anunex-Voiceprint', 'disabled');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (isCameraPreview(url.pathname, request.method)) {
      const body = await request.clone().json<unknown>().catch(() => null);
      if (containsRawCameraMedia(body)) return rawCameraRejected();
    }

    const response = await app.fetch(request, env, ctx);
    return withEphemeralVoiceHeaders(response, url.pathname);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;

export { privacyMinimizationPolicy };
