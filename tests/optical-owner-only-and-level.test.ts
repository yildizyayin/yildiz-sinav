import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';
import { quickOptical } from '../worker/lib/result-optical-quick';

/**
 * Owner decisions, 4 Nov:
 * - an institution's own optic is seen only by that institution (not other institutions, dealers or the Super Admin);
 * - optics carry a school level (İlkokul / Ortaokul / Lise) for the filterable list;
 * - the sample TXT/DAT test is optional, also for "Optik ekle" on sonuc.
 * Synthetic data only.
 */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/a025/${name}`, import.meta.url));
function memoryBucket() { const files = new Map<string, Uint8Array>(); return { files, async put(k: string, b: any) { files.set(k, new Uint8Array(await new Response(b).arrayBuffer())); return {}; }, async get(k: string) { const f = files.get(k); return f ? { body: new Blob([f]).stream(), writeHttpMetadata() {} } : null; }, async delete(k: string) { files.delete(k); } }; }

async function setup() {
  const t = await evaluatedExam('direct');
  (t.env as any).FILES = memoryBucket();
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (id: string, path: string, method = 'GET', body?: any) => {
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[id], Origin: 'https://app.anunex.com', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, data };
  };
  return { ...t, as, cookies };
}

describe('optics: owner-only institution optics and school level', () => {
  it('an institution optic is invisible to the Super Admin and to other institutions; level is stored and validated', async () => {
    const t = await setup();
    try {
      const own = await t.as('mgr', '/api/optical-definitions', 'POST', { name: 'Okul Formu', vendor: 'Sekonic', opticalCode: 'OK1', educationLevel: 'ORTAOKUL' });
      expect(own.status, own.text).toBe(201);
      const central = await t.as('admin', '/api/optical-definitions', 'POST', { name: 'Merkez Formu', vendor: 'Sekonic', opticalCode: 'MF1', educationLevel: 'LISE' });
      expect(central.status, central.text).toBe(201);
      expect((await t.as('admin', '/api/optical-definitions', 'POST', { name: 'X', vendor: 'Y', opticalCode: 'Z', educationLevel: 'UNIVERSITE' })).status).toBe(400);

      const mine = (await t.as('mgr', '/api/optical-definitions')).data.templates;
      expect(mine.find((x: any) => x.id === own.data.templateId)).toMatchObject({ education_level: 'ORTAOKUL', owner_type: 'INSTITUTION' });
      const adminList = (await t.as('admin', '/api/optical-definitions')).data.templates.map((x: any) => x.id);
      expect(adminList).toContain(central.data.templateId);
      expect(adminList).not.toContain(own.data.templateId);
      expect((await t.as('othermgr', '/api/optical-definitions')).data.templates.map((x: any) => x.id)).not.toContain(own.data.templateId);
      expect((await t.as('othermgr', `/api/optical-definitions/${own.data.templateId}`)).status).toBe(403);
      // the upload catalog too, even when the Super Admin picks that institution
      const catalog = (await t.as('admin', '/api/optical-templates?institutionId=school')).data.templates.map((x: any) => x.template_id);
      expect(catalog).not.toContain(own.data.templateId);

      const edited = await t.as('mgr', `/api/optical-definitions/${own.data.templateId}`, 'PATCH', { name: 'Okul Formu', vendor: 'Sekonic', opticalCode: 'OK1', educationLevel: 'LISE' });
      expect(edited.status, edited.text).toBe(200);
      expect(edited.data.template.education_level).toBe('LISE');
      const kept = await t.as('mgr', `/api/optical-definitions/${own.data.templateId}`, 'PATCH', { name: 'Okul Formu 2', vendor: 'Sekonic', opticalCode: 'OK1' });
      expect(kept.data.template.education_level).toBe('LISE'); // not sent → unchanged
    } finally { t.db.close(); }
  }, 60000);

  it('"Optik ekle" on sonuc works without a sample file and publishes the optic untested', async () => {
    const t = await setup();
    try {
      const form = new FormData();
      form.set('name', 'Okul 129');
      form.set('fmt', new File([fixture('OPT_K-129_SEKONIC.fmt')], 'OPT_K-129_SEKONIC.fmt', { type: 'text/plain' }));
      const res = await quickOptical(new Request('https://sonuc.anunex.com/api/admin/result-network/operations/opticals', { method: 'POST', headers: { Cookie: t.cookies.mgr, Origin: 'https://sonuc.anunex.com' }, body: form }), t.env);
      const data: any = await res.json();
      expect(res.status, JSON.stringify(data)).toBe(201);
      expect(data).toMatchObject({ ok: true, tested: false, recordCount: null });
      const row = t.db.prepare(`SELECT t.status,t.owner_type,t.owner_id FROM optical_template_versions v JOIN optical_templates t ON t.id=v.template_id WHERE v.id=?`).get(data.optical.id) as any;
      expect(row).toMatchObject({ status: 'READY', owner_type: 'INSTITUTION', owner_id: 'school' });
    } finally { t.db.close(); }
  }, 60000);
});
