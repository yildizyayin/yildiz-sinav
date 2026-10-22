import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluatedExam } from './helpers/exam-flow';
import { createSession } from '../worker/lib/auth';
import app from '../worker/preview-policy-production-entry';

/**
 * A034: optical definitions (Phobos). Add, edit, version, import FMT fields, test with a sample file,
 * publish, archive and delete, with each institution limited to its own optics. Real schema, production
 * entry chain, the real Sekonic 129 FMT and an anonymised TXT from A025.
 */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/a025/${name}`, import.meta.url));
function memoryBucket() { const files = new Map<string, Uint8Array>(); return { files, async put(k: string, b: any) { files.set(k, new Uint8Array(await new Response(b).arrayBuffer())); return {}; }, async get(k: string) { const f = files.get(k); return f ? { body: new Blob([f]).stream(), writeHttpMetadata() {} } : null; }, async delete(k: string) { files.delete(k); } }; }

async function setup() {
  const t = await evaluatedExam('direct');
  (t.env as any).FILES = memoryBucket();
  t.db.exec(`INSERT INTO institutions(id,name,code,status) VALUES('other','Other School','OTHER','ACTIVE');
    INSERT INTO users(id,role,display_name,password_hash,password_salt,active,institution_id) VALUES('mgr','INSTITUTION_MANAGER','M','u','u',1,'school'),('othermgr','INSTITUTION_MANAGER','O','u','u',1,'other');`);
  const cookies: Record<string, string> = {};
  for (const id of ['admin', 'mgr', 'othermgr', 'teacher']) cookies[id] = (await createSession(t.env, id, new Request('https://app.anunex.com'), false)).headers.get('Set-Cookie')!.split(';')[0];
  const as = async (id: string, path: string, method = 'GET', body?: any) => {
    const form = body instanceof FormData;
    const res = await (app as any).fetch(new Request(`https://app.anunex.com${path}`, { method, headers: { Cookie: cookies[id], Origin: 'https://app.anunex.com', ...(body && !form ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) }), t.env, { waitUntil() {} });
    const text = await res.text(); let data: any = null; try { data = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, data };
  };
  return { ...t, as };
}
const fmtForm = () => { const f = new FormData(); f.set('file', new File([fixture('OPT_K-129_SEKONIC.fmt')], 'OPT_K-129_SEKONIC.fmt', { type: 'text/plain' })); return f; };

describe('A034: optical definitions', () => {
  it('a manager adds an optic, imports its FMT, tests it with a real TXT, publishes it and uses it; edits go to a new version', async () => {
    const t = await setup();
    try {
      const created = await t.as('mgr', '/api/optical-definitions', 'POST', { name: 'Kurum 129', vendor: 'Sekonic', opticalCode: 'K129', formType: 'FMT' });
      expect(created.status, created.text).toBe(201);
      expect(created.data).toMatchObject({ ownerType: 'INSTITUTION', ownerId: 'school' });
      const v1 = created.data.versionId;
      const fmt = await t.as('mgr', `/api/optical-definition-versions/${v1}/fmt`, 'POST', fmtForm());
      expect(fmt.status, fmt.text).toBe(201);
      expect(fmt.data.definition.recordLength).toBe(222);
      expect(Object.keys(fmt.data.definition.answers)).toEqual(['TYT_TUR', 'TYT_SOS', 'TYT_MAT', 'TYT_FEN', 'TYT_FEL']);
      // not publishable before a sample file passes
      expect((await t.as('mgr', `/api/optical-definition-versions/${v1}/publish`, 'POST')).data.error.code).toBe('OPTICAL_DEFINITION_INCOMPLETE');
      const test = await t.as('mgr', `/api/optical-definition-versions/${v1}/test-parser`, 'POST', { sampleText: new TextDecoder('windows-1254').decode(fixture('cap_tyt0_anon.txt')), fileName: 'cap_tyt0.txt' });
      expect(test.status, test.text).toBe(200);
      expect(test.data).toMatchObject({ passed: true, recordCount: 6 });
      const pub = await t.as('mgr', `/api/optical-definition-versions/${v1}/publish`, 'POST');
      expect(pub.status, pub.text).toBe(200);
      // a published version is locked; an edit goes to a copied version, which must be tested again
      expect((await t.as('mgr', `/api/optical-definition-versions/${v1}/fmt`, 'POST', fmtForm())).data.error.code).toBe('PUBLISHED_VERSION_LOCKED');
      const v2 = await t.as('mgr', `/api/optical-definitions/${created.data.templateId}/versions`, 'POST', { version: 'v2', cloneFromVersionId: v1 });
      expect(v2.status, v2.text).toBe(201);
      const v2detail = await t.as('mgr', `/api/optical-definition-versions/${v2.data.versionId}`);
      expect(v2detail.data.version.parser_definition).toBe((t.db.prepare('SELECT parser_definition p FROM optical_template_versions WHERE id=?').get(v1) as any).p);
      expect(v2detail.data.readiness.parserTestPassed).toBe(false);
      // renaming keeps the code unique within the institution
      expect((await t.as('mgr', `/api/optical-definitions/${created.data.templateId}`, 'PATCH', { name: 'Kurum 129 TYT', vendor: 'Sekonic', opticalCode: 'K129' })).status).toBe(200);
      expect((await t.as('mgr', '/api/optical-definitions', 'POST', { name: 'Başka', vendor: 'Sekonic', opticalCode: 'K129' })).status).toBe(409);
      // the published optic is offered for this institution's uploads
      const list = await t.as('mgr', '/api/optical-definitions');
      expect(list.data.templates.find((x: any) => x.id === created.data.templateId)).toMatchObject({ status: 'READY', active_version_id: v1, name: 'Kurum 129 TYT' });
    } finally { t.db.close(); }
  }, 60000);

  it('each institution is limited to its own optics; central optics are read-only for institutions; teachers have no access', async () => {
    const t = await setup();
    try {
      const own = await t.as('mgr', '/api/optical-definitions', 'POST', { name: 'Kurum Formu', vendor: 'Sekonic', opticalCode: 'KF1' });
      const central = await t.as('admin', '/api/optical-definitions', 'POST', { name: 'Merkez Formu', vendor: 'Sekonic', opticalCode: 'MF1' });
      expect(central.data).toMatchObject({ ownerType: 'CENTRAL' });
      expect((await t.as('othermgr', '/api/optical-definitions')).data.templates.map((x: any) => x.id)).not.toContain(own.data.templateId);
      for (const [method, path, body] of [
        ['GET', `/api/optical-definitions/${own.data.templateId}`],
        ['PATCH', `/api/optical-definitions/${own.data.templateId}`, { name: 'x', vendor: 'y', opticalCode: 'z' }],
        ['POST', `/api/optical-definition-versions/${own.data.versionId}/fmt`, fmtForm()],
        ['DELETE', `/api/optical-definitions/${own.data.templateId}`],
        ['DELETE', `/api/optical-definition-versions/${own.data.versionId}`],
      ] as const) expect((await t.as('othermgr', path, method, body)).status, `${method} ${path}`).toBe(403);
      // central: readable when published, never editable by an institution
      expect((await t.as('mgr', `/api/optical-definitions/${central.data.templateId}`, 'PATCH', { name: 'x', vendor: 'y', opticalCode: 'z' })).status).toBe(403);
      expect((await t.as('mgr', `/api/optical-definition-versions/${central.data.versionId}/fmt`, 'POST', fmtForm())).status).toBe(403);
      expect((await t.as('teacher', '/api/optical-definitions')).status).toBe(403);
      // the Super Admin manages every optic and can define one on behalf of an institution
      expect((await t.as('admin', `/api/optical-definitions/${own.data.templateId}`, 'PATCH', { name: 'Kurum Formu', vendor: 'Sekonic', opticalCode: 'KF1' })).status).toBe(200);
      const forOther = await t.as('admin', '/api/optical-definitions', 'POST', { name: 'Diğer Kurum Formu', vendor: 'Sekonic', opticalCode: 'OF1', institutionId: 'other' });
      expect(forOther.data).toMatchObject({ ownerType: 'INSTITUTION', ownerId: 'other' });
      expect((await t.as('othermgr', `/api/optical-definitions/${forOther.data.templateId}`)).status).toBe(200);
      expect((await t.as('mgr', `/api/optical-definitions/${forOther.data.templateId}`)).status).toBe(403);
      expect((await t.as('admin', '/api/optical-definitions', 'POST', { name: 'X', vendor: 'Y', opticalCode: 'Z', institutionId: 'missing' })).status).toBe(400);
      const audit = t.db.prepare(`SELECT institution_id FROM audit_logs WHERE action='OPTICAL_TEMPLATE_UPDATED' AND entity_id=?`).all(own.data.templateId).map((r: any) => r.institution_id);
      expect(audit).toEqual(['school']); // the institution sees changes to its optic in its audit log
    } finally { t.db.close(); }
  }, 60000);

  it('delete: an unused draft version is deleted with its files; a used optic cannot be removed; an optic is archived instead of erased', async () => {
    const t = await setup();
    try {
      const own = await t.as('mgr', '/api/optical-definitions', 'POST', { name: 'Silinecek', vendor: 'Sekonic', opticalCode: 'DEL1' });
      expect((await t.as('mgr', `/api/optical-definition-versions/${own.data.versionId}/fmt`, 'POST', fmtForm())).status).toBe(201);
      expect((t.env as any).FILES.files.size).toBe(1);
      const del = await t.as('mgr', `/api/optical-definition-versions/${own.data.versionId}`, 'DELETE');
      expect(del.status, del.text).toBe(200);
      expect((t.env as any).FILES.files.size).toBe(0);
      expect(t.db.prepare('SELECT count(*) c FROM optical_template_versions WHERE id=?').get(own.data.versionId)).toEqual({ c: 0 });
      // a published version (the built-in 7108, used by this exam's upload) cannot be deleted
      expect((await t.as('admin', '/api/optical-definition-versions/optik-7108-sekonic-v1', 'DELETE')).status).toBe(400);
      const arch = await t.as('mgr', `/api/optical-definitions/${own.data.templateId}`, 'DELETE');
      expect(arch.status, arch.text).toBe(200);
      expect(arch.data).toMatchObject({ status: 'ARCHIVED' });
      expect((await t.as('mgr', '/api/optical-definitions')).data.templates.map((x: any) => x.id)).not.toContain(own.data.templateId);
    } finally { t.db.close(); }
  }, 60000);
});
