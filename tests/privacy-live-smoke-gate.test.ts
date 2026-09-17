import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const smoke = readFileSync(new URL('../scripts/live-kvkk-security-smoke.mjs', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../scripts/generate-privacy-security-fixture.mjs', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../worker/privacy-smoke-entry.ts', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const staging = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const production = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');

describe('mandatory live KVKK/privacy security gate', () => {
  it('keeps synthetic diagnostics staging-only and outside the production entrypoint', () => {
    expect(staging).toContain('"main": "./worker/privacy-smoke-entry.ts"');
    expect(production).toContain('"main": "./worker/privacy-export-entry.ts"');
    expect(production).not.toContain('privacy-smoke-entry');
    expect(wrapper).toContain("env.ENVIRONMENT !== 'staging'");
    expect(wrapper).toContain("user.role !== 'SUPER_ADMIN'");
    expect(wrapper).toContain("import app from './privacy-export-entry'");
  });

  it('uses only synthetic minimization markers and returns evidence rather than raw values', () => {
    expect(wrapper).toContain('syntheticOnly: true');
    expect(wrapper).toContain('minimizeNibiruAiMessages');
    expect(wrapper).toContain('minimizeWhatsAppOutboundText');
    expect(wrapper).toContain('containsRawCameraMedia');
    expect(wrapper).not.toContain('messages: minimized.messages');
    expect(wrapper).not.toContain('text: whatsapp.text');
  });

  it('builds a separate synthetic tenant and deliberately keeps legal transfer status pending', () => {
    expect(fixture).toContain('inst_privacy_b');
    expect(fixture).toContain('stu_privacy_b');
    expect(fixture).toContain('SMOKE_CONSENT');
    expect(fixture).toContain("transfer_mechanism='TBD'");
    expect(fixture).toContain("status='LEGAL_REVIEW'");
    expect(fixture).toContain('LEGAL_REVIEW_PENDING');
    expect(fixture).not.toContain("transfer_mechanism='STANDARD_CONTRACT'");
  });

  it('covers the release-blocking live privacy boundaries without emitting secrets', () => {
    for (const marker of [
      'Cross-tenant read/write denial',
      'Student self scope',
      'Parent linked-child scope',
      'Teacher assignment scope',
      'Guidance-only raw assessment boundary',
      'Logout session revocation',
      'AI outbound redaction / pseudonymization',
      'WhatsApp academic-detail minimization',
      'Protected export authorization + audit evidence',
      'Notice version + acknowledgement evidence',
      'Purpose-specific consent grant + withdrawal',
      'Synthetic anonymization job enters legal-review gate',
      'Provider/transfer registry completeness with release still blocked',
      'Incident-response 72-hour timer',
      'Camera raw-frame server rejection',
      'Voice raw-audio ephemeral / voiceprint disabled',
      'Smoke output contains no raw PII/secrets',
    ]) expect(smoke).toContain(marker);
    expect(smoke).toContain('safeReportText');
    expect(smoke).not.toContain('console.log(cookie');
    expect(smoke).not.toContain('console.log(payload');
  });

  it('loads the privacy fixture and enforces the live suite in staging deploys', () => {
    expect(packageJson).toContain('"test:privacy:live": "node scripts/live-kvkk-security-smoke.mjs"');
    expect(workflow).toContain('npm run seed:privacy:generate');
    expect(workflow).toContain('tmp/privacy-security-fixture.idempotent.sql');
    expect(workflow).toContain('Mandatory live KVKK/privacy security gate');
    expect(workflow).toContain('npm run test:privacy:live');
  });
});
