import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { resultApiPathAllowed } from '../worker/result-worker-entry';

const config=readFileSync(new URL('../wrangler.result.production.jsonc',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/deploy-result-network.yml',import.meta.url),'utf8');
const licensedWorkflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const bootstrapWorkflow=readFileSync(new URL('../.github/workflows/bootstrap-production-admin.yml',import.meta.url),'utf8');

describe('dedicated Result Network production boundary',()=>{
  it('allows only result, authentication and narrowly required administration APIs',()=>{
    expect(resultApiPathAllowed('/api/public/results/config')).toBe(true);
    expect(resultApiPathAllowed('/api/auth/login')).toBe(true);
    expect(resultApiPathAllowed('/api/admin/result-network/governance')).toBe(true);
    expect(resultApiPathAllowed('/api/admin/institution-directory/import')).toBe(true);
    expect(resultApiPathAllowed('/api/dashboard')).toBe(false);
    expect(resultApiPathAllowed('/api/nibiru/chat')).toBe(false);
    expect(resultApiPathAllowed('/api/whatsapp/webhook')).toBe(false);
  });

  it('uses a distinct Worker while resolving the canonical production stores',()=>{
    expect(config).toContain('"name": "anunex-result-prod"');
    expect(config).toContain('"main": "./worker/result-worker-entry.ts"');
    expect(config).toContain('__RESOLVED_FROM_PRODUCTION__');
    expect(workflow).toContain('Resolve canonical production D1 and R2 bindings');
    expect(workflow).toContain('attach_domain');
    expect(workflow).toContain('live-result-network-smoke.mjs');
    expect(workflow).not.toContain('live-whatsapp-smoke');
    expect(workflow).not.toContain('live-nibiru');
    expect(licensedWorkflow).toContain('attach_domain app.anunex.com yildiz-sinav-prod');
    expect(licensedWorkflow).not.toContain('attach_domain sonuc.anunex.com yildiz-sinav-prod');
  });

  it('uses explicit audited trigger markers for the first production cutover and admin repair',()=>{
    expect(workflow).toContain("- '.github/deploy-result-network.trigger'");
    expect(workflow).toContain("github.event_name == 'push' || inputs.attach_domain == true");
    expect(bootstrapWorkflow).toContain("- '.github/bootstrap-production-admin.trigger'");
  });
});
