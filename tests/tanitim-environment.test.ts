import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** Tanıtım ortamı (owner, 11 Nov 2026): separate, free of AI and schedules, and it only reads public programs from production. */
it('the showcase Worker has its own database, no AI binding, no cron and is not production', () => {
  const cfg = JSON.parse(readFileSync('wrangler.tanitim.jsonc', 'utf8'));
  expect(cfg.name).toBe('anunex-tanitim');
  expect(cfg.ai).toBeUndefined();
  expect(cfg.triggers).toBeUndefined();
  expect(cfg.vars.ENVIRONMENT).toBe('tanitim');
  expect(cfg.d1_databases[0]).toMatchObject({ binding: 'DB', database_name: 'anunex-tanitim-db' });
  expect(cfg.d1_databases[0].database_id).toBeUndefined();
});

it('the workflow is started by hand and touches production only with read-only SELECTs', () => {
  const wf = readFileSync('.github/workflows/tanitim-environment.yml', 'utf8');
  expect(wf).toMatch(/on:\s*\n\s*workflow_dispatch:/);
  expect(wf).not.toMatch(/\n\s*(push|schedule|pull_request):/);
  const prodCommands = wf.split('\n').filter((l) => /read_prod "/.test(l));
  expect(prodCommands.length).toBe(3);
  for (const l of prodCommands) expect(l).toMatch(/read_prod "SELECT /);
  expect(wf).not.toMatch(/--config tmp\/prod-read\.json --command "\$1"[^\n]*\n[^\n]*(INSERT|UPDATE|DELETE)/);
  expect(wf).not.toMatch(/yildiz-sinav-prod\/(versions|deployments)|wrangler deploy --config wrangler\.production/);
});

it('turns the copied programs into insert-or-ignore statements', () => {
  mkdirSync('tmp/tanitim-test', { recursive: true });
  writeFileSync('tmp/tanitim-test/s.json', JSON.stringify([{ results: [{ id: 'sub_mat', code: 'MAT', name: 'Matematik' }] }]));
  writeFileSync('tmp/tanitim-test/v.json', JSON.stringify([{ results: [{ id: 'cv8', academic_year: '2027-2028', grade_level: 8, verified: 1 }] }]));
  writeFileSync('tmp/tanitim-test/o.json', JSON.stringify([{ results: [{ id: 'o1', curriculum_version_id: 'cv8', code: "MAT.8.1.1", title: "Üslü ifadeler'e giriş" }] }]));
  const sql = execFileSync('node', ['scripts/copy-verified-curricula.mjs', 'tmp/tanitim-test/s.json', 'tmp/tanitim-test/v.json', 'tmp/tanitim-test/o.json'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  expect(sql).toContain("INSERT OR IGNORE INTO outcomes (id,curriculum_version_id,code,title) VALUES ('o1','cv8','MAT.8.1.1','Üslü ifadeler''e giriş');");
  expect(sql).toContain('INSERT OR IGNORE INTO curriculum_versions (id,academic_year,grade_level,verified) VALUES (\'cv8\',\'2027-2028\',8,1);');
});
