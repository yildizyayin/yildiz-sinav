import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../worker/v2-entry';
import { getAuthUser } from '../worker/lib/auth';
vi.mock('../worker/lib/auth', () => ({ getAuthUser: vi.fn(), hashPassword: vi.fn() }));
vi.mock('../worker/final-entry', () => ({ default: { fetch: vi.fn() } }));
const manager = { id: 'manager', role: 'INSTITUTION_MANAGER', institution_id: 'school-a' } as any;
function fixture(owner_type = 'INSTITUTION', owner_id: string | null = 'school-a', template_status = 'READY') {
  const studentRead = vi.fn();
  const env = { DB: { prepare: (sql: string) => ({ bind: () => ({
    first: async () => sql.includes('FROM classes') ? { id: 'class', institution_id: 'school-a' }
      : sql.includes('FROM optical_template_versions') ? { id: 'v', owner_type, owner_id, template_status, print_fields: '[]' }
      : sql.includes('FROM exams') ? { id: 'exam' } : { id: 'school-a' },
    all: async () => { if (sql.includes('FROM student_enrollments')) studentRead(); return { results: sql.includes('FROM exam_booklets') ? [{ code: 'A' }] : [] }; },
  }) }) } } as any;
  const request = (extra = '') => app.fetch(new Request(`https://app.anunex.com/api/optical-prepare?classId=class&templateVersionId=v${extra}`), env);
  return { request, studentRead };
}
beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(manager));
describe('Deimos preparation access', () => {
  it('rejects foreign templates before retrieving students', async () => { const f = fixture('INSTITUTION', 'school-b'); expect((await f.request()).status).toBe(403); expect(f.studentRead).not.toHaveBeenCalled(); });
  it('rejects unpublished central templates before retrieving students', async () => { const f = fixture('CENTRAL', null, 'NEEDS_DEFINITION'); expect((await f.request()).status).toBe(403); expect(f.studentRead).not.toHaveBeenCalled(); });
  it('prepares a permitted central template', async () => { const f = fixture('CENTRAL', null); expect((await f.request()).status).toBe(200); expect(f.studentRead).toHaveBeenCalledOnce(); });
  it('rejects a booklet that is not defined in the selected exam', async () => { const f = fixture(); const response = await f.request('&examId=exam&bookletSet=B'); expect(response.status).toBe(400); expect(f.studentRead).not.toHaveBeenCalled(); });
});
