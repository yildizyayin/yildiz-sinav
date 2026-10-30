import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';

/** Nibiru canlı kontrol (30 Oct): Super Admin only, rate limited, records which services answered. No real provider is called. */
describe('Nibiru live health check', () => {
  it('reports models, speech-to-text and the device-voice fallback without calling a paid voice', async () => {
    const t = await evaluatedExam('direct');
    const calls: string[] = [];
    let fetched = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (...a: any[]) => { fetched++; return realFetch(...(a as [any])); }) as any;
    try {
      Object.assign(t.env, { ENVIRONMENT: 'production', AI: { run: async (model: string, input: any) => {
        calls.push(model);
        if (input?.audio) return { text: '' }; // silence: the speech model answers with no text
        if (model.includes('nemotron')) throw new Error('MODEL_DOWN 503');
        return { response: 'OK' };
      } } });
      expect((await t.request('/api/nibiru/health-check', 'POST', undefined, 'teacher')).response.status).toBe(403);
      const r = await t.request('/api/nibiru/health-check', 'POST');
      expect(r.response.status, r.text).toBe(200);
      const items = Object.fromEntries(r.data.check.items.map((i: any) => [i.key, i]));
      expect(items.MODEL_FAST.state).toBe('OK');
      expect(items.MODEL_META.state).toBe('OK');
      expect(items.MODEL_NVIDIA.state).toBe('FAIL');
      expect(items.MODEL_NVIDIA.detail).toMatch(/MODEL_DOWN/);
      expect(items.STT.state).toBe('OK');
      expect(items.TTS.state).toBe('OFF');
      expect(items.TTS.detail).toMatch(/cihazın kendi Türkçe sesini/);
      expect(r.data.check.ok).toBe(false);
      expect(fetched).toBe(0); // no paid voice provider was reached
      expect(calls.some((m) => m.includes('whisper'))).toBe(true);
      // rate limited, and the result is kept for the screen
      expect((await t.request('/api/nibiru/health-check', 'POST')).response.status).toBe(429);
      const list = await t.request('/api/nibiru/health-check');
      expect(list.data.checks).toHaveLength(1);
      expect(list.data.checks[0].items.length).toBe(5);
      expect(JSON.stringify(list.data.checks[0])).not.toMatch(/ALI|YILMAZ/);
    } finally { globalThis.fetch = realFetch; }
  });
});
