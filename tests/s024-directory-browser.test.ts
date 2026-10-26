import { describe, expect, it } from 'vitest';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';

/** S024: every MEB school in the directory is visible to the Super Admin and its card opens without opening the school by hand. Synthetic data only. */
describe('S024 directory browser', () => {
  it('lists, filters and pages the directory, and opens a card on first use', async () => {
    const t = await evaluatedExam('direct');
    const ins = t.db.prepare(`INSERT INTO national_institution_directory(meb_code,name,normalized_name,city,district,education_level,ownership,source_url) VALUES(?,?,?,?,?,?,?,'https://www.meb.gov.tr/x')`);
    for (let i = 0; i < 60; i++) ins.run(String(710000 + i), `Deneme Okulu ${i}`, `DENEME OKULU ${i}`, 'Ankara', i % 2 ? 'Çankaya' : 'Keçiören', 'ORTAOKUL', 'PUBLIC');
    ins.run('720001', 'Şehit Ömer İlkokulu', 'SEHIT OMER ILKOKULU', 'Zonguldak', 'Merkez', 'İLKOKUL', 'PRIVATE');
    t.db.exec(`INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('dealerA','INSTITUTION_MANAGER','Bayi','u','u',1,NULL);
      INSERT INTO result_network_dealers(id,user_id,status) VALUES('dA','dealerA','APPROVED');
      INSERT INTO result_network_dealer_scopes(id,dealer_id,scope_type,city) VALUES('sA','dA','CITY','Ankara');`);
    const cookies: Record<string, string> = {};
    for (const id of ['admin', 'teacher', 'dealerA']) cookies[id] = (await createSession(t.env, id, new Request('https://sonuc.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
    const result = (await import('../worker/result-worker-entry')).default as any;
    const get = async (path: string, who = 'admin') => { const r = await result.fetch(new Request(`https://sonuc.anunex.com${path}`, { headers: { Cookie: cookies[who], Origin: 'https://sonuc.anunex.com' } }), t.env, { waitUntil() {} }); const text = await r.text(); return { status: r.status, data: JSON.parse(text), text }; };
    const base = '/api/admin/result-network/institution-directory';
    expect((await get(base, 'teacher')).status).toBe(403);
    const all = await get(base);
    expect(all.status, all.text).toBe(200);
    expect(all.data).toMatchObject({ total: 61, pageSize: 50 });
    expect(all.data.rows).toHaveLength(50);
    expect(all.data.cities).toEqual([{ city: 'Ankara', n: 60 }, { city: 'Zonguldak', n: 1 }]);
    expect((await get(`${base}?page=2`)).data.rows).toHaveLength(11);
    expect((await get(`${base}?city=Ankara&district=Çankaya`)).data.total).toBe(30);
    expect((await get(`${base}?city=Ankara`)).data.districts).toHaveLength(2);
    const found = await get(`${base}?q=${encodeURIComponent('şehit ömer')}`);
    expect(found.data.rows).toEqual([expect.objectContaining({ code: '720001', status: 'DIRECTORY', ownership: 'PRIVATE' })]);
    expect((await get(`${base}?q=7200`)).data.total).toBe(1);
    // a dealer cannot open a card outside its scope, and nothing gets created
    expect((await get('/api/admin/result-network/institutions/720001/card', 'dealerA')).status).toBe(404);
    expect((t.db.prepare(`SELECT count(*) n FROM institutions WHERE meb_code='720001'`).get() as any).n).toBe(0);
    // the Super Admin opens the card straight from the directory; opening it again reuses the same card
    const card = await get('/api/admin/result-network/institutions/720001/card');
    expect(card.status, card.text).toBe(200);
    expect(card.data.institution).toMatchObject({ code: '720001', name: 'Şehit Ömer İlkokulu', city: 'Zonguldak' });
    expect((await get('/api/admin/result-network/institutions/720001/card')).data.institution.id).toBe(card.data.institution.id);
    expect((t.db.prepare(`SELECT count(*) n FROM institutions WHERE meb_code='720001'`).get() as any).n).toBe(1);
    expect((await get(`${base}?q=720001`)).data.rows[0]).toMatchObject({ status: 'CARD', institution_id: card.data.institution.id });
    // status actions from the directory row work on the card that was just created
    const post = await result.fetch(new Request(`https://sonuc.anunex.com/api/admin/result-network/institutions/${card.data.institution.id}/status`, { method: 'POST', headers: { Cookie: cookies.admin, Origin: 'https://sonuc.anunex.com', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PASSIVE', reason: 'Kapandı' }) }), t.env, { waitUntil() {} });
    expect(post.status, await post.clone().text()).toBeLessThan(300);
    expect((await get(`${base}?q=720001`)).data.rows[0]).toMatchObject({ lifecycle: 'PASSIVE' });
    // a dealer in scope opens an Ankara card the same way
    expect((await get('/api/admin/result-network/institutions/710001/card', 'dealerA')).status).toBe(200);
  });
});
