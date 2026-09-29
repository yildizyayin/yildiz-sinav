import type { AuthUser, CapacityJobMessage, Env } from './types';
import { getAuthUser } from './lib/auth';
import { all, badRequest, forbidden, json } from './lib/db';
import { canEvaluateExam } from './lib/permissions';

type PreviewApp = typeof import('./privacy-export-entry').default;

type OpticalCandidate = {
  id: string;
  template_id: string;
  template_status: string;
  template_active: number;
  version_active: number;
  parser_definition: string | null;
  parser_test_passed: number;
  owner_type: 'CENTRAL' | 'INSTITUTION';
  owner_id: string | null;
};

function unauthenticated(): Response {
  return json({ ok: false, error: { code: 'UNAUTHENTICATED', message: 'Oturum açmanız gerekiyor.' } }, 401);
}

function institutionForPreview(user: AuthUser, form: FormData): string | null {
  if (user.role === 'SUPER_ADMIN') return form.get('institutionId')?.toString() || null;
  return user.institution_id || null;
}

function candidateAllowed(candidate: OpticalCandidate, institutionId: string): boolean {
  if (!candidate.template_active || !candidate.version_active) return false;
  if (candidate.template_status !== 'READY') return false;
  if (!candidate.parser_definition || Number(candidate.parser_test_passed || 0) !== 1) return false;
  if (candidate.owner_type === 'CENTRAL') return true;
  return candidate.owner_type === 'INSTITUTION' && candidate.owner_id === institutionId;
}

async function loadBoundCandidates(env: Env, examId: string): Promise<OpticalCandidate[]> {
  return all<OpticalCandidate>(env.DB.prepare(`
    SELECT v.id,v.template_id,t.status template_status,t.active template_active,v.active version_active,
           v.parser_definition,coalesce(d.parser_test_passed,0) parser_test_passed,t.owner_type,t.owner_id
    FROM exam_optical_bindings b
    JOIN optical_template_versions v ON v.id=b.optical_template_version_id
    JOIN optical_templates t ON t.id=v.template_id
    LEFT JOIN optical_definition_validations d ON d.optical_template_version_id=v.id
    WHERE b.exam_id=? AND b.active=1
    ORDER BY b.booklet_code,v.id
  `).bind(examId));
}

async function loadFallbackCandidates(env: Env, institutionId: string): Promise<OpticalCandidate[]> {
  return all<OpticalCandidate>(env.DB.prepare(`
    SELECT v.id,v.template_id,t.status template_status,t.active template_active,v.active version_active,
           v.parser_definition,coalesce(d.parser_test_passed,0) parser_test_passed,t.owner_type,t.owner_id
    FROM optical_template_versions v
    JOIN optical_templates t ON t.id=v.template_id
    LEFT JOIN optical_definition_validations d ON d.optical_template_version_id=v.id
    WHERE t.active=1
      AND v.active=1
      AND t.status='READY'
      AND v.parser_definition IS NOT NULL
      AND coalesce(d.parser_test_passed,0)=1
      AND (t.owner_type='CENTRAL' OR (t.owner_type='INSTITUTION' AND t.owner_id=?))
    ORDER BY t.owner_type,t.name,v.version
  `).bind(institutionId));
}

function rebuildRequestWithTemplate(request: Request, form: FormData, templateVersionId: string): Request {
  form.set('templateVersionId', templateVersionId);
  const headers = new Headers(request.headers);
  headers.delete('content-type');
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: form,
    redirect: request.redirect,
  });
}

async function enforcePreviewOpticalPolicy(request: Request, env: Env, ctx: ExecutionContext, examId: string, app: PreviewApp): Promise<Response> {
  const user = await getAuthUser(env, request);
  if (!user) return unauthenticated();
  if (!canEvaluateExam(user.role)) return forbidden('Bu sınavı değerlendirme yetkiniz bulunmuyor.');

  const form = await request.clone().formData();
  const institutionId = institutionForPreview(user, form);
  if (!institutionId) return badRequest('Kurum seçilmelidir.', 'INSTITUTION_REQUIRED');
  if (user.role !== 'SUPER_ADMIN' && user.institution_id !== institutionId) return forbidden();

  const requestedTemplateId = form.get('templateVersionId')?.toString() || '';
  const bound = await loadBoundCandidates(env, examId);
  if (bound.length) {
    const invalid = bound.filter((candidate) => !candidateAllowed(candidate, institutionId));
    if (invalid.length) {
      return badRequest(
        'Sınava bağlı optiklerden en az biri yayına hazır değil veya bu kuruma ait değil. Optik/FMT Tanımları alanından bağlantıyı düzeltin.',
        'OPTICAL_BINDING_NOT_READY',
      );
    }
    if (requestedTemplateId && !bound.some((candidate) => candidate.id === requestedTemplateId)) {
      return badRequest('Seçilen optik bu sınava bağlı değil.', 'OPTICAL_TEMPLATE_NOT_BOUND');
    }
    return app.fetch(request, env, ctx);
  }

  const fallback = await loadFallbackCandidates(env, institutionId);
  if (requestedTemplateId) {
    if (!fallback.some((candidate) => candidate.id === requestedTemplateId)) {
      return badRequest('Seçilen optik yayına hazır değil veya kurum erişim kapsamınızda değil.', 'OPTICAL_TEMPLATE_NOT_ALLOWED');
    }
    return app.fetch(request, env, ctx);
  }

  if (!fallback.length) {
    return badRequest('Bu kurum için yayına hazır optik tanımı bulunamadı.', 'READY_OPTICAL_REQUIRED');
  }
  if (fallback.length > 1) {
    return badRequest('Sınava optik bağlayın veya yükleme ekranından kullanılacak optiği seçin.', 'OPTICAL_TEMPLATE_REQUIRED');
  }

  return app.fetch(rebuildRequestWithTemplate(request, form, fallback[0].id), env, ctx);
}

export function createPreviewPolicyEntry(app: PreviewApp): ExportedHandler<Env, CapacityJobMessage> {
  return {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const preview = url.pathname.match(/^\/api\/exams\/([^/]+)\/preview-file$/);
    if (preview && request.method === 'POST') {
      return enforcePreviewOpticalPolicy(request, env, ctx, preview[1], app);
    }
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<CapacityJobMessage>, env: Env, ctx: ExecutionContext) {
    return app.queue(batch, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    return app.scheduled(event, env, ctx);
  },
  };
}
