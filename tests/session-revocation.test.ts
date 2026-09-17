import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const authSource = readFileSync(new URL('../worker/lib/auth.ts', import.meta.url), 'utf8');
const workerSource = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');

describe('session revocation security boundary', () => {
  it('revokes the server-side session before clearing the browser cookie', () => {
    expect(authSource).toContain("UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?");
    expect(authSource).toContain(`${'${SESSION_COOKIE}'}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  });

  it('never accepts an already revoked or expired session', () => {
    expect(authSource).toContain('if (!row || row.revoked_at || !row.active || new Date(row.expires_at).getTime() <= Date.now()) return null;');
  });

  it('routes logout only through the server-side revoke function', () => {
    expect(workerSource).toContain("if (url.pathname === '/api/auth/logout') return request.method === 'POST' ? revokeSession(env, request) : methodNotAllowed();");
  });
});
