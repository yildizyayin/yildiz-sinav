import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import { healthSchemaReady,safeObservabilityRoute } from '../worker/privacy-export-entry';

const deployWorkflow=readFileSync(new URL('../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
const recoveryWorkflow=readFileSync(new URL('../.github/workflows/production-recovery-check.yml',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../scripts/live-production-smoke.mjs',import.meta.url),'utf8');
const productionConfig=readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8');
const marketingConfig=readFileSync(new URL('../wrangler.marketing.jsonc',import.meta.url),'utf8');
const stagingDeploy=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');

describe('production operations closure',()=>{
 it('requires the complete critical schema and redacts long identifiers',()=>{
  expect(healthSchemaReady(6)).toBe(true);
  expect(healthSchemaReady(5)).toBe(false);
  expect(safeObservabilityRoute('/api/students/student_123456789/results')).toBe('/api/students/:id/results');
  expect(safeObservabilityRoute('/api/health')).toBe('/api/health');
 });
 it('runs a read-only smoke after migrations and secret synchronization',()=>{
  expect(deployWorkflow.indexOf('Apply production D1 migrations')).toBeLessThan(deployWorkflow.indexOf('Read-only production smoke acceptance'));
  expect(deployWorkflow.indexOf('Set production secrets')).toBeLessThan(deployWorkflow.indexOf('Read-only production smoke acceptance'));
  expect(deployWorkflow).toContain('.result.resources.bindings[]');
  expect(deployWorkflow).toContain('wrangler.production.resolved.json');
  expect(deployWorkflow).toContain('d1 migrations apply DB');
  expect(smoke).toContain("request('/api/health')");
  expect(smoke).toContain("request('/api/dashboard',{expected:401})");
  expect(smoke).not.toMatch(/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/);
 });
 it('separates public website, licensed app and demo domains',()=>{
  expect(marketingConfig).toContain('"name": "anunex-web"');
  expect(productionConfig).toContain('"name": "yildiz-sinav-prod"');
  expect(deployWorkflow).toContain('attach_domain app.anunex.com yildiz-sinav-prod');
  expect(deployWorkflow).toContain('attach_domain anunex.com anunex-web');
  expect(deployWorkflow).toContain('attach_domain www.anunex.com anunex-web');
  expect(stagingDeploy).toContain('SMOKE_BASE_URL: https://demo.anunex.com');
  expect(productionConfig).not.toContain('"custom_domain": true');
  expect(marketingConfig).not.toContain('"custom_domain": true');
  expect(smoke).toContain("'https://app.anunex.com'");
 });
 it('rehearses recovery transiently and never publishes the production export',()=>{
  expect(recoveryWorkflow).toContain('d1 time-travel info DB');
  expect(recoveryWorkflow).toContain('d1 export DB --remote');
  expect(recoveryWorkflow).toContain('PRAGMA integrity_check;');
  expect(recoveryWorkflow).toContain('rm -rf tmp/recovery-check');
  expect(recoveryWorkflow).not.toContain('upload-artifact');
  expect(recoveryWorkflow).not.toContain('time-travel restore');
 });
});
