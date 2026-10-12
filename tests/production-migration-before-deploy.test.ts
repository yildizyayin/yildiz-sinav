import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

describe('production deployment schema compatibility', () => {
  const source=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  it('resolves and migrates the existing production database before activating new code', () => {
    const resolve=source.indexOf('- name: Resolve production Worker version');
    const database=source.indexOf('- name: Resolve production D1 database');
    const materialize=source.indexOf('- name: Materialize resolved production D1 config');
    const migration=source.indexOf('- name: Apply production D1 migrations');
    const deploy=source.indexOf('- name: Deploy isolated production Worker and resources');
    expect(resolve).toBeGreaterThan(0);expect(database).toBeGreaterThan(resolve);expect(materialize).toBeGreaterThan(database);expect(migration).toBeGreaterThan(materialize);expect(deploy).toBeGreaterThan(migration);
  });
  it('deploys against the same resolved database and retains the production approval environment', () => {
    expect(source).toContain('wrangler deploy --config wrangler.production.resolved.json');
    expect(source).not.toContain('rm -f wrangler.production.resolved.json');
    expect(source).toContain('environment: production');
    expect(source).toContain('cancel-in-progress: false');
  });
});
