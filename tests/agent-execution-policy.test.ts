import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { agentDispatchRef } from '../worker/lib/agent-dispatch-policy';
import { validateLoadTarget } from '../scripts/agents/load-target.mjs';

describe('agent execution boundaries', () => {
  it('restricts the operator-configured branch to source auditors', () => {
    for (const name of ['ci-saglik', 'tenant-guvenlik', 'kvkk-denetim', 'd1-sema']) {
      expect(agentDispatchRef(`agent-${name}.yml`, 'feat/exam-evaluation-lock-integration')).toBe('feat/exam-evaluation-lock-integration');
      expect(agentDispatchRef(`agent-${name}.yml`)).toBe('main');
    }
    for (const name of ['yuk-testi', 'izleyici', 'kod-yazici', 'deploy-dogrulayici']) {
      expect(agentDispatchRef(`agent-${name}.yml`, 'feat/review')).toBe('main');
    }
    for (const ref of ['../main', 'feat//x', 'feat/x.lock', 'refs/heads/.bad', 'main;curl x', 'main\nother']) {
      expect(() => agentDispatchRef('agent-ci-saglik.yml', ref)).toThrow();
    }
  });
  it('rejects production variants even if an operator puts them in the origin allowlist', () => {
    for (const raw of ['https://app.anunex.com/', 'https://app.anunex.com/results', 'https://APP.ANUNEX.COM:443', 'https://sonuc.anunex.com./', 'https://anunex.com?x=1', 'https://www.anunex.com/#x']) {
      expect(() => validateLoadTarget(raw, raw)).toThrow();
    }
  });
  it('requires exact approved staging origins without credentials, paths or redirect parameters', () => {
    expect(validateLoadTarget('https://demo.anunex.com/')).toBe('https://demo.anunex.com');
    expect(validateLoadTarget('https://review.example.test', 'https://review.example.test')).toBe('https://review.example.test');
    expect(validateLoadTarget('http://localhost:8080', 'http://localhost:8080')).toBe('http://localhost:8080');
    for (const raw of ['https://unknown.example.test', 'https://demo.anunex.com.evil.test', 'https://app.anunex.com@demo.anunex.com', 'https://demo.anunex.com/?next=https://app.anunex.com', 'https://demo.anunex.com/redirect', 'http://localhost.evil.test']) {
      expect(() => validateLoadTarget(raw)).toThrow();
    }
    expect(readFileSync('.github/workflows/agent-yuk-testi.yml', 'utf8')).toContain('redirects: 0');
  });
  it('makes the actual CI shell fail before later successful commands mask an earlier error', () => {
    const yaml = readFileSync('.github/workflows/agent-ci-saglik.yml', 'utf8');
    const script = yaml.split('        run: |\n')[1].split('      - name:')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const dir = mkdtempSync(join(tmpdir(), 'agent-ci-proof-'));
    try {
      writeFileSync(join(dir, 'npm'), '#!/bin/bash\nif [[ "$*" == "run typecheck" ]]; then exit 12; fi\nif [[ "$*" == "run build" ]]; then touch build-ran; fi\nexit 0\n', { mode: 0o755 });
      const result = spawnSync('bash', ['-c', script], { cwd: dir, env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: 'utf8' });
      expect(result.status).toBe(12);
      expect(() => readFileSync(join(dir, 'build-ran'))).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
