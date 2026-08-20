import cameraApp from './camera-entry';
import chunkedEvaluationApp from './chunked-evaluation-entry';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && /^\/api\/scan-batches\/[^/]+\/evaluate$/.test(url.pathname)) {
      return chunkedEvaluationApp.fetch(request, env);
    }
    return cameraApp.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
