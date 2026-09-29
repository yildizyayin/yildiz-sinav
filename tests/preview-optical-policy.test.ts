import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../worker/preview-policy-entry.ts', import.meta.url), 'utf8');
const stagingConfig = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const productionConfig = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');

describe('preview optical policy gate', () => {
  it('runs before preview-file in staging and production', () => {
    expect(stagingConfig).toContain('"main": "./worker/preview-policy-staging-entry.ts"');
    expect(productionConfig).toContain('"main": "./worker/preview-policy-production-entry.ts"');
    expect(source).toContain("/preview-file$/");
  });

  it('requires bound opticals to be READY, parser-tested and tenant-safe', () => {
    expect(source).toContain("candidate.template_status !== 'READY'");
    expect(source).toContain('candidate.parser_test_passed');
    expect(source).toContain("candidate.owner_type === 'CENTRAL'");
    expect(source).toContain("candidate.owner_type === 'INSTITUTION' && candidate.owner_id === institutionId");
    expect(source).toContain('OPTICAL_BINDING_NOT_READY');
  });

  it('limits fallback catalog to central or current institution READY parsers', () => {
    expect(source).toContain("t.status='READY'");
    expect(source).toContain('coalesce(d.parser_test_passed,0)=1');
    expect(source).toContain("t.owner_type='CENTRAL'");
    expect(source).toContain("t.owner_type='INSTITUTION' AND t.owner_id=?");
    expect(source).toContain('OPTICAL_TEMPLATE_NOT_ALLOWED');
  });

  it('never silently auto-detects across multiple fallback templates', () => {
    expect(source).toContain('fallback.length > 1');
    expect(source).toContain('OPTICAL_TEMPLATE_REQUIRED');
    expect(source).toContain('rebuildRequestWithTemplate');
  });

  it('keeps an explicit exam binding authoritative', () => {
    expect(source).toContain('if (bound.length)');
    expect(source).toContain('OPTICAL_TEMPLATE_NOT_BOUND');
    expect(source).toMatch(/if \(bound\.length\)[\s\S]*const fallback = await loadFallbackCandidates/);
  });
});
