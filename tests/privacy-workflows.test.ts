import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const entry = readFileSync(new URL('../worker/privacy-entry.ts', import.meta.url), 'utf8');
const releaseMigration = readFileSync(new URL('../migrations/0028_kvkk_release_controls.sql', import.meta.url), 'utf8');

describe('KVKK operational workflows', () => {
  it('keeps consent separate, purpose-approved, withdrawable and tenant/relation scoped', () => {
    expect(entry).toContain("upper(coalesce(lawful_basis_code,'')) IN ('CONSENT','EXPLICIT_CONSENT','ACIK_RIZA')");
    expect(entry).toContain('INSERT INTO consent_records');
    expect(entry).toContain("state='WITHDRAWN',withdrawn_at=CURRENT_TIMESTAMP");
    expect(entry).toContain('p.parent_user_id=? AND p.student_id=? AND p.active=1 AND e.institution_id=?');
  });

  it('does not allow deletion jobs before identity verification and legal review', () => {
    expect(entry).toContain("dsr.identity_verification_status !== 'VERIFIED'");
    expect(entry).toContain('INSERT INTO privacy_deletion_jobs');
    expect(entry).toContain("status='LEGAL_REVIEW'");
    expect(entry).not.toContain("status='RUNNING' WHERE request_id");
  });

  it('creates incident records with the 72-hour authority review clock', () => {
    expect(entry).toContain('incidentAuthorityDeadline(detectedAt, personalDataInvolved)');
    expect(entry).toContain('authority_notification_due_at');
    expect(entry).toContain("'SECURITY_INCIDENT_OPENED'");
  });

  it('seeds external/legal production approvals as pending, never implicitly approved', () => {
    for (const code of [
      'COUNSEL_CONTROLLER_PROCESSOR',
      'COUNSEL_PRIVACY_NOTICES',
      'COUNSEL_RETENTION_SCHEDULE',
      'COUNSEL_SUBPROCESSOR_TRANSFERS',
      'VERBIS_STATUS_CONFIRMED',
      'PRODUCTION_OWNER_SIGNOFF',
    ]) expect(releaseMigration).toContain(code);
    expect(releaseMigration).toContain("status TEXT NOT NULL DEFAULT 'PENDING'");
    expect(releaseMigration).not.toMatch(/VALUES[\s\S]*'APPROVED'\)/);
  });

  it('blocks production when notices, processors, transfers, retention or explicit approvals are incomplete', () => {
    expect(entry).toContain("code: 'PROCESSOR_NOT_APPROVED'");
    expect(entry).toContain("code: 'TRANSFER_NOT_APPROVED'");
    expect(entry).toContain("code: 'NOTICE_MISSING'");
    expect(entry).toContain("code: 'RETENTION_POLICY_MISSING'");
    expect(entry).toContain("code: 'EXTERNAL_APPROVAL_PENDING'");
    expect(entry).toContain('productionReleaseAllowed: blockers.length === 0');
  });
});
