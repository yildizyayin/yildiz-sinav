import type { AuthUser, Env } from '../types';
import { all, json, one, uuid } from './db';

const SESSION_COOKIE = 'yildiz_session';
const ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, saltB64?: string, iterations = ITERATIONS): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = saltB64 ? base64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return { hash: bytesToBase64(new Uint8Array(bits)), salt: bytesToBase64(salt), iterations };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string, iterations: number): Promise<boolean> {
  const result = await hashPassword(password, salt, iterations);
  const a = base64ToBytes(result.hash);
  const b = base64ToBytes(expectedHash);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function getCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export async function getAuthUser(env: Env, request: Request): Promise<AuthUser | null> {
  const rawToken = getCookie(request, SESSION_COOKIE);
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const row = await one<AuthUser & { expires_at: string; revoked_at: string | null; active: number; institution_status: string | null }>(
    env.DB.prepare(`SELECT u.id, u.institution_id, u.student_id, u.role, u.display_name, u.email, u.username,
      s.expires_at, s.revoked_at, u.active, i.status AS institution_status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN institutions i ON i.id = u.institution_id
      WHERE s.token_hash = ? LIMIT 1`).bind(tokenHash),
  );
  if (!row || row.revoked_at || !row.active || new Date(row.expires_at).getTime() <= Date.now()) return null;
  return {
    id: row.id,
    institution_id: row.institution_id,
    student_id: row.student_id,
    role: row.role,
    display_name: row.display_name,
    email: row.email,
    username: row.username,
  };
}

export async function createSession(env: Env, userId: string, request: Request, remember: boolean): Promise<Response> {
  const raw = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, 'x');
  const hash = await sha256Hex(raw);
  const days = remember ? 30 : 1;
  const expires = new Date(Date.now() + days * 86400000);
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const ipHash = ip ? await sha256Hex(ip) : null;
  await env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(uuid('ses'), userId, hash, expires.toISOString(), request.headers.get('User-Agent'), ipHash)
    .run();
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure}`;
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

export async function revokeSession(env: Env, request: Request): Promise<Response> {
  const raw = getCookie(request, SESSION_COOKIE);
  if (raw) {
    const hash = await sha256Hex(raw);
    await env.DB.prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?').bind(hash).run();
  }
  const secure = env.ENVIRONMENT === 'production' ? '; Secure' : '';
  return json({ ok: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` });
}

export async function verifyTurnstile(env: Env, token: string | undefined, remoteIp?: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!env.TURNSTILE_SECRET_KEY) {
    if (env.ENVIRONMENT !== 'production') return { ok: true };
    return { ok: false, error: 'TURNSTILE_NOT_CONFIGURED' };
  }
  if (!token) return { ok: false, error: 'TURNSTILE_REQUIRED' };
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp ?? undefined }),
  });
  const payload = await response.json<{ success: boolean; 'error-codes'?: string[] }>();
  return payload.success ? { ok: true } : { ok: false, error: payload['error-codes']?.join(',') || 'TURNSTILE_FAILED' };
}

export async function isTemporarilyLocked(env: Env, identifier: string): Promise<boolean> {
  const hash = await sha256Hex(identifier.trim().toLowerCase());
  const rows = await all<{ success: number }>(env.DB.prepare(`SELECT success FROM login_attempts WHERE identifier_hash = ? AND created_at >= datetime('now','-15 minutes') ORDER BY created_at DESC LIMIT 8`).bind(hash));
  return rows.length >= 8 && rows.every((r) => !r.success);
}

export async function recordLoginAttempt(env: Env, identifier: string, success: boolean, request: Request): Promise<void> {
  const identifierHash = await sha256Hex(identifier.trim().toLowerCase());
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const ipHash = ip ? await sha256Hex(ip) : null;
  await env.DB.prepare('INSERT INTO login_attempts (id, identifier_hash, success, ip_hash) VALUES (?, ?, ?, ?)')
    .bind(uuid('log'), identifierHash, success ? 1 : 0, ipHash)
    .run();
}
