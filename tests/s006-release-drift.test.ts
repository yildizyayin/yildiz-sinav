import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { compareReleases, releaseOf } from '../worker/lib/release-drift';
import { readFileSync } from 'node:fs';

/** S006: the Super Admin sees whether sonuc.anunex.com runs the app's release; nothing is redeployed automatically. */
describe('S006 app / result release drift', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('compares releases and refuses to guess when one is missing', () => {
    expect(compareReleases('abc1234def56', 'abc1234def56').status).toBe('SAME');
    expect(compareReleases('abc1234def56', '0001234def56').status).toBe('DIFFERENT');
    expect(compareReleases(null, 'abc1234def56').status).toBe('UNKNOWN');
    expect(compareReleases('abc1234def56', null).status).toBe('UNKNOWN');
    expect(releaseOf({ RELEASE_SHA: 'ABC1234DEF5678901234567890123456789012AB' } as any)).toBe('abc1234def56');
    expect(releaseOf({ RELEASE_SHA: 'not-a-sha' } as any)).toBeNull();
  });

  it('reports the drift to the Super Admin only, reading the result health without deploying', async () => {
    const t = await evaluatedExam('direct');
    Object.assign(t.env, { RELEASE_SHA: 'aaaaaaaaaaaa1111', RESULT_PORTAL_ORIGIN: 'https://sonuc.example' });
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method || 'GET' }); return new Response(JSON.stringify({ ok: true, release: 'bbbbbbbbbbbb' })); }));
    const r = await t.request('/api/admin/release-drift');
    expect(r.response.status, r.text).toBe(200);
    expect(r.data).toMatchObject({ app: 'aaaaaaaaaaaa', result: 'bbbbbbbbbbbb', status: 'DIFFERENT', resultReachable: true });
    expect(calls).toEqual([{ url: 'https://sonuc.example/api/health', method: 'GET' }]);
    for (const who of ['teacher', 'stuuser', 'parent']) expect((await t.request('/api/admin/release-drift', 'GET', undefined, who)).response.status).toBe(403);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ release: '<img src=x onerror=alert(1)>' }))));
    expect((await t.request('/api/admin/release-drift')).data).toMatchObject({ status: 'UNKNOWN', result: null, resultReachable: true });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await t.request('/api/admin/release-drift')).data).toMatchObject({ status: 'UNKNOWN', resultReachable: false });
  });

  it('puts the release in the health answer of both Workers and is not reachable through the result Worker', async () => {
    const t = await evaluatedExam('direct');
    Object.assign(t.env, { RELEASE_SHA: 'cccccccccccc2222' });
    expect((await t.request('/api/health')).data.release).toBe('cccccccccccc');
    const result = (await import('../worker/result-worker-entry')).default as any;
    const h = await result.fetch(new Request('https://sonuc.anunex.com/api/health'), t.env, { waitUntil() {} });
    expect((await h.json()).release).toBe('cccccccccccc');
    const blocked = await result.fetch(new Request('https://sonuc.anunex.com/api/admin/release-drift'), t.env, { waitUntil() {} });
    expect(blocked.status).toBe(404);
  });

  it('stamps every production deploy with its commit; the result deploy follows a successful app deploy (S031) without re-attaching the domain', () => {
    for (const f of ['deploy-production.yml', 'deploy-app-production.yml']) expect(readFileSync(`.github/workflows/${f}`, 'utf8')).toMatch(/RELEASE_SHA:"?\$\{\{ github\.sha \}\}/);
    const result = readFileSync('.github/workflows/deploy-result-network.yml', 'utf8');
    expect(result).toMatch(/RELEASE_SHA:"\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}"/);
    expect(result).toMatch(/paths:\s*\n\s*- '\.github\/deploy-result-network\.trigger'/);
    expect(result).toMatch(/workflow_run:\s*\n\s*workflows: \["Deploy Production Cloudflare Worker"\]\s*\n\s*types: \[completed\]\s*\n\s*branches: \[main\]/);
    expect(result).toMatch(/github\.event\.workflow_run\.conclusion == 'success'/);
    expect(result).toMatch(/environment: production/);
    // the domain is attached only on the marker push or an explicit manual request, never on the automatic path
    for (const line of result.split('\n').filter((l) => l.includes('inputs.attach_domain == true') && l.includes('if:'))) expect(line).not.toContain('workflow_run');
  });
});
