import { describe, expect, it } from 'vitest';
import { sanitizeAuditDetails } from '../worker/lib/db';

describe('audit log privacy redaction', () => {
  it('redacts direct PII and secrets by key while preserving operational metadata', () => {
    const result = sanitizeAuditDetails({
      action: 'EXPORT_CREATED',
      studentId: 'stu_opaque_123',
      email: 'student@example.com',
      phone: '05551234567',
      accessToken: 'secret-token-value',
      nested: { first_name: 'Ayşe', score: 91.5 },
    }) as Record<string, any>;

    expect(result.action).toBe('EXPORT_CREATED');
    expect(result.studentId).toBe('stu_opaque_123');
    expect(result.email).toBe('[REDACTED]');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.nested.first_name).toBe('[REDACTED]');
    expect(result.nested.score).toBe(91.5);
  });

  it('redacts PII and bearer credentials embedded in free text', () => {
    const result = sanitizeAuditDetails({
      message: 'mail student@example.com tckn 12345678901 Authorization Bearer abc.def.ghi',
    }) as Record<string, string>;

    expect(result.message).not.toContain('student@example.com');
    expect(result.message).not.toContain('12345678901');
    expect(result.message).not.toContain('abc.def.ghi');
    expect(result.message).toContain('[REDACTED_EMAIL]');
    expect(result.message).toContain('[REDACTED_NUMBER]');
  });
});
