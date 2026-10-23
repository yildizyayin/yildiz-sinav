import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** S015: the provider probe, which creates real synthetic Cloudflare resources, runs only for provider-facing changes. */
describe('S015 provider probe scope', () => {
  const wf = readFileSync('.github/workflows/result-provider-probe.yml', 'utf8');
  it('limits pull-request runs to provider-facing paths and keeps manual runs', () => {
    const pr = wf.slice(wf.indexOf('pull_request:'), wf.indexOf('workflow_dispatch:'));
    expect(pr).toMatch(/paths:/);
    for (const p of ["'worker/result-provider-probe.ts'", "'worker/lib/result-artifact*.ts'", "'worker/lib/result-retention-queue.ts'", "'.github/workflows/result-provider-probe.yml'"]) expect(pr).toContain(p);
    expect(pr).not.toMatch(/'worker\/\*\*'|'\*\*'/);
    expect(wf).toMatch(/workflow_dispatch:/);
  });
  it('still removes its synthetic Worker and Queues after every run', () => {
    expect(wf).toMatch(/Remove isolated synthetic Worker and Queues\n\s+if: always\(\)/);
  });
});
