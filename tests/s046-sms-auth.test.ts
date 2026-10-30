import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { normalizeTrMobile } from '../worker/lib/sms';

/** S046: SMS code login / reset through Netgsm. Synthetic numbers (555 000 00 0X) and people only. */
async function world(configured = true) {
  const t = await evaluatedExam('direct');
  if (configured) Object.assign(t.env, { NETGSM_USERCODE: 'synthetic', NETGSM_PASSWORD: 'synthetic', NETGSM_HEADER: 'ANUNEX' });
  t.db.exec(`UPDATE users SET phone='+905550000001' WHERE id='parent';
    UPDATE users SET phone='05550000002' WHERE id='teacher';
    UPDATE users SET phone='5550000009' WHERE id='admin';`);
  const sent: any[] = [];
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ code: '00', jobId: 'job-1' }), { headers: { 'Content-Type': 'application/json' } });
  });
  const app = (await import('../worker/preview-policy-production-entry')).default as any;
  const call = async (path: string, body: any, ip = '203.0.113.7') => {
    const r = await app.fetch(new Request(`https://app.anunex.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://app.anunex.com' }, body: JSON.stringify(body) }), t.env, { waitUntil() {}, passThroughOnException() {} });
    return { status: r.status, data: await r.json().catch(() => null) as any, cookie: r.headers.get('Set-Cookie') };
  };
  const lastCode = () => String(sent.at(-1)?.body?.msg || '').match(/(\d{6})/)?.[1] || '';
  return { t, call, sent, lastCode };
}

afterEach(() => vi.unstubAllGlobals());

describe('S046 SMS ile giriş ve şifre yenileme', () => {
  it('normalizes Turkish mobile numbers', () => {
    for (const v of ['5551234567', '05551234567', '905551234567', '+90 555 123 45 67', '0090 555 123 4567']) expect(normalizeTrMobile(v)).toBe('5551234567');
    for (const v of ['2121234567', '555123', '+44 7700 900123', '']) expect(normalizeTrMobile(v)).toBeNull();
  });

  it('stays closed without Netgsm credentials', async () => {
    const { call, sent } = await world(false);
    expect((await call('/api/auth/sms/request', { phone: '5550000001', purpose: 'LOGIN' })).status).toBe(503);
    expect(sent).toHaveLength(0);
  });

  it('logs in with a one-time code and never reveals whether a number exists', async () => {
    const { t, call, sent, lastCode } = await world();
    const unknown = await call('/api/auth/sms/request', { phone: '5550000077', purpose: 'LOGIN' });
    expect(unknown.status).toBe(200);
    expect(sent).toHaveLength(0);
    const known = await call('/api/auth/sms/request', { phone: '0555 000 00 01', purpose: 'LOGIN' });
    expect(known.data.message).toBe(unknown.data.message);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe('https://api.netgsm.com.tr/sms/rest/v2/otp');
    expect(sent[0].body).toMatchObject({ msgheader: 'ANUNEX', no: '5550000001' });
    expect(sent[0].body.msg).toMatch(/^[\x20-\x7E]+$/);
    const code = lastCode();
    const stored = t.db.prepare(`SELECT phone_hash,code_hash FROM sms_otp_challenges WHERE sent=1`).get() as any;
    expect(stored.code_hash).not.toContain(code);
    expect(stored.phone_hash).not.toContain('5550000001');
    expect((await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code: code === '000000' ? '111111' : '000000' })).status).toBe(400);
    const ok = await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code });
    expect(ok.status).toBe(200);
    expect(ok.cookie).toContain('yildiz_session=');
    expect((await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code })).status).toBe(400);
    expect((t.db.prepare(`SELECT count(*) n FROM sms_delivery_log WHERE status='SENT'`).get() as any).n).toBe(1);
  });

  it('never sends a code to the Super Admin', async () => {
    const { call, sent } = await world();
    expect((await call('/api/auth/sms/request', { phone: '5550000009', purpose: 'LOGIN' })).status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('asks which account to use when a number is on two accounts', async () => {
    const { t, call, lastCode } = await world();
    t.db.exec(`UPDATE users SET phone='5550000001' WHERE id='teacher'`);
    await call('/api/auth/sms/request', { phone: '5550000001', purpose: 'LOGIN' });
    const code = lastCode();
    const first = await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code });
    expect(first.data.chooseAccount.map((a: any) => a.id).sort()).toEqual(['parent', 'teacher']);
    expect(first.cookie).toBeNull();
    const second = await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code, accountId: 'teacher' });
    expect(second.status).toBe(200);
    expect(second.cookie).toContain('yildiz_session=');
  });

  it('resets the password with a code and ends old sessions', async () => {
    const { t, call, lastCode } = await world();
    const { createSession } = await import('../worker/lib/auth');
    await createSession(t.env as any, 'teacher', new Request('https://app.anunex.com'), false);
    await call('/api/auth/sms/request', { phone: '5550000002', purpose: 'RESET' });
    const code = lastCode();
    expect((await call('/api/auth/sms/verify', { phone: '5550000002', purpose: 'RESET', code, newPassword: 'kisa' })).data.error.code).toBe('PASSWORD_TOO_SHORT');
    const ok = await call('/api/auth/sms/verify', { phone: '5550000002', purpose: 'RESET', code, newPassword: 'Yeni-Sifre-2026' });
    expect(ok.status).toBe(200);
    expect((t.db.prepare(`SELECT count(*) n FROM sessions WHERE user_id='teacher' AND revoked_at IS NULL`).get() as any).n).toBe(1);
    t.db.exec(`UPDATE users SET username='ogretmen1' WHERE id='teacher'`);
    const login = await call('/api/auth/login', { identifier: 'ogretmen1', password: 'Yeni-Sifre-2026' });
    expect(login.status).toBe(200);
  });

  it('limits sends and wrong tries', async () => {
    const { call, lastCode } = await world();
    for (let i = 0; i < 3; i++) expect((await call('/api/auth/sms/request', { phone: '5550000001', purpose: 'LOGIN' })).status).toBe(200);
    expect((await call('/api/auth/sms/request', { phone: '5550000001', purpose: 'LOGIN' })).status).toBe(429);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code: wrong })).status).toBe(400);
    expect((await call('/api/auth/sms/verify', { phone: '5550000001', purpose: 'LOGIN', code })).status).toBe(429);
  });
});
