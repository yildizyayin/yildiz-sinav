import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S020: a school known from the MEB directory gets a one-time PIN, claims its own manager account once, and keeps its card up to date. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,institution_type,ownership,education_level,official_url,source_url) VALUES
      ('700001','Deneme Ortaokulu','DENEME ORTAOKULU','Ankara','Çankaya','Ortaokul','PUBLIC','ORTAOKUL','https://deneme.meb.k12.tr','https://www.meb.gov.tr/baglantilar/okullar/index.php'),
      ('700002','Başka Lisesi','BASKA LISESI','İzmir','Konak','Anadolu Lisesi','PUBLIC','LİSE',NULL,'https://www.meb.gov.tr/baglantilar/okullar/index.php');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
    INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED');
    INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sA','dA','CITY','Ankara');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'dealerA', 'teacher', 'stuuser']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const result = (await import('../worker/result-worker-entry')).default as any;
  const call = async (path: string, init: { method?: string; body?: any; cookie?: string; ip?: string } = {}) => {
    const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { method: init.method || 'GET', headers: { ...(init.cookie ? { Cookie: init.cookie } : {}), Origin: 'https://sonuc.anunex.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': init.ip || '203.0.113.9' }, ...(init.body ? { body: JSON.stringify(init.body) } : {}) }), t.env, { waitUntil() {} });
    const text = await r.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: r.status, data, text, cookie: r.headers.get('Set-Cookie') };
  };
  const issue = (mebCode: string, who = 'admin') => call('/api/admin/result-network/institution-pins', { method: 'POST', body: { mebCode }, cookie: cookies[who] });
  const claimBody = (pin: string, extra: Record<string, unknown> = {}) => ({ mebCode: '700001', pin, displayName: 'Okul Müdürü', email: 'mudur@deneme.example', phone: '0312 555 00 00', address: 'Çankaya / Ankara', password: 'Guclu-Sifre-2027', ...extra });
  const claim = (pin: string, extra: Record<string, unknown> = {}) => call('/api/public/results/institution-claim', { method: 'POST', body: claimBody(pin, extra) });
  return { t, cookies, call, issue, claim };
}

describe('S020 institution claim', () => {
  it('opens the school from the directory once and shows the PIN only once', async () => {
    const { t, issue, cookies, call } = await setup();
    for (const who of ['teacher', 'stuuser']) expect((await issue('700001', who)).status).toBe(403);
    expect((await issue('999999')).status).toBe(404);
    const a = await issue('700001');
    expect(a.status, a.text).toBe(201);
    expect(a.data.pin).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(a.data.institution).toMatchObject({ code: '700001', name: 'Deneme Ortaokulu', city: 'Ankara', district: 'Çankaya' });
    const b = await issue('700001');
    expect(b.data.institution.id).toBe(a.data.institution.id);
    expect((t.db.prepare(`SELECT count(*) n FROM institutions WHERE code='700001'`).get() as any).n).toBe(1);
    const inst = t.db.prepare(`SELECT source_type,meb_code,institution_type,ownership,education_level,status FROM institutions WHERE code='700001'`).get();
    expect(inst).toEqual({ source_type: 'MEB', meb_code: '700001', institution_type: 'ORTAOKUL', ownership: 'PUBLIC', education_level: 'ORTAOKUL', status: 'ACTIVE' });
    expect(JSON.stringify(t.db.prepare('SELECT * FROM institution_claim_pins').all())).not.toContain(b.data.pin);
    // a dealer issues PINs only inside its scope (Ankara)
    expect((await issue('700001', 'dealerA')).status).toBe(201);
    expect((await issue('700002', 'dealerA')).status).toBe(403);
    // card is visible to the Super Admin
    expect((await call('/api/admin/result-network/institutions/700001/card', { cookie: cookies.admin })).data.institution.id).toBe(a.data.institution.id);
    expect((await call(`/api/admin/result-network/institutions/${a.data.institution.id}/card`, { cookie: cookies.admin })).data.pin).toMatchObject({ usedAt: null });
  });

  it('lets the school claim its account once with the PIN and then sign in', async () => {
    const { t, issue, claim, call } = await setup();
    const { pin, institution } = (await issue('700001')).data;
    expect((await claim('AAAAAAAA')).status).toBe(401);
    expect((await claim(pin, { mebCode: '700002' })).status).toBe(401);
    const ok = await claim(pin.toLowerCase().replace(/(.{4})/, '$1-'));
    expect(ok.status, ok.text).toBe(201);
    const user = t.db.prepare(`SELECT role,institution_id,email,must_change_password,active FROM users WHERE email='mudur@deneme.example'`).get();
    expect(user).toEqual({ role: 'INSTITUTION_MANAGER', institution_id: institution.id, email: 'mudur@deneme.example', must_change_password: 0, active: 1 });
    expect(t.db.prepare(`SELECT contact_name,contact_phone,contact_email,address FROM institutions WHERE id=?`).get(institution.id)).toEqual({ contact_name: 'Okul Müdürü', contact_phone: '0312 555 00 00', contact_email: 'mudur@deneme.example', address: 'Çankaya / Ankara' });
    // the PIN is spent
    expect((await claim(pin, { email: 'ikinci@deneme.example' })).status).toBe(401);
    const login = await call('/api/auth/login', { method: 'POST', body: { identifier: 'mudur@deneme.example', password: 'Guclu-Sifre-2027' } });
    expect(login.status, login.text).toBe(200);
    const cookie = login.cookie!.split(';')[0];
    const card = await call(`/api/admin/result-network/institutions/${institution.id}/card`, { cookie });
    expect(card.status, card.text).toBe(200);
    // the school updates its own card, but cannot read another school's
    const patched = await call(`/api/admin/result-network/institutions/${institution.id}/card`, { method: 'PATCH', body: { contactPhone: '0312 444 11 22', address: 'Yeni adres' }, cookie });
    expect(patched.data.institution).toMatchObject({ contact_phone: '0312 444 11 22', address: 'Yeni adres' });
    expect((await call(`/api/admin/result-network/institutions/${institution.id}/card`, { method: 'PATCH', body: { contactPhone: 'abc' }, cookie })).status).toBe(400);
    const other = (await issue('700002')).data.institution.id;
    expect((await call(`/api/admin/result-network/institutions/${other}/card`, { cookie })).status).toBe(404);
  });

  it('locks the PIN after five wrong guesses, also when they arrive together', async () => {
    const { t, issue, claim } = await setup();
    const { pin, institution } = (await issue('700001')).data;
    const results = await Promise.all(Array.from({ length: 9 }, (_, i) => claim(`WRONG${String(i).padStart(3, '2')}`.slice(0, 8).replace(/[01IO]/g, 'X'))));
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
    expect((await claim(pin)).status).toBe(429);
    expect((t.db.prepare('SELECT failed_attempts f FROM institution_claim_pins WHERE institution_id=?').get(institution.id) as any).f).toBe(5);
    // a new PIN from the Super Admin starts over
    const fresh = (await issue('700001')).data.pin;
    expect((await claim(fresh)).status).toBe(201);
  });

  it('does not spend the PIN when the e-mail already has an account', async () => {
    const { t, issue, claim } = await setup();
    t.db.exec(`UPDATE users SET email='mudur@deneme.example' WHERE id='teacher'`);
    const { pin } = (await issue('700001')).data;
    expect((await claim(pin)).status).toBe(409);
    expect((await claim(pin, { email: 'baska@deneme.example' })).status).toBe(201);
  });
});

describe('S021 opening a school by hand', () => {
  it('keeps contact fields, validates them, and lets a hand-opened school (ANX- code) claim with a PIN', async () => {
    const { t, cookies, call, claim } = await setup();
    const bad = await call('/api/admin/result-network/institutions', { method: 'POST', body: { name: 'Elle Açılan Kurs', city: 'Ankara', district: 'Çankaya', contactPhone: 'abc' }, cookie: cookies.admin });
    expect(bad.status).toBe(400);
    const made = await call('/api/admin/result-network/institutions', { method: 'POST', body: { name: 'Elle Açılan Kurs', city: 'Ankara', district: 'Çankaya', contactName: 'Kurs Müdürü', contactPhone: '0312 111 22 33', address: 'Kızılay' }, cookie: cookies.admin });
    expect(made.status, made.text).toBe(201);
    const code = made.data.institution.code;
    expect(code).toMatch(/^ANX-/);
    expect(t.db.prepare('SELECT source_type,meb_code,contact_name,contact_phone,address FROM institutions WHERE code=?').get(code)).toEqual({ source_type: 'MANUAL', meb_code: null, contact_name: 'Kurs Müdürü', contact_phone: '0312 111 22 33', address: 'Kızılay' });
    const pin = await call('/api/admin/result-network/institution-pins', { method: 'POST', body: { mebCode: code.toLowerCase() }, cookie: cookies.admin });
    expect(pin.status, pin.text).toBe(201);
    expect((await claim(pin.data.pin, { mebCode: code, email: 'kurs@deneme.example' })).status).toBe(201);
    const edited = await call(`/api/admin/result-network/institutions/${made.data.institution.id}`, { method: 'PATCH', body: { name: 'Elle Açılan Kurs', city: 'Ankara', district: 'Çankaya', contactPhone: '0312 999 88 77' }, cookie: cookies.admin });
    expect(edited.status, edited.text).toBe(200);
    expect((t.db.prepare('SELECT contact_phone,address FROM institutions WHERE code=?').get(code) as any)).toEqual({ contact_phone: '0312 999 88 77', address: 'Çankaya / Ankara' }); // the claim filled in the school's own address
  });
});
