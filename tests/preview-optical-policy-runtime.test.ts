import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreviewPolicyEntry } from '../worker/preview-policy-entry';
import { getAuthUser } from '../worker/lib/auth';

vi.mock('../worker/lib/auth', () => ({ getAuthUser: vi.fn() }));

const manager = { id: 'manager-a', role: 'INSTITUTION_MANAGER', institution_id: 'school-a' };
const candidate = (id: string, owner: 'CENTRAL' | 'INSTITUTION', ownerId: string | null = null) => ({
  id, template_id: `template-${id}`, template_status: 'READY', template_active: 1,
  version_active: 1, parser_definition: '{}', parser_test_passed: 1, owner_type: owner, owner_id: ownerId,
});

function fixture(bound: ReturnType<typeof candidate>[], fallback: ReturnType<typeof candidate>[]) {
  const delegated = vi.fn(async (request: Request) => Response.json({ selected: (await request.formData()).get('templateVersionId') }));
  const app = createPreviewPolicyEntry({ fetch: delegated, queue: vi.fn(), scheduled: vi.fn() } as any);
  const prepared = vi.fn((sql: string) => ({ bind: (...args: unknown[]) => ({
    all: async () => ({ results: sql.includes('FROM exam_optical_bindings') ? bound : fallback }),
    args,
  }) }));
  const env = { DB: { prepare: prepared } } as any;
  const ctx = {} as ExecutionContext;
  const preview = async (templateId?: string) => {
    const form = new FormData();
    form.set('file', new Blob(['sample']), 'sample.txt');
    if (templateId) form.set('templateVersionId', templateId);
    const request = new Request('https://app.anunex.com/api/exams/exam-a/preview-file', { method: 'POST', body: form });
    return app.fetch!(request, env, ctx);
  };
  return { preview, delegated, prepared };
}

beforeEach(() => vi.mocked(getAuthUser).mockResolvedValue(manager as any));

describe('Phobos preview runtime policy', () => {
  it('blocks a foreign tenant bound optical even when a safe fallback exists', async () => {
    const { preview, delegated } = fixture([candidate('foreign', 'INSTITUTION', 'school-b')], [candidate('central', 'CENTRAL')]);
    const response = await preview();
    expect(response.status).toBe(400);
    expect((await response.json() as any).error.code).toBe('OPTICAL_BINDING_NOT_READY');
    expect(delegated).not.toHaveBeenCalled();
  });

  it('rejects an explicit optical outside the scoped fallback catalog', async () => {
    const { preview, delegated } = fixture([], [candidate('school-a-optic', 'INSTITUTION', 'school-a')]);
    const response = await preview('school-b-optic');
    expect((await response.json() as any).error.code).toBe('OPTICAL_TEMPLATE_NOT_ALLOWED');
    expect(delegated).not.toHaveBeenCalled();
  });

  it('requires selection when multiple safe opticals exist', async () => {
    const { preview, delegated } = fixture([], [candidate('central', 'CENTRAL'), candidate('own', 'INSTITUTION', 'school-a')]);
    const response = await preview();
    expect((await response.json() as any).error.code).toBe('OPTICAL_TEMPLATE_REQUIRED');
    expect(delegated).not.toHaveBeenCalled();
  });

  it('injects the sole safe optical and forwards the uploaded request', async () => {
    const { preview, delegated } = fixture([], [candidate('own', 'INSTITUTION', 'school-a')]);
    const response = await preview();
    expect(response.status).toBe(200);
    expect((await response.json() as any).selected).toBe('own');
    expect(delegated).toHaveBeenCalledOnce();
  });

  it('rejects an untested bound parser before reaching legacy evaluation', async () => {
    const untested = { ...candidate('own', 'INSTITUTION', 'school-a'), parser_test_passed: 0 };
    const { preview, delegated } = fixture([untested], []);
    const response = await preview('own');
    expect((await response.json() as any).error.code).toBe('OPTICAL_BINDING_NOT_READY');
    expect(delegated).not.toHaveBeenCalled();
  });
});
