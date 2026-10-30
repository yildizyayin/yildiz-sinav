import type { Env } from '../types';

/**
 * S045: small AES-GCM box for secrets kept in D1 (a TOTP seed today). The key is derived from SESSION_SECRET
 * and a purpose label, so a value sealed for one purpose cannot be opened as another. Without SESSION_SECRET in
 * production nothing is sealed: callers must treat `null` as "not available", never fall back to plain text.
 */
function rootSecret(env: Env): string | null {
  const value = String(env.SESSION_SECRET || '').trim();
  if (value) return value;
  return env.ENVIRONMENT === 'production' ? null : 'anunex-non-production-secret-box';
}

const b64 = (bytes: Uint8Array) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function keyFor(env: Env, purpose: string): Promise<CryptoKey | null> {
  const root = rootSecret(env);
  if (!root) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${root}|${purpose}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function secretBoxAvailable(env: Env): boolean {
  return Boolean(rootSecret(env));
}

export async function sealSecret(env: Env, purpose: string, plain: string): Promise<string | null> {
  const key = await keyFor(env, purpose);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return `v1.${b64(iv)}.${b64(sealed)}`;
}

export async function openSecret(env: Env, purpose: string, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const [version, iv, data] = value.split('.');
  if (version !== 'v1' || !iv || !data) return null;
  const key = await keyFor(env, purpose);
  if (!key) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) as BufferSource }, key, unb64(data) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
