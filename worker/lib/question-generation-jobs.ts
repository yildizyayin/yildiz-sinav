import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';

type Context = {
  curriculumVersionId: string;
  academicYear: string;
  gradeLevel: number;
  subjectId: string;
  programVersion: string;
  outcomeCode: string | null;
  outcomeTitle: string;
};
type RequestContext = Omit<Context, 'outcomeCode' | 'outcomeTitle'>;
type JobRow = {
  id: string; request_key: string; outcome_id: string; curriculum_version_id: string;
  academic_year: string; grade_level: number; subject_id: string; program_version: string;
  outcome_code: string | null; outcome_title: string; question_count: number;
  status: 'REQUESTED' | 'RUNNING' | 'REVIEW_READY' | 'FAILED' | 'CANCELLED'; created_at: string; cancelled_at: string | null;
  attempt_count: number; generated_count: number; lease_until: string | null; error_code: string | null; completed_at: string | null;
};

function error(status: number, code: string, message: string): Response {
  return json({ ok: false, error: { code, message } }, status);
}
export function questionGenerationEnabled(env: Env): boolean {
  return env.QUESTION_GENERATION_ENABLED === 'true' && !!env.AI;
}
export function generationJobDto(row: JobRow) {
  return {
    id: row.id, outcomeId: row.outcome_id, status: row.status,
    questionCount: row.question_count, createdAt: row.created_at,
    cancelledAt: row.cancelled_at, attemptCount: row.attempt_count,
    generatedCount: row.generated_count, leaseUntil: row.lease_until,
    errorCode: row.error_code, completedAt: row.completed_at,
    context: {
      curriculumVersionId: row.curriculum_version_id, academicYear: row.academic_year,
      gradeLevel: row.grade_level, subjectId: row.subject_id,
      programVersion: row.program_version, outcomeCode: row.outcome_code,
      outcomeTitle: row.outcome_title,
    },
  };
}
export const generationJobFields = `id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,program_version,outcome_code,outcome_title,question_count,status,created_at,cancelled_at,attempt_count,generated_count,lease_until,error_code,completed_at`;
const fields = generationJobFields;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validYear(year: unknown): year is string {
  if (typeof year !== 'string' || !/^\d{4}-\d{4}$/.test(year)) return false;
  return Number(year.slice(5)) === Number(year.slice(0, 4)) + 1;
}
function validContext(value: any): value is RequestContext {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.curriculumVersionId === 'string' && value.curriculumVersionId.length > 0 && value.curriculumVersionId.length <= 100
    && validYear(value.academicYear)
    && Number.isInteger(value.gradeLevel) && value.gradeLevel >= 1 && value.gradeLevel <= 12
    && typeof value.subjectId === 'string' && value.subjectId.length > 0 && value.subjectId.length <= 100
    && typeof value.programVersion === 'string' && value.programVersion.length > 0 && value.programVersion.length <= 200;
}
function samePayload(row: JobRow, outcomeId: string, expected: RequestContext, questionCount: number): boolean {
  return row.outcome_id === outcomeId && row.question_count === questionCount
    && row.curriculum_version_id === expected.curriculumVersionId
    && row.academic_year === expected.academicYear && row.grade_level === expected.gradeLevel
    && row.subject_id === expected.subjectId && row.program_version === expected.programVersion;
}
const existingKey = (env: Env, key: string) => one<JobRow>(env.DB.prepare(`SELECT ${fields} FROM question_generation_jobs WHERE request_key=?`).bind(key));

async function createJob(request: Request, env: Env, user: AuthUser): Promise<Response> {
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || typeof body.outcomeId !== 'string' || !body.outcomeId || body.outcomeId.length > 100
    || !validContext(body.expectedContext)
    || typeof body.requestKey !== 'string' || !uuidPattern.test(body.requestKey)
    || !Number.isInteger(body.questionCount) || body.questionCount < 1 || body.questionCount > 10)
    return error(400, 'INVALID_GENERATION_REQUEST', 'Kazanım, doğrulanmış bağlam, UUID anahtarı ve 1-10 soru sayısı gereklidir.');
  const expected = body.expectedContext as RequestContext;
  const prior = await existingKey(env, body.requestKey);
  if (prior) return samePayload(prior, body.outcomeId, expected, body.questionCount)
    ? json({ ok: true, job: generationJobDto(prior), reused: true })
    : error(409, 'REQUEST_KEY_CONFLICT', 'İstek anahtarı farklı bir istek için kullanıldı.');

  // The displayed context is an optimistic witness. The INSERT repeats every
  // predicate and the displayed title/code, so a read/write race cannot record
  // stale provenance. No AI provider or background executor is invoked here.
  const source = await one<Context>(env.DB.prepare(`
    SELECT o.curriculum_version_id curriculumVersionId, cv.academic_year academicYear,
      o.grade_level gradeLevel, o.subject_id subjectId, cv.program_version programVersion,
      o.code outcomeCode, o.title outcomeTitle
    FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND o.grade_level=cv.grade_level
      AND o.curriculum_version_id=? AND cv.academic_year=? AND o.grade_level=?
      AND o.subject_id=? AND cv.program_version=?
  `).bind(body.outcomeId,expected.curriculumVersionId,expected.academicYear,expected.gradeLevel,expected.subjectId,expected.programVersion));
  if (!source) return error(409, 'GENERATION_CONTEXT_CHANGED', 'Kazanım veya doğrulanmış müfredat bağlamı değişti. Listeyi yenileyin.');
  const id = uuid('qgj');
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO question_generation_jobs
      (id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,
       subject_id,program_version,outcome_code,outcome_title,question_count,requested_by)
    SELECT ?,?,o.id,cv.id,cv.academic_year,o.grade_level,o.subject_id,
      cv.program_version,o.code,o.title,?,?
    FROM outcomes o JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
    WHERE o.id=? AND o.active=1 AND cv.verified=1 AND o.grade_level=cv.grade_level
      AND o.curriculum_version_id=? AND cv.academic_year=? AND o.grade_level=?
      AND o.subject_id=? AND cv.program_version=? AND o.code IS ? AND o.title=?
  `).bind(id,body.requestKey,body.questionCount,user.id,body.outcomeId,
    expected.curriculumVersionId,expected.academicYear,expected.gradeLevel,
    expected.subjectId,expected.programVersion,source.outcomeCode,source.outcomeTitle).run();
  if (Number(inserted.meta?.changes || 0) > 0) {
    const job = await one<JobRow>(env.DB.prepare(`SELECT ${fields} FROM question_generation_jobs WHERE id=?`).bind(id));
    return json({ ok: true, job: generationJobDto(job!), reused: false }, 201);
  }
  // UNIQUE constraints resolve races deterministically: the same key can be
  // retried; a different key cannot silently change an active job's quantity.
  const byKey = await existingKey(env, body.requestKey);
  if (byKey) return samePayload(byKey,body.outcomeId,expected,body.questionCount)
    ? json({ ok: true, job: generationJobDto(byKey), reused: true })
    : error(409, 'REQUEST_KEY_CONFLICT', 'İstek anahtarı farklı bir istek için kullanıldı.');
  const active = await one<JobRow>(env.DB.prepare(`SELECT ${fields} FROM question_generation_jobs WHERE outcome_id=? AND curriculum_version_id=? AND status IN ('REQUESTED','RUNNING','FAILED')`).bind(body.outcomeId,expected.curriculumVersionId));
  if (active) return error(409, 'GENERATION_JOB_ACTIVE', 'Bu kazanım ve müfredat sürümü için zaten etkin bir istek var.');
  return error(409, 'GENERATION_CONTEXT_CHANGED', 'Kazanım veya doğrulanmış müfredat bağlamı değişti. Listeyi yenileyin.');
}

async function listJobs(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const academicYear = query.get('academicYear');
  const outcomeId = query.get('outcomeId');
  const status = query.get('status');
  const cursor = query.get('cursor');
  const rawLimit = query.get('limit');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!validYear(academicYear)
    || (outcomeId !== null && (!outcomeId || outcomeId.length > 100))
    || (status !== null && !['REQUESTED','RUNNING','REVIEW_READY','FAILED','CANCELLED'].includes(status))
    || (cursor !== null && (!cursor || cursor.length > 100))
    || (rawLimit !== null && !/^[1-9][0-9]*$/.test(rawLimit))
    || !Number.isInteger(limit) || limit < 1 || limit > 50)
    return error(400, 'INVALID_GENERATION_LIST', 'Akademik yıl ve 1-50 arasında sayfa boyutu gereklidir.');
  const rows = await all<JobRow>(env.DB.prepare(`SELECT ${fields} FROM question_generation_jobs
    WHERE academic_year=? AND (? IS NULL OR outcome_id=?)
      AND (? IS NULL OR status=?) AND id>?
    ORDER BY id LIMIT ?`).bind(academicYear,outcomeId,outcomeId,status,status,cursor || '',limit + 1));
  const page = rows.slice(0,limit);
  return json({ ok: true, jobs: page.map(generationJobDto), nextCursor: rows.length > limit ? page.at(-1)!.id : null, executionEnabled: questionGenerationEnabled(env) });
}

async function cancelJob(env: Env, user: AuthUser, id: string): Promise<Response> {
  if (!id || id.length > 100) return error(400, 'INVALID_GENERATION_JOB_ID', 'İstek kimliği geçersiz.');
  // The conditional UPDATE is the sole transition; replaying a cancellation is
  // safe and does not alter its original actor or timestamp.
  await env.DB.prepare(`UPDATE question_generation_jobs SET status='CANCELLED',
    cancelled_at=CURRENT_TIMESTAMP,cancelled_by=?,lease_token=NULL,lease_until=NULL,error_code=NULL
    WHERE id=? AND status IN ('REQUESTED','RUNNING','FAILED')`).bind(user.id,id).run();
  const row = await one<JobRow>(env.DB.prepare(`SELECT ${fields} FROM question_generation_jobs WHERE id=?`).bind(id));
  if (!row) return error(404, 'GENERATION_JOB_NOT_FOUND', 'İstek bulunamadı.');
  return json({ ok: true, job: generationJobDto(row) });
}

/** A route helper: null means this URL belongs to another worker handler. */
export function handleQuestionGenerationJobs(request: Request, env: Env, user: AuthUser | null): Promise<Response> | null {
  const path = new URL(request.url).pathname;
  const base = '/api/question-bank-standard/generation-jobs';
  const cancel = path.match(/^\/api\/question-bank-standard\/generation-jobs\/([^/]+)\/cancel$/);
  if (path !== base && !cancel) return null;
  if (!user) return Promise.resolve(error(401, 'UNAUTHENTICATED', 'Oturum açmanız gerekiyor.'));
  if (user.role !== 'SUPER_ADMIN') return Promise.resolve(error(403, 'SUPER_ADMIN_ONLY', 'Bu işlem yalnız Süper Admin içindir.'));
  if (path === base && request.method === 'POST') return createJob(request,env,user);
  if (path === base && request.method === 'GET') return listJobs(request,env);
  if (cancel && request.method === 'PATCH') return cancelJob(env,user,cancel[1]);
  return Promise.resolve(error(405, 'METHOD_NOT_ALLOWED', 'Bu yöntem desteklenmiyor.'));
}
