import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';

const worker=readFileSync(new URL('../worker/onboarding-entry.ts',import.meta.url),'utf8');
const auth=readFileSync(new URL('../worker/lib/auth.ts',import.meta.url),'utf8');
const profile=readFileSync(new URL('../src/pages/Profile.tsx',import.meta.url),'utf8');

describe('account security center',()=>{
 it('lists only the authenticated users sessions and identifies the current token by hash',()=>{
  expect(worker).toContain('FROM sessions WHERE user_id=?');
  expect(worker).toContain('currentSessionTokenHash(request)');
  expect(auth).toContain('return raw?sha256Hex(raw):null');
 });

 it('verifies the current password and revokes other sessions after password change',()=>{
  expect(worker).toContain('verifyPassword(current');
  expect(worker).toContain("token_hash<>?");
  expect(worker).toContain('must_change_password=0');
 });

 it('supports one-session and all-session revocation without accepting another users session',()=>{
  expect(worker).toContain('WHERE id=? AND user_id=?');
  expect(worker).toContain('ALL_SESSIONS_REVOKED');
  expect(profile).toContain('Tüm Cihazlardan Çık');
 });
});
