import app from './privacy-smoke-entry';
import type { CapacityJobMessage, Env } from './types';
import { normalizeSekonicPreviewRequest } from './lib/sekonic-upload';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(await normalizeSekonicPreviewRequest(request), env, ctx);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
} satisfies ExportedHandler<Env, CapacityJobMessage>;
