import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lifecycle = readFileSync(new URL('../worker/privacy-lifecycle-entry.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0030_privacy_lifecycle_enforcement.sql', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../scripts/generate-privacy-security-fixture.mjs', import.meta.url), 'utf8');

describe('privacy lifecycle enforcement', () => {
  it('keeps real retention templates in legal review and never opens them implicitly', () => {
    for (const code of [
      'AUTH_SESSION_EXPIRED',
      'LOGIN_ATTEMPT_SECURITY',
      'NIBIRU_PAIRING_CODE',
      'WHATSAPP_RECEIPT',
      'SCAN_RAW_PAYLOAD',
    ]) expect(migration).toContain(code);
    expect(migration).toContain("'LEGAL_REVIEW'");
    expect(migration).not.toMatch(/AUTH_SESSION_EXPIRED[\s\S]{0,500}'APPROVED'/);
    expect(migration).toContain("'LOGIN_ATTEMPT_SECURITY','LOGIN_ATTEMPT'");
    expect(migration).toContain("'DELETE',0,'LEGAL_REVIEW'");
  });

  it('persists legal holds and non-PII disposal evidence', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS privacy_legal_holds');
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'ACTIVE'");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS privacy_disposal_evidence');
    expect(migration).toContain('affected_records INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('result_hash TEXT NOT NULL');
    expect(migration).not.toContain('raw_payload');
  });

  it('requires Super Admin, approved policy and no legal hold before execution', () => {
    expect(lifecycle).toContain("user.role !== 'SUPER_ADMIN'");
    expect(lifecycle).toContain("deletionJobCanExecute(job.status, job.legal_hold)");
    expect(lifecycle).toContain("'LEGAL_HOLD_ACTIVE'");
    expect(lifecycle).toContain("job.retention_policy_status !== 'APPROVED'");
    expect(lifecycle).toContain("'RETENTION_POLICY_NOT_APPROVED'");
  });

  it('keeps counsel approval as the default gate and confines bypass to a synthetic staging subject', () => {
    expect(lifecycle).toContain("approval_code='COUNSEL_RETENTION_SCHEDULE'");
    expect(lifecycle).toContain("env.ENVIRONMENT === 'staging'");
    expect(lifecycle).toContain("job.institution_code === 'PRIVB'");
    expect(lifecycle).toContain("job.reason_code === 'SMOKE_SYNTHETIC'");
    expect(lifecycle).toContain("SMOKE_SYNTHETIC_STUDENT_ERASURE");
    expect(fixture).toContain("'SMOKE_SYNTHETIC_STUDENT_ERASURE'");
    expect(fixture).toContain('Synthetic staging fixture approval only; this is not counsel or production legal approval.');
  });

  it('strengthens production release with an explicit approved retention-policy allowlist', () => {
    expect(lifecycle).toContain('REQUIRED_RETENTION_POLICY_CODES');
    expect(lifecycle).toContain("blockers.push({ code: 'RETENTION_POLICY_NOT_APPROVED', detail: code })");
    expect(lifecycle).toContain('productionReleaseAllowed: payload.productionReleaseAllowed === true && blockers.length === 0');
  });

  it('runs scheduled retention only after counsel sign-off and only for approved policies', () => {
    expect(lifecycle).toContain('if (!await retentionCounselApproved(env)) return;');
    expect(lifecycle).toContain("FROM retention_policies WHERE status='APPROVED'");
    expect(lifecycle).toContain("'PRIVACY_RETENTION_SWEEP_COMPLETED'");
    expect(lifecycle).toContain('ctx.waitUntil(runApprovedRetentionSweep(env))');
  });

  it('records controlled erasure evidence without placing raw identity values into audit details', () => {
    expect(lifecycle).toContain("const LIFECYCLE_SCOPE = 'IDENTITY_ERASURE_V1'");
    expect(lifecycle).toContain('INSERT OR IGNORE INTO privacy_disposal_evidence');
    expect(lifecycle).toContain("'PRIVACY_DELETION_JOB_COMPLETED'");
    expect(lifecycle).toContain('affectedRecords');
    expect(lifecycle).toContain('resultHash');
    expect(lifecycle).not.toContain('firstName:');
    expect(lifecycle).not.toContain('email:');
    expect(lifecycle).not.toContain('phone:');
  });
});
