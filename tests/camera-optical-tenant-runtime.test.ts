import { beforeEach, describe, expect, it, vi } from 'vitest';
import cameraApp from '../worker/camera-entry';
import { getAuthUser } from '../worker/lib/auth';

vi.mock('../worker/lib/auth', () => ({ getAuthUser: vi.fn() }));
vi.mock('../worker/reporting-entry', () => ({ default: { fetch: vi.fn() } }));

const user = { id: 'manager-a', role: 'INSTITUTION_MANAGER', institution_id: 'school-a' };

function fixture({ bound = true, owner = 'school-a' } = {}) {
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => {
        if (sql.includes('FROM institutions WHERE')) return { id: 'school-a', name: 'School A', status: 'ACTIVE' };
        if (sql.includes('FROM exams WHERE')) return { id: 'exam-a', status: 'ACTIVE', owner_type: 'INSTITUTION', institution_id: 'school-a' };
        if (sql.includes('FROM institution_seasons')) return { id: 'season-a', academic_year: '2026-2027' };
        if (sql.includes('FROM optical_template_versions v JOIN optical_templates t')) return owner === 'school-a' ? { id: 'optic-a', name: 'Optic A', status: 'READY', template_active: 1, active: 1, parser_test_passed: 1 } : null;
        if (sql.includes('count(*) c FROM scan_records')) return { c: 0 };
        return null;
      },
      all: async () => ({ results: sql.includes('FROM exam_optical_bindings WHERE') ? (bound ? [{ optical_template_version_id: 'optic-a', booklet_code: 'A' }] : [])
        : sql.includes('FROM exam_optical_bindings b') ? (bound && owner === 'school-a' ? [{ id: 'optic-a', name: 'Optic A', vendor: 'Test', version: 1, page_width_mm: 210, page_height_mm: 297, camera_geometry: '{}', fiducials: '[]' }] : [])
        : sql.includes('FROM exam_booklets') ? [{ code: 'A' }] : [] }),
      run: async () => { writes.push({ sql, args }); return { success: true }; },
    }),
  }));
  const env = { DB: { prepare } } as any;
  const get = async (path: string) => cameraApp.fetch(new Request(`https://app.anunex.com${path}`), env, {} as any);
  const post = async (templateVersionId: string, records: unknown[] = []) => cameraApp.fetch(new Request('https://app.anunex.com/api/exams/exam-a/camera-preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateVersionId, records }),
  }), env, {} as any);
  return { get, post, writes, prepare };
}

beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(user as any));

describe('camera optical tenant boundary', () => {
  it('requires an exam and returns only bound opticals owned by the current institution', async () => {
    const { get } = fixture({ owner: 'school-b' });
    expect((await get('/api/camera/templates')).status).toBe(400);
    const response = await get('/api/camera/templates?examId=exam-a');
    expect(response.status).toBe(200);
    expect((await response.json() as any).templates).toEqual([]);
  });

  it('rejects a manually supplied optical outside the exam binding', async () => {
    const { post, writes } = fixture();
    const response = await post('foreign-optic');
    expect((await response.json() as any).error.code).toBe('CAMERA_TEMPLATE_NOT_BOUND');
    expect(writes).toEqual([]);
  });

  it('rejects a bound optical owned by another institution', async () => {
    const { post, writes } = fixture({ owner: 'school-b' });
    const response = await post('optic-a');
    expect((await response.json() as any).error.code).toBe('CAMERA_TEMPLATE_NOT_READY');
    expect(writes).toEqual([]);
  });

  it('uses TCKN for matching without persisting it in the camera record', async () => {
    const { post, writes } = fixture();
    const response = await post('optic-a', [{ name: 'Ada Test', tckn: '11111111111', booklet: 'A', confidence: 0.9, answers_by_subject: {} }]);
    expect(response.status).toBe(200);
    const record = writes.find(write => write.sql.includes('INSERT INTO scan_records'));
    expect(record).toBeDefined();
    expect(String(record?.args[3])).not.toContain('11111111111');
  });
});
