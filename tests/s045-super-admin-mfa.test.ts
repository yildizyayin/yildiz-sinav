import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession, hashPassword } from '../worker/lib/auth';
import { generateTotpCode } from '../worker/lib/mfa';
import { generateTotpSecret, superAdminMfaSecret } from '../worker/lib/super-admin-mfa';

/** S045: Super Admin enrolls an authenticator from the panel; login asks for the code only after it is confirmed. */
async function world() {
  const t = await evaluatedExam('direct');
  Object.assign(t.env, { SESSION_SECRET: 'synthetic-session-secret' });
  const pass = await hashPassword('Synthetic-Admin-1');
  t.db.prepare(`UPDATE users SET username='rootadmin',password_hash=?,password_salt=?,password_iterations=? WHERE id='admin'`).run(pass.hash, pass.salt, pass.iterations);
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const cookies: Record<string, string> = {};
  const call = async (who: string | null, path: string, method = 'GET', body?: any) => {
    if (who && !cookies[who]) cookies[who] = (await createSession(t.env, who, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { ...(who ? { Cookie: cookies[who] } : {}), Origin: 'https://app.anunex.com', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), t.env, { waitUntil() {}, passThroughOnException() {} });
    return { status: r.status, data: await r.json().catch(() => null) as any };
  };
  return { t, call };
}

afterEach(() => vi.unstubAllGlobals());

describe('S045 Süper Admin iki adımlı doğrulama', () => {
  it('generates RFC 4648 base32 seeds of 160 bits', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(s);
  });

  it('enrolls, confirms with a code, enforces at login, and disables only with a valid code', async () => {
    const { t, call } = await world();
    expect((await call('teacher', '/api/security/mfa')).status).toBe(403);
    let st = await call('admin', '/api/security/mfa');
    expect(st.data.data).toMatchObject({ active: false, canEnroll: true });
    expect((await call('admin', '/api/config')).data.superAdminMfaEnabled).toBe(false);

    const enroll = await call('admin', '/api/security/mfa/enroll', 'POST');
    expect(enroll.status).toBe(200);
    const secret = enroll.data.data.secret as string;
    expect(enroll.data.data.otpauthUri).toContain(`secret=${secret}`);
    const stored = t.db.prepare(`SELECT secret_sealed,status FROM super_admin_mfa_secrets WHERE user_id='admin'`).get() as any;
    expect(stored.status).toBe('PENDING');
    expect(stored.secret_sealed).not.toContain(secret);
    // Pending is not enforced.
    expect(await superAdminMfaSecret(t.env as any, 'admin')).toBeNull();

    expect((await call('admin', '/api/security/mfa/confirm', 'POST', { code: '000000' })).status).toBe(400);
    const ok = await call('admin', '/api/security/mfa/confirm', 'POST', { code: await generateTotpCode(secret) });
    expect(ok.status).toBe(200);
    expect(await superAdminMfaSecret(t.env as any, 'admin')).toBe(secret);
    expect((await call('admin', '/api/config')).data.superAdminMfaEnabled).toBe(true);
    expect((await call('admin', '/api/security/mfa/enroll', 'POST')).status).toBe(409);

    // Production login now needs the code (Turnstile stubbed as passed).
    Object.assign(t.env, { ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'synthetic' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } }));
    const login = (extra: any = {}) => call(null, '/api/auth/login', 'POST', { identifier: 'rootadmin', password: 'Synthetic-Admin-1', turnstileToken: 't', ...extra });
    const noCode = await login();
    expect(noCode.status).toBe(401);
    expect(noCode.data.error.code).toBe('MFA_REQUIRED');
    expect((await login({ mfaCode: '123456' })).data.error.code).toBe('MFA_INVALID');
    expect((await login({ mfaCode: await generateTotpCode(secret) })).status).toBe(200);
    Object.assign(t.env, { ENVIRONMENT: 'test' });

    expect((await call('admin', '/api/security/mfa/disable', 'POST', { code: '000000' })).status).toBe(400);
    expect((await call('admin', '/api/security/mfa/disable', 'POST', { code: await generateTotpCode(secret) })).status).toBe(200);
    st = await call('admin', '/api/security/mfa');
    expect(st.data.data.active).toBe(false);
  });

  it('fails closed when an active seed cannot be opened', async () => {
    const { t, call } = await world();
    const secret = (await call('admin', '/api/security/mfa/enroll', 'POST')).data.data.secret;
    await call('admin', '/api/security/mfa/confirm', 'POST', { code: await generateTotpCode(secret) });
    Object.assign(t.env, { ENVIRONMENT: 'production', TURNSTILE_SECRET_KEY: 'synthetic', SESSION_SECRET: 'rotated-secret' });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } }));
    const r = await call(null, '/api/auth/login', 'POST', { identifier: 'rootadmin', password: 'Synthetic-Admin-1', turnstileToken: 't', mfaCode: await generateTotpCode(secret) });
    expect(r.status).toBe(503);
    expect(r.data.error.code).toBe('MFA_STORAGE_UNAVAILABLE');
  });

  it('keeps the Cloudflare platform secret as an override', async () => {
    const { t } = await world();
    Object.assign(t.env, { SUPER_ADMIN_MFA_TOTP_SECRET: 'JBSWY3DPEHPK3PXP' });
    expect(await superAdminMfaSecret(t.env as any, 'admin')).toBe('JBSWY3DPEHPK3PXP');
  });
});
