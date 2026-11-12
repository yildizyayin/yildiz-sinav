import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import app from '../worker/preview-policy-production-entry';
import { createSession } from '../worker/lib/auth';
import { normalizePhone } from '../worker/lib/pilot-applications';

/** Pilot okul başvurusu (owner, 12 Nov 2026): anunex.com form → Super Admin list. Synthetic data only. */
const call = (t: any, path: string, init: RequestInit & { origin?: string; cookie?: string } = {}) =>
  (app as any).fetch(new Request(`https://app.anunex.com${path}`, { ...init, headers: { ...(init.origin ? { Origin: init.origin } : {}), ...(init.cookie ? { Cookie: init.cookie } : {}), ...(init.body ? { 'Content-Type': 'application/json' } : {}), 'CF-Connecting-IP': '203.0.113.7' } }), t.env, { waitUntil() {}, passThroughOnException() {} });
const form = { institutionName: 'Örnek Ortaokulu', city: 'Ankara', institutionType: 'DEVLET_OKULU', studentCount: '300-500', contactName: 'Deneme Yetkili', phone: '0532 000 00 00', email: 'yetkili@example.com', kvkk: true };

describe('pilot applications', () => {
  it('normalises Turkish phone numbers', () => {
    expect(normalizePhone('+90 532 000 00 00')).toBe('05320000000');
    expect(normalizePhone('532 000 0000')).toBe('05320000000');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('takes an application from anunex.com only, with KVKK consent, limits repeats and shows it to the Super Admin', async () => {
    const t = await evaluatedExam('direct');
    const pre = await call(t, '/api/public/pilot-applications', { method: 'OPTIONS', origin: 'https://anunex.com' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('https://anunex.com');
    expect((await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://evil.example', body: JSON.stringify(form) })).status).toBe(403);
    expect((await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify({ ...form, kvkk: false }) })).status).toBe(400);
    expect((await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify({ ...form, phone: '12' }) })).status).toBe(400);
    const ok = await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify(form) });
    expect(ok.status, await ok.clone().text()).toBe(201);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://anunex.com');
    expect(t.db.prepare(`SELECT institution_name,phone,institution_type,kvkk_version,status FROM pilot_applications`).get()).toEqual({ institution_name: 'Örnek Ortaokulu', phone: '05320000000', institution_type: 'DEVLET_OKULU', kvkk_version: 'pilot-2026-11-12', status: 'NEW' });
    expect(JSON.stringify(t.db.prepare(`SELECT * FROM pilot_applications`).get())).not.toContain('203.0.113.7');
    // a bot filling the hidden field is accepted silently but nothing is stored
    await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify({ ...form, website: 'http://spam' }) });
    expect(t.db.prepare(`SELECT count(*) n FROM pilot_applications`).get()).toEqual({ n: 1 });
    await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify(form) });
    await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify(form) });
    expect((await call(t, '/api/public/pilot-applications', { method: 'POST', origin: 'https://anunex.com', body: JSON.stringify(form) })).status).toBe(429);

    const sa = (await createSession(t.env, 'admin', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const teacher = (await createSession(t.env, 'teacher', new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    expect((await call(t, '/api/pilot-applications', { cookie: teacher })).status).toBe(403);
    const list = await call(t, '/api/pilot-applications', { cookie: sa });
    expect(list.status).toBe(200);
    const rows = (await list.json() as any).applications;
    expect(rows).toHaveLength(3);
    expect((await call(t, `/api/pilot-applications/${rows[0].id}`, { method: 'PATCH', cookie: sa, origin: 'https://app.anunex.com', body: JSON.stringify({ status: 'CONTACTED', note: 'Arandı' }) })).status).toBe(200);
    expect(t.db.prepare(`SELECT count(*) n FROM notifications WHERE type='PILOT_APPLICATION'`).get()).not.toEqual({ n: 0 });
  });
});
