/**
 * A032b: the Super Admin owns the whole system. In a dispute with an institution they can suspend
 * (askıya al), freeze (dondur), reactivate or delete it. Deletion is reversible: the institution and all
 * its accounts are closed and leave the lists, data is kept, and the Super Admin can bring it back.
 *
 * Every non-active state closes every account bound to the institution (manager, teacher, guidance,
 * student, parent): open sessions are revoked and new logins are refused. One model is used by the app's
 * institution screen and the result-network screen (institution_access_controls + governance events).
 */
import type { AuthUser, Env } from '../types';
import { audit, badRequest, json, one, uuid } from './db';

export type Lifecycle = 'ACTIVE' | 'PASSIVE' | 'FROZEN' | 'ARCHIVED';
export const LIFECYCLES: Lifecycle[] = ['ACTIVE', 'PASSIVE', 'FROZEN', 'ARCHIVED'];
export const LIFECYCLE_LABEL: Record<Lifecycle, string> = { ACTIVE: 'Aktif', PASSIVE: 'Askıda', FROZEN: 'Dondurulmuş', ARCHIVED: 'Silinmiş (geri alınabilir)' };

export async function changeInstitutionLifecycle(env: Env, user: AuthUser, id: string, nextRaw: unknown, reasonRaw: unknown, dealerId: string | null = null): Promise<Response> {
  const next = String(nextRaw || '').toUpperCase() as Lifecycle;
  if (!LIFECYCLES.includes(next)) return badRequest('Geçersiz kurum durumu.');
  const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  if (reason.length > 500) return badRequest('Gerekçe 500 karakteri geçemez.');
  if (next === 'ARCHIVED' && reason.length < 10) return badRequest('Kurumu silmek için en az 10 karakterlik gerekçe yazın.', 'REASON_REQUIRED');
  const inst = await one<any>(env.DB.prepare(`SELECT i.id,i.status,COALESCE(iac.lifecycle_status,CASE WHEN i.status='ACTIVE' THEN 'ACTIVE' ELSE 'PASSIVE' END) lifecycle_status,
    (SELECT count(*) FROM users u WHERE u.institution_id=i.id AND u.role<>'SUPER_ADMIN') account_count,
    (SELECT count(*) FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.institution_id=i.id AND u.role<>'SUPER_ADMIN' AND s.revoked_at IS NULL AND datetime(s.expires_at)>CURRENT_TIMESTAMP) open_sessions
    FROM institutions i LEFT JOIN institution_access_controls iac ON iac.institution_id=i.id WHERE i.id=?`).bind(id));
  if (!inst) return json({ ok: false, error: { code: 'INSTITUTION_NOT_FOUND', message: 'Kurum bulunamadı.' } }, 404);
  const from = inst.lifecycle_status as Lifecycle;
  const action = next === 'ARCHIVED' ? 'ARCHIVE' : next === 'FROZEN' ? 'FREEZE' : next === 'PASSIVE' ? 'PASSIVE' : from === 'FROZEN' ? 'UNFREEZE' : 'RESTORE';
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE institutions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(next === 'ACTIVE' ? 'ACTIVE' : 'PASSIVE', id),
    env.DB.prepare(`INSERT INTO institution_access_controls(institution_id,lifecycle_status,reason,updated_by) VALUES(?,?,?,?) ON CONFLICT(institution_id) DO UPDATE SET lifecycle_status=excluded.lifecycle_status,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(id, next, reason || null, user.id),
    env.DB.prepare(`INSERT INTO institution_governance_events(id,institution_id,actor_user_id,actor_dealer_id,action,previous_status,next_status,metadata_json) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid('ige'), id, user.id, dealerId, action, from, next, JSON.stringify({ reason: reason || null, accounts: Number(inst.account_count || 0) })),
  ];
  if (next !== 'ACTIVE') statements.push(env.DB.prepare(`UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id IN (SELECT id FROM users WHERE institution_id=? AND role<>'SUPER_ADMIN') AND revoked_at IS NULL`).bind(id));
  await env.DB.batch(statements);
  await audit(env.DB, user.id, id, next === 'ACTIVE' ? 'INSTITUTION_REACTIVATED' : next === 'ARCHIVED' ? 'INSTITUTION_DELETED' : next === 'FROZEN' ? 'INSTITUTION_FROZEN' : 'INSTITUTION_PAUSED', 'institution', id, { from, to: next, reason: reason || null, accounts: Number(inst.account_count || 0), sessionsClosed: next === 'ACTIVE' ? 0 : Number(inst.open_sessions || 0), dealerId });
  return json({ ok: true, id, status: next, previousStatus: from, label: LIFECYCLE_LABEL[next], accounts: Number(inst.account_count || 0), sessionsClosed: next === 'ACTIVE' ? 0 : Number(inst.open_sessions || 0) });
}
