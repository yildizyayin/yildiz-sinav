import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateTotpCode, verifyTotpCode } from '../worker/lib/mfa';

const entrySource = readFileSync(new URL('../worker/privacy-minimization-entry.ts', import.meta.url), 'utf8');
const productionConfig = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/0029_super_admin_mfa_guard.sql', import.meta.url), 'utf8');

describe('Super Admin MFA production gate', () => {
  it('implements RFC 6238 compatible SHA-1 TOTP generation and verification', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(await generateTotpCode(secret, 59_000, 8)).toBe('94287082');
    expect(await generateTotpCode(secret, 59_000, 6)).toBe('287082');
    expect(await verifyTotpCode(secret, '287082', 59_000, 0)).toBe(true);
    expect(await verifyTotpCode(secret, '000000', 59_000, 0)).toBe(false);
  });

  it('fails Super Admin login closed in production when MFA is missing or invalid', () => {
    expect(entrySource).toContain("env.ENVIRONMENT !== 'production'");
    expect(entrySource).toContain("user.role !== 'SUPER_ADMIN'");
    expect(entrySource).toContain('SUPER_ADMIN_MFA_TOTP_SECRET');
    expect(entrySource).toContain('SUPER_ADMIN_MFA_NOT_CONFIGURED');
    expect(entrySource).toContain('MFA_REQUIRED');
    expect(entrySource).toContain('MFA_INVALID');
    expect(entrySource).toContain('revokeIssuedLoginSession(env, response)');
  });

  it('rate-limits repeated MFA failures without persisting TOTP secrets or codes', () => {
    expect(entrySource).toContain('MFA_FAILURE_LIMIT = 8');
    expect(entrySource).toContain('MFA_TEMP_LOCKED');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS super_admin_mfa_attempts');
    expect(migration).not.toMatch(/totp|secret|code\s+TEXT/i);
  });

  it('keeps the MFA seed out of plaintext production vars', () => {
    expect(productionConfig).not.toContain('SUPER_ADMIN_MFA_TOTP_SECRET');
  });
});
