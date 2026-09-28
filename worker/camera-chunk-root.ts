import cameraApp from './camera-entry';
import evaluationAccuracyGateApp from './evaluation-accuracy-gate-entry';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && /^\/api\/scan-batches\/[^/]+\/evaluate$/.test(url.pathname)) {
      return evaluationAccuracyGateApp.fetch(request, env);
    }
    return cameraApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
