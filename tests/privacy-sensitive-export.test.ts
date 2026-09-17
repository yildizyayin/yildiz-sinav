import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../worker/privacy-export-entry.ts', import.meta.url), 'utf8');
const smokeSource = readFileSync(new URL('../worker/privacy-smoke-entry.ts', import.meta.url), 'utf8');
const staging = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const production = readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8');

describe('sensitive privacy export boundary', () => {
  it('requires an authenticated Super Admin before exporting the DSR register', () => {
    expect(source).toContain("if (!user) return unauthenticated()");
    expect(source).toContain("if (user.role !== 'SUPER_ADMIN') return forbidden");
    expect(source).toContain("'/api/admin/privacy/exports/requests.csv'");
  });

  it('exports only the minimized operational register fields', () => {
    expect(source).toContain('SELECT id,institution_id,request_type,identity_verification_status,status,received_at,target_deadline_at,completed_at');
    expect(source).not.toContain('scope_note');
    expect(source).not.toContain('resolution_note');
    expect(source).not.toContain('requester_user_id');
    expect(source).not.toContain('subject_student_id');
  });

  it('records an audit event without putting exported rows into audit details', () => {
    expect(source).toContain("'PRIVACY_SENSITIVE_EXPORT'");
    expect(source).toContain("exportType: 'DSR_REGISTER_CSV'");
    expect(source).toContain('rowCount: rows.length');
    expect(source).not.toContain('details: rows');
  });

  it('prevents browser/proxy caching and marks the export as audited', () => {
    expect(source).toContain("'Cache-Control': 'private, no-store'");
    expect(source).toContain("'X-Anunex-Sensitive-Export': 'audited'");
    expect(source).toContain("'X-Content-Type-Options': 'nosniff'");
  });

  it('keeps the audited export wrapper in both deployment chains', () => {
    expect(staging).toContain('"main": "./worker/privacy-smoke-entry.ts"');
    expect(smokeSource).toContain("import app from './privacy-export-entry'");
    expect(production).toContain('"main": "./worker/privacy-export-entry.ts"');
  });
});
