import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../worker/v2-final-entry';
import { getAuthUser } from '../worker/lib/auth';
vi.mock('../worker/lib/auth', () => ({ getAuthUser: vi.fn() }));
vi.mock('../worker/v2-entry', () => ({ default: { fetch: vi.fn() } }));
const manager = { id: 'manager', role: 'INSTITUTION_MANAGER', institution_id: 'school-a' } as any;
function fixture(owner_type = 'INSTITUTION', owner_id: string | null = 'school-a', template_status = 'READY') {
  const get = vi.fn(async () => ({ body: 'image', writeHttpMetadata: () => {} }));
  const env = { DB: { prepare: (sql: string) => ({ bind: () => ({ first: async () => sql.includes('FROM optical_template_versions') ? { id: 'v', owner_type, owner_id, template_status } : { object_key: 'blank', content_type: 'image/png' } }) }) }, FILES: { get } } as any;
  const request = () => app.fetch(new Request('https://app.anunex.com/api/v2/optical-print-base?versionId=v'), env);
  return { request, get };
}
beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(manager));
describe('Deimos print base access', () => {
  it('rejects another institution before reading any R2 asset', async () => { const f = fixture('INSTITUTION', 'school-b'); expect((await f.request()).status).toBe(403); expect(f.get).not.toHaveBeenCalled(); });
  it('allows the current institution template', async () => { const f = fixture(); expect((await f.request()).status).toBe(200); expect(f.get).toHaveBeenCalledOnce(); });
  it('allows a published central template', async () => { const f = fixture('CENTRAL', null); expect((await f.request()).status).toBe(200); });
  it('rejects unpublished central templates', async () => { const f = fixture('CENTRAL', null, 'NEEDS_DEFINITION'); expect((await f.request()).status).toBe(403); expect(f.get).not.toHaveBeenCalled(); });
  it('allows super admin to inspect unpublished templates', async () => { vi.mocked(getAuthUser).mockResolvedValue({ ...manager, role: 'SUPER_ADMIN' }); expect((await fixture('CENTRAL', null, 'NEEDS_DEFINITION').request()).status).toBe(200); });
});
