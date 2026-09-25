import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, normalizeNotificationChannels } from '../worker/lib/account-notifications';

const migration = readFileSync(new URL('../migrations/0054_account_access_notifications.sql', import.meta.url), 'utf8');

describe('account access onboarding contract', () => {
  it('keeps both notification channels as the default', () => {
    expect(normalizeNotificationChannels(undefined)).toEqual(['EMAIL', 'SMS']);
    expect(normalizeNotificationChannels(['email', 'SMS', 'unknown', 'email'])).toEqual(['EMAIL', 'SMS']);
  });

  it('generates a temporary password that meets the minimum length', () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/[A-Za-z]/);
    expect(password).toMatch(/[0-9]/);
  });

  it('stores only encrypted credential payloads and delivery outcomes', () => {
    expect(migration).toContain('must_change_password INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS account_notification_batches');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS account_notification_deliveries');
    expect(migration).toContain('credential_ciphertext TEXT');
    expect(migration).not.toMatch(/password\s+TEXT/i);
    expect(migration).toContain("status IN ('PENDING','SENT','SKIPPED','FAILED')");
  });
});
