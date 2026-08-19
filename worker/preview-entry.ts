import app from './index';
import type { Env } from './types';
import { ensurePreviewDatabase, previewState } from './preview-bootstrap';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await ensurePreviewDatabase(env);
    const url = new URL(request.url);
    if (url.pathname === '/api/preview-state' && request.method === 'GET') {
      return Response.json(await previewState(env));
    }
    return app.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
