import coreApp from '../index';
import type { Env } from '../types';
import { hashPassword } from './auth';
import { one, uuid } from './db';
import { normalizeSekonicPreviewRequest } from './sekonic-upload';

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type ResultWorkspace = {
  meb_code: string;
  institution_id: string;
  service_user_id: string;
  name: string;
  city: string;
  district: string;
};

export async function ensureResultWorkspace(env: Env, mebCode: string, createdBy?: string | null): Promise<ResultWorkspace> {
  const existing = await one<ResultWorkspace>(env.DB.prepare(`
    SELECT w.meb_code,w.institution_id,w.service_user_id,n.name,n.city,n.district
    FROM result_institution_workspaces w
    JOIN national_institution_directory n ON n.meb_code=w.meb_code
    WHERE w.meb_code=? AND n.status='ACTIVE'
  `).bind(mebCode));
  if (existing) return existing;

  const directory = await one<{ meb_code: string; name: string; city: string; district: string }>(env.DB.prepare(`
    SELECT meb_code,name,city,district
    FROM national_institution_directory
    WHERE meb_code=? AND status='ACTIVE'
  `).bind(mebCode));
  if (!directory) throw new Error('RESULT_DIRECTORY_INSTITUTION_NOT_FOUND');

  const institutionCode = `RN-${directory.meb_code}`;
  let institution = await one<{ id: string }>(env.DB.prepare(`SELECT id FROM institutions WHERE code=?`).bind(institutionCode));
  if (!institution) {
    const institutionId = uuid('rinst');
    await env.DB.prepare(`
      INSERT INTO institutions(id,name,code,city,district,status,result_network_only)
      VALUES(?,?,?,?,?,'ACTIVE',1)
    `).bind(institutionId,directory.name,institutionCode,directory.city,directory.district).run();
    institution = { id: institutionId };
  }

  let service = await one<{ id: string }>(env.DB.prepare(`
    SELECT u.id
    FROM users u
    WHERE u.institution_id=? AND u.role='INSTITUTION_MANAGER' AND u.username IS NULL AND u.email IS NULL
    ORDER BY u.created_at ASC LIMIT 1
  `).bind(institution.id));
  if (!service) {
    const encoded = await hashPassword(randomSecret());
    const userId = uuid('rsvc');
    await env.DB.prepare(`
      INSERT INTO users(id,institution_id,role,display_name,password_hash,password_salt,password_iterations,active)
      VALUES(?,?,'INSTITUTION_MANAGER',?,?,?,?,1)
    `).bind(userId,institution.id,`${directory.name} Sonuç Servisi`,encoded.hash,encoded.salt,encoded.iterations).run();
    service = { id: userId };
  }

  await env.DB.prepare(`
    INSERT INTO result_institution_workspaces(meb_code,institution_id,service_user_id,created_by)
    VALUES(?,?,?,?)
    ON CONFLICT(meb_code) DO UPDATE SET institution_id=excluded.institution_id,service_user_id=excluded.service_user_id,updated_at=CURRENT_TIMESTAMP
  `).bind(directory.meb_code,institution.id,service.id,createdBy||null).run();

  return {
    meb_code: directory.meb_code,
    institution_id: institution.id,
    service_user_id: service.id,
    name: directory.name,
    city: directory.city,
    district: directory.district,
  };
}

export async function callSharedEvaluationEngine(
  request: Request,
  env: Env,
  mebCode: string,
  targetPath: string,
  createdBy?: string | null,
): Promise<Response> {
  const workspace = await ensureResultWorkspace(env, mebCode, createdBy);
  const raw = randomSecret();
  const tokenHash = await sha256(raw);
  const sessionId = uuid('rbridge');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions(id,user_id,token_hash,expires_at,user_agent,ip_hash)
    VALUES(?,?,?,?,?,NULL)
  `).bind(sessionId,workspace.service_user_id,tokenHash,expiresAt,'ANUNEX_RESULT_EVALUATION_BRIDGE').run();

  try {
    const target = new URL(request.url);
    const [pathname,query=''] = targetPath.split('?');
    target.pathname = pathname;
    target.search = query ? `?${query}` : '';
    const source = request.clone();
    const headers = new Headers(source.headers);
    headers.set('Cookie',`yildiz_session=${encodeURIComponent(raw)}`);
    headers.set('X-Anunex-Result-Bridge','1');
    headers.delete('content-length');
    const body = request.method==='GET'||request.method==='HEAD' ? undefined : await source.arrayBuffer();
    let forwarded = new Request(target.toString(),{
      method:request.method,
      headers,
      body,
      redirect:request.redirect,
    });
    if (/^\/api\/exams\/[^/]+\/preview-file$/.test(target.pathname)) {
      forwarded = await normalizeSekonicPreviewRequest(forwarded);
    }
    return await coreApp.fetch(forwarded,env);
  } finally {
    await env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?`).bind(sessionId).run();
  }
}
