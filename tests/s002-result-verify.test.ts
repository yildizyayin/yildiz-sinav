import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { hashPassword } from '../worker/lib/auth';
import { handleResultNetworkRequest } from '../worker/result-network-entry';

/** S002: the personal access code step of the result portal cannot be brute-forced in parallel or past a lock. Synthetic data only. */
async function setup() {
  const t = await evaluatedExam('direct');
  t.db.exec('PRAGMA foreign_keys=OFF');
  const code = await hashPassword('48151623');
  t.db.prepare(`INSERT INTO result_access_identities(id,administration_id,result_institution_id,participant_id,grade_level,normalized_name,access_code_hash,access_code_salt,expires_at) VALUES('idn','adm','rni','p1',8,'ALI YILMAZ',?,?,'2099-01-01')`).run(code.hash, code.salt);
  const ip = (await crypto.subtle.digest('SHA-256', new TextEncoder().encode('203.0.113.7')));
  const ipHash = [...new Uint8Array(ip)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const challenge = (id: string) => t.db.prepare(`INSERT INTO result_lookup_challenges(id,identity_id,ip_hash,expires_at) VALUES(?,'idn',?,datetime('now','+10 minutes'))`).run(id, ipHash);
  const verify = async (challengeId: string, accessCode: string, from = '203.0.113.7') => {
    const r = (await handleResultNetworkRequest(new Request('https://sonuc.anunex.com/api/public/results/verify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': from }, body: JSON.stringify({ challengeId, accessCode }) }), t.env))!;
    const body: any = await r.json();
    return { status: r.status, code: body.error?.code ?? 'OK', cookie: r.headers.get('Set-Cookie') };
  };
  const identity = () => t.db.prepare(`SELECT failed_attempts f,locked_until IS NOT NULL locked FROM result_access_identities WHERE id='idn'`).get() as any;
  return { t, challenge, verify, identity };
}

describe('S002 result portal personal verification', () => {
  it('opens a session with the right code once, and only from the address that searched', async () => {
    const { t, challenge, verify } = await setup();
    challenge('c1');
    expect((await verify('c1', '48151623', '198.51.100.9')).code).toBe('CHALLENGE_EXPIRED');
    const ok = await verify('c1', '48151623');
    expect(ok.status).toBe(200); expect(ok.cookie).toContain('anunex_result_session=');
    expect((await verify('c1', '48151623')).code).toBe('CHALLENGE_EXPIRED');
    expect((t.db.prepare('SELECT count(*) n FROM result_portal_sessions').get() as any).n).toBe(1);
  });

  it('opens a single session when the right code is sent twice at the same time', async () => {
    const { t, challenge, verify } = await setup();
    challenge('c1');
    const both = await Promise.all([verify('c1', '48151623'), verify('c1', '48151623')]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    expect((t.db.prepare('SELECT count(*) n FROM result_portal_sessions').get() as any).n).toBe(1);
  });

  it('counts at most five guesses per search even when they arrive at the same time', async () => {
    const { challenge, verify, identity } = await setup();
    challenge('c1');
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => verify('c1', String(10000000 + i))));
    expect(results.filter((r) => r.code === 'VERIFICATION_FAILED')).toHaveLength(5);
    expect(results.filter((r) => r.code === 'CHALLENGE_EXPIRED')).toHaveLength(7);
    expect(identity().f).toBe(5);
    expect((await verify('c1', '48151623')).code).toBe('CHALLENGE_EXPIRED');
  });

  it('locks the identity after eight failures, also for searches opened before the lock', async () => {
    const { challenge, verify, identity } = await setup();
    challenge('c1'); challenge('c2'); challenge('c3');
    await Promise.all([...Array.from({ length: 5 }, () => verify('c1', '11111111')), ...Array.from({ length: 3 }, () => verify('c2', '22222222'))]);
    expect(identity()).toEqual({ f: 8, locked: 1 });
    expect((await verify('c3', '48151623')).code).toBe('CHALLENGE_EXPIRED');
    expect((await verify('c2', '48151623')).code).toBe('CHALLENGE_EXPIRED');
  });
});
